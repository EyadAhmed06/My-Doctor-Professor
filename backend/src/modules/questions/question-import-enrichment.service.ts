import { Injectable } from '@nestjs/common';
import { QuestionDifficulty } from '../../common/entities/question.entity';

type ImportIssue = { code: string; severity: string; message: string };
type ImportOption = { label: string; option_text: string; is_correct: boolean };
type ImportCandidate = {
  candidate_id: string;
  question_text: string;
  options: ImportOption[];
  explanation: string | null;
  difficulty: QuestionDifficulty;
  status: 'VALID' | 'NEEDS_REVIEW' | 'INVALID';
  issues: ImportIssue[];
  [key: string]: unknown;
};
type ImportInspection = {
  candidates: ImportCandidate[];
  summary?: { extracted: number; valid: number; needs_review: number; invalid: number; duplicates: number };
  issues: ImportIssue[];
  [key: string]: unknown;
};
type EnrichmentRow = {
  candidate_id: string;
  correct_label: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  explanation_lines: string[];
};
type OpenAiResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

const MODEL = process.env.OPENAI_QUESTION_ENRICHMENT_MODEL || process.env.OPENAI_MODEL || 'gpt-5-mini';
const BATCH_SIZE = 32;
const MAX_PARALLEL_BATCHES = 8;
const REQUEST_TIMEOUT_MS = 40_000;

