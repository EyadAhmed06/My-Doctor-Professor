import { QuestionDifficulty } from '../../common/entities/question.entity';
import { QuestionImportAiEnrichmentService } from './question-import-ai-enrichment.service';
import {
  OpenRouterEnrichmentError,
  OpenRouterQuestionEnrichmentService,
} from './openrouter-question-enrichment.service';

const signature = {
  provider: 'OPENROUTER' as const,
  model: 'meta/muse-spark-1.3',
  promptVersion: 'mcq-explanation-v4-clinical-rationale',
};

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

function generatedResult(candidateId: string) {
  return {
    candidateId,
    sourceCorrectLabel: 'C',
    answerConsistency: 'CONSISTENT' as const,
    questionExplanation: 'The stem tests the preferred management principle.',
    optionExplanations: ['A', 'B', 'C', 'D', 'E'].map((label) => ({
      label,
      assessment: label === 'C' ? 'CORRECT' as const : 'INCORRECT' as const,
      explanation: `${label} rationale`,
    })),
    difficulty: 'MEDIUM' as const,
    confidence: 0.94,
    reviewReason: null,
    model: 'meta/muse-spark-1.3',
    promptVersion: 'mcq-explanation-v4-clinical-rationale',
  };
}

describe('QuestionImportAiEnrichmentService', () => {
  it('returns a question explanation plus A-E explanations without changing the answer key', async () => {
    const generate = jest.fn().mockResolvedValue({
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
      promptVersion: 'mcq-explanation-v4-clinical-rationale',
    });
    const openRouter = {
      isConfigured: () => true,
      getSignature: () => signature,
      generate,
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

  it('enriches an explicitly confirmed four-option MCQ without inventing option E', async () => {
    const fourOptions = ['A', 'B', 'C', 'D'].map((label) => ({
      label,
      option_text: `Option ${label}`,
      is_correct: label === 'C',
    }));
    const generate = jest.fn().mockResolvedValue({
      candidateId: 'candidate-1',
      sourceCorrectLabel: 'C',
      answerConsistency: 'CONSISTENT',
      questionExplanation: 'The stem tests the preferred management principle.',
      optionExplanations: ['A', 'B', 'C', 'D'].map((label) => ({
        label,
        assessment: label === 'C' ? 'CORRECT' : 'INCORRECT',
        explanation: `${label} rationale`,
      })),
      difficulty: 'MEDIUM',
      confidence: 0.94,
      reviewReason: null,
      model: 'meta/muse-spark-1.3',
      promptVersion: 'mcq-explanation-v4-clinical-rationale',
    });
    const openRouter = {
      isConfigured: () => true,
      getSignature: () => signature,
      generate,
    } as unknown as OpenRouterQuestionEnrichmentService;

    const service = new QuestionImportAiEnrichmentService(openRouter);
    const result = await service.enrichInspection(inspection(candidate({
      options: fourOptions,
      status: 'NEEDS_REVIEW',
      allow_four_options: true,
    })));

    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.candidates[0].options).toHaveLength(4);
    expect(result.candidates[0].options.map((option) => option.explanation)).toEqual([
      'A rationale', 'B rationale', 'C rationale', 'D rationale',
    ]);
  });

  it('reuses a cached four-option enrichment without inventing option E', async () => {
    const fourOptions = ['A', 'B', 'C', 'D'].map((label) => ({
      label,
      option_text: `Option ${label}`,
      is_correct: label === 'C',
    }));
    const serviceCandidate = candidate({
      options: fourOptions,
      status: 'NEEDS_REVIEW',
      allow_four_options: true,
    });
    const seedService = new QuestionImportAiEnrichmentService({
      isConfigured: () => true,
      getSignature: () => signature,
      generate: jest.fn(),
    } as unknown as OpenRouterQuestionEnrichmentService);
    const cachedResult = {
      ...generatedResult('candidate-1'),
      optionExplanations: generatedResult('candidate-1').optionExplanations.slice(0, 4),
    };
    const cache = {
      find: jest.fn().mockResolvedValue([{
        provider: signature.provider,
        model: signature.model,
        promptVersion: signature.promptVersion,
        contentHash: seedService.contentHash(serviceCandidate),
        result: cachedResult,
      }]),
      upsert: jest.fn(),
    };
    const generate = jest.fn();
    const service = new QuestionImportAiEnrichmentService({
      isConfigured: () => true,
      getSignature: () => signature,
      generate,
    } as unknown as OpenRouterQuestionEnrichmentService, cache as never);

    const result = await service.enrichInspection(inspection(serviceCandidate));

    expect(generate).not.toHaveBeenCalled();
    expect(result.candidates[0].options).toHaveLength(4);
    expect(result.candidates[0].options.map((option) => option.explanation)).toEqual([
      'A rationale', 'B rationale', 'C rationale', 'D rationale',
    ]);
    expect(result.candidates[0].options.some((option) => option.label === 'E')).toBe(false);
  });

  it('does not enrich an unconfirmed four-option MCQ', async () => {
    const generate = jest.fn();
    const openRouter = {
      isConfigured: () => true,
      getSignature: () => signature,
      generate,
    } as unknown as OpenRouterQuestionEnrichmentService;
    const service = new QuestionImportAiEnrichmentService(openRouter);

    await service.enrichInspection(inspection(candidate({
      options: ['A', 'B', 'C', 'D'].map((label) => ({
        label,
        option_text: `Option ${label}`,
        is_correct: label === 'C',
      })),
      status: 'NEEDS_REVIEW',
      allow_four_options: false,
    })));

    expect(generate).not.toHaveBeenCalled();
  });

  it('does not ask AI to invent a missing source answer', async () => {
    const generate = jest.fn();
    const openRouter = { isConfigured: () => true, getSignature: () => signature, generate } as unknown as OpenRouterQuestionEnrichmentService;
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
      getSignature: () => signature,
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
        promptVersion: 'mcq-explanation-v4-clinical-rationale',
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

  it('uses a safe initial concurrency of two for a healthy bulk run', async () => {
    let active = 0;
    let maxActive = 0;
    const generate = jest.fn().mockImplementation(async (request: { candidateId: string }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return generatedResult(request.candidateId);
    });
    const openRouter = {
      isConfigured: () => true,
      getSignature: () => signature,
      generate,
    } as unknown as OpenRouterQuestionEnrichmentService;
    const rows = Array.from({ length: 4 }, (_, index) => candidate({
      candidate_id: `candidate-${index + 1}`,
    }));
    const bulkInspection = {
      topic: { id: 'topic-1', name: 'Gastroenterology' },
      candidates: rows,
      summary: { extracted: 4, valid: 4, needs_review: 0, invalid: 0, duplicates: 0 },
      issues: [],
    };

    const result = await new QuestionImportAiEnrichmentService(openRouter).enrichInspection(bulkInspection);

    expect(result.candidates.every((row) => row.ai_enrichment?.status === 'GENERATED')).toBe(true);
    expect(generate).toHaveBeenCalledTimes(4);
    expect(maxActive).toBe(2);
  });

  it('enriches all 80 healthy questions without dropping candidate ids', async () => {
    const generate = jest.fn().mockImplementation(async (request: { candidateId: string }) => generatedResult(request.candidateId));
    const openRouter = {
      isConfigured: () => true,
      getSignature: () => signature,
      generate,
    } as unknown as OpenRouterQuestionEnrichmentService;
    const rows = Array.from({ length: 80 }, (_, index) => candidate({ candidate_id: `candidate-${index + 1}` }));

    const result = await new QuestionImportAiEnrichmentService(openRouter).enrichInspection({
      topic: { id: 'topic-1', name: 'Gastroenterology' },
      candidates: rows,
      summary: { extracted: 80, valid: 80, needs_review: 0, invalid: 0, duplicates: 0 },
      issues: [],
    });

    expect(generate).toHaveBeenCalledTimes(80);
    expect(result.enrichment_summary).toEqual({ generated: 80, cached: 0, failed: 0, billing_deferred: 0 });
    expect(result.candidates.map((row) => row.candidate_id)).toEqual(rows.map((row) => row.candidate_id));
    expect(result.candidates.every((row) => row.ai_enrichment?.status === 'GENERATED')).toBe(true);
  });

  it('reuses 20 matching complete enrichments and only requests the other 60', async () => {
    const generate = jest.fn().mockImplementation(async (request: { candidateId: string }) => generatedResult(request.candidateId));
    const openRouter = {
      isConfigured: () => true,
      getSignature: () => signature,
      generate,
    } as unknown as OpenRouterQuestionEnrichmentService;
    const service = new QuestionImportAiEnrichmentService(openRouter);
    const rows = Array.from({ length: 80 }, (_, index) => candidate({ candidate_id: `candidate-${index + 1}` }));
    for (const row of rows.slice(0, 20)) {
      row.explanation = 'Cached question rationale.';
      row.options = row.options.map((option) => ({ ...option, explanation: `${option.label} cached rationale` }));
      row.ai_enrichment = {
        ...signature,
        provider: signature.provider,
        prompt_version: signature.promptVersion,
        content_hash: service.contentHash(row),
        status: 'GENERATED',
      };
    }

    const result = await service.enrichInspection({
      topic: { id: 'topic-1', name: 'Gastroenterology' },
      candidates: rows,
      summary: { extracted: 80, valid: 80, needs_review: 0, invalid: 0, duplicates: 0 },
      issues: [],
    });

    expect(generate).toHaveBeenCalledTimes(60);
    expect(result.enrichment_summary).toEqual({ generated: 60, cached: 20, failed: 0, billing_deferred: 0 });
    expect(result.candidates.filter((row) => row.ai_enrichment?.status === 'CACHED')).toHaveLength(20);
  });

  it('reduces subsequent waves to concurrency one after transient in-flight pressure', async () => {
    let active = 0;
    const activeAtStart: number[] = [];
    const generate = jest.fn().mockImplementation(async (
      request: { candidateId: string },
      options?: { onRetry?: (context: { failure: OpenRouterEnrichmentError }) => void },
    ) => {
      active += 1;
      activeAtStart.push(active);
      if (request.candidateId === 'candidate-2') {
        options?.onRetry?.({
          failure: new OpenRouterEnrichmentError('IN_FLIGHT_BUDGET_EXHAUSTED', 'temporary pressure', true, 402),
        });
      }
      await Promise.resolve();
      active -= 1;
      return generatedResult(request.candidateId);
    });
    const openRouter = {
      isConfigured: () => true,
      getSignature: () => signature,
      generate,
    } as unknown as OpenRouterQuestionEnrichmentService;
    const rows = Array.from({ length: 6 }, (_, index) => candidate({
      candidate_id: `candidate-${index + 1}`,
      question_text: `Which therapy is most appropriate for patient ${index + 1}?`,
    }));

    await new QuestionImportAiEnrichmentService(openRouter).enrichInspection({
      candidates: rows,
      summary: { extracted: 6, valid: 6, needs_review: 0, invalid: 0, duplicates: 0 },
      issues: [],
    });

    expect(activeAtStart.slice(0, 3)).toEqual([1, 1, 2]);
    expect(activeAtStart.slice(3)).toEqual([1, 1, 1]);
  });

  it('does not fan a permanent billing error at question 21 out to questions 22-80', async () => {
    const generate = jest.fn().mockImplementation(async (request: { candidateId: string }) => {
      if (request.candidateId === 'candidate-21') {
        throw new OpenRouterEnrichmentError(
          'INSUFFICIENT_CREDITS',
          'OpenRouter has insufficient usable credit; add credits before retrying.',
          false,
          402,
          'payment_required',
          'billing_error',
          'insufficient_credits',
        );
      }
      return generatedResult(request.candidateId);
    });
    const openRouter = {
      isConfigured: () => true,
      getSignature: () => signature,
      generate,
    } as unknown as OpenRouterQuestionEnrichmentService;
    const rows = Array.from({ length: 80 }, (_, index) => candidate({ candidate_id: `candidate-${index + 1}` }));

    const result = await new QuestionImportAiEnrichmentService(openRouter).enrichInspection({
      candidates: rows,
      summary: { extracted: 80, valid: 80, needs_review: 0, invalid: 0, duplicates: 0 },
      issues: [],
    });

    expect(generate).toHaveBeenCalledTimes(21);
    expect(generate.mock.calls.map(([request]) => request.candidateId)).not.toContain('candidate-22');
    expect(result.enrichment_summary).toEqual({ generated: 20, cached: 0, failed: 0, billing_deferred: 60 });
    expect(result.candidates.filter((row) => row.ai_enrichment?.status === 'DEFERRED_BILLING')).toHaveLength(60);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'AI_ENRICHMENT_BILLING_DEFERRED',
      message: '20 generated · 0 reused · 60 deferred because OpenRouter credit is unavailable.',
    }));
  });

  it('persists each success and resumes only unresolved questions after interruption', async () => {
    const stored: Array<Record<string, unknown>> = [];
    const cache = {
      find: jest.fn().mockResolvedValueOnce([]).mockImplementation(async () => stored),
      upsert: jest.fn().mockImplementation(async (row: Record<string, unknown>) => { stored.push(row); }),
    };
    const firstGenerate = jest.fn().mockImplementation(async (request: { candidateId: string }) => {
      if (request.candidateId === 'candidate-3') {
        throw new OpenRouterEnrichmentError('INSUFFICIENT_CREDITS', 'Insufficient credits.', false, 402);
      }
      return generatedResult(request.candidateId);
    });
    const firstOpenRouter = {
      isConfigured: () => true,
      getSignature: () => signature,
      generate: firstGenerate,
    } as unknown as OpenRouterQuestionEnrichmentService;
    const rows = Array.from({ length: 6 }, (_, index) => candidate({
      candidate_id: `candidate-${index + 1}`,
      question_text: `Which therapy is most appropriate for patient ${index + 1}?`,
    }));

    const first = await new QuestionImportAiEnrichmentService(firstOpenRouter, cache as never).enrichInspection({
      candidates: rows,
      summary: { extracted: 6, valid: 6, needs_review: 0, invalid: 0, duplicates: 0 },
      issues: [],
    });
    expect(first.enrichment_summary).toEqual({ generated: 2, cached: 0, failed: 0, billing_deferred: 4 });
    expect(cache.upsert).toHaveBeenCalledTimes(2);

    const resumedGenerate = jest.fn().mockImplementation(async (request: { candidateId: string }) => generatedResult(request.candidateId));
    const resumedOpenRouter = {
      isConfigured: () => true,
      getSignature: () => signature,
      generate: resumedGenerate,
    } as unknown as OpenRouterQuestionEnrichmentService;
    const resumed = await new QuestionImportAiEnrichmentService(resumedOpenRouter, cache as never).enrichInspection({
      candidates: rows,
      summary: { extracted: 6, valid: 6, needs_review: 0, invalid: 0, duplicates: 0 },
      issues: [],
    });

    expect(resumedGenerate).toHaveBeenCalledTimes(4);
    expect(resumed.enrichment_summary).toEqual({ generated: 4, cached: 2, failed: 0, billing_deferred: 0 });
    expect(resumed.candidates.every((row) => ['GENERATED', 'CACHED'].includes(row.ai_enrichment?.status ?? ''))).toBe(true);
  });
  it('stops bulk fan-out after the first deterministic OpenRouter routing-policy failure', async () => {
    const failure = new OpenRouterEnrichmentError(
      'NO_COMPATIBLE_ENDPOINT',
      'OpenRouter routing is blocked by the account/API-key privacy or guardrail policy.',
      false,
      404,
      '404',
      undefined,
      undefined,
      'No endpoints are available matching your guardrail restrictions and data policy.',
    );
    const generate = jest.fn().mockRejectedValue(failure);
    const openRouter = {
      isConfigured: () => true,
      getSignature: () => signature,
      generate,
    } as unknown as OpenRouterQuestionEnrichmentService;
    const rows = Array.from({ length: 80 }, (_, index) => candidate({ candidate_id: `candidate-${index + 1}` }));

    const result = await new QuestionImportAiEnrichmentService(openRouter).enrichInspection({
      candidates: rows,
      summary: { extracted: 80, valid: 80, needs_review: 0, invalid: 0, duplicates: 0 },
      issues: [],
    });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.enrichment_summary).toEqual({ generated: 0, cached: 0, failed: 80, billing_deferred: 0 });
    expect(result.candidates.every((row) => row.ai_enrichment?.status === 'FAILED')).toBe(true);
  });

});
