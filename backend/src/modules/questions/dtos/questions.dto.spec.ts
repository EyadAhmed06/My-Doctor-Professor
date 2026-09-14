import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { QuestionDifficulty } from '../../../common/entities/question.entity';
import { PublishQuestionImportDto } from './questions.dto';

function payloadWithExplanation(explanation: string) {
  return {
    topic_id: '60000000-0000-4000-8000-000000000001',
    original_filename: 'questions.pdf',
    file_sha256: 'a'.repeat(64),
    copyright_confirmed: true,
    candidates: [
      {
        approved: true,
        question_text: 'Which chamber receives oxygenated blood from the pulmonary veins?',
        explanation,
        difficulty: QuestionDifficulty.MEDIUM,
        marks: 1,
        options: [
          { option_text: 'Right atrium', explanation: 'It receives systemic venous blood.', is_correct: false },
          { option_text: 'Left atrium', explanation: 'Pulmonary veins drain directly into the left atrium.', is_correct: true },
          { option_text: 'Right ventricle', explanation: 'It receives blood from the right atrium.', is_correct: false },
          { option_text: 'Left ventricle', explanation: 'It receives blood from the left atrium.', is_correct: false },
          { option_text: 'Aorta', explanation: 'It carries blood away from the left ventricle.', is_correct: false },
        ],
      },
    ],
  };
}

function constraintMessages(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...constraintMessages(error.children ?? []),
  ]);
}

describe('PublishQuestionImportDto explanation policy', () => {
  it('accepts an explanation with at most two sentences and 220 characters', async () => {
    const dto = plainToInstance(
      PublishQuestionImportDto,
      payloadWithExplanation(
        'Pulmonary veins return oxygenated blood to the left atrium. This distinguishes it from the right atrium.',
      ),
    );

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an explanation longer than 220 characters', async () => {
    const dto = plainToInstance(
      PublishQuestionImportDto,
      payloadWithExplanation('a'.repeat(221)),
    );

    const errors = await validate(dto);
    expect(errors).not.toHaveLength(0);
    expect(constraintMessages(errors)).toContain(
      'explanation must be shorter than or equal to 220 characters',
    );
  });

  it('rejects an explanation with more than two sentences', async () => {
    const dto = plainToInstance(
      PublishQuestionImportDto,
      payloadWithExplanation('First sentence. Second sentence. Third sentence.'),
    );

    const errors = await validate(dto);
    expect(errors).not.toHaveLength(0);
    expect(constraintMessages(errors)).toContain(
      'explanation must be at most 2 sentences and 220 characters',
    );
  });
});
