import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { EssayConfiguration } from '../../common/entities/essay-configuration.entity';
import { Question, QuestionType } from '../../common/entities/question.entity';
import { Topic } from '../../common/entities/topic.entity';
import { AcademicAccessService } from '../academic/academic-access.service';
import type { UploadedResourceFile } from '../academic/resource-storage.service';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { PublishEssayQuestionImportDto } from './dtos/essay-question-import.dto';
import { PdfTextExtractionService, type UnicodeParsedPdf } from './pdf-text-extraction.service';
import { detectQuestionDocumentType, QuestionDocumentType } from './question-document-type';

const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_CANDIDATES = 500;
const MIN_TEXT_LENGTH = 80;
const REFERENCE_PREFIX = 'MDP_ESSAY_PDF_IMPORT';

type ParsedPdf = UnicodeParsedPdf;
type EssayIssue = { code: string; severity: 'INFO' | 'WARNING' | 'ERROR'; message: string };
type EssayCandidate = {
  candidate_id: string;
  section: string;
  block_type: 'CASE' | 'LECTURE';
  case_number: number;
  case_label: string;
  case_stem: string;
  question_number: number;
  question_text: string;
  model_answer: string | null;
  answer_origin: 'SOURCE' | 'MISSING';
  source_page: number | null;
  answer_page: number | null;
  extraction_confidence: number;
  status: 'VALID' | 'NEEDS_REVIEW' | 'INVALID';
  issues: EssayIssue[];
};

@Injectable()
export class EssayQuestionImportService {
  constructor(
    @InjectRepository(Question) private readonly questions: Repository<Question>,
    @InjectRepository(Topic) private readonly topics: Repository<Topic>,
    private readonly dataSource: DataSource,
    private readonly academicAccess: AcademicAccessService,
    private readonly pdfTextExtractor: PdfTextExtractionService,
  ) {}

