import { OpenRouterQuestionEnrichmentService } from './openrouter-question-enrichment.service';

describe('OpenRouterQuestionEnrichmentService', () => {
  const input = {
    candidateId: 'q1',
    questionText: 'Which option is correct?',
    sourceCorrectLabel: 'C',
    options: ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `Option ${label}` })),
  };
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function validPayload() {
    return {
      candidate_id: 'q1',
      source_correct_label: 'C',
      answer_consistency: 'CONSISTENT',
      question_explanation: 'Core explanation',
      options: ['A', 'B', 'C', 'D', 'E'].map((label) => ({
        label,
        assessment: label === 'C' ? 'CORRECT' : 'INCORRECT',
        explanation: `${label} explanation`,
      })),
      difficulty: 'MEDIUM',
      confidence: 0.9,
      review_reason: null,
    };
  }

  function response(content: unknown) {
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }) } as Response;
  }

  it('accepts a valid five-option explanation without changing the source answer', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue(response(validPayload()));
    const result = await new OpenRouterQuestionEnrichmentService().generate(input);
    expect(result.sourceCorrectLabel).toBe('C');
    expect(result.optionExplanations).toHaveLength(5);
    expect(result.model).toBe('meta/muse-spark-1.3');
    expect(result.promptVersion).toBe('mcq-explanation-v1');
  });

  it('rejects an AI attempt to change the source answer', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue(response({ ...validPayload(), source_correct_label: 'D' }));
    await expect(new OpenRouterQuestionEnrichmentService().generate(input)).rejects.toThrow('change the source answer key');
  });

  it('rejects malformed option cardinality before any API call', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = jest.fn();
    await expect(new OpenRouterQuestionEnrichmentService().generate({ ...input, options: input.options.slice(0, 4) })).rejects.toThrow('exactly five');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('retries transient 429 responses and succeeds', async () => {
    jest.useFakeTimers();
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' } as Response)
      .mockResolvedValueOnce(response(validPayload()));
    const promise = new OpenRouterQuestionEnrichmentService().generate(input);
    await jest.advanceTimersByTimeAsync(500);
    await expect(promise).resolves.toMatchObject({ sourceCorrectLabel: 'C' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry authentication failures', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'bad key' } as Response);
    await expect(new OpenRouterQuestionEnrichmentService().generate(input)).rejects.toThrow('(401)');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
