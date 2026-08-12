import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { inflateSync } from 'zlib';
import { DataSource, Repository } from 'typeorm';
import { EssayConfiguration } from '../../common/entities/essay-configuration.entity';
import { Question, QuestionDifficulty, QuestionType } from '../../common/entities/question.entity';
import { Topic } from '../../common/entities/topic.entity';
import { AcademicAccessService } from '../academic/academic-access.service';
import type { UploadedResourceFile } from '../academic/resource-storage.service';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { PublishEssayQuestionImportDto } from './dtos/essay-question-import.dto';

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_PDF_PAGES = 200;
const MAX_CANDIDATES = 500;
const MIN_TEXT_LENGTH = 80;
const REFERENCE_PREFIX = 'MDP_ESSAY_PDF_IMPORT';

type PdfPage = { page: number; text: string };
type ParsedPdf = { pages: PdfPage[]; pageCount: number; text: string; extractionConfidence: number };
type EssayIssue = { code: string; severity: 'INFO' | 'WARNING' | 'ERROR'; message: string };
type EssayCandidate = {
  candidate_id: string;
  section: string;
  case_number: number;
  case_label: string;
  case_stem: string;
  question_number: number;
  question_text: string;
  model_answer: string | null;
  source_page: number | null;
  answer_page: number | null;
  extraction_confidence: number;
  status: 'VALID' | 'NEEDS_REVIEW' | 'INVALID';
  issues: EssayIssue[];
};

type CaseBlock = {
  section: string;
  caseNumber: number;
  caseLabel: string;
  body: string;
  startPage: number | null;
};

@Injectable()
export class EssayQuestionImportService {
  constructor(
    @InjectRepository(Question) private readonly questions: Repository<Question>,
    @InjectRepository(Topic) private readonly topics: Repository<Topic>,
    private readonly dataSource: DataSource,
    private readonly academicAccess: AcademicAccessService,
  ) {}

