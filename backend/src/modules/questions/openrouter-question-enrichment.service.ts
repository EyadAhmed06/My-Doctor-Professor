import { Injectable } from '@nestjs/common';

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

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'meta/muse-spark-1.3';
const PROMPT_VERSION = 'mcq-explanation-v2-concise';
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 3;
const MAX_EXPLANATION_CHARS = 220;
const MAX_EXPLANATION_SENTENCES = 2;
const MAX_OUTPUT_TOKENS = 1_200;
const MAX_REVIEW_REASON_CHARS = 180;

class OpenRouterHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
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

  async generate(input: McqExplanationInput): Promise<McqExplanationResult> {
    if (!this.apiKey) throw new Error('OPENROUTER_API_KEY is not configured on the backend.');
    this.assertInput(input);

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.generateOnce(input);
      } catch (error) {
        lastError = error;
        if (!this.shouldRetry(error) || attempt === MAX_ATTEMPTS) throw error;
        await this.delay(this.retryDelayMs(attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new Error('OpenRouter enrichment failed.');
  }

  private async generateOnce(input: McqExplanationInput): Promise<McqExplanationResult> {
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
          provider: { require_parameters: true },
          plugins: [{ id: 'response-healing' }],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'mcq_explanation', strict: true, schema: this.responseSchema() },
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
                'Return exactly one explanation for each of A, B, C, D and E.',
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
        const text = await response.text().catch(() => '');
        throw new OpenRouterHttpError(
          response.status,
          `OpenRouter request failed (${response.status})${text ? `: ${text.slice(0, 300)}` : ''}`,
        );
      }

      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error('OpenRouter returned no message content.');

      return this.validateOutput(input, this.parseStructuredContent(content));
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

  private shouldRetry(error: unknown): boolean {
    if (error instanceof OpenRouterHttpError) return error.status === 429 || error.status >= 500;
    return error instanceof Error && (error.name === 'AbortError' || /fetch failed|network|socket/i.test(error.message));
  }

  private retryDelayMs(attempt: number): number {
    return Math.min(4_000, 500 * (2 ** (attempt - 1)));
  }

  private delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

  private assertInput(input: McqExplanationInput): void {
    const labels = input.options.map((option) => option.label.trim().toUpperCase());
    if (input.options.length !== 5 || labels.join(',') !== 'A,B,C,D,E') throw new Error('AI enrichment requires exactly five sequential options labelled A-E.');
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

    const optionRows = Array.isArray(row.options) ? row.options : [];
    if (optionRows.length !== 5) throw new Error('AI did not return exactly five option explanations.');
    const normalized = optionRows.map((item) => {
      if (!item || typeof item !== 'object') throw new Error('AI returned an invalid option explanation row.');
      const option = item as Record<string, unknown>;
      return {
        label: String(option.label || '').trim().toUpperCase(),
        assessment: String(option.assessment || '').trim().toUpperCase() as 'CORRECT' | 'INCORRECT',
        explanation: this.normalizeExplanation(String(option.explanation || '')),
      };
    });
    if (normalized.map((option) => option.label).join(',') !== 'A,B,C,D,E') throw new Error('AI option labels did not match A-E exactly.');
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

  private responseSchema(): Record<string, unknown> {
    return {
      type: 'object', additionalProperties: false,
      required: ['candidate_id', 'source_correct_label', 'answer_consistency', 'question_explanation', 'options', 'difficulty', 'confidence', 'review_reason'],
      properties: {
        candidate_id: { type: 'string' },
        source_correct_label: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E'] },
        answer_consistency: { type: 'string', enum: ['CONSISTENT', 'QUESTIONABLE'] },
        question_explanation: { type: 'string', minLength: 1, maxLength: MAX_EXPLANATION_CHARS },
        options: {
          type: 'array', minItems: 5, maxItems: 5,
          items: {
            type: 'object', additionalProperties: false,
            required: ['label', 'assessment', 'explanation'],
            properties: {
              label: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E'] },
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
