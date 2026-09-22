import { Injectable } from '@nestjs/common';
import {
  hasSequentialMcqLabels,
  isSupportedMcqOptionCount,
  sequentialMcqLabels,
} from '../../common/mcq-option-policy';

export type McqOptionInput = { label: string; text: string };
export type McqExplanationInput = {
  candidateId: string;
  questionText: string;
  options: McqOptionInput[];
  sourceCorrectLabel: string;
  subject?: string | null;
  section?: string | null;
};
export type McqOptionExplanation = {
  label: string;
  assessment: 'CORRECT' | 'INCORRECT';
  explanation: string;
};
export type McqExplanationResult = {
  candidateId: string;
  sourceCorrectLabel: string;
  answerConsistency: 'CONSISTENT' | 'QUESTIONABLE';
  questionExplanation: string;
  optionExplanations: McqOptionExplanation[];
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  confidence: number;
  reviewReason: string | null;
  model: string;
  promptVersion: string;
};

export type OpenRouterFailureKind =
  | 'IN_FLIGHT_BUDGET_EXHAUSTED'
  | 'INSUFFICIENT_CREDITS'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'AUTH_ERROR'
  | 'INVALID_REQUEST'
  | 'NO_COMPATIBLE_ENDPOINT'
  | 'UNKNOWN';

export type OpenRouterRetryContext = {
  attempt: number;
  failure: OpenRouterEnrichmentError;
  delayMs: number;
};

export type OpenRouterGenerateOptions = {
  onRetry?: (context: OpenRouterRetryContext) => void;
};

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'meta/muse-spark-1.3';
const PROMPT_VERSION = 'mcq-explanation-v3-four-or-five-options';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;
const MAX_EXPLANATION_CHARS = 220;
const MAX_EXPLANATION_SENTENCES = 2;
const MAX_OUTPUT_TOKENS = 1_200;
const MAX_REVIEW_REASON_CHARS = 180;
const MAX_ERROR_BODY_CHARS = 16_384;
const MAX_PROVIDER_MESSAGE_CHARS = 500;
const MAX_RETRY_DELAY_MS = 15_000;

export class OpenRouterEnrichmentError extends Error {
  constructor(
    readonly kind: OpenRouterFailureKind,
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
    readonly code?: string,
    readonly type?: string,
    readonly reason?: string,
    readonly providerMessage?: string,
    readonly requestId?: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'OpenRouterEnrichmentError';
  }
}

