import { DataSource, Repository } from 'typeorm';
import { Question } from '../../common/entities/question.entity';
import { Topic } from '../../common/entities/topic.entity';
import { AcademicAccessService } from '../academic/academic-access.service';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { splitCanonicalSections } from './canonical-mcq-parser';
import {
  PdfTextExtractionService,
  type UnicodeParsedPdf,
} from './pdf-text-extraction.service';
import { UnicodeQuestionImportService } from './unicode-question-import.service';

function fiveOptions(seed: string): string {
  return [
    `A) ${seed} A`,
    `B) ${seed} B`,
    `C) ${seed} C`,
    `D) ${seed} D`,
    `E) ${seed} E`,
  ].join('\n');
}

function pdf(text: string, extractionMethod: 'TEXT_LAYER' | 'OCR' = 'TEXT_LAYER'): UnicodeParsedPdf {
  return {
    pages: [{
      page: 1,
      text,
      source: extractionMethod === 'OCR' ? 'OCR' : 'TEXT_LAYER',
      confidence: extractionMethod === 'OCR' ? 0.9 : 0.82,
      textLength: text.length,
      ocrAttempted: extractionMethod === 'OCR',
      layoutReflowed: false,
    }],
    pageCount: 1,
    text,
    extractionConfidence: extractionMethod === 'OCR' ? 0.9 : 0.82,
    extractionMethod,
    ocrPageCount: extractionMethod === 'OCR' ? 1 : 0,
    textLayerPageCount: extractionMethod === 'OCR' ? 0 : 1,
    emptyPageCount: 0,
  };
}

