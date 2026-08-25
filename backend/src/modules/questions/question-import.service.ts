import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { inflateSync } from 'zlib';
import { DataSource, Repository } from 'typeorm';
import { McqOption } from '../../common/entities/mcq-option.entity';
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

type ImportCandidate = {
  candidate_id: string;
  source_page: number | null;
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

type PdfPage = { page: number; text: string };

type ParsedPdf = {
  pages: PdfPage[];
  pageCount: number;
  text: string;
  extractionConfidence: number;
};

type ParsedQuestion = {
  sourcePage: number | null;
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

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_PDF_PAGES = 200;
const MAX_IMPORT_CANDIDATES = 500;
const MIN_TEXT_LENGTH = 80;
const MAX_MCQ_OPTIONS = 6;
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
    const sha256 = createHash('sha256').update(safeFile.buffer).digest('hex');
    const pdf = this.extractPdf(safeFile.buffer);
    const previouslyPublished = await this.questions
      .createQueryBuilder('question')
      .where('question.reference LIKE :reference', {
        reference: `%${IMPORT_REFERENCE_PREFIX}%sha256=${sha256}%`,
      })
      .getCount();

    const topic = await this.topics.findOne({
      where: { id: dto.topic_id },
      relations: { lecture: true },
    });
    if (!topic) throw new BadRequestException('Selected topic no longer exists');

    if (pdf.text.trim().length < MIN_TEXT_LENGTH) {
      return {
        original_filename: this.safeFilename(safeFile.originalname),
        file_sha256: sha256,
        file_size: safeFile.size,
        page_count: pdf.pageCount,
        extraction_method: 'TEXT_LAYER',
        extraction_confidence: pdf.extractionConfidence,
        status: 'NEEDS_OCR',
        previously_published_from_same_file: previouslyPublished,
        topic: { id: topic.id, name: topic.topicName },
        issues: [
          {
            code: 'NO_USABLE_TEXT_LAYER',
            severity: 'ERROR',
            message:
              'The PDF appears scanned or its text encoding is not safely extractable. OCR is required before questions can be reviewed.',
          },
        ],
        sections: [] as Array<{ title: string; questions: number }>,
        candidates: [] as ImportCandidate[],
      };
    }

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

    const parsed = this.parseQuestions(pdf);
    const candidates = parsed.slice(0, MAX_IMPORT_CANDIDATES).map((candidate, index) =>
      this.evaluateCandidate(candidate, index, topicCorpus, existing),
    );
    const valid = candidates.filter((candidate) => candidate.status === 'VALID').length;
    const needsReview = candidates.filter((candidate) => candidate.status === 'NEEDS_REVIEW').length;
    const invalid = candidates.filter((candidate) => candidate.status === 'INVALID').length;

    const issues: ImportIssue[] = [];
    if (parsed.length > MAX_IMPORT_CANDIDATES) {
      issues.push({
        code: 'IMPORT_LIMIT_REACHED',
        severity: 'WARNING',
        message: `Only the first ${MAX_IMPORT_CANDIDATES} extracted questions are shown in one import batch.`,
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

    return {
      original_filename: this.safeFilename(safeFile.originalname),
      file_sha256: sha256,
      file_size: safeFile.size,
      page_count: pdf.pageCount,
      extraction_method: 'TEXT_LAYER',
      extraction_confidence: pdf.extractionConfidence,
      status: candidates.length ? 'REVIEW_REQUIRED' : 'NO_QUESTIONS',
      previously_published_from_same_file: previouslyPublished,
      topic: { id: topic.id, name: topic.topicName },
      summary: {
        extracted: candidates.length,
        valid,
        needs_review: needsReview,
        invalid,
        duplicates: candidates.filter((candidate) => candidate.duplicate).length,
      },
      sections: Array.from(sectionCounts.entries()).map(([title, questions]) => ({ title, questions })),
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

    for (const [index, candidate] of selected.entries()) {
      this.validatePublishCandidate(candidate, index);
      const topicConfidence = this.topicConfidence(candidate.question_text, topicCorpus);
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
      const duplicate = this.bestDuplicate(candidate.question_text, existing);
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

        const question = await manager.save(
          Question,
          manager.create(Question, {
            topicId: dto.topic_id,
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
      throw new BadRequestException('PDF imports are limited to 25 MB');
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

  private extractPdf(buffer: Buffer): ParsedPdf {
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
    const pattern = /(\((?:\\.|[^\\)])*\)|<[A-Fa-f0-9\s]+>|\[(?:\\.|[^\]])*\])\s*(Tj|TJ|'|")/g;
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

  private parseQuestions(pdf: ParsedPdf): ParsedQuestion[] {
    const preparedPages = pdf.pages.map((page) => ({
      page: page.page,
      text: this.prepareForParsing(page.text),
    }));
    const combined = preparedPages
      .map((page) => `\n[[MDP_PAGE_${page.page}]]\n${page.text}`)
      .join('\n');
    const sections = this.splitLectureSections(combined);
    return sections.flatMap((section) => this.parseSectionQuestions(section, combined));
  }

  private splitLectureSections(combined: string): ParsingSection[] {
    const headingPattern = /^\s*(Lecture\s+(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|\d+)(?:\s*[:-])?[^\n]*)$/gim;
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

  private parseSectionQuestions(section: ParsingSection, combined: string): ParsedQuestion[] {
    const answerKey = this.extractCompactAnswerKey(section.text);
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
      const correctLabel = inlineAnswer || answerKey.get(questionNumber) || null;
      const explanation = block.match(/(?:Explanation|Rationale)\s*:\s*([\s\S]+?)(?=$)/i)?.[1]
        ?.replace(/\s+/g, ' ')
        .trim() || null;
      if (stem) {
        candidates.push({
          sourcePage,
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
      if (accepted.length >= MAX_MCQ_OPTIONS) break;
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

  private extractCompactAnswerKey(value: string): Map<number, string> {
    const result = new Map<number, string>();
    const lines = value.split('\n');
    for (const line of lines) {
      const pairs = Array.from(line.matchAll(/(?:^|\s|\()(\d{1,3})\s*[.)-]?\s*([A-F])\b/gi));
      if (pairs.length < 2) continue;
      for (const pair of pairs) {
        result.set(Number(pair[1]), pair[2].toUpperCase());
      }
    }

    const marker = value.search(/answer\s*key/i);
    if (marker >= 0) {
      const tail = value.slice(marker);
      const pattern = /(?:^|\s|\()(\d{1,3})\s*[.):-]?\s*([A-F])\b/gim;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(tail)) !== null) {
        result.set(Number(match[1]), match[2].toUpperCase());
      }
    }
    return result;
  }

  private isCompactAnswerKeyLine(value: string): boolean {
    return Array.from(value.matchAll(/(?:^|\s|\()\d{1,3}\s*[.)-]?\s*[A-F]\b/gi)).length >= 2;
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
    topicCorpus: string,
    existing: Pick<Question, 'id' | 'questionText' | 'isActive' | 'topicId'>[],
  ): ImportCandidate {
    const issues: ImportIssue[] = [];
    const optionTexts = candidate.options.map((option) => this.normalize(option.text));
    if (candidate.questionText.length < 8) {
      issues.push({ code: 'STEM_TOO_SHORT', severity: 'ERROR', message: 'Question stem is too short to publish safely.' });
    }
    if (candidate.options.length < 2 || candidate.options.length > MAX_MCQ_OPTIONS) {
      issues.push({
        code: 'INVALID_OPTION_COUNT',
        severity: 'ERROR',
        message: `MCQs must contain between two and ${MAX_MCQ_OPTIONS} answer options.`,
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
    const topicConfidence = this.topicConfidence(topicInput, topicCorpus);
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
    const structuralPenalty = issues.filter((issue) => issue.severity === 'ERROR').length * 0.22;
    const reviewPenalty = issues.filter((issue) => issue.severity === 'WARNING').length * 0.1;
    const extractionConfidence = Number(
      Math.max(0.2, 1 - structuralPenalty - reviewPenalty).toFixed(2),
    );
    return {
      candidate_id: `candidate-${index + 1}`,
      source_page: candidate.sourcePage,
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
    if (candidate.options.length < 2 || candidate.options.length > MAX_MCQ_OPTIONS) {
      throw new BadRequestException(`Question ${index + 1} must contain two to ${MAX_MCQ_OPTIONS} options`);
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
    existing: Pick<Question, 'id' | 'questionText' | 'isActive' | 'topicId'>[],
  ): DuplicateMatch | null {
    let best: DuplicateMatch | null = null;
    for (const question of existing) {
      const similarity = this.similarity(text, question.questionText);
      if (similarity < 0.72 || (best && similarity <= best.similarity)) continue;
      best = {
        question_id: question.id,
        question_text: question.questionText,
        similarity: Number(similarity.toFixed(2)),
        exact: this.normalize(text) === this.normalize(question.questionText),
      };
    }
    return best;
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
    const content = new Set(this.tokens(text));
    const reference = new Set(this.tokens(corpus));
    if (!content.size || !reference.size) return 0;
    const overlap = [...content].filter((token) => reference.has(token)).length;
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
