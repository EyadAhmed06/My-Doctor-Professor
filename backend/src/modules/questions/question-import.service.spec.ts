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
(1) B 2) E) Tj
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
    expect(result.candidates[0].issues.some((issue) => issue.code === 'INVALID_OPTION_COUNT')).toBe(false);
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

  it('requires an explicit rights confirmation before inspection', async () => {
    const { service } = build();
    await expect(service.inspectPdf(
      { topic_id: topic.id, copyright_confirmed: false },
      file(textPdf()),
      actor,
    )).rejects.toThrow('Confirm that you have permission');
  });
});
