import { BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Question } from '../../common/entities/question.entity';
import { Topic } from '../../common/entities/topic.entity';
import { AcademicAccessService } from '../academic/academic-access.service';
import type { UploadedResourceFile } from '../academic/resource-storage.service';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { QuestionImportService } from './question-import.service';

function textPdf(): Buffer {
  const body = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 600 >>
stream
BT
(1. Which chamber receives oxygenated blood directly from the pulmonary veins?) Tj
(A. Right atrium) Tj
(B. Left atrium) Tj
(C. Right ventricle) Tj
(D. Left ventricle) Tj
(Answer: B) Tj
(Explanation: Pulmonary veins return oxygenated blood to the left atrium.) Tj
ET
endstream
endobj
%%EOF`;
  return Buffer.from(body, 'latin1');
}

function fiveOptionLecturePdf(): Buffer {
  const body = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 1600 >>
stream
BT
(Lecture One: Cardiac anatomy and circulation) Tj
(1. Which chamber receives oxygenated blood directly from the pulmonary veins?) Tj
(A. Right atrium) Tj
(B. Left atrium) Tj
(C. Right ventricle) Tj
(D. Left ventricle) Tj
(E. Coronary sinus) Tj
(2. Which chamber ejects oxygenated blood into the systemic circulation?) Tj
(A. Right atrium) Tj
(B. Left atrium) Tj
(C. Right ventricle) Tj
(D. Pulmonary trunk) Tj
(E. Left ventricle) Tj
(1) B) Tj
(2) E) Tj
ET
endstream
endobj
%%EOF`;
  return Buffer.from(body, 'latin1');
}

function repeatedOptionSequencePdf(): Buffer {
  const body = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 1200 >>
stream
BT
(Lecture One: Cardiac anatomy and circulation) Tj
(1. Which chamber receives oxygenated blood directly from the pulmonary veins?) Tj
(A. Right atrium) Tj
(B. Left atrium) Tj
(C. Right ventricle) Tj
(D. Left ventricle) Tj
(A. contamination from the next extraction block) Tj
(B. more contamination) Tj
(1) B 2) C) Tj
ET
endstream
endobj
%%EOF`;
  return Buffer.from(body, 'latin1');
}

function scannedPdf(): Buffer {
  return Buffer.from(`%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /Resources <<>> >> endobj