@Injectable()
export class QuestionImportEnrichmentService {
  async enrichInspection<T extends ImportInspection>(inspection: T): Promise<T> {
    const rawCandidates = inspection.candidates;
    if (rawCandidates.length === 0) return inspection;

    const candidates = rawCandidates.map((candidate) => ({
      ...candidate,
      issues: candidate.issues.filter((issue) => issue.code !== 'NO_SOURCE_EXPLANATION'),
    }));

    // A question is eligible when the stem/options are structurally usable. A source
    // answer key is preferred, but a missing key no longer blocks explanation and
    // difficulty automation: the model may infer one of the supplied labels and the
    // response is explicitly tagged as AI-inferred.
    const eligible = candidates.filter((candidate) => {
      const correctCount = candidate.options.filter((option) => option.is_correct).length;
      return candidate.status !== 'INVALID' &&
        candidate.question_text.trim().length >= 8 &&
        candidate.options.length >= 2 &&
        candidate.options.length <= 6 &&
        correctCount <= 1;
    });
    if (eligible.length === 0) {
      return this.withRecalculatedSummary(inspection, candidates, {
        code: 'AI_ENRICHMENT_NOT_APPLICABLE',
        severity: 'INFO',
        message: 'No structurally eligible questions were available for automatic answer, explanation, and difficulty enrichment.',
      });
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      const eligibleIds = new Set(eligible.map((candidate) => candidate.candidate_id));
      const updated = candidates.map((candidate) =>
        eligibleIds.has(candidate.candidate_id)
          ? this.withEnrichmentFailure(candidate, 'OPENAI_API_KEY is not configured on the backend.')
          : candidate,
      );
      return this.withRecalculatedSummary(inspection, updated, {
        code: 'AI_ENRICHMENT_UNAVAILABLE',
        severity: 'WARNING',
        message: 'Automatic answers, explanations, and difficulty estimates were skipped because OPENAI_API_KEY is not configured.',
      });
    }

    const batches = this.chunk(eligible, BATCH_SIZE);
    const results = new Map<string, EnrichmentRow>();
    const failedIds = new Set<string>();

    for (let offset = 0; offset < batches.length; offset += MAX_PARALLEL_BATCHES) {
      const wave = batches.slice(offset, offset + MAX_PARALLEL_BATCHES);
      const waveResults = await Promise.allSettled(wave.map((batch) => this.enrichBatch(batch, apiKey)));
      waveResults.forEach((result, index) => {
        const batch = wave[index];
        if (result.status === 'fulfilled') {
          for (const row of result.value) results.set(row.candidate_id, row);
        } else {
          for (const candidate of batch) failedIds.add(candidate.candidate_id);
        }
      });
    }

    const updated = candidates.map((candidate) => {
      const row = results.get(candidate.candidate_id);
      if (!row) {
        if (failedIds.has(candidate.candidate_id)) {
          return this.withEnrichmentFailure(candidate, 'The automated enrichment request failed. Review this question before publishing.');
        }
        return candidate;
      }

      const existingCorrect = candidate.options.find((option) => option.is_correct)?.label.toUpperCase() || null;
      const correctLabel = row.correct_label.trim().toUpperCase();
      const availableLabels = new Set(candidate.options.map((option) => option.label.toUpperCase()));
      if (!availableLabels.has(correctLabel) || (existingCorrect && correctLabel !== existingCorrect)) {
        return this.withEnrichmentFailure(candidate, existingCorrect
          ? 'The automated enrichment attempted to change the source answer key, so it was rejected.'
          : 'The automated enrichment returned a correct option that does not exist in the extracted choices.');
      }

      const explanation = this.validateExplanation(row, candidate);
      if (!explanation) {
        return this.withEnrichmentFailure(candidate, 'The generated explanation did not pass the 4–7 line validation rules.');
      }

      const inferredAnswer = !existingCorrect;
      const issues: ImportIssue[] = [
        ...candidate.issues.filter((issue) =>
          !['AI_ENRICHMENT_FAILED', 'NO_SOURCE_EXPLANATION', 'DIFFICULTY_ESTIMATED', 'MISSING_ANSWER_KEY'].includes(issue.code),
        ),
        ...(inferredAnswer ? [{
          code: 'AI_ANSWER_INFERRED',
          severity: 'INFO',
          message: `The PDF parser did not recover a source answer key, so ${MODEL} selected ${correctLabel} from the extracted options.`,
        }] : []),
        {
          code: 'AI_ENRICHED',
          severity: 'INFO',
          message: `A concise 4–7 line explanation and estimated difficulty were generated automatically with ${MODEL}.`,
        },
      ];
      const hardError = issues.some((issue) => issue.severity === 'ERROR');
      const needsReview = issues.some((issue) => issue.severity === 'WARNING');

      return {
        ...candidate,
        options: candidate.options.map((option) => ({
          ...option,
          is_correct: option.label.toUpperCase() === correctLabel,
        })),
        explanation,
        difficulty: row.difficulty as QuestionDifficulty,
        status: hardError ? 'INVALID' as const : needsReview ? 'NEEDS_REVIEW' as const : 'VALID' as const,
        issues,
      };
    });

    const failedCount = updated.filter((candidate) =>
      candidate.issues.some((issue) => issue.code === 'AI_ENRICHMENT_FAILED'),
    ).length;

    return this.withRecalculatedSummary(
      inspection,
      updated,
      failedCount > 0
        ? {
            code: 'AI_ENRICHMENT_PARTIAL',
            severity: 'WARNING',
            message: `${failedCount} question(s) could not be automatically enriched and remain in the review queue.`,
          }
        : {
            code: 'AI_ENRICHMENT_COMPLETE',
            severity: 'INFO',
            message: `${results.size} question(s) received automatic answer resolution where needed, concise explanations, and estimated difficulty.`,
          },
    );
  }

