import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { QuestionDifficulty } from '../../../common/entities/question.entity';
import { EnrichQuestionImportDto, PublishQuestionImportDto } from './questions.dto';

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
  it('accepts an explanation with at most three sentences and 700 characters', async () => {
    const dto = plainToInstance(
      PublishQuestionImportDto,
      payloadWithExplanation(
        'Pulmonary veins return oxygenated blood to the left atrium. This distinguishes it from the right atrium.',
      ),
    );

    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts a four-option import payload so server publication can apply instructor confirmation', async () => {
    const payload = payloadWithExplanation('Concise explanation.');
    payload.candidates[0].options = payload.candidates[0].options.slice(0, 4);
    (payload.candidates[0] as typeof payload.candidates[0] & { allow_four_options?: boolean }).allow_four_options = true;

    const dto = plainToInstance(PublishQuestionImportDto, payload);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an import payload with fewer than four options', async () => {
    const payload = payloadWithExplanation('Concise explanation.');
    payload.candidates[0].options = payload.candidates[0].options.slice(0, 3);

    const dto = plainToInstance(PublishQuestionImportDto, payload);
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects an explanation longer than 700 characters', async () => {
    const dto = plainToInstance(
      PublishQuestionImportDto,
      payloadWithExplanation('a'.repeat(701)),
    );

    const errors = await validate(dto);
    expect(errors).not.toHaveLength(0);
    expect(constraintMessages(errors)).toContain(
      'explanation must be shorter than or equal to 700 characters',
    );
  });

  it('rejects an explanation with more than three sentences', async () => {
    const dto = plainToInstance(
      PublishQuestionImportDto,
      payloadWithExplanation('First sentence. Second sentence. Third sentence. Fourth sentence.'),
    );

    const errors = await validate(dto);
    expect(errors).not.toHaveLength(0);
    expect(constraintMessages(errors)).toContain(
      'explanation must be at most 3 sentences and 700 characters',
    );
  });
});


describe('EnrichQuestionImportDto option-count policy', () => {
  function enrichmentPayload(optionCount: number) {
    return {
      topic_name: 'Cardiology',
      candidates: [{
        candidate_id: 'candidate-1',
        question_text: 'Which chamber receives oxygenated blood from the pulmonary veins?',
        allow_four_options: optionCount === 4,
        options: Array.from({ length: optionCount }, (_, index) => ({
          label: String.fromCharCode(65 + index),
          option_text: `Option ${String.fromCharCode(65 + index)}`,
          is_correct: index === 1,
        })),
      }],
    };
  }

  it('accepts four-option candidates for explanation generation', async () => {
    const dto = plainToInstance(EnrichQuestionImportDto, enrichmentPayload(4));
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts the standard five-option candidates for explanation generation', async () => {
    const dto = plainToInstance(EnrichQuestionImportDto, enrichmentPayload(5));
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects enrichment candidates outside the four-or-five option contract', async () => {
    const tooFew = plainToInstance(EnrichQuestionImportDto, enrichmentPayload(3));
    const tooMany = plainToInstance(EnrichQuestionImportDto, enrichmentPayload(6));

    expect(await validate(tooFew)).not.toHaveLength(0);
    expect(await validate(tooMany)).not.toHaveLength(0);
  });
});
