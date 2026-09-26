import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { inflateSync } from 'zlib';
import { DataSource, Repository } from 'typeorm';
import { McqOption } from '../../common/entities/mcq-option.entity';
import {
  MAX_MCQ_OPTIONS,
  MIN_MCQ_OPTIONS,
  STANDARD_MCQ_OPTIONS,
  isSupportedMcqOptionCount,
} from '../../common/mcq-option-policy';
import {
  Question,
  QuestionDifficulty,
  QuestionType,
} from '../../common/entities/question.entity';
import { Topic } from '../../common/entities/topic.entity';
import { AcademicAccessService } from '../academic/academic-access.service';
import type { UploadedResourceFile } from '../academic/resource-storage.service';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import {
  InspectQuestionImportDto,
  PublishImportedQuestionDto,
  PublishQuestionImportDto,
} from './dtos/questions.dto';
import { detectQuestionDocumentType, QuestionDocumentType } from './question-document-type';

type ImportIssueSeverity = 'INFO' | 'WARNING' | 'ERROR';

type ImportIssue = {
  code: string;
  severity: ImportIssueSeverity;
  message: string;
};

type ExtractedOption = {
  label: string;
  option_text: string;
  is_correct: boolean;
};

type DuplicateMatch = {
  question_id: string;
  question_text: string;
  similarity: number;
  exact: boolean;
};

type ExistingQuestionFingerprint = Pick<
  Question,
  'id' | 'questionText' | 'isActive' | 'topicId'
> & {
  normalizedText: string;
  tokenSet: Set<string>;
};

type ImportCandidate = {
  candidate_id: string;
  question_number: number;
  source_page: number | null;
  answer_key_label: string | null;
  answer_key_page: number | null;
  source_section: string | null;
  question_text: string;
  options: ExtractedOption[];
  explanation: string | null;
  difficulty: QuestionDifficulty;
  marks: number;
  extraction_confidence: number;
  topic_confidence: number;
  status: 'VALID' | 'NEEDS_REVIEW' | 'INVALID';
  issues: ImportIssue[];
  duplicate: DuplicateMatch | null;
};

type PdfPage = {
  page: number;
  text: string;
  source?: 'TEXT_LAYER' | 'OCR' | 'EMPTY';
  confidence?: number;
  textLength?: number;
  ocrAttempted?: boolean;
  layoutReflowed?: boolean;
};

type ParsedPdf = {
  pages: PdfPage[];
  pageCount: number;
  text: string;
  extractionConfidence: number;
  extractionMethod?: 'TEXT_LAYER' | 'OCR' | 'HYBRID_OCR';
  ocrPageCount?: number;
  textLayerPageCount?: number;
  emptyPageCount?: number;
};

type ParsedQuestion = {
  questionNumber: number;
  sourcePage: number | null;
  answerKeyPage: number | null;
  sourceSection: string | null;
  questionText: string;
  options: Array<{ label: string; text: string }>;
  correctLabel: string | null;
  explanation: string | null;
};

type ParsingSection = {
  title: string | null;
  text: string;
  offset: number;
};

type AnswerKeyEntry = { label: string; page: number | null };
type ParsedSectionDiagnostics = {
  title: string | null;
  answerKey?: Map<number, AnswerKeyEntry>;
  expectedQuestionNumbers: number[];
  parsedQuestionNumbers: number[];
  missingQuestionNumbers: number[];
  unexpectedQuestionNumbers: number[];
  duplicateQuestionNumbers?: number[];
  answerKeyConflicts?: Array<{ questionNumber: number; labels: string[] }>;
  expectedQuestionCount: number | null;
  parsedQuestionCount: number;
  completeness: number | null;
};
type ParsedQuestionDocument = {
  documentType: QuestionDocumentType;
  answerKey: Map<number, AnswerKeyEntry>;
  questions: ParsedQuestion[];
  sections?: ParsedSectionDiagnostics[];
  expectedQuestionCount?: number | null;
  parsedQuestionCount?: number;
  missingQuestionCount?: number;
  isStructurallyComplete?: boolean;
};

const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_PDF_PAGES = 200;
const MAX_PARSED_MCQ_OPTIONS = 6;
const IMPORT_REFERENCE_PREFIX = 'MDP_PDF_IMPORT';

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
  'in', 'is', 'it', 'most', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was',
  'what', 'which', 'with', 'patient', 'following', 'best', 'answer', 'finding',
]);

@Injectable()
export class QuestionImportService {
  constructor(
    @InjectRepository(Question)
    private readonly questions: Repository<Question>,
    @InjectRepository(Topic)
    private readonly topics: Repository<Topic>,
    private readonly dataSource: DataSource,
    private readonly academicAccess: AcademicAccessService,
  ) {}

  private readonly logger = new Logger(QuestionImportService.name);

