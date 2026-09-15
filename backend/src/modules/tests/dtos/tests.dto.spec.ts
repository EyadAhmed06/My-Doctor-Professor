import { validate } from 'class-validator';
import { GeneratePracticeTestDto, SaveAnswerDto } from './tests.dto';
import { TestMode } from '../../../common/entities/test-attempt.entity';

describe('assessment DTO UUID compatibility', () => {
  it('accepts the canonical PostgreSQL UUID text used by persisted demo MCQ options', async () => {
    const dto = Object.assign(new SaveAnswerDto(), {
      selected_option_id: '71000000-0000-4000-0001-000000000004',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('accepts persisted lecture UUID text even when it is not UUID v4', async () => {
    const dto = Object.assign(new GeneratePracticeTestDto(), {
      bundle_id: '11111111-1111-4111-8111-111111111111',
      lecture_ids: ['71000000-0000-1000-0001-000000000004'],
      question_count: 40,
      test_mode: TestMode.TUTOR,
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'lecture_ids')).toBe(false);
  });

  it('still rejects malformed persisted identifiers', async () => {
    const answer = Object.assign(new SaveAnswerDto(), {
      selected_option_id: 'not-an-option-id',
    });
    const practice = Object.assign(new GeneratePracticeTestDto(), {
      bundle_id: '11111111-1111-4111-8111-111111111111',
      lecture_ids: ['not-a-lecture-id'],
      question_count: 40,
      test_mode: TestMode.TUTOR,
    });

    const [answerErrors, practiceErrors] = await Promise.all([
      validate(answer),
      validate(practice),
    ]);
    expect(answerErrors.some((error) => error.property === 'selected_option_id')).toBe(true);
    expect(practiceErrors.some((error) => error.property === 'lecture_ids')).toBe(true);
  });
});
