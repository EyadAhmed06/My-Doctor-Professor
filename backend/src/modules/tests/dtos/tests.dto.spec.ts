import { validate } from 'class-validator';
import { SaveAnswerDto } from './tests.dto';

describe('SaveAnswerDto', () => {
  it('accepts the canonical PostgreSQL UUID text used by persisted demo MCQ options', async () => {
    const dto = Object.assign(new SaveAnswerDto(), {
      selected_option_id: '71000000-0000-4000-0001-000000000004',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('still rejects malformed option identifiers', async () => {
    const dto = Object.assign(new SaveAnswerDto(), {
      selected_option_id: 'not-an-option-id',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'selected_option_id')).toBe(true);
  });
});