  async inspectPdf(
    dto: InspectQuestionImportDto,
    file: UploadedResourceFile | undefined,
    actor: AuthenticatedUser,
  ) {
    if (!dto.copyright_confirmed) {
      throw new BadRequestException(
        'Confirm that you have permission to use the uploaded question material',
      );
    }
    await this.academicAccess.assertTopicReadable(dto.topic_id, actor);
    this.validatePdfFile(file);
    const safeFile = file;
    const inspectStartedAt = Date.now();
    const sha256 = createHash('sha256').update(safeFile.buffer).digest('hex');

    // Database lookups are independent of binary PDF extraction, so overlap
    // them instead of adding their latency to the critical path.
    const previouslyPublishedPromise = this.questions
      .createQueryBuilder('question')
      .where('question.reference LIKE :reference', {
        reference: `%${IMPORT_REFERENCE_PREFIX}%sha256=${sha256}%`,
      })
      .getCount();
    const topicPromise = this.topics.findOne({
      where: { id: dto.topic_id },
      relations: { lecture: true },
    });
    const existingQuestionsPromise = this.questions.find({
      where: { topicId: dto.topic_id },
      select: { id: true, questionText: true, isActive: true, topicId: true },
      take: 1000,
    });

    const extractionStartedAt = Date.now();
    let pdf = await this.extractPdf(safeFile.buffer);
    const extractionMs = Date.now() - extractionStartedAt;
    const databaseStartedAt = Date.now();
    const [previouslyPublished, topic, existing] = await Promise.all([
      previouslyPublishedPromise,
      topicPromise,
      existingQuestionsPromise,
    ]);
    const databaseWaitMs = Date.now() - databaseStartedAt;
    if (!topic) throw new BadRequestException('Selected topic no longer exists');

    // The MCQ fast path intentionally defers speculative OCR. A fully raster
    // document is the one case where there is nothing to parse first, so
    // preserve the old OCR capability by recovering all physical pages only
    // after the cheap text-layer attempt proves there is no usable text.
    let rasterFallbackTriggered = false;
    let rasterFallbackMs = 0;
    if (!pdf.text.trim()) {
      rasterFallbackTriggered = true;
      const rasterFallbackStartedAt = Date.now();
      const recoveredRasterPdf = await this.recoverIncompletePdf(
        safeFile.buffer,
        pdf,
        pdf.pages.map((page) => page.page),
      );
      rasterFallbackMs = Date.now() - rasterFallbackStartedAt;
      if (recoveredRasterPdf?.text.trim()) {
        pdf = recoveredRasterPdf;
      }
    }

    if (!pdf.text.trim()) {
      this.logger.log(
        JSON.stringify({
          event: 'pdf_inspection_timing',
          file_sha256_prefix: sha256.slice(0, 12),
          page_count: pdf.pageCount,
          extracted_questions: 0,
          extraction_ms: extractionMs,
          database_wait_ms: databaseWaitMs,
          raster_fallback_triggered: rasterFallbackTriggered,
          raster_fallback_ms: rasterFallbackMs,
          parse_ms: 0,
          recovery_triggered: false,
          recovery_pages: [],
          structural_recovery_strategy: 'TARGETED_ONLY',
          recovery_ms: 0,
          evaluation_ms: 0,
          total_ms: Date.now() - inspectStartedAt,
          outcome: 'NO_USABLE_TEXT',
        }),
      );
      return {
        original_filename: this.safeFilename(safeFile.originalname),
        file_sha256: sha256,
        file_size: safeFile.size,
        page_count: pdf.pageCount,
        extraction_method: pdf.extractionMethod || 'TEXT_LAYER',
        extraction_confidence: pdf.extractionConfidence,
        status: 'NEEDS_OCR',
        previously_published_from_same_file: previouslyPublished,
        topic: { id: topic.id, name: topic.topicName },
        issues: [
          {
            code: 'NO_USABLE_TEXT_LAYER',
            severity: 'ERROR',
            message:
              'No usable text could be recovered from the PDF text layer or OCR fallback. Re-export the PDF with embedded text or verify that Tesseract OCR is available.',
          },
        ],
        parser: {
          schema_version: '3.0', requested_document_type: 'MCQ',
          detected_document_type: 'UNKNOWN' as QuestionDocumentType,
          answer_key: {} as Record<string, { answer: string; page: number | null }>, mapped_answers: 0,
        },
        sections: [] as Array<{ title: string; questions: number }>,
        pages: pdf.pages.map((page) => ({
          page: page.page,
          source: page.source || 'EMPTY',
          confidence: page.confidence ?? 0,
          text_length: page.textLength ?? page.text.trim().length,
          ocr_attempted: page.ocrAttempted ?? false,
          layout_reflowed: page.layoutReflowed ?? false,
        })),
        candidates: [] as ImportCandidate[],
      };
    }

    const documentType = detectQuestionDocumentType(pdf.text);
    if (documentType === 'ESSAY_CASES') {
      throw new BadRequestException('This file contains essay cases, not MCQs. Use the Essay PDF Inspector for this document.');
    }

    const topicCorpus = [
      topic.topicName,
      topic.description || '',
      topic.lecture?.title || '',
      topic.lecture?.description || '',
      ...existing.slice(0, 100).map((question) => question.questionText),
    ].join(' ');
    const topicReferenceTokens = new Set(this.tokens(topicCorpus));
    const existingFingerprints = this.prepareExistingQuestions(existing);

    const parseStartedAt = Date.now();
    let parsedDocument = this.parseQuestions(pdf, documentType);
    let parseMs = Date.now() - parseStartedAt;
    let recoveryMs = 0;
    let recoveryPages: number[] = [];

    const needsStructuralRecovery =
      this.needsStructuralRecovery(parsedDocument);

    if (needsStructuralRecovery) {
      recoveryPages = this.recoveryPageNumbers(pdf, parsedDocument);

      // Structural recovery is deliberately targeted-only. A malformed or
      // missing question must never turn into an unconditional whole-document
      // OCR pass. Fully raster PDFs are handled separately above, where every
      // physical page is genuinely suspect because no text layer exists.
      if (recoveryPages.length > 0) {
        const recoveryStartedAt = Date.now();
        const recoveredPdf = await this.recoverIncompletePdf(
          safeFile.buffer,
          pdf,
          recoveryPages,
        );

        if (recoveredPdf) {
          const recoveryParseStartedAt = Date.now();
          const recoveredDocument = this.parseQuestions(
            recoveredPdf,
            documentType,
          );
          parseMs += Date.now() - recoveryParseStartedAt;

          if (
            this.shouldPreferRecoveredDocument(
              parsedDocument,
              recoveredDocument,
            )
          ) {
            pdf = recoveredPdf;
            parsedDocument = recoveredDocument;
          }
        }
        recoveryMs = Date.now() - recoveryStartedAt;
      }
    }

    const parsed = parsedDocument.questions;
    const pageConfidence = new Map(
      pdf.pages.map((page) => [
        page.page,
        page.confidence ?? pdf.extractionConfidence,
      ]),
    );
    const evaluationStartedAt = Date.now();
    const candidates = parsed.map((candidate, index) =>
        this.evaluateCandidate(
          candidate,
          index,
          topicReferenceTokens,
          existingFingerprints,
          pageConfidence,
          pdf.extractionConfidence,
        ),
      );
    const evaluationMs = Date.now() - evaluationStartedAt;
    const valid = candidates.filter((candidate) => candidate.status === 'VALID').length;
    const needsReview = candidates.filter((candidate) => candidate.status === 'NEEDS_REVIEW').length;
    const invalid = candidates.filter((candidate) => candidate.status === 'INVALID').length;

    const issues: ImportIssue[] = [];
    const structuralSections = parsedDocument.sections || [];
    for (const section of structuralSections) {
      const sectionName = section.title || 'UNSCOPED';
      if (section.expectedQuestionCount === null) {
        issues.push({
          code: 'SECTION_ANSWER_KEY_NOT_DETECTED',
          severity: 'ERROR',
          message: `${sectionName}: no reliable section answer key was detected, so extraction completeness cannot be verified.`,
        });
        continue;
      }
      if (section.missingQuestionNumbers.length > 0) {
        issues.push({
          code: 'SECTION_QUESTIONS_MISSING',
          severity: 'ERROR',
          message: `${sectionName}: answer key expects ${section.expectedQuestionCount} question(s), but ${section.parsedQuestionCount} were parsed. Missing question number(s): ${section.missingQuestionNumbers.join(', ')}.`,
        });
      }
      if (section.unexpectedQuestionNumbers.length > 0) {
        issues.push({
          code: 'SECTION_QUESTIONS_UNEXPECTED',
          severity: 'ERROR',
          message: `${sectionName}: parsed question number(s) not present in the section answer key: ${section.unexpectedQuestionNumbers.join(', ')}.`,
        });
      }
      if ((section.duplicateQuestionNumbers || []).length > 0) {
        issues.push({
          code: 'SECTION_DUPLICATE_QUESTION_NUMBERS',
          severity: 'ERROR',
          message: `${sectionName}: duplicate question number(s) were parsed: ${(section.duplicateQuestionNumbers || []).join(', ')}.`,
        });
      }
      if ((section.answerKeyConflicts || []).length > 0) {
        issues.push({
          code: 'SECTION_ANSWER_KEY_CONFLICT',
          severity: 'ERROR',
          message: `${sectionName}: conflicting answer-key entries were detected for question number(s): ${(section.answerKeyConflicts || []).map((conflict) => conflict.questionNumber).join(', ')}.`,
        });
      }
    }

    const unreadablePages = pdf.pages.filter(
      (page) => (page.ocrAttempted ?? false) && !page.text.trim(),
    );
    if (unreadablePages.length > 0) {
      issues.push({
        code: 'OCR_PAGES_UNREADABLE',
        severity: 'ERROR',
        message: `OCR could not recover usable text from page(s): ${unreadablePages.map((page) => page.page).join(', ')}.`,
      });
    }
    if (candidates.length === 0) {
      issues.push({
        code: 'NO_QUESTIONS_DETECTED',
        severity: 'ERROR',
        message:
          'No supported numbered MCQs were detected. Use numbered questions with A-F answer options, or create the questions manually.',
      });
    }
    if (previouslyPublished > 0) {
      issues.push({
        code: 'FILE_ALREADY_IMPORTED',
        severity: 'WARNING',
        message: `${previouslyPublished} question(s) from this exact PDF hash already exist in the question bank. Reuse detected matches instead of creating copies.`,
      });
    }

    const sectionCounts = new Map<string, number>();
    for (const candidate of candidates) {
      if (!candidate.source_section) continue;
      sectionCounts.set(
        candidate.source_section,
        (sectionCounts.get(candidate.source_section) || 0) + 1,
      );
    }

    this.logger.log(
      JSON.stringify({
        event: 'pdf_inspection_timing',
        file_sha256_prefix: sha256.slice(0, 12),
        page_count: pdf.pageCount,
        extracted_questions: candidates.length,
        extraction_ms: extractionMs,
        database_wait_ms: databaseWaitMs,
        raster_fallback_triggered: rasterFallbackTriggered,
        raster_fallback_ms: rasterFallbackMs,
        parse_ms: parseMs,
        recovery_triggered:
          needsStructuralRecovery && recoveryPages.length > 0,
        recovery_requested: needsStructuralRecovery,
        recovery_pages: recoveryPages,
        structural_recovery_strategy: 'TARGETED_ONLY',
        recovery_ms: recoveryMs,
        evaluation_ms: evaluationMs,
        total_ms: Date.now() - inspectStartedAt,
      }),
    );

    return {
      original_filename: this.safeFilename(safeFile.originalname),
      file_sha256: sha256,
      file_size: safeFile.size,
      page_count: pdf.pageCount,
      extraction_method: pdf.extractionMethod || 'TEXT_LAYER',
      extraction_confidence: pdf.extractionConfidence,
      status: candidates.length
        ? parsedDocument.isStructurallyComplete === false
          ? 'INCOMPLETE_EXTRACTION'
          : 'REVIEW_REQUIRED'
        : 'NO_QUESTIONS',
      previously_published_from_same_file: previouslyPublished,
      topic: { id: topic.id, name: topic.topicName },
      summary: {
        expected:
          parsedDocument.expectedQuestionCount === undefined
            ? null
            : parsedDocument.expectedQuestionCount,
        extracted: candidates.length,
        missing: parsedDocument.missingQuestionCount ?? 0,
        structurally_complete:
          parsedDocument.isStructurallyComplete ?? null,
        valid,
        needs_review: needsReview,
        invalid,
        duplicates: candidates.filter((candidate) => candidate.duplicate).length,
      },
      parser: {
        schema_version: '2.0', requested_document_type: 'MCQ',
        detected_document_type: parsedDocument.documentType,
        answer_key: Object.fromEntries(Array.from(parsedDocument.answerKey.entries()).map(([questionNumber, entry]) => [String(questionNumber), { answer: entry.label, page: entry.page }])),
        mapped_answers: candidates.filter((candidate) => candidate.answer_key_label).length,
        unmapped_question_numbers: candidates.filter((candidate) => !candidate.answer_key_label).map((candidate) => candidate.question_number),
        question_answer_pairs: candidates.map((candidate) => ({
          section: candidate.source_section,
          question_number: candidate.question_number,
          answer: candidate.answer_key_label,
          question_page: candidate.source_page,
          answer_page: candidate.answer_key_page,
        })),
        expected_question_count:
          parsedDocument.expectedQuestionCount === undefined
            ? null
            : parsedDocument.expectedQuestionCount,
        parsed_question_count:
          parsedDocument.parsedQuestionCount ?? parsed.length,
        missing_question_count:
          parsedDocument.missingQuestionCount ?? 0,
        structurally_complete:
          parsedDocument.isStructurallyComplete ?? null,
      },
      sections: structuralSections.length
        ? structuralSections.map((section) => ({
            title: section.title || 'UNSCOPED',
            questions: section.parsedQuestionCount,
            expected_questions: section.expectedQuestionCount,
            missing_question_numbers: section.missingQuestionNumbers,
            unexpected_question_numbers: section.unexpectedQuestionNumbers,
            duplicate_question_numbers: section.duplicateQuestionNumbers || [],
            answer_key_conflicts: section.answerKeyConflicts || [],
            completeness: section.completeness,
          }))
        : Array.from(sectionCounts.entries()).map(([title, questions]) => ({
            title,
            questions,
          })),
      pages: pdf.pages.map((page) => ({
        page: page.page,
        source: page.source || 'TEXT_LAYER',
        confidence: page.confidence ?? pdf.extractionConfidence,
        text_length: page.textLength ?? page.text.trim().length,
        ocr_attempted: page.ocrAttempted ?? false,
        layout_reflowed: page.layoutReflowed ?? false,
      })),
      extraction_breakdown: {
        text_layer_pages: pdf.textLayerPageCount ?? pdf.pages.filter((page) => page.text.trim()).length,
        ocr_pages: pdf.ocrPageCount ?? 0,
        empty_pages: pdf.emptyPageCount ?? pdf.pages.filter((page) => !page.text.trim()).length,
      },
      issues,
      candidates,
    };
  }

