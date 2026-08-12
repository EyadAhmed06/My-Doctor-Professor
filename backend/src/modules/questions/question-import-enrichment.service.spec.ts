import { QuestionDifficulty } from '../../common/entities/question.entity';
import { QuestionImportEnrichmentService } from './question-import-enrichment.service';

describe('QuestionImportEnrichmentService', () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_QUESTION_ENRICHMENT_MODEL;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.OPENAI_QUESTION_ENRICHMENT_MODEL;
    else process.env.OPENAI_QUESTION_ENRICHMENT_MODEL = originalModel;
  });

  function inspection() {
    return {
      candidates: [
        {
          candidate_id: 'candidate-1',
          source_page: 1,
          question_text: 'Which chamber receives oxygenated blood directly from the pulmonary veins?',
          options: [
            { label: 'A', option_text: 'Right atrium', is_correct: false },
            { label: 'B', option_text: 'Left atrium', is_correct: true },
            { label: 'C', option_text: 'Right ventricle', is_correct: false },
            { label: 'D', option_text: 'Left ventricle', is_correct: false },
            { label: 'E', option_text: 'Pulmonary artery', is_correct: false },
          ],
          explanation: null,
          difficulty: QuestionDifficulty.MEDIUM,
          marks: 1,
          extraction_confidence: 1,
          topic_confidence: 1,
          status: 'VALID' as const,
          issues: [],
          duplicate: null,
        },
      ],
      summary: {
        extracted: 1,
        valid: 1,
        needs_review: 0,
        invalid: 0,
        duplicates: 0,
      },
      issues: [],
    };
  }

  it('adds a concise 4-7 line explanation and automated difficulty without changing the source answer', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  questions: [
                    {
                      candidate_id: 'candidate-1',
                      difficulty: 'EASY',
                      explanation_lines: [
                        'B is correct: pulmonary veins return oxygenated blood directly to the left atrium.',
                        'A is wrong: the right atrium receives systemic venous blood through the venae cavae.',
                        'C is wrong: the right ventricle pumps deoxygenated blood into the pulmonary artery.',
                        'D is wrong: the left ventricle receives blood from the left atrium, not pulmonary veins directly.',
                        'E is wrong: the pulmonary artery carries blood away from the right ventricle.',
                      ],
                    },
                  ],
                }),
              },
            ],
          },
        ],
      }),
    } as Response);

    const service = new QuestionImportEnrichmentService();
    const result = await service.enrichInspection(inspection());
    const candidate = result.candidates[0];

    expect(candidate.difficulty).toBe(QuestionDifficulty.EASY);
    expect(candidate.explanation?.split('\n')).toHaveLength(5);
    expect(candidate.explanation).toContain('B is correct');
    expect(candidate.explanation).toContain('A is wrong');
    expect(candidate.explanation).toContain('E is wrong');
    expect(candidate.options.find((option) => option.is_correct)?.label).toBe('B');
    expect(candidate.status).toBe('VALID');
    expect(candidate.issues.some((issue) => issue.code === 'AI_ENRICHED')).toBe(true);
  });

  it('moves otherwise-valid questions to review when enrichment cannot run', async () => {
    delete process.env.OPENAI_API_KEY;
    const service = new QuestionImportEnrichmentService();
    const result = await service.enrichInspection(inspection());

    expect(result.candidates[0].status).toBe('NEEDS_REVIEW');
    expect(result.candidates[0].explanation).toBeNull();
    expect(result.summary.needs_review).toBe(1);
    expect(result.issues.some((issue) => issue.code === 'AI_ENRICHMENT_UNAVAILABLE')).toBe(true);
  });

  it('rejects malformed AI output that omits an incorrect option explanation', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          questions: [
            {
              candidate_id: 'candidate-1',
              difficulty: 'MEDIUM',
              explanation_lines: [
                'B is correct for the direct pulmonary venous connection.',
                'A is wrong because it receives systemic venous return.',
                'C is wrong because it pumps toward the lungs.',
                'D is wrong because it is downstream from the left atrium.',
              ],
            },
          ],
        }),
      }),
    } as Response);

    const service = new QuestionImportEnrichmentService();
    const result = await service.enrichInspection(inspection());

    expect(result.candidates[0].status).toBe('NEEDS_REVIEW');
    expect(result.candidates[0].issues.some((issue) => issue.code === 'AI_ENRICHMENT_FAILED')).toBe(true);
  });
});
