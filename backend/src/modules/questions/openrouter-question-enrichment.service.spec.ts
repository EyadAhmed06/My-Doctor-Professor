import {
  OpenRouterEnrichmentError,
  OpenRouterQuestionEnrichmentService,
} from './openrouter-question-enrichment.service';

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

  function validPayload(labels = ['A', 'B', 'C', 'D', 'E']) {
    return {
      candidate_id: 'q1',
      source_correct_label: 'C',
      answer_consistency: 'CONSISTENT',
      question_explanation: 'C matches the defining finding; the alternatives do not.',
      options: labels.map((label) => ({
        label,
        assessment: label === 'C' ? 'CORRECT' : 'INCORRECT',
        explanation: label === 'C'
          ? 'This is the defining finding in the stem.'
          : 'This finding does not match the key feature in the stem.',
      })),
      difficulty: 'MEDIUM',
      confidence: 0.9,
      review_reason: null,
    };
  }

  function response(content: unknown) {
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }) } as Response;
  }

  it('accepts a valid concise five-option explanation without changing the source answer', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue(response(validPayload()));
    const result = await new OpenRouterQuestionEnrichmentService().generate(input);
    expect(result.sourceCorrectLabel).toBe('C');
    expect(result.optionExplanations).toHaveLength(5);
    expect(result.model).toBe('meta/muse-spark-1.3');
    expect(result.promptVersion).toBe('mcq-explanation-v3-four-or-five-options');
  });

  it('caps provider output to the concise explanation budget', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue(response(validPayload()));

    await new OpenRouterQuestionEnrichmentService().generate(input);

    const request = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      model: 'meta/muse-spark-1.3',
      max_tokens: 1200,
      provider: { require_parameters: true },
      plugins: [{ id: 'response-healing' }],
      response_format: { type: 'json_schema' },
    });
  });

  it('accepts schema-valid JSON wrapped in a Markdown fence', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const payload = validPayload();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(payload)}\n\`\`\`` } }],
      }),
    } as Response);

    await expect(new OpenRouterQuestionEnrichmentService().generate(input))
      .resolves.toMatchObject({ sourceCorrectLabel: 'C' });
  });

  it('extracts schema-valid JSON from mixed provider text before validation', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const payload = validPayload();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: `Structured result:\n${JSON.stringify(payload)}` } }],
      }),
    } as Response);

    await expect(new OpenRouterQuestionEnrichmentService().generate(input))
      .resolves.toMatchObject({ sourceCorrectLabel: 'C' });
  });

  it('rejects an AI attempt to change the source answer', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue(response({ ...validPayload(), source_correct_label: 'D' }));
    await expect(new OpenRouterQuestionEnrichmentService().generate(input)).rejects.toThrow('change the source answer key');
  });

  it('accepts a valid four-option explanation and constrains the response schema to A-D', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const fourOptionInput = { ...input, options: input.options.slice(0, 4) };
    global.fetch = jest.fn().mockResolvedValue(response(validPayload(['A', 'B', 'C', 'D'])));

    const result = await new OpenRouterQuestionEnrichmentService().generate(fourOptionInput);
    expect(result.optionExplanations).toHaveLength(4);

    const request = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.response_format.json_schema.schema.properties.options).toMatchObject({
      minItems: 4,
      maxItems: 4,
    });
    expect(body.response_format.json_schema.schema.properties.source_correct_label.enum).toEqual(['A', 'B', 'C', 'D']);
  });

  it('rejects malformed option cardinality below four before any API call', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = jest.fn();
    await expect(new OpenRouterQuestionEnrichmentService().generate({ ...input, options: input.options.slice(0, 3) }))
      .rejects.toThrow('four or five sequential options');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects explanations longer than two sentences', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const payload = validPayload();
    payload.question_explanation = 'First useful point. Second useful point. Third unnecessary point.';
    global.fetch = jest.fn().mockResolvedValue(response(payload));

    await expect(new OpenRouterQuestionEnrichmentService().generate(input)).rejects.toThrow('exceeded 2 sentences');
  });

  it('rejects explanations that exceed the concise character budget', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const payload = validPayload();
    payload.options[0].explanation = 'A'.repeat(221);
    global.fetch = jest.fn().mockResolvedValue(response(payload));

    await expect(new OpenRouterQuestionEnrichmentService().generate(input)).rejects.toThrow('exceeded 220 characters');
  });

  it('normalizes multiline explanations into compact student-facing text', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const payload = validPayload();
    payload.question_explanation = 'Key finding\n\npoints directly to C.';
    global.fetch = jest.fn().mockResolvedValue(response(payload));

    const result = await new OpenRouterQuestionEnrichmentService().generate(input);
    expect(result.questionExplanation).toBe('Key finding points directly to C.');
  });

  it('retries transient 429 responses and succeeds', async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0);
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' } as Response)
      .mockResolvedValueOnce(response(validPayload()));
    const promise = new OpenRouterQuestionEnrichmentService().generate(input);
    await jest.advanceTimersByTimeAsync(500);
    await expect(promise).resolves.toMatchObject({ sourceCorrectLabel: 'C' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries a provider-routing 404 without require_parameters and succeeds', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers(),
        text: async () => JSON.stringify({
          error: {
            message: 'No endpoints found that support the requested parameters.',
            code: 404,
          },
        }),
      } as Response)
      .mockResolvedValueOnce(response(validPayload()));

    await expect(new OpenRouterQuestionEnrichmentService().generate(input))
      .resolves.toMatchObject({ sourceCorrectLabel: 'C' });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const strictBody = JSON.parse(
      String((global.fetch as jest.Mock).mock.calls[0][1].body),
    );
    const relaxedBody = JSON.parse(
      String((global.fetch as jest.Mock).mock.calls[1][1].body),
    );
    expect(strictBody.provider).toEqual({ require_parameters: true });
    expect(relaxedBody.provider).toBeUndefined();
    expect(relaxedBody.response_format).toMatchObject({
      type: 'json_schema',
    });
  });

  it('does not relax a 404 caused by data-region policy', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
      text: async () => JSON.stringify({
        error: {
          message: 'No endpoints found supporting your data region.',
          code: 404,
        },
      }),
    } as Response);

    await expect(new OpenRouterQuestionEnrichmentService().generate(input))
      .rejects.toMatchObject({
        kind: 'NO_COMPATIBLE_ENDPOINT',
        status: 404,
      });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry authentication failures', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'bad key' } as Response);
    await expect(new OpenRouterQuestionEnrichmentService().generate(input)).rejects.toThrow('(401)');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries a transient 402 in-flight budget reservation and succeeds', async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0);
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 402,
        text: async () => JSON.stringify({
          error: {
            message: 'This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle.',
            metadata: { reason: 'in_flight_budget_exhausted' },
          },
        }),
      } as Response)
      .mockResolvedValueOnce(response(validPayload()));

    const promise = new OpenRouterQuestionEnrichmentService().generate(input);
    await jest.advanceTimersByTimeAsync(2_000);

    await expect(promise).resolves.toMatchObject({ sourceCorrectLabel: 'C' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry a permanent 402 insufficient-credit failure', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => JSON.stringify({
        error: { message: 'This request requires more credits. Add credits to continue.', code: 402 },
      }),
    } as Response);

    await expect(new OpenRouterQuestionEnrichmentService().generate(input)).rejects.toMatchObject({
      kind: 'INSUFFICIENT_CREDITS',
      status: 402,
      retryable: false,
      code: '402',
      reason: undefined,
      message: expect.stringContaining('insufficient usable credit'),
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('uses structured billing metadata before misleading message text', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 402,
      headers: new Headers({ 'x-request-id': 'req-billing-1' }),
      text: async () => JSON.stringify({
        error: {
          message: 'Retry after in-flight requests settle.',
          code: 'payment_required',
          type: 'billing_error',
          metadata: { reason: 'insufficient_credits' },
        },
      }),
    } as Response);

    await expect(new OpenRouterQuestionEnrichmentService().generate(input)).rejects.toMatchObject({
      kind: 'INSUFFICIENT_CREDITS',
      reason: 'insufficient_credits',
      code: 'payment_required',
      type: 'billing_error',
      requestId: 'req-billing-1',
      retryable: false,
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('treats a structured credit-limit failure as permanent billing exhaustion', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => JSON.stringify({
        error: {
          message: 'Payment is required.',
          code: 'credit_limit_exceeded',
          metadata: { reason: 'billing_limit_exceeded' },
        },
      }),
    } as Response);

    await expect(new OpenRouterQuestionEnrichmentService().generate(input)).rejects.toMatchObject({
      kind: 'INSUFFICIENT_CREDITS',
      code: 'credit_limit_exceeded',
      reason: 'billing_limit_exceeded',
      retryable: false,
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([500, 502, 503])('retries HTTP %s and retains the successful retry', async (status) => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0);
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status, text: async () => 'provider unavailable' } as Response)
      .mockResolvedValueOnce(response(validPayload()));

    const promise = new OpenRouterQuestionEnrichmentService().generate(input);
    await jest.advanceTimersByTimeAsync(500);

    await expect(promise).resolves.toMatchObject({ sourceCorrectLabel: 'C' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['timeout', Object.assign(new Error('aborted'), { name: 'AbortError' }), 'TIMEOUT'],
    ['network reset', new Error('socket connection reset'), 'NETWORK_ERROR'],
  ])('retries a %s failure with bounded attempts', async (_label, failure, expectedKind) => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0);
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockRejectedValue(failure);

    const promise = new OpenRouterQuestionEnrichmentService().generate(input);
    const rejection = expect(promise).rejects.toMatchObject({ kind: expectedKind, retryable: true });
    await jest.advanceTimersByTimeAsync(500);

    await rejection;
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('honors a structured retry-after value with a bounded delay', async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0);
    process.env.OPENROUTER_API_KEY = 'test-key';
    const onRetry = jest.fn();
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 402,
        text: async () => JSON.stringify({
          error: {
            message: 'Temporary reservation pressure.',
            metadata: {
              reason: 'in_flight_budget_exhausted',
              headers: { 'Retry-After': '120' },
            },
          },
        }),
      } as Response)
      .mockResolvedValueOnce(response(validPayload()));

    const promise = new OpenRouterQuestionEnrichmentService().generate(input, { onRetry });
    await jest.advanceTimersByTimeAsync(15_000);

    await expect(promise).resolves.toMatchObject({ sourceCorrectLabel: 'C' });
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({
      attempt: 1,
      delayMs: 15_000,
      failure: expect.objectContaining({ kind: 'IN_FLIGHT_BUDGET_EXHAUSTED', retryAfterMs: 120_000 }),
    }));
  });

  it.each([
    ['wrong candidate id', (payload: ReturnType<typeof validPayload>) => { payload.candidate_id = 'wrong'; }, 'wrong candidate id'],
    ['six options', (payload: ReturnType<typeof validPayload>) => { payload.options.push({ ...payload.options[0], label: 'F' }); }, 'exactly five'],
    ['wrong correct assessment', (payload: ReturnType<typeof validPayload>) => { payload.options[2].assessment = 'INCORRECT'; payload.options[1].assessment = 'CORRECT'; }, 'contradict'],
    ['invalid difficulty', (payload: ReturnType<typeof validPayload>) => { payload.difficulty = 'IMPOSSIBLE'; }, 'invalid difficulty'],
    ['invalid confidence', (payload: ReturnType<typeof validPayload>) => { payload.confidence = 1.5; }, 'invalid confidence'],
    ['missing review reason', (payload: ReturnType<typeof validPayload>) => { payload.answer_consistency = 'QUESTIONABLE'; }, 'requires a review reason'],
  ])('rejects structured output with %s', async (_label, mutate, expectedMessage) => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const payload = validPayload();
    mutate(payload);
    global.fetch = jest.fn().mockResolvedValue(response(payload));

    await expect(new OpenRouterQuestionEnrichmentService().generate(input)).rejects.toMatchObject({
      kind: 'INVALID_RESPONSE',
      message: expect.stringContaining(expectedMessage),
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed JSON without retrying or hiding the validation error', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{not-json' } }] }),
    } as Response);

    await expect(new OpenRouterQuestionEnrichmentService().generate(input)).rejects.toEqual(
      expect.objectContaining<Partial<OpenRouterEnrichmentError>>({
        kind: 'INVALID_RESPONSE',
        retryable: false,
        message: expect.stringContaining('non-JSON content'),
      }),
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  it('surfaces account privacy/guardrail routing blocks without retrying or relaxing policy', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
      text: async () => JSON.stringify({
        error: {
          message: 'No endpoints out of 1 requested are available matching your guardrail restrictions and data policy. Paid model training violation.',
          code: 404,
        },
      }),
    } as Response);

    await expect(new OpenRouterQuestionEnrichmentService().generate(input))
      .rejects.toMatchObject({
        kind: 'NO_COMPATIBLE_ENDPOINT',
        status: 404,
        retryable: false,
        message: expect.stringContaining('privacy or guardrail policy'),
      });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

});