  async publish(
    dto: PublishQuestionImportDto,
    actor: AuthenticatedUser,
  ) {
    if (!dto.copyright_confirmed) {
      throw new BadRequestException(
        'Publication requires confirmation that you have permission to use this material',
      );
    }
    if (!/^[a-f0-9]{64}$/i.test(dto.file_sha256)) {
      throw new BadRequestException('Invalid PDF SHA-256 fingerprint');
    }
    await this.academicAccess.assertTopicReadable(dto.topic_id, actor);
    const topic = await this.topics.findOne({
      where: { id: dto.topic_id },
      relations: { lecture: true },
    });
    if (!topic) throw new BadRequestException('Selected topic no longer exists');

    const selected = dto.candidates.filter((candidate) => candidate.approved);
    if (selected.length === 0) {
      throw new BadRequestException('Approve at least one extracted question before publishing');
    }
    const sectionNames = [...new Set(selected.map((candidate) => candidate.source_section?.trim()).filter((name): name is string => Boolean(name)))];
    const siblingTopics = sectionNames.length ? await this.topics.find({ where: { lectureId: topic.lectureId } }) : [];
    const sectionTopics = new Map(siblingTopics.map((item) => [item.topicName.toLocaleLowerCase(), item]));

    const existing = await this.questions.find({
      where: { topicId: topic.id },
      select: { id: true, questionText: true, isActive: true, topicId: true },
      take: 1000,
    });
    const topicCorpus = [
      topic.topicName,
      topic.description || '',
      topic.lecture?.title || '',
      topic.lecture?.description || '',
      ...existing.slice(0, 100).map((question) => question.questionText),
    ].join(' ');
    const topicReferenceTokens = new Set(this.tokens(topicCorpus));
    const existingFingerprints = this.prepareExistingQuestions(existing);

    for (const [index, candidate] of selected.entries()) {
      this.validatePublishCandidate(candidate, index);
      const topicConfidence = this.topicConfidenceFromTokens(
        candidate.question_text,
        topicReferenceTokens,
      );
      if (topicConfidence < 0.08 && !candidate.allow_topic_override) {
        throw new BadRequestException(
          `Question ${index + 1} has a very low lexical match to ${topic.topicName}. Review it or explicitly confirm the topic override.`,
        );
      }
      if (candidate.reuse_question_id) {
        const reusable = existing.find(
          (question) => question.id === candidate.reuse_question_id && question.isActive,
        );
        if (!reusable) {
          throw new BadRequestException(
            `Question ${index + 1} references a reusable question that is missing, inactive, or outside the selected topic`,
          );
        }
        continue;
      }
      const duplicate = this.bestDuplicate(
        candidate.question_text,
        existingFingerprints,
      );
      if (duplicate && duplicate.similarity >= 0.92 && !candidate.allow_duplicate) {
        throw new ConflictException(
          `Question ${index + 1} closely matches an existing question (${Math.round(duplicate.similarity * 100)}%). Reuse it or explicitly allow a new copy.`,
        );
      }
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const published: Array<{
        question_id: string;
        action: 'CREATED' | 'REUSED';
        source_page: number | null;
      }> = [];

      for (const candidate of selected) {
        if (candidate.reuse_question_id) {
          published.push({
            question_id: candidate.reuse_question_id,
            action: 'REUSED',
            source_page: candidate.source_page ?? null,
          });
          continue;
        }

        const sectionName = candidate.source_section?.trim();
        let destinationTopicId = topic.id;
        if (sectionName) {
          const key = sectionName.toLocaleLowerCase();
          let destination = sectionTopics.get(key);
          if (!destination) {
            destination = await manager.save(Topic, manager.create(Topic, {
              lectureId: topic.lectureId,
              topicName: sectionName,
              description: null,
              displayOrder: siblingTopics.length + sectionTopics.size + 1,
            }));
            sectionTopics.set(key, destination);
          }
          destinationTopicId = destination.id;
        }
        const question = await manager.save(
          Question,
          manager.create(Question, {
            topicId: destinationTopicId,
            questionType: QuestionType.MCQ,
            title: null,
            questionText: candidate.question_text.trim(),
            explanation: candidate.explanation?.trim() || null,
            hint: null,
            reference: this.importReference(
              dto.original_filename,
              dto.file_sha256,
              candidate.source_page ?? null,
            ),
            difficulty: candidate.difficulty,
            estimatedTimeSeconds: 75,
            marks: Number(candidate.marks).toFixed(2),
            isQuestionBank: true,
            version: 1,
            isActive: true,
            createdBy: actor.userId,
          }),
        );

        await manager.save(
          McqOption,
          candidate.options.map((option, optionIndex) =>
            manager.create(McqOption, {
              questionId: question.id,
              optionText: option.option_text.trim(),
              isCorrect: option.is_correct,
              displayOrder: optionIndex + 1,
            }),
          ),
        );
        published.push({
          question_id: question.id,
          action: 'CREATED',
          source_page: candidate.source_page ?? null,
        });
      }
      return published;
    });