  async inspectPdf(
    copyrightConfirmed: boolean,
    file: UploadedResourceFile | undefined,
  ) {
    if (!copyrightConfirmed) {
      throw new BadRequestException('Confirm that you have permission to use the uploaded question material');
    }
    this.validatePdfFile(file);
    const safeFile = file;
    const sha256 = createHash('sha256').update(safeFile.buffer).digest('hex');
    const pdf = this.extractPdf(safeFile.buffer);
    if (pdf.text.trim().length < MIN_TEXT_LENGTH) {
      return {
        original_filename: this.safeFilename(safeFile.originalname),
        file_sha256: sha256,
        file_size: safeFile.size,
        page_count: pdf.pageCount,
        extraction_method: 'TEXT_LAYER',
        extraction_confidence: pdf.extractionConfidence,
        status: 'NEEDS_OCR',
        summary: { cases: 0, extracted: 0, valid: 0, needs_review: 0, invalid: 0 },
        issues: [{
          code: 'NO_USABLE_TEXT_LAYER', severity: 'ERROR',
          message: 'The PDF appears scanned or its text layer is not safely extractable. OCR is required before essay questions can be reviewed.',
        }] as EssayIssue[],
        candidates: [] as EssayCandidate[],
      };
    }

    const parsed = this.parseEssayCases(pdf, sha256).slice(0, MAX_CANDIDATES);
    const valid = parsed.filter((item) => item.status === 'VALID').length;
    const needsReview = parsed.filter((item) => item.status === 'NEEDS_REVIEW').length;
    const invalid = parsed.filter((item) => item.status === 'INVALID').length;
    const cases = new Set(parsed.map((item) => `${item.section}:${item.case_number}`)).size;
    const issues: EssayIssue[] = [];
    if (parsed.length === 0) {
      issues.push({
        code: 'NO_ESSAY_QUESTIONS_DETECTED', severity: 'ERROR',
        message: 'No case-based essay questions were detected. Supported files use Case N, Q N, and Answers of case N sections.',
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
      extraction_method: 'TEXT_LAYER_CASE_ESSAY',
      extraction_confidence: pdf.extractionConfidence,
      status: parsed.length ? 'REVIEW_REQUIRED' : 'NO_QUESTIONS',
      summary: { cases, extracted: parsed.length, valid, needs_review: needsReview, invalid },
      issues,
      candidates: parsed,
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
      const questionText = this.composeQuestion(candidate.case_stem, candidate.question_text);
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
          questionText: this.composeQuestion(candidate.case_stem, candidate.question_text),
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

  private parseEssayCases(pdf: ParsedPdf, sha256: string): EssayCandidate[] {
    const stream = pdf.pages.map((page) => `\n[[PAGE:${page.page}]]\n${this.cleanPageText(page.text)}`).join('\n');
    const casePattern = /\bCASE\s*(\d{1,2})\s*:\s*/gi;
    const matches = [...stream.matchAll(casePattern)];
    const candidates: EssayCandidate[] = [];
    let section = 'Essay collection';

    for (let index = 0; index < matches.length; index += 1) {
      const match = matches[index];
      const start = match.index ?? 0;
      const previousBoundary = index === 0 ? 0 : (matches[index - 1].index ?? 0);
      const prelude = stream.slice(previousBoundary, start);
      const sectionMatches = [...prelude.matchAll(/\b(Final\s+20\d{2}|Full\s+nephrology\s+exam(?:\s*\([^)]*\))?)/gi)];
      if (sectionMatches.length) section = this.cleanInline(sectionMatches[sectionMatches.length - 1][1]);

      const end = index + 1 < matches.length ? (matches[index + 1].index ?? stream.length) : stream.length;
      const caseNumber = Number(match[1]);
      const block = stream.slice(start + match[0].length, end);
      const answerMarker = new RegExp(`\\bAnswers?\\s+of\\s+case\\s*${caseNumber}\\b`, 'i');
      const answerMatch = answerMarker.exec(block);
      const questionPart = answerMatch ? block.slice(0, answerMatch.index) : block;
      const answerPart = answerMatch ? block.slice(answerMatch.index + answerMatch[0].length) : '';
      const questionMatches = [...questionPart.matchAll(/\bQ\s*(\d{1,2})\s*[\.\)]\s*/gi)];
      if (!questionMatches.length) continue;

      const caseStemRaw = questionPart.slice(0, questionMatches[0].index ?? 0);
      const caseStem = this.cleanInline(this.removePageMarkers(caseStemRaw));
      const answerMap = this.parseAnswerMap(answerPart);
      const casePage = this.pageBefore(stream, start);

      for (let qIndex = 0; qIndex < questionMatches.length; qIndex += 1) {
        const qMatch = questionMatches[qIndex];
        const qStart = (qMatch.index ?? 0) + qMatch[0].length;
        const qEnd = qIndex + 1 < questionMatches.length ? (questionMatches[qIndex + 1].index ?? questionPart.length) : questionPart.length;
        const questionNumber = Number(qMatch[1]);
        const questionText = this.cleanInline(this.removePageMarkers(questionPart.slice(qStart, qEnd)));
        if (!questionText) continue;
        const model = answerMap.get(questionNumber) || null;
        const sourcePage = this.pageBefore(stream, start + match[0].length + (qMatch.index ?? 0));
        const answerPage = model ? this.findAnswerPage(stream, start, end, caseNumber, questionNumber) : null;
        const issues: EssayIssue[] = [];
        if (!caseStem) issues.push({ code: 'CASE_STEM_MISSING', severity: 'WARNING', message: 'No case stem was detected before this question.' });
        if (!model) issues.push({ code: 'MODEL_ANSWER_MISSING', severity: 'ERROR', message: 'No matching numbered answer was detected for this question.' });
        if (questionText.length < 8) issues.push({ code: 'QUESTION_TOO_SHORT', severity: 'ERROR', message: 'The extracted question is too short to publish safely.' });
        const status: EssayCandidate['status'] = issues.some((issue) => issue.severity === 'ERROR') ? 'INVALID' : issues.length ? 'NEEDS_REVIEW' : 'VALID';
        const caseLabel = `${section} · Case ${caseNumber} · Q${questionNumber}`;
        candidates.push({
          candidate_id: createHash('sha256').update(`${sha256}:${section}:${caseNumber}:${questionNumber}:${questionText}`).digest('hex').slice(0, 24),
          section,
          case_number: caseNumber,
          case_label: caseLabel,
          case_stem: caseStem,
          question_number: questionNumber,
          question_text: questionText,
          model_answer: model,
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

  private parseAnswerMap(text: string) {
    const map = new Map<number, string>();
    const normalized = text.replace(/\r/g, '\n');
    const marker = /(?:^|\n)\s*(\d{1,2})\s*\)\s*/gm;
    const matches = [...normalized.matchAll(marker)];
    for (let index = 0; index < matches.length; index += 1) {
      const number = Number(matches[index][1]);
      const start = (matches[index].index ?? 0) + matches[index][0].length;
      const end = index + 1 < matches.length ? (matches[index + 1].index ?? normalized.length) : normalized.length;
      const answer = this.cleanInline(this.removePageMarkers(normalized.slice(start, end)));
      if (answer) map.set(number, answer);
    }
    return map;
  }

  private pageBefore(text: string, offset: number) {
    const prefix = text.slice(0, offset);
    const matches = [...prefix.matchAll(/\[\[PAGE:(\d+)\]\]/g)];
    return matches.length ? Number(matches[matches.length - 1][1]) : null;
  }

  private findAnswerPage(stream: string, caseStart: number, caseEnd: number, caseNumber: number, questionNumber: number) {
    const block = stream.slice(caseStart, caseEnd);
    const answerIndex = block.search(new RegExp(`\\bAnswers?\\s+of\\s+case\\s*${caseNumber}\\b`, 'i'));
    if (answerIndex < 0) return null;
    const after = block.slice(answerIndex);
    const marker = new RegExp(`(?:^|\\n)\\s*${questionNumber}\\s*\\)`, 'm');
    const match = marker.exec(after);
    return match ? this.pageBefore(stream, caseStart + answerIndex + (match.index ?? 0)) : null;
  }

  private composeQuestion(caseStem: string, question: string) {
    const stem = caseStem.trim();
    const prompt = question.trim();
    return stem ? `CASE\n${stem}\n\nQUESTION\n${prompt}` : prompt;
  }

  private cleanPageText(text: string) {
    return text
      .replace(/My\s+Doctor\s*&?\s*The\s+Professor\s+Page/gi, ' ')
      .replace(/[.…·]{6,}/g, '\n')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n');
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
    if (file.size > MAX_PDF_BYTES) throw new BadRequestException('PDF imports are limited to 25 MB');
    if (!/\.pdf$/i.test(file.originalname || '')) throw new BadRequestException('Essay imports must use a .pdf filename');
    if (file.mimetype !== 'application/pdf') throw new BadRequestException('Declared file type must be application/pdf');
    if (file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') throw new BadRequestException('Uploaded content is not a real PDF file');
  }

  private extractPdf(buffer: Buffer): ParsedPdf {
    const binary = buffer.toString('latin1');
    if (/\/Encrypt\b/.test(binary)) throw new BadRequestException('Password-protected or encrypted PDFs are not supported');
    const declaredPageCount = (binary.match(/\/Type\s*\/Page\b/g) || []).length;
    if (declaredPageCount < 1) throw new BadRequestException('The PDF does not contain a readable page structure');
    if (declaredPageCount > MAX_PDF_PAGES) throw new BadRequestException(`PDF imports are limited to ${MAX_PDF_PAGES} pages`);

    const objects = new Map<number, string>();
    const objectPattern = /(\d+)\s+\d+\s+obj\b([\s\S]*?)endobj/g;
    let objectMatch: RegExpExecArray | null;
    while ((objectMatch = objectPattern.exec(binary)) !== null) objects.set(Number(objectMatch[1]), objectMatch[2]);

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
      const text = refs.map((reference) => objects.get(reference)).filter((value): value is string => Boolean(value))
        .map((value) => this.extractTextFromStreamObject(value)).filter(Boolean).join('\n');
      pages.push({ page: pages.length + 1, text });
    }
    if (!pages.length || pages.every((page) => !page.text.trim())) {
      const fallback = Array.from(objects.values()).map((value) => this.extractTextFromStreamObject(value)).filter(Boolean).join('\n');
      pages.push({ page: 1, text: fallback });
    }
    const text = pages.map((page) => page.text).join('\n');
    const printable = [...text].filter((character) => character === '\n' || character === '\t' || character.charCodeAt(0) >= 32).length;
    const extractionConfidence = text.length ? Math.min(1, (printable / text.length) * Math.min(1, text.length / 1000)) : 0;
    return { pages, pageCount: declaredPageCount, text, extractionConfidence };
  }

  private extractTextFromStreamObject(body: string) {
    const stream = body.match(/stream\r?\n?([\s\S]*?)\r?\n?endstream/);
    if (!stream) return '';
    const raw = Buffer.from(stream[1], 'latin1');
    let decoded = raw;
    try {
      if (/\/FlateDecode\b/.test(body)) decoded = inflateSync(raw);
      else if (/\/Filter\b/.test(body)) return '';
    } catch { return ''; }
    return this.extractTextOperators(decoded.toString('latin1'));
  }

  private extractTextOperators(content: string) {
    const output: string[] = [];
    const pattern = /(\((?:\\.|[^\\)])*\)|<[A-Fa-f0-9\s]+>|\[(?:\\.|[^\]])*\])\s*(Tj|TJ|'|")/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const operand = match[1];
      if (operand.startsWith('[')) {
        const values: string[] = [];
        const inner = /\((?:\\.|[^\\)])*\)|<[A-Fa-f0-9\s]+>/g;
        let value: RegExpExecArray | null;
        while ((value = inner.exec(operand)) !== null) values.push(this.decodePdfString(value[0]));
        if (values.length) output.push(values.join(''));
      } else output.push(this.decodePdfString(operand));
    }
    return output.map((line) => line.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim()).filter(Boolean).join('\n');
  }

  private decodePdfString(value: string) {
    if (value.startsWith('<')) {
      const hex = value.slice(1, -1).replace(/\s+/g, '');
      if (!hex || hex.length % 2) return '';
      const bytes = Buffer.from(hex, 'hex');
      if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        const chars: number[] = [];
        for (let index = 2; index + 1 < bytes.length; index += 2) chars.push(bytes.readUInt16BE(index));
        return String.fromCharCode(...chars);
      }
      return bytes.toString('latin1');
    }
    return value.slice(1, -1)
      .replace(/\\([nrtbf()\\])/g, (_, code: string) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[code] || code))
      .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)));
  }

  private safeFilename(value: string) {
    return (value || 'questions.pdf').replace(/[\r\n;]/g, '_').slice(0, 255);
  }
}