describe('canonical MCQ section parsing', () => {
  it('splits Gastroenterology Week 1 sections so repeated numbering and answer keys stay scoped', () => {
    const text = [
      '[[MDP_PAGE_3]]',
      'Gastroenterology Week 1',
      'Peptic ulcer',
      '1) Peptic question',
      'A) a',
      'B) b',
      'C) c',
      'D) d',
      'E) e',
      'Answer Key',
      '1) E',
      '[[MDP_PAGE_7]]',
      'GERD',
      '1) GERD question',
      'A) a',
      'B) b',
      'C) c',
      'D) d',
      'E) e',
      'Answer Key',
      '1) B',
    ].join('\n');

    const sections = splitCanonicalSections(text);

    expect(sections.map((section) => section.title)).toEqual([
      'Peptic ulcer',
      'GERD',
    ]);
    expect(sections[0].text).toContain('1) E');
    expect(sections[0].text).not.toContain('1) GERD question');
    expect(sections[1].text).toContain('1) B');
  });

  it('keeps the existing Lecture heading format supported when no answer keys exist', () => {
    const sections = splitCanonicalSections(
      'Lecture One: Anatomy\n1) Question\nA) a\nB) b\nC) c\nD) d\nE) e',
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('Lecture One: Anatomy');
  });
});

describe('UnicodeQuestionImportService recovery', () => {
  const actor: AuthenticatedUser = {
    userId: '11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
    email: 'instructor@example.test',
    role: UserRole.INSTRUCTOR,
  };

  it('retries when the answer key itself was missing from the text layer', async () => {
    const firstPass = pdf([
      'Arbitrary Section',
      `1) First question?\n${fiveOptions('q1')}`,
      `2) Second question?\n${fiveOptions('q2')}`,
    ].join('\n'));

    const recovered = pdf([
      'Arbitrary Section',
      `1) First question?\n${fiveOptions('q1')}`,
      `2) Second question?\n${fiveOptions('q2')}`,
      'Answer Key',
      '1-A, 2-B',
    ].join('\n'), 'OCR');

    const extract = jest
      .fn()
      .mockReturnValueOnce(firstPass)
      .mockReturnValueOnce(recovered);
    const extractor = { extract } as unknown as PdfTextExtractionService;
    const builder = {
      where: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };
    const questions = {
      createQueryBuilder: jest.fn(() => builder),
      find: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<Question>;
    const topic = {
      id: '33333333-3333-4333-8333-333333333333',
      topicName: 'Arbitrary Section',
      description: 'Test topic',
      lecture: { title: 'Test lecture', description: '' },
    } as Topic;
    const topics = {
      findOne: jest.fn().mockResolvedValue(topic),
    } as unknown as Repository<Topic>;
    const access = {
      assertTopicReadable: jest.fn().mockResolvedValue(undefined),
    } as unknown as AcademicAccessService;

    const service = new UnicodeQuestionImportService(
      questions,
      topics,
      {} as DataSource,
      access,
      extractor,
    );
    const buffer = Buffer.from('%PDF-1.4\n%%EOF');

    const result = await service.inspectPdf(
      { topic_id: topic.id, copyright_confirmed: true },
      {
        originalname: 'questions.pdf',
        mimetype: 'application/pdf',
        size: buffer.length,
        buffer,
      },
      actor,
    );

    expect(extract).toHaveBeenCalledTimes(2);
    expect(extract.mock.calls[1][1]).toEqual({ forceOcr: true });
    expect(result.summary.expected).toBe(2);
    expect(result.summary.extracted).toBe(2);
    expect(result.summary.structurally_complete).toBe(true);
    expect(result.parser.mapped_answers).toBe(2);
    expect(result.extraction_method).toBe('OCR');
  });

  it('retries with forced OCR when answer-key completeness proves a question is missing', async () => {
    const firstPass = pdf([
      'Arbitrary Section',
      `1) First question?\n${fiveOptions('q1')}`,
      `2) Second question?\n${fiveOptions('q2')}`,
      'Answer Key',
      '1-A, 2-B, 3-C',
    ].join('\n'));

    const recovered = pdf([
      'Arbitrary Section',
      `1) First question?\n${fiveOptions('q1')}`,
      `2) Second question?\n${fiveOptions('q2')}`,
      `3) Third question?\n${fiveOptions('q3')}`,
      'Answer Key',
      '1-A, 2-B, 3-C',
    ].join('\n'), 'OCR');

    const extract = jest
      .fn()
      .mockReturnValueOnce(firstPass)
      .mockReturnValueOnce(recovered);

    const extractor = { extract } as unknown as PdfTextExtractionService;
    const builder = {
      where: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };
    const questions = {
      createQueryBuilder: jest.fn(() => builder),
      find: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<Question>;
    const topic = {
      id: '33333333-3333-4333-8333-333333333333',
      topicName: 'Arbitrary Section',
      description: 'Test topic',
      lecture: { title: 'Test lecture', description: '' },
    } as Topic;
    const topics = {
      findOne: jest.fn().mockResolvedValue(topic),
    } as unknown as Repository<Topic>;
    const access = {
      assertTopicReadable: jest.fn().mockResolvedValue(undefined),
    } as unknown as AcademicAccessService;

    const service = new UnicodeQuestionImportService(
      questions,
      topics,
      {} as DataSource,
      access,
      extractor,
    );

    const buffer = Buffer.from('%PDF-1.4\n%%EOF');
    const result = await service.inspectPdf(
      { topic_id: topic.id, copyright_confirmed: true },
      {
        originalname: 'questions.pdf',
        mimetype: 'application/pdf',
        size: buffer.length,
        buffer,
      },
      actor,
    );

    expect(extract).toHaveBeenCalledTimes(2);
    expect(extract.mock.calls[1][1]).toEqual({ forceOcr: true });
    expect(result.summary.expected).toBe(3);
    expect(result.summary.extracted).toBe(3);
    expect(result.summary.missing).toBe(0);
    expect(result.summary.structurally_complete).toBe(true);
    expect(result.extraction_method).toBe('OCR');
    expect(result.candidates.map((candidate) => candidate.question_number)).toEqual([
      1,
      2,
      3,
    ]);
  });
});