  private async enrichBatch(candidates: ImportCandidate[], apiKey: string): Promise<EnrichmentRow[]> {
    const payload = candidates.map((candidate) => ({
      candidate_id: candidate.candidate_id,
      question: candidate.question_text,
      source_correct_label: candidate.options.find((option) => option.is_correct)?.label || null,
      options: candidate.options.map((option) => ({
        label: option.label,
        text: option.option_text,
      })),
    }));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: MODEL,
          store: false,
          max_output_tokens: 12_000,
          reasoning: { effort: 'low' },
          instructions: [
            'You are enriching instructor-authored medical MCQs for a study platform.',
            'Return exactly one correct_label from the supplied option labels for every question.',
            'If source_correct_label is present, it is authoritative: return exactly that label and never change or dispute it.',
            'If source_correct_label is null, select the medically best answer only from the supplied options; never invent an option.',
            'For every question, write a concise explanation of 4 to 7 non-empty lines total.',
            'Start each option-specific line with its option label, for example "B: ...".',
            'One line must directly explain why the correct option is correct.',
            'Every incorrect option must be addressed exactly once by label and state why it is wrong for this question.',
            'If covering all options produces fewer than four lines, add one or two short lines beginning with "Key:" to reach four lines.',
            'Keep each line straightforward and focused; avoid introductions, conclusions, filler, repetition, citations, and long paragraphs.',
            'Estimate difficulty as EASY, MEDIUM, or HARD from the reasoning burden required, not from how obscure the fact sounds.',
            'If the question is medically ambiguous, choose the best supplied option and use appropriately qualified wording rather than inventing certainty.',
          ].join(' '),
          input: JSON.stringify(payload),
          text: {
            verbosity: 'low',
            format: {
              type: 'json_schema',
              name: 'mcq_import_enrichment',
              strict: true,
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['questions'],
                properties: {
                  questions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['candidate_id', 'correct_label', 'difficulty', 'explanation_lines'],
                      properties: {
                        candidate_id: { type: 'string' },
                        correct_label: { type: 'string' },
                        difficulty: { type: 'string', enum: ['EASY', 'MEDIUM', 'HARD'] },
                        explanation_lines: { type: 'array', items: { type: 'string' } },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 600);
        throw new Error(`OpenAI enrichment failed (${response.status}): ${detail}`);
      }

      const body = (await response.json()) as OpenAiResponse;
      const text = this.responseText(body);
      const parsed = JSON.parse(text) as { questions?: EnrichmentRow[] };
      if (!Array.isArray(parsed.questions)) throw new Error('OpenAI enrichment response did not contain questions');

      const expected = new Set(candidates.map((candidate) => candidate.candidate_id));
      const unique = new Set<string>();
      const rows = parsed.questions.filter((row) => {
        if (!row || !expected.has(row.candidate_id) || unique.has(row.candidate_id)) return false;
        unique.add(row.candidate_id);
        return true;
      });
      if (rows.length !== candidates.length) {
        throw new Error('OpenAI enrichment response did not match every candidate in the batch');
      }
      return rows;
    } finally {
      clearTimeout(timeout);
    }
  }

  private validateExplanation(row: EnrichmentRow, candidate: ImportCandidate): string | null {
    if (!['EASY', 'MEDIUM', 'HARD'].includes(row.difficulty)) return null;
    if (!Array.isArray(row.explanation_lines)) return null;
    const lines = row.explanation_lines.map((line) => line.trim()).filter(Boolean);
    if (lines.length < 4 || lines.length > 7) return null;
    if (lines.some((line) => line.length > 260)) return null;

    for (const option of candidate.options) {
      const label = option.label.toUpperCase();
      const pattern = new RegExp(`^(?:OPTION\\s+)?${this.escapeRegExp(label)}(?:\\b|\\s*[:.)\\-–—])`, 'i');
      if (!lines.some((line) => pattern.test(line))) return null;
    }
    return lines.join('\n');
  }

  private withEnrichmentFailure(candidate: ImportCandidate, reason: string): ImportCandidate {
    return {
      ...candidate,
      status: candidate.status === 'INVALID' ? 'INVALID' : 'NEEDS_REVIEW',
      issues: [
        ...candidate.issues.filter((issue) =>
          !['AI_ENRICHMENT_FAILED', 'NO_SOURCE_EXPLANATION'].includes(issue.code),
        ),
        { code: 'AI_ENRICHMENT_FAILED', severity: 'WARNING', message: reason },
      ],
    };
  }

  private withRecalculatedSummary<T extends ImportInspection>(inspection: T, candidates: ImportCandidate[], batchIssue: ImportIssue): T {
    const summary = inspection.summary
      ? {
          ...inspection.summary,
          extracted: candidates.length,
          valid: candidates.filter((candidate) => candidate.status === 'VALID').length,
          needs_review: candidates.filter((candidate) => candidate.status === 'NEEDS_REVIEW').length,
          invalid: candidates.filter((candidate) => candidate.status === 'INVALID').length,
        }
      : inspection.summary;

    return {
      ...inspection,
      candidates,
      summary,
      issues: [...inspection.issues, batchIssue],
    } as T;
  }

  private responseText(response: OpenAiResponse): string {
    if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text;
    const texts = (response.output || [])
      .flatMap((item) => item.content || [])
      .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
      .map((item) => item.text as string);
    const joined = texts.join('').trim();
    if (!joined) throw new Error('OpenAI enrichment response contained no output text');
    return joined;
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
    return chunks;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
