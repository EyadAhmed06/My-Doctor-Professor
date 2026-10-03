import { QuestionType } from '../../common/entities/question.entity';
import { TestQuestion } from '../../common/entities/test-question.entity';
import { Test } from '../../common/entities/test.entity';
import { validateTestForPublish } from './assessment-authoring.service';

function testRecord(): Test {
  return {
    totalMarks: '1.00',
    passingMarks: null,
    durationMinutes: 10,
    courseId: 'course-1',
    weekId: null,
    lectureId: null,
    availableFrom: null,
    availableUntil: null,
  } as Test;
}

function item(optionCount: number): TestQuestion {
  return {
    displayOrder: 1,
    marks: '1.00',
    question: {
      isActive: true,
      questionType: QuestionType.MCQ,
      options: Array.from({ length: optionCount }, (_, index) => ({
        isCorrect: index === 0,
      })),
    },
  } as TestQuestion;
}

describe('validateTestForPublish MCQ option policy', () => {
  it('accepts an active four-option MCQ with exactly one correct answer', () => {
    const issues = validateTestForPublish(testRecord(), [item(4)]);
    expect(issues.some((issue) => issue.code === 'MALFORMED_MCQS')).toBe(false);
  });

  it('rejects an MCQ with fewer than four options', () => {
    const issues = validateTestForPublish(testRecord(), [item(3)]);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MALFORMED_MCQS', severity: 'ERROR' }),
    ]));
  });
});