%%EOF`, 'latin1');
}

describe('QuestionImportService', () => {
  const actor: AuthenticatedUser = {
    userId: '11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
    email: 'instructor@example.test',
    role: UserRole.INSTRUCTOR,
  };
  const topic = {
    id: '33333333-3333-4333-8333-333333333333',
    topicName: 'Cardiac anatomy and circulation',
    description: 'Heart chambers, circulation, valves and blood flow.',
    lecture: {
      title: 'Cardiac anatomy and circulation',
      description: 'Chambers and pulmonary circulation.',
    },
  } as Topic;

  function build() {
    const builder = {
      where: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };
    const questions = {
      createQueryBuilder: jest.fn(() => builder),
      find: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<Question>;
    const topics = {
      findOne: jest.fn().mockResolvedValue(topic),
    } as unknown as Repository<Topic>;
    const assertTopicReadable = jest.fn().mockResolvedValue(undefined);
    const access = {
      assertTopicReadable,
    } as unknown as AcademicAccessService;
    const dataSource = {} as DataSource;
    return {
      service: new QuestionImportService(questions, topics, dataSource, access),
      assertTopicReadable,
    };
  }

  function file(buffer: Buffer, overrides: Partial<UploadedResourceFile> = {}): UploadedResourceFile {
    return {
      originalname: 'questions.pdf',
      mimetype: 'application/pdf',
      size: buffer.length,
      buffer,
      ...overrides,
    };
  }

  it('rejects text disguised as a PDF before parsing', async () => {
    const { service } = build();
    await expect(service.inspectPdf(
      { topic_id: topic.id, copyright_confirmed: true },
      file(Buffer.from('not a pdf')),
      actor,
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it('extracts a numbered MCQ and its answer key into the review queue', async () => {
    const { service, assertTopicReadable } = build();
    const result = await service.inspectPdf(
      { topic_id: topic.id, copyright_confirmed: true },
      file(textPdf()),
      actor,
    );

    expect(assertTopicReadable).toHaveBeenCalledWith(topic.id, actor);
    expect(result.page_count).toBe(1);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].question_text).toContain('Which chamber receives oxygenated blood');
    expect(result.candidates[0].options).toHaveLength(4);
    expect(result.candidates[0].options.find((option) => option.is_correct)?.option_text).toBe('Left atrium');
    expect(result.candidates[0].explanation).toContain('Pulmonary veins return oxygenated blood');
  });

  it('supports A-E options and compact lecture answer keys without requiring explanations', async () => {
    const { service } = build();
    const result = await service.inspectPdf(
      { topic_id: topic.id, copyright_confirmed: true },
      file(fiveOptionLecturePdf()),
      actor,
    );

    expect(result.candidates).toHaveLength(2);
    expect(result.sections).toEqual([
      expect.objectContaining({ title: expect.stringContaining('Lecture One'), questions: 2 }),
    ]);
    expect(result.candidates[0].options).toHaveLength(5);
    expect(result.candidates[0].options.find((option) => option.is_correct)?.label).toBe('B');
    expect(result.candidates[1].options.find((option) => option.is_correct)?.label).toBe('E');
    expect(result.candidates.map((candidate) => candidate.question_number)).toEqual([1, 2]);
    expect(result.parser.detected_document_type).toBe('MCQ');
    expect(result.parser.answer_key).toEqual({
      '1': expect.objectContaining({ answer: 'B' }),
      '2': expect.objectContaining({ answer: 'E' }),
    });
    expect(result.parser.mapped_answers).toBe(2);
    expect(result.candidates[0].issues.some((issue) => issue.code === 'MISSING_EXPLANATION')).toBe(false);
    expect(result.candidates[0].issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'NO_SOURCE_EXPLANATION', severity: 'INFO' }),
    ]));
    expect(result.candidates[0].status).not.toBe('INVALID');
  });

  it('auto-stops an impossible repeated option label sequence instead of treating it as eight options', async () => {
    const { service } = build();
    const result = await service.inspectPdf(
      { topic_id: topic.id, copyright_confirmed: true },
      file(repeatedOptionSequencePdf()),
      actor,
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].options.map((option) => option.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(result.candidates[0].issues.some((issue) => issue.code === 'INVALID_OPTION_COUNT')).toBe(true);
    expect(result.candidates[0].status).toBe('INVALID');
  });

  it('does not invent questions when a PDF has no safely extractable text layer', async () => {
    const { service } = build();
    const result = await service.inspectPdf(
      { topic_id: topic.id, copyright_confirmed: true },
      file(scannedPdf()),
      actor,
    );

    expect(result.status).toBe('NEEDS_OCR');
    expect(result.candidates).toEqual([]);
    expect(result.issues[0].code).toBe('NO_USABLE_TEXT_LAYER');
  });

  it('targets only the local page window for a malformed parsed question', () => {
    const { service } = build();
    const pdf = {
      pageCount: 20,
      text: 'synthetic',
      extractionConfidence: 1,
      pages: Array.from({ length: 20 }, (_, index) => ({
        page: index + 1,
        text: 'healthy text',
        source: 'TEXT_LAYER',
        confidence: 1,
      })),
    };
    const document = {
      documentType: 'MCQ',
      answerKey: new Map(),
      questions: [{
        questionNumber: 50,
        sourcePage: 10,
        answerKeyPage: 20,
        sourceSection: 'Lecture One',
        questionText: 'Malformed question',
        options: [
          { label: 'A', text: 'one' },
          { label: 'B', text: 'two' },
          { label: 'C', text: 'three' },
          { label: 'D', text: 'four' },
        ],
        correctLabel: 'B',
        explanation: null,
      }],
      sections: [],
      expectedQuestionCount: 1,
      parsedQuestionCount: 1,
      missingQuestionCount: 0,
      isStructurallyComplete: false,
    };

    expect((service as any).recoveryPageNumbers(pdf, document)).toEqual([
      9, 10, 11, 19, 20,
    ]);
  });

  it('targets the section tail instead of OCRing every question page when the answer key is missing', () => {
    const { service } = build();
    const pdf = {
      pageCount: 20,
      text: 'synthetic',
      extractionConfidence: 1,
      pages: Array.from({ length: 20 }, (_, index) => ({
        page: index + 1,
        text: 'healthy text',
        source: 'TEXT_LAYER',
        confidence: 1,
      })),
    };
    const questions = Array.from({ length: 10 }, (_, index) => ({
      questionNumber: index + 1,
      sourcePage: index + 2,
      answerKeyPage: null,
      sourceSection: 'Lecture One',
      questionText: `Question ${index + 1}`,
      options: ['A', 'B', 'C', 'D', 'E'].map((label) => ({
        label,
        text: `${label} option`,
      })),
      correctLabel: null,
      explanation: null,
    }));
    const document = {
      documentType: 'MCQ',
      answerKey: new Map(),
      questions,
      sections: [{
        title: 'Lecture One',
        expectedQuestionNumbers: [],
        parsedQuestionNumbers: questions.map((question) => question.questionNumber),
        missingQuestionNumbers: [],
        unexpectedQuestionNumbers: [],
        duplicateQuestionNumbers: [],
        answerKeyConflicts: [],
        expectedQuestionCount: null,
        parsedQuestionCount: questions.length,
        completeness: null,
      }],
      expectedQuestionCount: null,
      parsedQuestionCount: questions.length,
      missingQuestionCount: 0,
      isStructurallyComplete: false,
    };

    expect((service as any).recoveryPageNumbers(pdf, document)).toEqual([
      10, 11, 12, 13, 14,
    ]);
  });

  it('does not OCR unrelated pages when structural failure has no local evidence', () => {
    const { service } = build();
    const pdf = {
      pageCount: 8,
      text: 'synthetic',
      extractionConfidence: 1,
      pages: Array.from({ length: 8 }, (_, index) => ({
        page: index + 1,
        text: 'healthy prose without MCQ markers',
        source: 'TEXT_LAYER',
        confidence: 1,
      })),
    };
    const document = {
      documentType: 'MCQ',
      answerKey: new Map(),
      questions: [],
      sections: [{
        title: 'Lecture One',
        expectedQuestionNumbers: [1],
        parsedQuestionNumbers: [],
        missingQuestionNumbers: [1],
        unexpectedQuestionNumbers: [],
        duplicateQuestionNumbers: [],
        answerKeyConflicts: [],
        expectedQuestionCount: 1,
        parsedQuestionCount: 0,
        completeness: 0,
      }],
      expectedQuestionCount: 1,
      parsedQuestionCount: 0,
      missingQuestionCount: 1,
      isStructurallyComplete: false,
    };

    expect((service as any).recoveryPageNumbers(pdf, document)).toEqual([]);
  });

  it('localizes a missing question from its raw text marker instead of OCRing the document', () => {
    const { service } = build();
    const pdf = {
      pageCount: 12,
      text: 'synthetic',
      extractionConfidence: 1,
      pages: Array.from({ length: 12 }, (_, index) => ({
        page: index + 1,
        text:
          index === 6
            ? '1) Garbled question stem\nA) first option\nB) second option'
            : 'healthy prose',
        source: 'TEXT_LAYER',
        confidence: 1,
      })),
    };
    const document = {
      documentType: 'MCQ',
      answerKey: new Map(),
      questions: [],
      sections: [{
        title: 'Lecture One',
        answerKey: new Map([[1, { label: 'B', page: 10 }]]),
        expectedQuestionNumbers: [1],
        parsedQuestionNumbers: [],
        missingQuestionNumbers: [1],
        unexpectedQuestionNumbers: [],
        duplicateQuestionNumbers: [],
        answerKeyConflicts: [],
        expectedQuestionCount: 1,
        parsedQuestionCount: 0,
        completeness: 0,
      }],
      expectedQuestionCount: 1,
      parsedQuestionCount: 0,
      missingQuestionCount: 1,
      isStructurallyComplete: false,
    };

    expect((service as any).recoveryPageNumbers(pdf, document)).toEqual([
      6, 7, 8,
    ]);
  });

  it('keeps recovery targeted even when most text-layer pages are weak', () => {
    const { service } = build();
    const pdf = {
      pageCount: 10,
      text: 'synthetic',
      extractionConfidence: 0.8,
      pages: Array.from({ length: 10 }, (_, index) => ({
        page: index + 1,
        text: 'text',
        source: 'TEXT_LAYER',
        confidence: index < 7 ? 0.6 : 0.95,
      })),
    };
    const document = {
      documentType: 'MCQ',
      answerKey: new Map(),
      questions: [],
      sections: [],
      expectedQuestionCount: null,
      parsedQuestionCount: 0,
      missingQuestionCount: 0,
      isStructurallyComplete: false,
    };

    expect((service as any).recoveryPageNumbers(pdf, document)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it('requires an explicit rights confirmation before inspection', async () => {
    const { service } = build();
    await expect(service.inspectPdf(
      { topic_id: topic.id, copyright_confirmed: false },
      file(textPdf()),
      actor,
    )).rejects.toThrow('Confirm that you have permission');
  });

  it('performs only one targeted recovery pass when the document remains incomplete', async () => {
    const { service } = build();
    const pages = Array.from({ length: 4 }, (_, index) => ({
      page: index + 1,
      text: `page ${index + 1} text`,
      source: 'TEXT_LAYER' as const,
      confidence: 0.9,
      textLength: 11,
      ocrAttempted: false,
      layoutReflowed: false,
    }));
    const originalPdf = {
      pages,
      pageCount: 4,
      text: pages.map((page) => page.text).join('\n'),
      extractionConfidence: 0.9,
      extractionMethod: 'TEXT_LAYER' as const,
      ocrPageCount: 0,
      textLayerPageCount: 4,
      emptyPageCount: 0,
    };
    const targetedPdf = {
      ...originalPdf,
      pages: pages.map((page) =>
        page.page === 2
          ? {
              ...page,
              text: 'page 2 OCR text',
              source: 'OCR' as const,
              ocrAttempted: true,
            }
          : { ...page },
      ),
      text: 'page 1 text\npage 2 OCR text\npage 3 text\npage 4 text',
      extractionMethod: 'HYBRID_OCR' as const,
      ocrPageCount: 1,
      textLayerPageCount: 3,
    };
    const parsedQuestion = {
      questionNumber: 1,
      sourcePage: 1,
      answerKeyPage: 4,
      sourceSection: 'Arbitrary Section',
      questionText: 'Which option is correct?',
      options: ['A', 'B', 'C', 'D', 'E'].map((label) => ({
        label,
        text: `${label} option`,
      })),
      correctLabel: 'A',
      explanation: null,
    };
    const incompleteDocument = {
      documentType: 'MCQ',
      answerKey: new Map([[1, { label: 'A', page: 4 }]]),
      questions: [parsedQuestion],
      sections: [],
      expectedQuestionCount: 2,
      parsedQuestionCount: 1,
      missingQuestionCount: 1,
      isStructurallyComplete: false,
    };

    jest.spyOn(service as any, 'extractPdf').mockResolvedValue(originalPdf);
    jest.spyOn(service as any, 'recoveryPageNumbers').mockReturnValue([2]);
    jest.spyOn(service as any, 'parseQuestions')
      .mockReturnValueOnce(incompleteDocument)
      .mockReturnValueOnce(incompleteDocument);
    const recover = jest.spyOn(service as any, 'recoverIncompletePdf')
      .mockResolvedValueOnce(targetedPdf);

    const buffer = fiveOptionLecturePdf();
    const result = await service.inspectPdf(
      { topic_id: topic.id, copyright_confirmed: true },
      file(buffer),
      actor,
    );

    expect(recover).toHaveBeenCalledTimes(1);
    expect(recover).toHaveBeenCalledWith(buffer, originalPdf, [2]);
    expect(result.summary.structurally_complete).toBe(false);
  });

});