  async inspectPdf(
    copyrightConfirmed: boolean,
    file: UploadedResourceFile | undefined,
    standaloneType: 'CASE' | 'LECTURE' = 'LECTURE',
  ) {
    if (!copyrightConfirmed) {
      throw new BadRequestException('Confirm that you have permission to use the uploaded question material');
    }
    this.validatePdfFile(file);
    const safeFile = file;
    const sha256 = createHash('sha256').update(safeFile.buffer).digest('hex');
    const pdf = await this.pdfTextExtractor.extract(safeFile.buffer);
    if (pdf.text.trim().length < MIN_TEXT_LENGTH) {
      return {
        original_filename: this.safeFilename(safeFile.originalname),
        file_sha256: sha256,
        file_size: safeFile.size,
        page_count: pdf.pageCount,
        extraction_method: 'TEXT_LAYER',
        extraction_confidence: pdf.extractionConfidence,
        status: 'NEEDS_OCR',
        summary: { cases: 0, lectures: 0, extracted: 0, valid: 0, needs_review: 0, invalid: 0 },
        parser: {
          schema_version: '2.1', requested_document_type: 'ESSAY_CASES',
          detected_document_type: 'UNKNOWN' as QuestionDocumentType, answer_key: {}, mapped_answers: 0,
        },
        issues: [{
          code: 'NO_USABLE_TEXT_LAYER', severity: 'ERROR',
          message: 'The PDF appears scanned or its text layer is not safely extractable. OCR is required before essay questions can be reviewed.',
        }] as EssayIssue[],
        candidates: [] as EssayCandidate[],
      };
    }

    const documentType = detectQuestionDocumentType(pdf.text);
    if (documentType === 'MCQ') {
      throw new BadRequestException('This file contains MCQs, not essay cases. Use the MCQ PDF Inspector for this document.');
    }

    const extracted = this.parseEssayCases(pdf, sha256, standaloneType).slice(0, MAX_CANDIDATES);
    // Essay imports are source-grounded only. A missing answer is a parsing/source
    // issue to review, never a reason to synthesize medical content with an API.
    const parsed = extracted;
    const valid = parsed.filter((item) => item.status === 'VALID').length;
    const needsReview = parsed.filter((item) => item.status === 'NEEDS_REVIEW').length;
    const invalid = parsed.filter((item) => item.status === 'INVALID').length;
    const cases = new Set(parsed.filter((item) => item.block_type === 'CASE').map((item) => `${item.section}:${item.case_number}`)).size;
    const lectures = new Set(parsed.filter((item) => item.block_type === 'LECTURE').map((item) => `${item.section}:${item.case_number}`)).size;
    const issues: EssayIssue[] = [];
    if (parsed.length === 0) {
      issues.push({
        code: 'NO_ESSAY_QUESTIONS_DETECTED', severity: 'ERROR',
        message: 'No essay questions were detected. Supported formats include CASE N or Lecture N: Title with numbered prompts and corresponding answer sections.',
      });
    }
    if (parsed.length >= MAX_CANDIDATES) {
      issues.push({
        code: 'IMPORT_LIMIT_REACHED', severity: 'WARNING',
        message: `Only the first ${MAX_CANDIDATES} extracted essay questions are shown in one import batch.`,
      });
    }

    return {
      original_filename: this.safeFilename(safeFile.originalname),
      file_sha256: sha256,
      file_size: safeFile.size,
      page_count: pdf.pageCount,
      extraction_method: pdf.extractionMethod ?? 'TEXT_LAYER',
      extraction_confidence: pdf.extractionConfidence,
      status: parsed.length ? 'REVIEW_REQUIRED' : 'NO_QUESTIONS',
      summary: { cases, lectures, extracted: parsed.length, valid, needs_review: needsReview, invalid },
      parser: {
        schema_version: '2.1', requested_document_type: 'ESSAY_CASES',
        detected_document_type: documentType,
        answer_key: parsed.reduce<Record<string, Record<string, string>>>((result, candidate) => {
          if (candidate.answer_origin !== 'SOURCE' || !candidate.model_answer) return result;
          const caseKey = `${candidate.section}::case_${candidate.case_number}`;
          result[caseKey] = { ...(result[caseKey] || {}), [String(candidate.question_number)]: candidate.model_answer };
          return result;
        }, {}),
        mapped_answers: parsed.filter((candidate) => candidate.answer_origin === 'SOURCE').length,
        generated_answers: 0,
        unmapped_keys: parsed.filter((candidate) => candidate.answer_origin === 'MISSING').map((candidate) => ({ section: candidate.section, case_number: candidate.case_number, question_number: candidate.question_number })),
      },
      issues,
      candidates: parsed,
    };
  }