@Injectable()
export class OpenRouterQuestionEnrichmentService {
  private readonly apiKey = process.env.OPENROUTER_API_KEY?.trim() || '';
  private readonly baseUrl = (process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');
  private readonly model = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;

  isConfigured(): boolean { return Boolean(this.apiKey); }

  getSignature(): { provider: 'OPENROUTER'; model: string; promptVersion: string } {
    return { provider: 'OPENROUTER', model: this.model, promptVersion: PROMPT_VERSION };
  }

  async generate(input: McqExplanationInput, options: OpenRouterGenerateOptions = {}): Promise<McqExplanationResult> {
    if (!this.apiKey) throw new Error('OPENROUTER_API_KEY is not configured on the backend.');
    this.assertInput(input);

    let lastError: OpenRouterEnrichmentError | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.generateOnce(input, true);
      } catch (error) {
        let failure = this.normalizeFailure(error);
        if (
          failure.kind === 'NO_COMPATIBLE_ENDPOINT' &&
          this.canRelaxProviderRequirements(failure)
        ) {
          try {
            return await this.generateOnce(input, false);
          } catch (compatibilityError) {
            failure = this.normalizeFailure(compatibilityError);
          }
        }
        lastError = failure;
        if (!failure.retryable || attempt === this.maxAttemptsFor(failure)) throw failure;
        const delayMs = this.retryDelayMs(attempt, failure);
        options.onRetry?.({ attempt, failure, delayMs });
        await this.delay(delayMs);
      }
    }
    throw lastError ?? new OpenRouterEnrichmentError('UNKNOWN', 'OpenRouter enrichment failed.', false);
  }

  private async generateOnce(
    input: McqExplanationInput,
    requireParameters: boolean,
  ): Promise<McqExplanationResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...(process.env.OPENROUTER_HTTP_REFERER ? { 'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER } : {}),
          ...(process.env.OPENROUTER_APP_TITLE ? { 'X-Title': process.env.OPENROUTER_APP_TITLE } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          temperature: 0.1,
          max_tokens: MAX_OUTPUT_TOKENS,
          ...(requireParameters
            ? { provider: { require_parameters: true } }
            : {}),
          plugins: [{ id: 'response-healing' }],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'mcq_explanation', strict: true, schema: this.responseSchema(input) },
          },
          messages: [
            {
              role: 'system',
              content: [
                'You generate concise educational explanations for medical MCQs.',
                'The supplied source answer is authoritative and must never be changed.',
                'Never rewrite the question or any option text.',
                'Explain only the decisive fact or distinction that helps the student understand why an option is correct or incorrect.',
                'Do not add background teaching, definitions, repetition, filler, or a restatement of the question unless essential to the distinction.',
                'Every question explanation and every option explanation must be at most two short sentences, preferably one sentence, and no more than 220 characters.',
                'Write the minimum useful explanation: direct, specific, and exam-relevant.',
                'If the source answer appears medically inconsistent, keep it unchanged and mark answer_consistency as QUESTIONABLE with a concise review_reason.',
                `Return exactly one explanation for each supplied answer option (${sequentialMcqLabels(input.options.length).join(', ')}). Do not invent or omit choices.`,
                'Return only the JSON object required by the response schema, without prose or Markdown fences.',
              ].join(' '),
            },
            {
              role: 'user',
              content: JSON.stringify({
                candidate_id: input.candidateId,
                subject: input.subject ?? null,
                section: input.section ?? null,
                question: input.questionText,
                options: input.options,
                source_correct_label: input.sourceCorrectLabel,
                explanation_style: {
                  objective: 'minimum useful explanation for the student',
                  max_sentences: MAX_EXPLANATION_SENTENCES,
                  max_characters: MAX_EXPLANATION_CHARS,
                  preferred_sentences: 1,
                },
              }),
            },
          ],
        }),
      });

      if (!response.ok) {
        const text = (await response.text().catch(() => '')).slice(0, MAX_ERROR_BODY_CHARS);
        throw this.httpFailure(response, text);
      }

      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        throw new OpenRouterEnrichmentError(
          'INVALID_RESPONSE',
          'OpenRouter returned no message content.',
          false,
        );
      }

      try {
        return this.validateOutput(input, this.parseStructuredContent(content));
      } catch (error) {
        if (error instanceof OpenRouterEnrichmentError) throw error;
        throw new OpenRouterEnrichmentError(
          'INVALID_RESPONSE',
          error instanceof Error ? error.message : 'OpenRouter returned an invalid structured response.',
          false,
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseStructuredContent(content: string): unknown {
    const trimmed = content.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
    const objectStart = trimmed.indexOf('{');
    const objectEnd = trimmed.lastIndexOf('}');
    const embedded = objectStart >= 0 && objectEnd > objectStart
      ? trimmed.slice(objectStart, objectEnd + 1)
      : '';
    const candidates = [...new Set([trimmed, fenced, embedded]
      .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0))];

    for (const candidate of candidates) {
      try { return JSON.parse(candidate); }
      catch { /* Try the next safe extraction candidate. */ }
    }
    throw new Error('OpenRouter returned non-JSON content for a structured explanation request.');
  }

  private httpFailure(response: Response, body: string): OpenRouterEnrichmentError {
    const parsed = this.parseErrorBody(body);
    const error = this.errorRecord(parsed);
    const metadata = this.record(error?.metadata) ?? this.record(this.record(parsed)?.metadata);
    const providerMessage = this.safeProviderMessage(
      this.stringValue(error?.message) || this.stringValue(this.record(parsed)?.message) || body,
    );
    const code = this.stringValue(error?.code) || this.stringValue(this.record(parsed)?.code);
    const type = this.stringValue(error?.type) || this.stringValue(this.record(parsed)?.type);
    const reason = this.stringValue(metadata?.reason);
    const retryAfterMs = this.retryAfterMs(response, metadata);
    const requestId = this.firstString(
      response.headers?.get?.('x-request-id'),
      response.headers?.get?.('x-openrouter-request-id'),
      this.stringValue(metadata?.request_id),
    );
    const kind = this.classifyHttpFailure(response.status, { code, type, reason, providerMessage, metadata });
    const retryable = ['IN_FLIGHT_BUDGET_EXHAUSTED', 'RATE_LIMITED', 'SERVER_ERROR', 'TIMEOUT'].includes(kind);
    const message = this.publicFailureMessage(kind, response.status, providerMessage, requestId);
    return new OpenRouterEnrichmentError(
      kind,
      message,
      retryable,
      response.status,
      code,
      type,
      reason,
      providerMessage || undefined,
      requestId,
      retryAfterMs,
    );
  }

  private normalizeFailure(error: unknown): OpenRouterEnrichmentError {
    if (error instanceof OpenRouterEnrichmentError) return error;
    if (error instanceof Error && error.name === 'AbortError') {
      return new OpenRouterEnrichmentError(
        'TIMEOUT',
        `OpenRouter request timed out after ${REQUEST_TIMEOUT_MS / 1_000} seconds.`,
        true,
      );
    }
    if (error instanceof Error && /fetch failed|network|socket|connection reset|econnreset/i.test(error.message)) {
      return new OpenRouterEnrichmentError(
        'NETWORK_ERROR',
        `OpenRouter network request failed: ${this.safeProviderMessage(error.message)}`,
        true,
      );
    }
    return new OpenRouterEnrichmentError(
      'INVALID_RESPONSE',
      error instanceof Error ? this.safeProviderMessage(error.message) : 'OpenRouter returned an invalid response.',
      false,
    );
  }

  private classifyHttpFailure(
    status: number,
    values: {
      code?: string;
      type?: string;
      reason?: string;
      providerMessage: string;
      metadata?: Record<string, unknown>;
    },
  ): OpenRouterFailureKind {
    const structured = [values.reason, values.code, values.type, this.stringValue(values.metadata?.limit_source)]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (/in[_ -]?flight[_ -]?budget[_ -]?exhausted|openrouter[_ -]?in[_ -]?flight[_ -]?budget/.test(structured)) {
      return 'IN_FLIGHT_BUDGET_EXHAUSTED';
    }
    if (/insufficient[_ -]?(credits?|balance|funds)|credit[_ -]?(balance[_ -]?)?(exhausted|limit[_ -]?exceeded)|billing[_ -]?(exhausted|limit[_ -]?exceeded)|openrouter[_ -]?key[_ -]?limit/.test(structured)) {
      return 'INSUFFICIENT_CREDITS';
    }
    const hasStructuredBudgetReason = Boolean(values.reason || this.stringValue(values.metadata?.limit_source));
    if (status === 402 && !hasStructuredBudgetReason) {
      const fallback = values.providerMessage.toLowerCase();
      if (/current in[- ]flight requests|retry after in[- ]flight/.test(fallback)) return 'IN_FLIGHT_BUDGET_EXHAUSTED';
      if (/insufficient (credits?|balance|funds)|add credits?|balance (?:is )?exhausted|requires? more credits?|key limit exceeded/.test(fallback)) {
        return 'INSUFFICIENT_CREDITS';
      }
    }
    if (
      status === 404 &&
      /no (?:compatible )?endpoints? found|no endpoints? (?:are )?available|provider routing|no provider/i.test(
        values.providerMessage,
      )
    ) {
      return 'NO_COMPATIBLE_ENDPOINT';
    }
    if (status === 429) return 'RATE_LIMITED';
    if (status === 408 || status === 524) return 'TIMEOUT';
    if (status >= 500) return 'SERVER_ERROR';
    if (status === 401 || status === 403) return 'AUTH_ERROR';
    if ([400, 404, 405, 413, 422].includes(status)) return 'INVALID_REQUEST';
    return 'UNKNOWN';
  }

  private publicFailureMessage(
    kind: OpenRouterFailureKind,
    status: number,
    providerMessage: string,
    requestId?: string,
  ): string {
    const policyBlocked = kind === 'NO_COMPATIBLE_ENDPOINT'
      && /privacy|guardrail|data (?:policy|collection)|training|retention|zdr/i.test(providerMessage);
    const prefix = kind === 'INSUFFICIENT_CREDITS'
      ? 'OpenRouter has insufficient usable credit; add credits or raise the key limit before retrying.'
      : kind === 'IN_FLIGHT_BUDGET_EXHAUSTED'
        ? 'OpenRouter temporarily exhausted its in-flight budget.'
        : kind === 'NO_COMPATIBLE_ENDPOINT'
          ? policyBlocked
            ? 'OpenRouter routing is blocked by the account/API-key privacy or guardrail policy. Use a compatible model/provider or update OpenRouter Privacy/Guardrails.'
            : 'OpenRouter could not find a compatible provider endpoint for this generation request.'
          : `OpenRouter request failed (${status}).`;
    const detail = providerMessage && !prefix.toLowerCase().includes(providerMessage.toLowerCase())
      ? ` Provider message: ${providerMessage}`
      : '';
    return `${prefix}${detail}${requestId ? ` Request id: ${requestId}.` : ''}`.slice(0, 900);
  }

  private canRelaxProviderRequirements(
    error: OpenRouterEnrichmentError,
  ): boolean {
    const message = [
      error.providerMessage,
      error.reason,
      error.code,
      error.type,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (
      /data (?:policy|region)|region|privacy|guardrail|model (?:not found|does not exist)|unknown model/.test(
        message,
      )
    ) {
      return false;
    }

    return /parameter|response[_ -]?format|structured|no (?:compatible )?endpoints? found|no endpoints? (?:are )?available|provider routing|no provider/.test(
      message,
    );
  }

  private retryDelayMs(attempt: number, error: OpenRouterEnrichmentError): number {
    const baseDelay = error.kind === 'IN_FLIGHT_BUDGET_EXHAUSTED' ? 2_000 : 500;
    const exponential = baseDelay * (2 ** (attempt - 1));
    const requested = error.retryAfterMs == null ? 0 : Math.min(error.retryAfterMs, MAX_RETRY_DELAY_MS);
    return Math.min(MAX_RETRY_DELAY_MS, Math.max(exponential, requested));
  }

  private maxAttemptsFor(error: OpenRouterEnrichmentError): number {
    return ['TIMEOUT', 'NETWORK_ERROR'].includes(error.kind) ? 2 : MAX_ATTEMPTS;
  }

  private delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

  private parseErrorBody(body: string): unknown {
    if (!body.trim()) return null;
    try { return JSON.parse(body); }
    catch { return null; }
  }

  private errorRecord(value: unknown): Record<string, unknown> | undefined {
    const record = this.record(value);
    return this.record(record?.error) ?? record;
  }

  private record(value: unknown): Record<string, unknown> | undefined {
    return value != null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
  }

  private stringValue(value: unknown): string | undefined {
    if (typeof value === 'string') return value.trim() || undefined;
    if (typeof value === 'number') return String(value);
    return undefined;
  }

  private firstString(...values: Array<string | null | undefined>): string | undefined {
    return values.find((value): value is string => Boolean(value?.trim()))?.trim();
  }

  private safeProviderMessage(value: string): string {
    return value
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, '[redacted OpenRouter key]')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_PROVIDER_MESSAGE_CHARS);
  }

  private retryAfterMs(response: Response, metadata?: Record<string, unknown>): number | undefined {
    const metadataHeaders = this.record(metadata?.headers);
    const raw = this.firstString(
      response.headers?.get?.('retry-after'),
      this.stringValue(metadataHeaders?.['Retry-After']),
      this.stringValue(metadataHeaders?.['retry-after']),
    );
    if (!raw) return undefined;
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
    const date = Date.parse(raw);
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
  }

  private assertInput(input: McqExplanationInput): void {
    const labels = input.options.map((option) => option.label.trim().toUpperCase());
    if (!isSupportedMcqOptionCount(input.options.length) || !hasSequentialMcqLabels(labels)) {
      throw new Error('AI enrichment requires four or five sequential options labelled A-D or A-E.');
    }
    const correct = input.sourceCorrectLabel.trim().toUpperCase();
    if (!labels.includes(correct)) throw new Error('The source correct answer is not present in the supplied options.');
  }

  private validateOutput(input: McqExplanationInput, value: unknown): McqExplanationResult {
    if (!value || typeof value !== 'object') throw new Error('AI explanation payload is not an object.');
    const row = value as Record<string, unknown>;
    if (String(row.candidate_id || '') !== input.candidateId) throw new Error('AI returned the wrong candidate id.');
    const sourceCorrectLabel = String(row.source_correct_label || '').trim().toUpperCase();
    const expectedCorrect = input.sourceCorrectLabel.trim().toUpperCase();
    if (sourceCorrectLabel !== expectedCorrect) throw new Error('AI attempted to change the source answer key.');

    const expectedLabels = sequentialMcqLabels(input.options.length);
    const optionRows = Array.isArray(row.options) ? row.options : [];
    if (optionRows.length !== input.options.length) {
      throw new Error(`AI did not return exactly ${input.options.length} option explanations.`);
    }
    const normalized = optionRows.map((item) => {
      if (!item || typeof item !== 'object') throw new Error('AI returned an invalid option explanation row.');
      const option = item as Record<string, unknown>;
      return {
        label: String(option.label || '').trim().toUpperCase(),
        assessment: String(option.assessment || '').trim().toUpperCase() as 'CORRECT' | 'INCORRECT',
        explanation: this.normalizeExplanation(String(option.explanation || '')),
      };
    });
    if (normalized.map((option) => option.label).join(',') !== expectedLabels.join(',')) throw new Error(`AI option labels did not match ${expectedLabels.join('-')} exactly.`);
    if (normalized.some((option) => !['CORRECT', 'INCORRECT'].includes(option.assessment))) throw new Error('AI returned an invalid option assessment.');
    const correctRows = normalized.filter((option) => option.assessment === 'CORRECT');
    if (correctRows.length !== 1 || correctRows[0].label !== expectedCorrect) throw new Error('AI option assessments contradict the source answer key.');
    if (normalized.some((option) => !option.explanation)) throw new Error('AI returned an empty option explanation.');
    normalized.forEach((option) => this.assertConciseExplanation(option.explanation, `Option ${option.label}`));

    const questionExplanation = this.normalizeExplanation(String(row.question_explanation || ''));
    if (!questionExplanation) throw new Error('AI returned an empty question explanation.');
    this.assertConciseExplanation(questionExplanation, 'Question');

    const answerConsistency = String(row.answer_consistency || '').trim().toUpperCase();
    if (!['CONSISTENT', 'QUESTIONABLE'].includes(answerConsistency)) throw new Error('AI returned an invalid answer consistency status.');
    const difficulty = String(row.difficulty || '').trim().toUpperCase();
    if (!['EASY', 'MEDIUM', 'HARD'].includes(difficulty)) throw new Error('AI returned an invalid difficulty.');
    const confidence = Number(row.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('AI returned an invalid confidence value.');
    const reviewReason = row.review_reason == null ? null : this.normalizeExplanation(String(row.review_reason)) || null;
    if (answerConsistency === 'QUESTIONABLE' && !reviewReason) throw new Error('Questionable answer consistency requires a review reason.');
    if (reviewReason && reviewReason.length > MAX_REVIEW_REASON_CHARS) throw new Error('AI review reason exceeded the concise review limit.');

    return {
      candidateId: input.candidateId,
      sourceCorrectLabel,
      answerConsistency: answerConsistency as 'CONSISTENT' | 'QUESTIONABLE',
      questionExplanation,
      optionExplanations: normalized,
      difficulty: difficulty as 'EASY' | 'MEDIUM' | 'HARD',
      confidence,
      reviewReason,
      model: this.model,
      promptVersion: PROMPT_VERSION,
    };
  }

  private normalizeExplanation(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  private assertConciseExplanation(value: string, field: string): void {
    if (value.length > MAX_EXPLANATION_CHARS) {
      throw new Error(`${field} explanation exceeded ${MAX_EXPLANATION_CHARS} characters.`);
    }
    const sentences = value
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    if (sentences.length > MAX_EXPLANATION_SENTENCES) {
      throw new Error(`${field} explanation exceeded ${MAX_EXPLANATION_SENTENCES} sentences.`);
    }
  }

  private responseSchema(input: McqExplanationInput): Record<string, unknown> {
    const labels = sequentialMcqLabels(input.options.length);
    return {
      type: 'object', additionalProperties: false,
      required: ['candidate_id', 'source_correct_label', 'answer_consistency', 'question_explanation', 'options', 'difficulty', 'confidence', 'review_reason'],
      properties: {
        candidate_id: { type: 'string' },
        source_correct_label: { type: 'string', enum: labels },
        answer_consistency: { type: 'string', enum: ['CONSISTENT', 'QUESTIONABLE'] },
        question_explanation: { type: 'string', minLength: 1, maxLength: MAX_EXPLANATION_CHARS },
        options: {
          type: 'array', minItems: input.options.length, maxItems: input.options.length,
          items: {
            type: 'object', additionalProperties: false,
            required: ['label', 'assessment', 'explanation'],
            properties: {
              label: { type: 'string', enum: labels },
              assessment: { type: 'string', enum: ['CORRECT', 'INCORRECT'] },
              explanation: { type: 'string', minLength: 1, maxLength: MAX_EXPLANATION_CHARS },
            },
          },
        },
        difficulty: { type: 'string', enum: ['EASY', 'MEDIUM', 'HARD'] },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        review_reason: { type: ['string', 'null'], maxLength: MAX_REVIEW_REASON_CHARS },
      },
    };
  }
}
