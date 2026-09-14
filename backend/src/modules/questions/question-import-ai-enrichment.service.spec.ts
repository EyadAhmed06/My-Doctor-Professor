import { QuestionDifficulty } from '../../common/entities/question.entity';
import { QuestionImportAiEnrichmentService } from './question-import-ai-enrichment.service';
import { OpenRouterQuestionEnrichmentService } from './openrouter-question-enrichment.service';

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    candidate_id: 'candidate-1',
    question_text: 'Which therapy is most appropriate for this patient?',
    source_section: 'GERD',
    options: ['A', 'B', 'C', 'D', 'E'].map((label) => ({
      label,
      option_text: `Option ${label}`,
      is_correct: label === 'C',
    })),
    explanation: null,
    difficulty: QuestionDifficulty.MEDIUM,
    status: 'VALID' as const,
    issues: [],
    ...overrides,
  };
}

function inspection(row = candidate()) {
  return {
    topic: { id: 'topic-1', name: 'Gastroenterology' },
    candidates: [row],
    summary: { extracted: 1, valid: 1, needs_review: 0, invalid: 0, duplicates: 0 },
    issues: [],
  };
}

describe('QuestionImportAiEnrichmentService', () => {
  it('returns a question explanation plus A-E explanations without changing the answer key', async () => {
    const openRouter = {
      isConfigured: () => true,
      generate: jest.fn().mockResolvedValue({
        candidateId: 'candidate-1',
        sourceCorrectLabel: 'C',
        answerConsistency: 'CONSISTENT',
        questionExplanation: 'The stem tests the preferred management principle.',
        optionExplanations: ['A', 'B', 'C', 'D', 'E'].map((label) => ({
          label,
          assessment: label === 'C' ? 'CORRECT' : 'INCORRECT',
          explanation: `${label} rationale`,
        })),
        difficulty: 'MEDIUM',
        confidence: 0.94,
        reviewReason: null,
        model: 'meta/muse-spark-1.3',
        promptVersion: 'mcq-explanation-v2-concise',
      }),
    } as unknown as OpenRouterQuestionEnrichmentService;

    const service = new QuestionImportAiEnrichmentService(openRouter);
    const result = await service.enrichInspection(inspection());
    const enriched = result.candidates[0];

    expect(enriched.options.find((option) => option.label === 'C')?.is_correct).toBe(true);
    expect(enriched.options.filter((option) => option.is_correct)).toHaveLength(1);
    expect(enriched.options.map((option) => option.explanation)).toEqual([
      'A rationale', 'B rationale', 'C rationale', 'D rationale', 'E rationale',
    ]);
    expect(enriched.explanation).toBe('The stem tests the preferred management principle.');
    expect(enriched.issues.some((issue) => issue.code === 'AI_ENRICHED')).toBe(true);
  });

  it('does not ask AI to invent a missing source answer', async () => {
    const generate = jest.fn();
    const openRouter = { isConfigured: () => true, generate } as unknown as OpenRouterQuestionEnrichmentService;
    const service = new QuestionImportAiEnrichmentService(openRouter);
    const row = candidate({
      status: 'NEEDS_REVIEW',
      options: ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, option_text: `Option ${label}`, is_correct: false })),
    });

    const result = await service.enrichInspection(inspection(row));

    expect(generate).not.toHaveBeenCalled();
    expect(result.candidates[0].options.some((option) => option.is_correct)).toBe(false);
  });

  it('flags a questionable source key for instructor review while preserving it', async () => {
    const openRouter = {
      isConfigured: () => true,
      generate: jest.fn().mockResolvedValue({
        candidateId: 'candidate-1',
        sourceCorrectLabel: 'C',
        answerConsistency: 'QUESTIONABLE',
        questionExplanation: 'Explanation',
        optionExplanations: ['A', 'B', 'C', 'D', 'E'].map((label) => ({
          label,
          assessment: label === 'C' ? 'CORRECT' : 'INCORRECT',
          explanation: `${label} rationale`,
        })),
        difficulty: 'HARD',
        confidence: 0.55,
        reviewReason: 'The keyed answer conflicts with standard management guidance.',
        model: 'meta/muse-spark-1.3',
        promptVersion: 'mcq-explanation-v2-concise',
      }),
    } as unknown as OpenRouterQuestionEnrichmentService;

    const service = new QuestionImportAiEnrichmentService(openRouter);
    const result = await service.enrichInspection(inspection());

    expect(result.candidates[0].status).toBe('NEEDS_REVIEW');
    expect(result.candidates[0].options.find((option) => option.label === 'C')?.is_correct).toBe(true);
    expect(result.candidates[0].issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'AI_ANSWER_KEY_REVIEW_REQUIRED', severity: 'WARNING' }),
    ]));
  });
});