  async inspectJson(copyrightConfirmed: boolean, file: UploadedResourceFile | undefined, standaloneType: 'CASE' | 'LECTURE' = 'LECTURE') {
    if (!copyrightConfirmed) throw new BadRequestException('Confirm permission to use this material');
    if (!file?.buffer?.length || !/\.(json|txt)$/i.test(file.originalname || '') || file.size > 2 * 1024 * 1024)
      throw new BadRequestException('Select a non-empty JSON or JSON text file up to 2 MB');
    let payload: unknown;
    try { payload = JSON.parse(file.buffer.toString('utf8').replace(/^\uFEFF/, '')); }
    catch { throw new BadRequestException('File is not valid UTF-8 JSON'); }
    type JsonRow = Record<string, unknown>;
    const record = (value: unknown): JsonRow | null =>
      value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRow : null;
    const root = record(payload);
    const blocks: Array<{ type: 'CASE'|'LECTURE'; number: number; title: string; stem: string; questions: unknown[] }> = [];
    const ingest = (raw: unknown, defaultType: 'CASE'|'LECTURE', index: number) => {
      const obj = record(raw);
      if (!obj) throw new BadRequestException(`Section ${index + 1} must be an object`);
      const declaredKind = String(obj.type ?? obj.block_type ?? defaultType).toUpperCase();
      const kind = declaredKind === 'SECTION' ? 'LECTURE' : declaredKind;
      if (kind !== 'CASE' && kind !== 'LECTURE') throw new BadRequestException('Section type must be CASE, LECTURE or SECTION');
      const number = Number(obj.number ?? obj.case_number ?? obj.lecture_number ?? index + 1);
      const title = String(obj.title ?? obj.name ?? `${kind === 'CASE' ? 'Case' : 'Lecture'} ${number}`).trim();
      const stem = String(obj.stem ?? obj.case_stem ?? (kind === 'LECTURE' ? title : '')).trim();
      if (!Number.isInteger(number) || number < 1 || number > 999 || !title || !Array.isArray(obj.questions))
        throw new BadRequestException(`Section ${index + 1} needs a valid number, title and questions array`);
      blocks.push({type:kind,number,title,stem,questions:obj.questions});
    };
    if (Array.isArray(payload)) {
      if (payload.some(row => record(row)?.questions !== undefined)) payload.forEach((row,i)=>ingest(row,'LECTURE',i));
      else ingest({ title:standaloneType === 'CASE' ? 'Standalone case' : 'Standalone lecture',questions:payload },standaloneType,0);
    } else if (root) {
      if (Array.isArray(root.sections)) root.sections.forEach((row,i)=>ingest(row,standaloneType,i));
      else if (Array.isArray(root.cases) || Array.isArray(root.lectures)) {
        (root.cases as unknown[] | undefined)?.forEach((row,i)=>ingest(row,'CASE',i));
        (root.lectures as unknown[] | undefined)?.forEach((row,i)=>ingest(row,'LECTURE',i));
      } else if (typeof root.question_text === 'string' || typeof root.question === 'string' || typeof root.prompt === 'string') {
        ingest({ title: standaloneType === 'CASE' ? 'Standalone case' : 'Standalone lecture', questions: [root] }, standaloneType, 0);
      } else ingest(root, standaloneType, 0);
    } else throw new BadRequestException('JSON must contain a question, questions, sections, cases or lectures');
    if (blocks.length > 100) throw new BadRequestException('Maximum 100 sections per import');
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const candidates: EssayCandidate[] = [];
    for (const block of blocks) {
      for (let i=0; i<block.questions.length; i++) {
        const question = record(block.questions[i]);
        if (!question) throw new BadRequestException(`Invalid question in ${block.title}`);
        const questionText = String(question.question_text ?? question.question ?? question.prompt ?? '').trim();
        const answer = String(question.model_answer ?? question.answer ?? '').trim() || null;
        const questionNumber = Number(question.question_number ?? question.number ?? i+1);
        if (!questionText || questionText.length > 10000 || !Number.isInteger(questionNumber) || questionNumber < 1 || questionNumber > 999)
          throw new BadRequestException(`Invalid question text or number in ${block.title}`);
        const issues: EssayIssue[] = answer ? [] : [{code:'MODEL_ANSWER_MISSING',severity:'ERROR',message:'Provide a source model answer before publishing.'}];
        const section = block.type === 'LECTURE' ? `Lecture ${block.number}: ${block.title}` : block.title;
        candidates.push({
          candidate_id:createHash('sha256').update(`${sha256}:${section}:${block.number}:${questionNumber}:${questionText}`).digest('hex').slice(0,24),
          section,block_type:block.type,case_number:block.number,case_label:`${section} · Q${questionNumber}`,
          case_stem:block.stem || block.title,question_number:questionNumber,question_text:questionText,
          model_answer:answer,answer_origin:answer?'SOURCE':'MISSING',source_page:null,answer_page:null,
          extraction_confidence:1,status:issues.length?'INVALID':'VALID',issues,
        });
      }
    }
    if (!candidates.length || candidates.length > MAX_CANDIDATES) throw new BadRequestException('JSON needs 1–500 essay questions');
    return {
      original_filename:this.safeFilename(file.originalname),file_sha256:sha256,file_size:file.size,page_count:0,
      extraction_method:'JSON',extraction_confidence:1,status:'REVIEW_REQUIRED',
      summary:{cases:blocks.filter(b=>b.type==='CASE').length,lectures:blocks.filter(b=>b.type==='LECTURE').length,
        extracted:candidates.length,valid:candidates.filter(c=>c.status==='VALID').length,needs_review:0,invalid:candidates.filter(c=>c.status==='INVALID').length},
      parser:{schema_version:'2.2',requested_document_type:'ESSAY',detected_document_type:'ESSAY',answer_key:{},mapped_answers:candidates.filter(c=>c.answer_origin==='SOURCE').length,generated_answers:0},
      issues:[] as EssayIssue[],candidates,
    };
  }