    return {
      topic_id: dto.topic_id,
      file_sha256: dto.file_sha256.toLowerCase(),
      created: result.filter((item) => item.action === 'CREATED').length,
      reused: result.filter((item) => item.action === 'REUSED').length,
      skipped: dto.candidates.length - selected.length,
      questions: result,
    };
  }

  private validatePdfFile(file: UploadedResourceFile | undefined): asserts file is UploadedResourceFile {
    if (!file?.buffer?.length) throw new BadRequestException('Select a non-empty PDF file');
    if (file.size > MAX_PDF_BYTES) {
      throw new BadRequestException('PDF imports are limited to 50 MB');
    }
    if (!/\.pdf$/i.test(file.originalname || '')) {
      throw new BadRequestException('Question imports must use a .pdf filename');
    }
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Declared file type must be application/pdf');
    }
    if (file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new BadRequestException('Uploaded content is not a real PDF file');
    }
  }

  protected async extractPdf(buffer: Buffer): Promise<ParsedPdf> {
    const binary = buffer.toString('latin1');
    if (/\/Encrypt\b/.test(binary)) {
      throw new BadRequestException('Password-protected or encrypted PDFs are not supported for question import');
    }
    const declaredPageCount = (binary.match(/\/Type\s*\/Page\b/g) || []).length;
    if (declaredPageCount < 1) {
      throw new BadRequestException('The PDF does not contain a readable page structure');
    }
    if (declaredPageCount > MAX_PDF_PAGES) {
      throw new BadRequestException(`PDF imports are limited to ${MAX_PDF_PAGES} pages`);
    }

    const objects = new Map<number, string>();
    const objectPattern = /(\d+)\s+\d+\s+obj\b([\s\S]*?)endobj/g;
    let objectMatch: RegExpExecArray | null;
    while ((objectMatch = objectPattern.exec(binary)) !== null) {
      objects.set(Number(objectMatch[1]), objectMatch[2]);
    }

    const pages: PdfPage[] = [];
    for (const body of objects.values()) {
      if (!/\/Type\s*\/Page\b/.test(body)) continue;
      const refs: number[] = [];
      const single = body.match(/\/Contents\s+(\d+)\s+\d+\s+R/);
      if (single) refs.push(Number(single[1]));
      const list = body.match(/\/Contents\s*\[([^\]]+)\]/);
      if (list) {
        const refPattern = /(\d+)\s+\d+\s+R/g;
        let ref: RegExpExecArray | null;
        while ((ref = refPattern.exec(list[1])) !== null) refs.push(Number(ref[1]));
      }
      const text = refs
        .map((reference) => objects.get(reference))
        .filter((value): value is string => Boolean(value))
        .map((value) => this.extractTextFromStreamObject(value))
        .filter(Boolean)
        .join('\n');
      pages.push({ page: pages.length + 1, text });
    }

    if (pages.length === 0 || pages.every((page) => !page.text.trim())) {
      const fallback = Array.from(objects.values())
        .map((value) => this.extractTextFromStreamObject(value))
        .filter(Boolean)
        .join('\n');
      pages.push({ page: 1, text: fallback });
    }

    const text = pages.map((page) => page.text).join('\n');
    const printable = Array.from(text).filter((character) => {
      const code = character.charCodeAt(0);
      return character === '\n' || character === '\t' || code >= 32;
    }).length;
    const printableRatio = text.length ? printable / text.length : 0;
    const density = Math.min(1, text.trim().length / Math.max(300, declaredPageCount * 250));
    const extractionConfidence = Number(
      Math.max(0, Math.min(1, printableRatio * 0.65 + density * 0.35)).toFixed(2),
    );
    return {
      pages,
      pageCount: declaredPageCount,
      text,
      extractionConfidence,
    };
  }

  private extractTextFromStreamObject(body: string): string {
    const stream = body.match(/stream\r?\n?([\s\S]*?)\r?\n?endstream/);
    if (!stream) return '';
    const raw = Buffer.from(stream[1], 'latin1');
    let decoded = raw;
    try {
      if (/\/FlateDecode\b/.test(body)) decoded = inflateSync(raw);
      else if (/\/Filter\b/.test(body)) return '';
    } catch {
      return '';
    }
    return this.extractTextOperators(decoded.toString('latin1'));
  }

  private extractTextOperators(content: string): string {
    const output: string[] = [];
    const pattern = /(\((?:\\.|[^\\])*?\)|<[A-Fa-f0-9\s]+>|\[(?:\\.|[^\]])*\])\s*(Tj|TJ|'|")/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const operand = match[1];
      if (operand.startsWith('[')) {
        const values: string[] = [];
        const inner = /\((?:\\.|[^\\)])*\)|<[A-Fa-f0-9\s]+>/g;
        let value: RegExpExecArray | null;
        while ((value = inner.exec(operand)) !== null) {
          values.push(this.decodePdfString(value[0]));
        }
        if (values.length) output.push(values.join(''));
      } else {
        output.push(this.decodePdfString(operand));
      }
    }
    return output
      .map((line) => line.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim())
      .filter(Boolean)
      .join('\n');
  }

  private decodePdfString(value: string): string {
    if (value.startsWith('<')) {
      const hex = value.slice(1, -1).replace(/\s+/g, '');
      if (!hex || hex.length % 2 !== 0) return '';
      const bytes = Buffer.from(hex, 'hex');
      if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        let result = '';
        for (let index = 2; index + 1 < bytes.length; index += 2) {
          result += String.fromCharCode(bytes.readUInt16BE(index));
        }
        return result;
      }
      return bytes.toString('latin1');
    }

    const source = value.slice(1, -1);
    let output = '';
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (character !== '\\') {
        output += character;
        continue;
      }
      const next = source[index + 1];
      if (next === undefined) break;
      if (/[0-7]/.test(next)) {
        const octal = source.slice(index + 1).match(/^[0-7]{1,3}/)?.[0] || next;
        output += String.fromCharCode(parseInt(octal, 8));
        index += octal.length;
        continue;
      }
      const escapes: Record<string, string> = {
        n: '\n',
        r: '\r',
        t: '\t',
        b: '\b',
        f: '\f',
        '(': '(',
        ')': ')',
        '\\': '\\',
      };
      if (next === '\n' || next === '\r') {
        index += next === '\r' && source[index + 2] === '\n' ? 2 : 1;
        continue;
      }
      output += escapes[next] ?? next;
      index += 1;
    }
    return output;
  }

  protected async recoverIncompletePdf(
    _buffer: Buffer,
    _currentPdf: ParsedPdf,
    _pageNumbers: number[],
  ): Promise<ParsedPdf | null> {
    return null;
  }

  private needsStructuralRecovery(
    document: ParsedQuestionDocument,
  ): boolean {
    return (
      document.isStructurallyComplete === false ||
      document.questions.some(
        (question) =>
          question.options.length === MIN_MCQ_OPTIONS ||
          !isSupportedMcqOptionCount(question.options.length) ||
          !question.correctLabel ||
          !question.options.some(
            (option) => option.label === question.correctLabel,
          ),
      )
    );
  }

  private recoveryPageNumbers(
    pdf: ParsedPdf,
    document: ParsedQuestionDocument,
  ): number[] {
    const pages = new Set<number>();
    const sections = document.sections || [];
    const sectionByTitle = new Map(
      sections.map((section) => [section.title || null, section]),
    );

    const addPage = (page: number | null | undefined) => {
      if (!page) return;
      if (page >= 1 && page <= pdf.pageCount) pages.add(page);
    };

    const addWindow = (
      page: number | null | undefined,
      before = 1,
      after = 1,
    ) => {
      if (!page) return;
      for (let offset = -before; offset <= after; offset += 1) {
        addPage(page + offset);
      }
    };

    const rawQuestionPages = (questionNumber: number) =>
      pdf.pages
        .filter((page) =>
          this.pageContainsQuestionNumber(page.text, questionNumber),
        )
        .map((page) => page.page);

    const sectionAnswerKeyPages = (
      section: ParsedSectionDiagnostics,
      scoped: ParsedQuestion[],
    ) => {
      const known = new Set<number>();
      for (const entry of section.answerKey?.values() || []) {
        if (entry.page) known.add(entry.page);
      }
      for (const question of scoped) {
        if (question.answerKeyPage) known.add(question.answerKeyPage);
      }
      return [...known].sort((left, right) => left - right);
    };

    // Parsed malformed questions already have physical provenance. Recover the
    // question page and its immediate boundary neighbors, plus the known answer
    // key page when the key itself may be involved.
    for (const question of document.questions) {
      const fourOptionAmbiguity = question.options.length === MIN_MCQ_OPTIONS;
      const invalidOptions = !isSupportedMcqOptionCount(question.options.length);
      const answerOutsideOptions =
        Boolean(question.correctLabel) &&
        !question.options.some(
          (option) => option.label === question.correctLabel,
        );

      // Four options are valid after instructor confirmation, but on first
      // inspection they are also indistinguishable from a dropped option E.
      // Give OCR one narrow chance to recover the source page (and a possible
      // continuation page) before asking the instructor to confirm A-D.
      if (fourOptionAmbiguity) {
        addWindow(question.sourcePage, 0, 1);
        continue;
      }

      if (invalidOptions || answerOutsideOptions) {
        addWindow(question.sourcePage);
        addWindow(question.answerKeyPage);
        continue;
      }

      if (!question.correctLabel) {
        const section = sectionByTitle.get(question.sourceSection || null);
        if (section?.expectedQuestionCount != null) {
          addWindow(question.sourcePage);
          for (const page of sectionAnswerKeyPages(
            section,
            document.questions.filter(
              (peer) =>
                (peer.sourceSection || null) ===
                (question.sourceSection || null),
            ),
          )) {
            addWindow(page);
          }
        }
      }
    }

    for (const section of sections) {
      const scoped = document.questions
        .filter(
          (question) =>
            (question.sourceSection || null) === (section.title || null),
        )
        .sort((left, right) => left.questionNumber - right.questionNumber);
      const answerKeyPages = sectionAnswerKeyPages(section, scoped);

      // No answer key detected: canonical PDFs place the key after the section.
      // Probe only the local tail around the final parsed question.
      if (section.expectedQuestionCount === null && scoped.length > 0) {
        const lastSourcePage = scoped
          .map((question) => question.sourcePage)
          .filter((page): page is number => Boolean(page))
          .sort((left, right) => left - right)
          .at(-1);
        addWindow(lastSourcePage, 1, 3);
      }

      for (const missing of section.missingQuestionNumbers) {
        // Strongest signal: the text layer still contains the missing question
        // number but the parser could not recover its A-E structure.
        const directPages = rawQuestionPages(missing);
        if (directPages.length > 0) {
          for (const page of directPages) addWindow(page);
          continue;
        }

        // Otherwise recover only around the nearest successfully parsed
        // neighbors. This covers questions split across physical page breaks.
        const lower = [...scoped]
          .reverse()
          .find((question) => question.questionNumber < missing);
        const upper = scoped.find(
          (question) => question.questionNumber > missing,
        );
        if (lower?.sourcePage || upper?.sourcePage) {
          addWindow(lower?.sourcePage);
          addWindow(upper?.sourcePage);
          continue;
        }

        // If the section has no parsed question provenance at all, use the
        // answer-key page as an anchor and probe the few pages immediately
        // preceding it rather than OCRing the document.
        for (const page of answerKeyPages) {
          addWindow(page, 3, 0);
        }
      }

      // Duplicate/unexpected numbers can often be localized directly from the
      // raw text layer even when canonical parsing could not assign them safely.
      const suspiciousNumbers = new Set([
        ...section.unexpectedQuestionNumbers,
        ...(section.duplicateQuestionNumbers || []),
      ]);
      for (const number of suspiciousNumbers) {
        for (const page of rawQuestionPages(number)) addWindow(page);
      }

      if ((section.answerKeyConflicts || []).length > 0) {
        for (const page of answerKeyPages) addWindow(page);
      }
    }

    // Legacy/uncategorized PDFs without section diagnostics still get a small
    // answer-key-tail probe when all parsed questions are unmapped.
    if (
      sections.length === 0 &&
      document.questions.length > 0 &&
      document.questions.every((question) => !question.correctLabel)
    ) {
      const lastSourcePage = document.questions
        .map((question) => question.sourcePage)
        .filter((page): page is number => Boolean(page))
        .sort((left, right) => left - right)
        .at(-1);
      addWindow(lastSourcePage, 1, 3);
    }

    // Weak text-layer pages are themselves suspect, but do not automatically
    // expand each one to neighboring pages; that old behavior could make a
    // moderately weak document silently approach whole-document OCR.
    for (const page of pdf.pages) {
      if (
        page.source !== 'OCR' &&
        (page.confidence ?? pdf.extractionConfidence) < 0.7
      ) {
        addPage(page.page);
      }
    }

    // Last-resort localization uses only pages with concrete structural damage
    // signals. If there is no evidence pointing to a page, return no recovery
    // pages and leave the extraction explicitly incomplete rather than spending
    // minutes OCRing unrelated pages.
    if (pages.size === 0 && document.isStructurallyComplete === false) {
      for (const page of this.structuralProbePages(pdf)) addWindow(page);
    }

    return [...pages].sort((left, right) => left - right);
  }

  private pageContainsQuestionNumber(
    text: string,
    questionNumber: number,
  ): boolean {
    for (const line of text.split('\n')) {
      const match = line.match(
        /^\s*(?:Q(?:uestion)?\s*)?(?:\((\d{1,4})\)|(\d{1,4})\s*[.)\]:\-–—])\s+(.+)$/i,
      );
      if (!match) continue;
      const parsed = Number(match[1] || match[2]);
      if (parsed !== questionNumber) continue;

      // Do not confuse compact answer-key rows such as "12) B" with a
      // question stem. A real stem may legitimately begin with "A patient...",
      // so only reject a remainder that is nothing more than one option label.
      const remainder = match[3].trim();
      if (/^\(?[A-F]\)?[.)]?\s*$/i.test(remainder)) continue;
      return true;
    }
    return false;
  }

  private structuralProbePages(pdf: ParsedPdf): number[] {
    const scored = pdf.pages
      .filter((page) => page.source !== 'OCR')
      .map((page) => {
        const text = page.text || '';
        const questionStarts = (
          text.match(
            /^\s*(?:Q(?:uestion)?\s*)?(?:\(\d{1,4}\)|\d{1,4}\s*[.)\]:\-–—])\s+/gim,
          ) || []
        ).length;
        const optionStarts = (
          text.match(
            /^\s*(?:\([A-F]\)|[A-F]\s*[.)\]:\-–—])\s+/gim,
          ) || []
        ).length;
        const explicitAnswerKeySignals = (
          text.match(
            /^\s*(?:answer\s*keys?|answers|correct\s+answers?|solutions?|key)\b/gim,
          ) || []
        ).length;
        const compactAnswerKeySignals = text
          .split('\n')
          .filter((line) => this.isCompactAnswerKeyLine(line)).length;
        const answerKeySignals =
          explicitAnswerKeySignals + compactAnswerKeySignals;
        const replacements = (text.match(/\uFFFD/g) || []).length;
        const confidence = page.confidence ?? pdf.extractionConfidence;

        let score = 0;
        if (confidence < 0.7) score += 6;
        if (replacements > 0) score += 6;
        if (
          questionStarts > 0 &&
          optionStarts < questionStarts * (STANDARD_MCQ_OPTIONS - 1)
        ) {
          score += 5;
        }
        if (
          questionStarts > 0 &&
          optionStarts > 0 &&
          optionStarts % STANDARD_MCQ_OPTIONS !== 0
        ) {
          score += 2;
        }
        if (answerKeySignals > 0) score += 2;

        return { page: page.page, score };
      })
      .filter((item) => item.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score || left.page - right.page,
      );

    const limit = Math.min(
      6,
      Math.max(2, Math.ceil(pdf.pageCount * 0.15)),
    );
    return scored
      .slice(0, limit)
      .map((item) => item.page)
      .sort((left, right) => left - right);
  }

  private shouldPreferRecoveredDocument(
    current: ParsedQuestionDocument,
    recovered: ParsedQuestionDocument,
  ): boolean {
    const currentExpected = current.expectedQuestionCount ?? 0;
    const recoveredExpected = recovered.expectedQuestionCount ?? 0;
    const currentMissing =
      current.missingQuestionCount ?? Number.POSITIVE_INFINITY;
    const recoveredMissing =
      recovered.missingQuestionCount ?? Number.POSITIVE_INFINITY;
    const currentValidStructures =
      this.countStructurallyValidParsedQuestions(current);
    const recoveredValidStructures =
      this.countStructurallyValidParsedQuestions(recovered);
    const currentStandardStructures =
      this.countStandardFiveOptionParsedQuestions(current);
    const recoveredStandardStructures =
      this.countStandardFiveOptionParsedQuestions(recovered);

    // OCR must not lose an answer-key contract that the text layer already
    // established, nor may it trade structurally valid four/five-option
    // questions for merely more detected question numbers.
    if (recoveredExpected < currentExpected) return false;
    if (recoveredMissing > currentMissing) return false;
    if (recoveredValidStructures < currentValidStructures) return false;

    if (recoveredMissing < currentMissing) return true;
    if (recoveredValidStructures > currentValidStructures) return true;
    if (recoveredStandardStructures > currentStandardStructures) return true;

    if (
      recovered.isStructurallyComplete === true &&
      current.isStructurallyComplete !== true
    ) {
      return true;
    }

    return recovered.questions.length > current.questions.length;
  }

  private countStructurallyValidParsedQuestions(
    document: ParsedQuestionDocument,
  ): number {
    return document.questions.filter(
      (question) =>
        isSupportedMcqOptionCount(question.options.length) &&
        Boolean(question.correctLabel) &&
        question.options.some(
          (option) => option.label === question.correctLabel,
        ),
    ).length;
  }

  private countStandardFiveOptionParsedQuestions(
    document: ParsedQuestionDocument,
  ): number {
    return document.questions.filter(
      (question) =>
        question.options.length === STANDARD_MCQ_OPTIONS &&
        Boolean(question.correctLabel) &&
        question.options.some(
          (option) => option.label === question.correctLabel,
        ),
    ).length;
  }

  protected parseQuestions(
    pdf: ParsedPdf,
    documentType: QuestionDocumentType = detectQuestionDocumentType(pdf.text),
  ): ParsedQuestionDocument {
    const preparedPages = pdf.pages.map((page) => ({
      page: page.page,
      text: this.prepareForParsing(page.text),
    }));
    const combined = preparedPages
      .map((page) => `\n[[MDP_PAGE_${page.page}]]\n${page.text}`)
      .join('\n');
    const answerKey = this.extractAnswerKey(combined);
    const sections = this.splitLectureSections(combined);
    return {
      documentType,
      answerKey,
      questions: sections.flatMap((section) => {
        const scopedAnswerKey = new Map(answerKey);
        for (const [number, entry] of this.extractAnswerKey(section.text)) {
          scopedAnswerKey.set(number, entry);
        }
        return this.parseSectionQuestions(section, combined, scopedAnswerKey);
      }),
    };
  }

  private splitLectureSections(combined: string): ParsingSection[] {
    const headingPattern = /^[ \t]*(Lecture\s+(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|\d+)(?:\s*[:-])?[^\n]*|Diabetes \(diagnosis and classification\)|Macro vascular|Other Symptoms of diabetes|Microvascular Complications|Pharma of DM|Gestational diabetes)[ \t]*$/gim;
    const headings = Array.from(combined.matchAll(headingPattern));
    if (headings.length === 0) {
      return [{ title: null, text: combined, offset: 0 }];
    }

    const sections: ParsingSection[] = [];
    for (let index = 0; index < headings.length; index += 1) {
      const heading = headings[index];
      const offset = heading.index || 0;
      const end = headings[index + 1]?.index ?? combined.length;
      sections.push({
        title: heading[1].replace(/\s+/g, ' ').trim(),
        text: combined.slice(offset, end),
        offset,
      });
    }
    return sections;
  }

  private parseSectionQuestions(
    section: ParsingSection,
    combined: string,
    answerKey: Map<number, AnswerKeyEntry>,
  ): ParsedQuestion[] {
    const starts = Array.from(
      section.text.matchAll(/^\s*(?:Q(?:uestion)?\s*)?(\d{1,3})[.)]\s+(.+)$/gim),
    ).filter((match) => !this.isCompactAnswerKeyLine(match[0]));
    const candidates: ParsedQuestion[] = [];

    for (let index = 0; index < starts.length; index += 1) {
      const start = starts[index];
      const localStart = start.index || 0;
      const localEnd = starts[index + 1]?.index ?? section.text.length;
      let block = section.text.slice(localStart, localEnd);
      if (this.isCompactAnswerKeyLine(block.split('\n')[0] || '')) continue;
      const sourcePage = this.pageBefore(combined, section.offset + localStart);
      block = block.replace(/\[\[MDP_PAGE_\d+\]\]/g, '\n');
      const questionNumber = Number(start[1]);
      const firstOption = block.search(/^\s*[A-F][.)]\s+/im);
      if (firstOption < 0) continue;
      const stem = block
        .slice(0, firstOption)
        .replace(/^\s*(?:Q(?:uestion)?\s*)?\d{1,3}[.)]\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      const optionArea = block.slice(firstOption);
      const options = this.parseOptions(optionArea);
      const inlineAnswer = block.match(/(?:Correct\s+Answer|Answer)\s*[:-]\s*([A-F])\b/i)?.[1]?.toUpperCase() || null;
      const answerKeyEntry = answerKey.get(questionNumber) || null;
      const correctLabel = inlineAnswer || answerKeyEntry?.label || null;
      const explanation = block.match(/(?:Explanation|Rationale)\s*:\s*([\s\S]+?)(?=$)/i)?.[1]
        ?.replace(/\s+/g, ' ')
        .trim() || null;
      if (stem) {
        candidates.push({
          questionNumber,
          sourcePage,
          answerKeyPage: inlineAnswer ? sourcePage : answerKeyEntry?.page ?? null,
          sourceSection: section.title,
          questionText: stem,
          options,
          correctLabel,
          explanation,
        });
      }
    }
    return candidates;
  }

  private parseOptions(optionArea: string): Array<{ label: string; text: string }> {
    const metadata = optionArea.search(/^\s*(?:Correct\s+Answer|Answer|Explanation|Rationale)\s*:/im);
    const compactKey = this.findCompactAnswerKeyOffset(optionArea);
    const hardEnd = [metadata, compactKey]
      .filter((value) => value >= 0)
      .reduce((lowest, value) => Math.min(lowest, value), optionArea.length);
    const area = optionArea.slice(0, hardEnd);
    const markers = Array.from(area.matchAll(/^\s*([A-F])[.)]\s*/gim));
    if (markers.length === 0) return [];

    const accepted: RegExpMatchArray[] = [];
    let previous = 64;
    let resetAt = area.length;
    for (const marker of markers) {
      const code = marker[1].toUpperCase().charCodeAt(0);
      if (accepted.length > 0 && code <= previous) {
        resetAt = marker.index ?? area.length;
        break;
      }
      if (accepted.length > 0 && code !== previous + 1) {
        resetAt = marker.index ?? area.length;
        break;
      }
      accepted.push(marker);
      previous = code;
      if (accepted.length >= MAX_PARSED_MCQ_OPTIONS) break;
    }

    return accepted.map((marker, index) => {
      const start = (marker.index || 0) + marker[0].length;
      const next = accepted[index + 1]?.index ?? resetAt;
      const text = area.slice(start, next).replace(/\s+/g, ' ').trim();
      return { label: marker[1].toUpperCase(), text };
    }).filter((option) => Boolean(option.text));
  }

  private prepareForParsing(value: string): string {
    return value
      .replace(/\r/g, '\n')
      .replace(/[\t ]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s+([A-F])[.)]\s+/g, '\n$1. ')
      .replace(/\s+(Correct\s+Answer|Answer|Explanation|Rationale)\s*:/gi, '\n$1:')
      .replace(/\s+(Q(?:uestion)?\s*\d{1,3}[.)])\s+/gi, '\n$1 ')
      .replace(/\s+(Lecture\s+(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|\d+))/gi, '\n$1')
      .trim();
  }

  private extractAnswerKey(value: string): Map<number, AnswerKeyEntry> {
    const result = new Map<number, AnswerKeyEntry>();
    let offset = 0;
    let inExplicitAnswerKey = false;
    for (const line of value.split('\n')) {
      if (/answer\s*key/i.test(line)) inExplicitAnswerKey = true;
      const pairs = Array.from(line.matchAll(/(?:^|\s|\||\()(\d{1,3})\s*[.)\-:]?\s*([A-F])(?=\s|$|\|)/gi));
      if (inExplicitAnswerKey || this.isCompactAnswerKeyLine(line)) {
        for (const pair of pairs) {
          const questionNumber = Number(pair[1]);
          const entry = { label: pair[2].toUpperCase(), page: this.pageBefore(value, offset + (pair.index || 0)) };
          const existing = result.get(questionNumber);
          if (!existing || existing.label === entry.label) result.set(questionNumber, entry);
        }
      }
      offset += line.length + 1;
    }
    return result;
  }

  private isCompactAnswerKeyLine(value: string): boolean {
    const line = value.replace(/\[\[MDP_PAGE_\d+\]\]/g, '').trim();
    if (!line) return false;
    const pairs = Array.from(line.matchAll(/(?:^|\s|\||\()(\d{1,3})\s*[.)\-:]?\s*([A-F])(?=\s|$|\|)/gi));
    if (!pairs.length) return false;
    const remainder = line
      .replace(/(?:^|\s|\||\()\d{1,3}\s*[.)\-:]?\s*[A-F](?=\s|$|\|)/gi, ' ')
      .replace(/[|,;]+/g, ' ')
      .trim();
    return remainder.length === 0;
  }

  private findCompactAnswerKeyOffset(value: string): number {
    let offset = 0;
    for (const line of value.split('\n')) {
      if (this.isCompactAnswerKeyLine(line)) return offset;
      offset += line.length + 1;
    }
    return -1;
  }

  private pageBefore(value: string, index: number): number | null {
    const prefix = value.slice(0, index);
    const matches = Array.from(prefix.matchAll(/\[\[MDP_PAGE_(\d+)\]\]/g));
    const last = matches.at(-1);
    return last ? Number(last[1]) : null;
  }

  private evaluateCandidate(
    candidate: ParsedQuestion,
    index: number,
    topicReferenceTokens: Set<string>,
    existing: ExistingQuestionFingerprint[],
    pageConfidence: Map<number, number> = new Map(),
    documentExtractionConfidence = 1,
  ): ImportCandidate {
    const issues: ImportIssue[] = [];
    const optionTexts = candidate.options.map((option) => this.normalize(option.text));
    if (candidate.questionText.length < 8) {
      issues.push({ code: 'STEM_TOO_SHORT', severity: 'ERROR', message: 'Question stem is too short to publish safely.' });
    }
    if (candidate.options.length === MIN_MCQ_OPTIONS) {
      issues.push({
        code: 'FOUR_OPTION_MCQ',
        severity: 'WARNING',
        message: 'This MCQ contains four answer choices (A-D). Confirm during review that the source intentionally has four choices rather than a missing fifth option.',
      });
    } else if (!isSupportedMcqOptionCount(candidate.options.length)) {
      issues.push({
        code: 'INVALID_OPTION_COUNT',
        severity: 'ERROR',
        message: `MCQs must contain ${MIN_MCQ_OPTIONS} or ${MAX_MCQ_OPTIONS} answer options.`,
      });
    }
    if (new Set(optionTexts).size !== optionTexts.length) {
      issues.push({ code: 'DUPLICATE_OPTIONS', severity: 'ERROR', message: 'Two or more answer options contain the same normalized text.' });
    }
    if (!candidate.correctLabel) {
      issues.push({ code: 'MISSING_ANSWER_KEY', severity: 'WARNING', message: 'No reliable answer key was detected. Select the correct option during review.' });
    } else if (!candidate.options.some((option) => option.label === candidate.correctLabel)) {
      issues.push({ code: 'ANSWER_OUTSIDE_OPTIONS', severity: 'ERROR', message: `The answer key points to ${candidate.correctLabel}, which is not one of the extracted options.` });
    }

    const difficulty = this.estimateDifficulty(candidate.questionText);
    issues.push({
      code: 'DIFFICULTY_ESTIMATED',
      severity: 'INFO',
      message: `Difficulty was estimated as ${difficulty}. It can be adjusted later and calibrated from student performance.`,
    });
    if (!candidate.explanation) {
      issues.push({
        code: 'NO_SOURCE_EXPLANATION',
        severity: 'INFO',
        message: 'The source PDF does not provide an explanation. None will be generated automatically.',
      });
    }

    const topicInput = [candidate.sourceSection || '', candidate.questionText].join(' ');
    const topicConfidence = this.topicConfidenceFromTokens(
      topicInput,
      topicReferenceTokens,
    );
    if (topicConfidence < 0.08) {
      issues.push({ code: 'TOPIC_MISMATCH', severity: 'WARNING', message: 'The extracted wording has a very weak lexical match to the selected topic. Instructor confirmation is required.' });
    }
    const duplicate = this.bestDuplicate(candidate.questionText, existing);
    if (duplicate) {
      issues.push({
        code: duplicate.exact ? 'EXACT_DUPLICATE' : 'POSSIBLE_DUPLICATE',
        severity: duplicate.exact ? 'WARNING' : 'INFO',
        message: `${duplicate.exact ? 'An exact' : 'A similar'} question already exists (${Math.round(duplicate.similarity * 100)}% similarity). Prefer reuse over another copy.`,
      });
    }
    const hardError = issues.some((issue) => issue.severity === 'ERROR');
    const review = issues.some((issue) => issue.severity === 'WARNING');
    const extractionConfidence = Number(
      (
        candidate.sourcePage === null
          ? documentExtractionConfidence
          : pageConfidence.get(candidate.sourcePage) ?? documentExtractionConfidence
      ).toFixed(2),
    );
    return {
      candidate_id: `candidate-${index + 1}`,
      question_number: candidate.questionNumber,
      source_page: candidate.sourcePage,
      answer_key_label: candidate.correctLabel,
      answer_key_page: candidate.answerKeyPage,
      source_section: candidate.sourceSection,
      question_text: candidate.questionText,
      options: candidate.options.map((option) => ({
        label: option.label,
        option_text: option.text,
        is_correct: option.label === candidate.correctLabel,
      })),
      explanation: candidate.explanation,
      difficulty,
      marks: 1,
      extraction_confidence: extractionConfidence,
      topic_confidence: topicConfidence,
      status: hardError ? 'INVALID' : review ? 'NEEDS_REVIEW' : 'VALID',
      issues,
      duplicate,
    };
  }

  private estimateDifficulty(text: string): QuestionDifficulty {
    const normalized = text.toLocaleLowerCase();
    const hardSignals = [
      'most appropriate next step',
      'best explains',
      'mechanism',
      'pathogenesis',
      'after treatment',
      'which of the following best',
      'patient presents',
      'a patient',
      'a researcher',
    ];
    const easySignals = [
      'is defined as',
      'what is the normal',
      'what is the average',
      'which artery',
      'which nerve',
      'which vitamin',
      'which cell',
      'is called',
    ];
    const hardScore = hardSignals.filter((signal) => normalized.includes(signal)).length;
    const easyScore = easySignals.filter((signal) => normalized.includes(signal)).length;
    if (hardScore >= 2 || text.length > 300) return QuestionDifficulty.HARD;
    if (easyScore > hardScore && text.length < 180) return QuestionDifficulty.EASY;
    return QuestionDifficulty.MEDIUM;
  }

  private validatePublishCandidate(candidate: PublishImportedQuestionDto, index: number): void {
    const text = candidate.question_text.trim();
    if (text.length < 8) throw new BadRequestException(`Question ${index + 1} has an invalid stem`);
    if (!isSupportedMcqOptionCount(candidate.options.length)) {
      throw new BadRequestException(
        `Question ${index + 1} must contain ${MIN_MCQ_OPTIONS} or ${MAX_MCQ_OPTIONS} options`,
      );
    }
    if (candidate.options.length === MIN_MCQ_OPTIONS && !candidate.allow_four_options) {
      throw new BadRequestException(
        `Question ${index + 1} has four options and requires explicit instructor confirmation before publication`,
      );
    }
    const normalized = candidate.options.map((option) => this.normalize(option.option_text));
    if (normalized.some((option) => !option) || new Set(normalized).size !== normalized.length) {
      throw new BadRequestException(`Question ${index + 1} contains empty or duplicate options`);
    }
    if (candidate.options.filter((option) => option.is_correct).length !== 1) {
      throw new BadRequestException(`Question ${index + 1} must have exactly one correct option`);
    }
  }

  private bestDuplicate(
    text: string,
    existing: ExistingQuestionFingerprint[],
  ): DuplicateMatch | null {
    const normalizedText = this.normalize(text);
    const tokenSet = new Set(this.tokens(normalizedText));
    let best: DuplicateMatch | null = null;

    for (const question of existing) {
      const similarity = this.similarityPrepared(
        normalizedText,
        tokenSet,
        question.normalizedText,
        question.tokenSet,
      );
      if (similarity < 0.72 || (best && similarity <= best.similarity)) continue;
      best = {
        question_id: question.id,
        question_text: question.questionText,
        similarity: Number(similarity.toFixed(2)),
        exact: normalizedText === question.normalizedText,
      };
    }
    return best;
  }

  private prepareExistingQuestions(
    existing: Pick<Question, 'id' | 'questionText' | 'isActive' | 'topicId'>[],
  ): ExistingQuestionFingerprint[] {
    return existing.map((question) => {
      const normalizedText = this.normalize(question.questionText);
      return {
        ...question,
        normalizedText,
        tokenSet: new Set(this.tokens(normalizedText)),
      };
    });
  }

  private similarityPrepared(
    leftNormalized: string,
    leftTokens: Set<string>,
    rightNormalized: string,
    rightTokens: Set<string>,
  ): number {
    if (leftNormalized === rightNormalized) return 1;
    if (!leftTokens.size || !rightTokens.size) return 0;
    let intersection = 0;
    const smaller =
      leftTokens.size <= rightTokens.size ? leftTokens : rightTokens;
    const larger =
      smaller === leftTokens ? rightTokens : leftTokens;
    for (const token of smaller) {
      if (larger.has(token)) intersection += 1;
    }
    const union = leftTokens.size + rightTokens.size - intersection;
    return union ? intersection / union : 0;
  }

  private similarity(left: string, right: string): number {
    const leftNormalized = this.normalize(left);
    const rightNormalized = this.normalize(right);
    if (leftNormalized === rightNormalized) return 1;
    const leftTokens = new Set(this.tokens(leftNormalized));
    const rightTokens = new Set(this.tokens(rightNormalized));
    if (!leftTokens.size || !rightTokens.size) return 0;
    const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
    const union = new Set([...leftTokens, ...rightTokens]).size;
    return union ? intersection / union : 0;
  }

  private topicConfidence(text: string, corpus: string): number {
    return this.topicConfidenceFromTokens(
      text,
      new Set(this.tokens(corpus)),
    );
  }

  private topicConfidenceFromTokens(
    text: string,
    reference: Set<string>,
  ): number {
    const content = new Set(this.tokens(text));
    if (!content.size || !reference.size) return 0;
    let overlap = 0;
    for (const token of content) {
      if (reference.has(token)) overlap += 1;
    }
    const denominator = Math.min(20, content.size);
    return Number(Math.min(1, overlap / Math.max(1, denominator)).toFixed(2));
  }

  private tokens(value: string): string[] {
    return (value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
      .filter((token) => token.length > 2 && !STOPWORDS.has(token));
  }

  private normalize(value: string): string {
    return value
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private importReference(filename: string, sha256: string, page: number | null): string {
    return `${IMPORT_REFERENCE_PREFIX} | file=${this.safeFilename(filename)} | sha256=${sha256.toLowerCase()} | page=${page ?? 'unknown'}`;
  }

  private safeFilename(value: string): string {
    return value.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 220) || 'questions.pdf';
  }
}