  async publish(dto: PublishEssayQuestionImportDto, actor: AuthenticatedUser) {
    if (!dto.copyright_confirmed) {
      throw new BadRequestException('Publication requires confirmation that you have permission to use this material');
    }
    if (!/^[a-f0-9]{64}$/i.test(dto.file_sha256)) {
      throw new BadRequestException('Invalid PDF SHA-256 fingerprint');
    }
    const selected = dto.candidates.filter((item) => item.approved);
    if (!selected.length) throw new BadRequestException('Approve at least one essay question before publishing');

    const topicIds = [...new Set(selected.map((item) => item.topic_id))];
    for (const topicId of topicIds) await this.academicAccess.assertTopicReadable(topicId, actor);
    const topics = await this.topics.find({ where: topicIds.map((id) => ({ id })) });
    if (topics.length !== topicIds.length) throw new BadRequestException('One or more selected topics no longer exist');

    const existing = await this.questions.find({
      where: topicIds.map((topicId) => ({ topicId, questionType: QuestionType.ESSAY })),
      select: { id: true, topicId: true, questionText: true, isActive: true },
      take: 5000,
    });

    for (const [index, candidate] of selected.entries()) {
      const questionText = this.composeQuestion(candidate.case_stem, candidate.question_text, candidate.block_type);
      if (!candidate.model_answer.trim()) throw new BadRequestException(`Essay ${index + 1} needs a model answer before publication`);
      if (candidate.reuse_question_id) {
        const reusable = existing.find((item) => item.id === candidate.reuse_question_id && item.topicId === candidate.topic_id && item.isActive);
        if (!reusable) throw new BadRequestException(`Essay ${index + 1} references a missing, inactive, or out-of-topic reusable question`);
        continue;
      }
      const duplicate = this.bestDuplicate(questionText, existing.filter((item) => item.topicId === candidate.topic_id));
      if (duplicate && duplicate.similarity >= 0.92 && !candidate.allow_duplicate) {
        throw new ConflictException(`Essay ${index + 1} closely matches an existing question (${Math.round(duplicate.similarity * 100)}%). Reuse it or explicitly allow a separate copy.`);
      }
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const published: Array<{ question_id: string; action: 'CREATED' | 'REUSED'; source_page: number | null }> = [];
      for (const candidate of selected) {
        if (candidate.reuse_question_id) {
          published.push({ question_id: candidate.reuse_question_id, action: 'REUSED', source_page: candidate.source_page ?? null });
          continue;
        }
        const question = await manager.save(Question, manager.create(Question, {
          topicId: candidate.topic_id,
          questionType: QuestionType.ESSAY,
          title: candidate.case_label.trim().slice(0, 200),
          questionText: this.composeQuestion(candidate.case_stem, candidate.question_text, candidate.block_type),
          explanation: null,
          hint: null,
          reference: this.importReference(dto.original_filename, dto.file_sha256, candidate.source_page ?? null, candidate.case_label),
          difficulty: candidate.difficulty,
          estimatedTimeSeconds: 300,
          marks: Number(candidate.marks).toFixed(2),
          isQuestionBank: true,
          version: 1,
          isActive: true,
          createdBy: actor.userId,
        }));
        await manager.save(EssayConfiguration, manager.create(EssayConfiguration, {
          questionId: question.id,
          minimumWordCount: null,
          maximumWordCount: null,
          modelAnswer: candidate.model_answer.trim(),
          gradingRubric: candidate.grading_rubric?.trim() || null,
        }));
        published.push({ question_id: question.id, action: 'CREATED', source_page: candidate.source_page ?? null });
      }
      return published;
    });

    return {
      file_sha256: dto.file_sha256.toLowerCase(),
      created: result.filter((item) => item.action === 'CREATED').length,
      reused: result.filter((item) => item.action === 'REUSED').length,
      skipped: dto.candidates.length - selected.length,
      questions: result,
    };
  }

  private parseEssayCases(pdf: ParsedPdf, sha256: string, standaloneType: 'CASE' | 'LECTURE' = 'LECTURE'): EssayCandidate[] {
    const rawStream = pdf.pages.map((page) => `\n[[PAGE:${page.page}]]\n${this.cleanPageText(page.text)}`).join('\n');
    // Standalone essay PDFs often have questions and an Answer section but
    // no "Lecture 1" heading. Give these an explicit editable review group.
    // Never infer a clinical case from an unlabelled passage.
    const containsBlocks = /(?:^|\n)[ \t]*(?:CASE[ \t]+\d{1,3}|Lecture[ \t]+\d{1,3}[ \t]*:)/im.test(rawStream);
    const stream = containsBlocks ? rawStream : standaloneType === 'CASE'
      ? `\nCASE 1:\n${rawStream}` : `\nLecture 1: Standalone lecture\n${rawStream}`;

    // Accept the essay formats we receive in practice:
    //   CASE 1
    //   CASE 1:
    //   Case 1: stem on the same line
    // Anchoring at line start prevents "Answers of case 1" from being mistaken for a new case.
    const blockPattern = /(?:^|\n)[ \t]*(?:CASE[ \t]+(\d{1,3})[ \t]*:?[ \t]*|Lecture[ \t]+(\d{1,3})[ \t]*:[ \t]*([^\n]*))/gim;
    const matches = [...stream.matchAll(blockPattern)];
    const sectionPattern = /\b(Final\s+20\d{2}|Full\s+nephrology\s+exam(?:\s*\([^)]*\))?)/gi;
    const candidates: EssayCandidate[] = [];
    let section = 'Essay collection';

    for (let index = 0; index < matches.length; index += 1) {
      const match = matches[index];
      const start = match.index ?? 0;
      const contentStart = start + match[0].length;
      const previousBoundary = index === 0 ? 0 : (matches[index - 1].index ?? 0);
      const prelude = stream.slice(previousBoundary, start);
      const preludeSections = [...prelude.matchAll(sectionPattern)];
      if (preludeSections.length) section = this.cleanInline(preludeSections[preludeSections.length - 1][1]);

      const nextCaseStart = index + 1 < matches.length ? (matches[index + 1].index ?? stream.length) : stream.length;
      const isLecture = Boolean(match[2]);
      const caseNumber = Number(match[1] ?? match[2]);
      const lectureTitle = isLecture ? this.cleanInline(match[3] || '') : '';
      const rawCaseBlock = stream.slice(contentStart, nextCaseStart);

      // Newer essay packs commonly keep each answer key directly inside its case and
      // label it simply "Answer:" or "Answers:". Legacy packs may use
      // "Answers of case N" later in the document. Support both deterministically.
      const localAnswerPattern = /(?:^|\n)[ \t]*(?:Answers?(?:[ \t]+(?:of|for)[ \t]+(?:[^\n]*?[ \t]+)?(?:case|lecture)[ \t]+\d{1,3}(?:[ \t]*:[^\n]*)?)?|Model[ \t]+Answers?)[ \t]*:?[ \t]*(?=\n|$)/im;
      const localAnswerMatch = localAnswerPattern.exec(rawCaseBlock);

      let questionPart = rawCaseBlock;
      let answerPart = '';
      let answerStart: number | null = null;
      let answerEnd: number | null = null;

      if (localAnswerMatch) {
        questionPart = rawCaseBlock.slice(0, localAnswerMatch.index ?? 0);
        answerStart = contentStart + (localAnswerMatch.index ?? 0) + localAnswerMatch[0].length;
        answerEnd = nextCaseStart;
        answerPart = stream.slice(answerStart, answerEnd);
      } else {
        // Case numbers can restart in a later exam. Never allow an answer key from
        // the later exam to satisfy a question in the earlier one.
        const nextSameCase = matches.slice(index + 1).find((item) => Number(item[1] ?? item[2]) === caseNumber && Boolean(item[2]) === isLecture);
        const answerScopeEnd = nextSameCase?.index ?? stream.length;
        const answerSearch = stream.slice(start, answerScopeEnd);
        const answerMarker = new RegExp(
          `(?:^|\\n)[ \\t]*Answers?[ \\t]+(?:of|for)[ \\t]+(?:[^\\n]*?[ \\t]+)?${isLecture ? 'lecture' : 'case'}[ \\t]*${caseNumber}(?:[ \\t]*:[^\\n]*)?[ \\t]*(?=\\n|$)`,
          'im',
        );
        const answerMatch = answerMarker.exec(answerSearch);
        answerStart = answerMatch
          ? start + (answerMatch.index ?? 0) + answerMatch[0].length
          : null;

        const answerTail = answerStart === null ? '' : stream.slice(answerStart, answerScopeEnd);
        const nextAnswerOffset = answerTail.search(/(?:^|\n)[ \t]*Answers?[ \t]+(?:of|for)[ \t]+(?:[^\n]*?[ \t]+)?(?:case|lecture)[ \t]+\d{1,3}(?:[ \t]*:[^\n]*)?[ \t]*(?=\n|$)/im);
        answerEnd = answerStart === null
          ? null
          : nextAnswerOffset >= 0 ? answerStart + nextAnswerOffset : answerScopeEnd;
        answerPart = answerStart === null || answerEnd === null
          ? ''
          : stream.slice(answerStart, answerEnd);
      }

      // Question markers are deliberately line-anchored. This accepts:
      //   1: prompt, 1. prompt, 1) prompt, Q1. prompt, Q 1: prompt
      // without treating numbers embedded in the clinical stem as questions.
      const questionPattern = /(?:^|\n)\s*(?:Q(?:uestion)?\s*)?(\d{1,3})\s*[:.)-]\s+/gim;
      const questionMatches = [...questionPart.matchAll(questionPattern)];
      if (!questionMatches.length) continue;

      const caseStemRaw = questionPart.slice(0, questionMatches[0].index ?? 0);
      const preQuestionText = this.cleanInline(this.removePageMarkers(caseStemRaw));
      // A lecture title can wrap within its own page, but the next page's
      // running header must never become part of the lecture title.
      const samePageTitleRemainder = this.cleanInline(caseStemRaw.split(/\[\[PAGE:\d+\]\]/)[0]);
      const caseStem = isLecture
        ? ([lectureTitle, ...(samePageTitleRemainder.length > 0 && samePageTitleRemainder.length <= 60 ? [samePageTitleRemainder] : [])].filter(Boolean).join(' ') || `Lecture ${caseNumber}`)
        : preQuestionText;
      const questionNumbers = questionMatches.map((item) => Number(item[1]));
      const answerMap = this.parseAnswerMap(answerPart, questionNumbers);
      const casePage = this.pageBefore(stream, start);

      for (let qIndex = 0; qIndex < questionMatches.length; qIndex += 1) {
        const qMatch = questionMatches[qIndex];
        const qStart = (qMatch.index ?? 0) + qMatch[0].length;
        const qEnd = qIndex + 1 < questionMatches.length
          ? (questionMatches[qIndex + 1].index ?? questionPart.length)
          : questionPart.length;
        const questionNumber = Number(qMatch[1]);
        const questionText = this.cleanInline(this.removePageMarkers(questionPart.slice(qStart, qEnd)));
        if (!questionText) continue;

        const answerEntry = answerMap.get(questionNumber);
        const model = answerEntry?.text ?? null;
        const questionOffset = contentStart + (qMatch.index ?? 0);
        const sourcePage = this.pageBefore(stream, questionOffset);
        const answerPage = answerEntry && answerStart !== null
          ? this.pageBefore(stream, answerStart + answerEntry.markerOffset)
          : null;

        const issues: EssayIssue[] = [];
        if (!isLecture && !caseStem) {
          issues.push({
            code: 'CASE_STEM_MISSING',
            severity: 'WARNING',
            message: 'No case stem was detected before this question.',
          });
        }
        if (!model) {
          issues.push({
            code: 'MODEL_ANSWER_MISSING',
            severity: 'ERROR',
            message: 'No matching numbered answer was detected for this question.',
          });
        }
        if (questionText.length < 8) {
          issues.push({
            code: 'QUESTION_TOO_SHORT',
            severity: 'ERROR',
            message: 'The extracted question is too short to publish safely.',
          });
        }

        const status: EssayCandidate['status'] = issues.some((issue) => issue.severity === 'ERROR')
          ? 'INVALID'
          : issues.length ? 'NEEDS_REVIEW' : 'VALID';
        const blockSection = isLecture ? `Lecture ${caseNumber}: ${caseStem}` : section;
        const caseLabel = `${blockSection} · ${isLecture ? '' : `Case ${caseNumber} · `}Q${questionNumber}`;

        candidates.push({
          candidate_id: createHash('sha256')
            .update(`${sha256}:${blockSection}:${isLecture ? 'LECTURE' : 'CASE'}:${caseNumber}:${questionNumber}:${questionText}`)
            .digest('hex')
            .slice(0, 24),
          section: blockSection,
          block_type: isLecture ? 'LECTURE' : 'CASE',
          case_number: caseNumber,
          case_label: caseLabel,
          case_stem: caseStem,
          question_number: questionNumber,
          question_text: questionText,
          model_answer: model,
          answer_origin: model ? 'SOURCE' : 'MISSING',
          source_page: sourcePage ?? casePage,
          answer_page: answerPage,
          extraction_confidence: Math.max(0.5, Math.min(1, pdf.extractionConfidence * (model ? 1 : 0.7))),
          status,
          issues,
        });
      }
    }
    return candidates;
  }

  private parseAnswerMap(text: string, expectedQuestionNumbers: number[]) {
    type AnswerMarker = {
      number: number;
      index: number;
      contentStart: number;
      indent: number;
    };

    const map = new Map<number, { text: string; markerOffset: number }>();
    const normalized = text.replace(/\r\n?/g, '\n');
    const expected = [...new Set(expectedQuestionNumbers.filter((number) => Number.isInteger(number) && number > 0))];
    const expectedSet = new Set(expected);
    if (!expected.length) return map;

    // pdftotext -layout preserves indentation. Top-level answer numbers are aligned
    // at the answer block margin, while numbered sub-points are indented. Preserve
    // that distinction so "1) answer\n  1. detail\n  2. detail\n2) answer" does not
    // split answer 1 into fake answers 1 and 2.
    const marker = /(^|\n)([ \t]*)(?:Q(?:uestion)?\s*)?(\d{1,3})\s*[:.)-]\s*/gim;
    const markers: AnswerMarker[] = [...normalized.matchAll(marker)]
      .map((match) => ({
        number: Number(match[3]),
        index: match.index ?? 0,
        contentStart: (match.index ?? 0) + match[0].length,
        indent: match[2].replace(/\t/g, '    ').length,
      }))
      .filter((item) => expectedSet.has(item.number));

    if (!markers.length) return map;
    const minimumIndent = Math.min(...markers.map((item) => item.indent));
    const topLevelMarkers = markers.filter((item) => item.indent <= minimumIndent + 2);

    const selected: AnswerMarker[] = [];
    let cursor = -1;
    for (const number of expected) {
      const preferred = topLevelMarkers.find((item) => item.number === number && item.index > cursor);
      const fallback = markers.find((item) => item.number === number && item.index > cursor);
      const chosen = preferred ?? fallback;
      if (!chosen) continue;
      selected.push(chosen);
      cursor = chosen.index;
    }

    for (let index = 0; index < selected.length; index += 1) {
      const current = selected[index];
      const end = index + 1 < selected.length ? selected[index + 1].index : normalized.length;
      const answer = this.formatModelAnswer(this.removePageMarkers(normalized.slice(current.contentStart, end)));
      if (answer) {
        map.set(current.number, {
          text: answer,
          markerOffset: current.index,
        });
      }
    }

    return map;
  }

  private pageBefore(text: string, offset: number) {
    const prefix = text.slice(0, offset);
    const matches = [...prefix.matchAll(/\[\[PAGE:(\d+)\]\]/g)];
    return matches.length ? Number(matches[matches.length - 1][1]) : null;
  }

  private composeQuestion(caseStem: string, question: string, blockType: 'CASE' | 'LECTURE' = 'CASE') {
    const stem = caseStem.trim();
    const prompt = question.trim();
    // A lecture title is curriculum metadata, not a clinical case stem.
    if (blockType === 'LECTURE') return prompt;
    return stem ? `CASE\n${stem}\n\nQUESTION\n${prompt}` : prompt;
  }

  private cleanPageText(text: string) {
    return text
      .replace(/My\s+Doctor\s*&?\s*The\s+Professor\s+Page/gi, ' ')
      .replace(/[.…·]{6,}/g, '\n')
      .replace(/(?:[«»‹›]\s*){2,}/g, '\n')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
      .replace(/\t/g, '    ')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n');
  }

  private formatModelAnswer(text: string) {
    // Preserve answer structure rather than flattening bullets and newlines.
    // Source line wraps become spaces; real bullet/numbered entries remain
    // distinct lines. Never change the clinical wording of the answer.
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const result: string[] = [];
    for (const raw of lines) {
      const line = raw.replace(/[ \t]+/g, ' ').trim();
      if (!line) continue;
      const bullet = /^(?:[•●▪◦*-]|\d+[.)])\s+/.test(line);
      if (bullet || !result.length) result.push(line);
      else result[result.length - 1] += ' ' + line;
    }
    return result.join('\n').trim();
  }

  private cleanInline(text: string) {
    return text.replace(/\s+/g, ' ').trim();
  }

  private removePageMarkers(text: string) {
    return text.replace(/\[\[PAGE:\d+\]\]/g, ' ');
  }

  private bestDuplicate(text: string, existing: Array<Pick<Question, 'id' | 'questionText'>>) {
    let best: { question_id: string; similarity: number } | null = null;
    for (const question of existing) {
      const similarity = this.jaccard(text, question.questionText);
      if (!best || similarity > best.similarity) best = { question_id: question.id, similarity };
    }
    return best && best.similarity >= 0.72 ? best : null;
  }

  private jaccard(left: string, right: string) {
    const tokenize = (value: string) => new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter((token) => token.length > 2));
    const a = tokenize(left); const b = tokenize(right);
    if (!a.size || !b.size) return 0;
    const intersection = [...a].filter((token) => b.has(token)).length;
    return intersection / (a.size + b.size - intersection);
  }

  private importReference(filename: string, sha256: string, page: number | null, caseLabel: string) {
    return `${REFERENCE_PREFIX};file=${this.safeFilename(filename)};sha256=${sha256.toLowerCase()};page=${page ?? 'unknown'};case=${caseLabel.replace(/;/g, ',')}`;
  }

  private validatePdfFile(file: UploadedResourceFile | undefined): asserts file is UploadedResourceFile {
    if (!file?.buffer?.length) throw new BadRequestException('Select a non-empty PDF file');
    if (file.size > MAX_PDF_BYTES) throw new BadRequestException('PDF imports are limited to 50 MB');
    if (!/\.pdf$/i.test(file.originalname || '')) throw new BadRequestException('Essay imports must use a .pdf filename');
    if (file.mimetype !== 'application/pdf') throw new BadRequestException('Declared file type must be application/pdf');
    if (file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') throw new BadRequestException('Uploaded content is not a real PDF file');
  }

  private safeFilename(value: string) {
    return (value || 'questions.pdf').replace(/[\r\n;]/g, '_').slice(0, 255);
  }
}
