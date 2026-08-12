import { Injectable } from '@nestjs/common';
import { QuestionDifficulty } from '../../common/entities/question.entity';
import type { UploadedResourceFile } from '../academic/resource-storage.service';

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
  source_page?: number | null;
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
type RecoveryRow = EnrichmentRow & {
  question_text: string;
  options: Array<{ label: string; text: string }>;
};
type OpenAiResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};
type OpenAiFile = { id?: string };

const MODEL = process.env.OPENAI_QUESTION_ENRICHMENT_MODEL || process.env.OPENAI_MODEL || 'gpt-5-mini';
const BATCH_SIZE = 32;
const MAX_PARALLEL_BATCHES = 8;
const REQUEST_TIMEOUT_MS = 40_000;
const RECOVERY_TIMEOUT_MS = 90_000;

@Injectable()
export class QuestionImportEnrichmentService {
  async enrichInspection<T extends ImportInspection>(inspection: T, sourceFile?: UploadedResourceFile): Promise<T> {
    const rawCandidates = inspection.candidates;
    if (rawCandidates.length === 0) return inspection;

    let candidates = rawCandidates.map((candidate) => ({
      ...candidate,
      issues: candidate.issues.filter((issue) => issue.code !== 'NO_SOURCE_EXPLANATION'),
    }));

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (apiKey && sourceFile) {
      candidates = await this.recoverMalformedCandidates(candidates, apiKey, sourceFile);
    }

    const eligible = candidates.filter((candidate) => {
      const correctCount = candidate.options.filter((option) => option.is_correct).length;
      return candidate.status !== 'INVALID' &&
        candidate.question_text.trim().length >= 8 &&
        candidate.options.length >= 2 &&
        candidate.options.length <= 6 &&
        correctCount <= 1 &&
        !candidate.issues.some((issue) => issue.code === 'AI_SOURCE_RECOVERED');
    });
    if (eligible.length === 0) {
      const batchIssue: ImportIssue = candidates.some((candidate) => candidate.issues.some((issue) => issue.code === 'AI_SOURCE_RECOVERED'))
        ? {
            code: 'AI_ENRICHMENT_COMPLETE',
            severity: 'INFO',
            message: 'Malformed questions were recovered from the source PDF and enriched automatically.',
          }
        : {
            code: 'AI_ENRICHMENT_NOT_APPLICABLE',
            severity: 'INFO',
            message: 'No structurally eligible questions were available for automatic answer, explanation, and difficulty enrichment.',
          };
      return this.withRecalculatedSummary(inspection, candidates, batchIssue);
    }

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

    candidates = candidates.map((candidate) => {
      const row = results.get(candidate.candidate_id);
      if (!row) {
        if (failedIds.has(candidate.candidate_id)) {
          return this.withEnrichmentFailure(candidate, 'The automated enrichment request failed. Review this question before publishing.');
        }
        return candidate;
      }
      return this.applyEnrichment(candidate, row);
    });

    const failedCount = candidates.filter((candidate) =>
      candidate.issues.some((issue) => issue.code === 'AI_ENRICHMENT_FAILED'),
    ).length;
    const recoveredCount = candidates.filter((candidate) =>
      candidate.issues.some((issue) => issue.code === 'AI_SOURCE_RECOVERED'),
    ).length;

    return this.withRecalculatedSummary(
      inspection,
      candidates,
      failedCount > 0
        ? {
            code: 'AI_ENRICHMENT_PARTIAL',
            severity: 'WARNING',
            message: `${failedCount} question(s) could not be automatically enriched. ${recoveredCount} malformed question(s) were recovered from the source PDF.`,
          }
        : {
            code: 'AI_ENRICHMENT_COMPLETE',
            severity: 'INFO',
            message: `${results.size + recoveredCount} question(s) received automatic answer resolution where needed, concise explanations, and estimated difficulty; ${recoveredCount} malformed question(s) were recovered from the source PDF.`,
          },
    );
  }

  private applyEnrichment(candidate: ImportCandidate, row: EnrichmentRow): ImportCandidate {
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
        message: `The PDF text parser did not recover a source answer key, so ${MODEL} selected ${correctLabel} from the extracted options.`,
      }] : []),
      {
        code: 'AI_ENRICHED',
        severity: 'INFO',
        message: `A concise 4–7 line explanation and estimated difficulty were generated automatically with ${MODEL}.`,
      },
    ];

    return {
      ...candidate,
      options: candidate.options.map((option) => ({
        ...option,
        is_correct: option.label.toUpperCase() === correctLabel,
      })),
      explanation,
      difficulty: row.difficulty as QuestionDifficulty,
      status: this.statusFromIssues(issues),
      issues,
    };
  }

  private async recoverMalformedCandidates(
    candidates: ImportCandidate[],
    apiKey: string,
    sourceFile: UploadedResourceFile,
  ): Promise<ImportCandidate[]> {
    const malformed = candidates.filter((candidate) =>
      candidate.status === 'INVALID' &&
      candidate.issues.some((issue) => ['INVALID_OPTION_COUNT', 'DUPLICATE_OPTIONS', 'ANSWER_OUTSIDE_OPTIONS'].includes(issue.code)),
    );
    if (malformed.length === 0) return candidates;

    let fileId: string | null = null;
    try {
      fileId = await this.uploadSourcePdf(sourceFile, apiKey);
      const recovered = await this.recoverFromPdf(malformed, fileId, apiKey);
      const byId = new Map(recovered.map((row) => [row.candidate_id, row]));
      return candidates.map((candidate) => {
        const row = byId.get(candidate.candidate_id);
        if (!row) return candidate;
        const normalizedOptions = this.validateRecoveredOptions(row.options);
        if (!normalizedOptions) return candidate;
        const correctLabel = row.correct_label.trim().toUpperCase();
        if (!normalizedOptions.some((option) => option.label === correctLabel)) return candidate;

        const draft: ImportCandidate = {
          ...candidate,
          question_text: row.question_text.trim(),
          options: normalizedOptions.map((option) => ({
            label: option.label,
            option_text: option.text,
            is_correct: option.label === correctLabel,
          })),
          difficulty: row.difficulty as QuestionDifficulty,
          status: 'NEEDS_REVIEW',
          issues: candidate.issues.filter((issue) =>
            !['INVALID_OPTION_COUNT', 'DUPLICATE_OPTIONS', 'ANSWER_OUTSIDE_OPTIONS', 'MISSING_ANSWER_KEY', 'DIFFICULTY_ESTIMATED', 'NO_SOURCE_EXPLANATION'].includes(issue.code),
          ),
        };
        const explanation = this.validateExplanation(row, draft);
        if (!explanation) return candidate;
        const issues: ImportIssue[] = [
          ...draft.issues,
          {
            code: 'AI_SOURCE_RECOVERED',
            severity: 'INFO',
            message: `The damaged text extraction was recovered directly from source page ${candidate.source_page ?? 'unknown'} of the uploaded PDF.`,
          },
          {
            code: 'AI_ENRICHED',
            severity: 'INFO',
            message: `A concise 4–7 line explanation and estimated difficulty were generated automatically with ${MODEL}.`,
          },
        ];
        return {
          ...draft,
          explanation,
          status: this.statusFromIssues(issues),
          issues,
        };
      });
    } catch {
      return candidates.map((candidate) => malformed.some((item) => item.candidate_id === candidate.candidate_id)
        ? {
            ...candidate,
            issues: [
              ...candidate.issues,
              {
                code: 'AI_SOURCE_RECOVERY_FAILED',
                severity: 'WARNING',
                message: 'Automatic recovery from the original PDF failed; this malformed extraction still needs instructor review.',
              },
            ],
          }
        : candidate);
    } finally {
      if (fileId) void this.deleteOpenAiFile(fileId, apiKey);
    }
  }

  private async uploadSourcePdf(file: UploadedResourceFile, apiKey: string): Promise<string> {
    const body = new FormData();
    body.append('purpose', 'user_data');
    body.append('expires_after[anchor]', 'created_at');
    body.append('expires_after[seconds]', '3600');
    body.append('file', new Blob([file.buffer], { type: 'application/pdf' }), file.originalname || 'questions.pdf');
    const response = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
    });
    if (!response.ok) throw new Error(`OpenAI PDF upload failed (${response.status})`);
    const result = await response.json() as OpenAiFile;
    if (!result.id) throw new Error('OpenAI PDF upload returned no file id');
    return result.id;
  }

  private async recoverFromPdf(candidates: ImportCandidate[], fileId: string, apiKey: string): Promise<RecoveryRow[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RECOVERY_TIMEOUT_MS);
    try {
      const requestText = JSON.stringify(candidates.map((candidate) => ({
        candidate_id: candidate.candidate_id,
        source_page: candidate.source_page ?? null,
        extracted_question: candidate.question_text,
      })));
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
          max_output_tokens: 5000,
          reasoning: { effort: 'low' },
          instructions: [
            'Recover malformed MCQs from the attached source PDF exactly enough for instructor review.',
            'Use candidate_id and source_page to locate each question. Preserve the question meaning and option texts from the PDF; do not invent replacement distractors.',
            'Return 2 to 6 sequentially labelled options using A, B, C, D, E, F as present in the source.',
            'Resolve the correct option from the PDF answer key when it is available. If the key cannot be located, select the medically best supplied option.',
            'Generate a straightforward 4 to 7 line explanation. Explain why the correct option is correct and why every incorrect option is wrong.',
            'Estimate difficulty as EASY, MEDIUM, or HARD.',
          ].join(' '),
          input: [{
            role: 'user',
            content: [
              { type: 'input_file', file_id: fileId },
              { type: 'input_text', text: requestText },
            ],
          }],
          text: {
            verbosity: 'low',
            format: {
              type: 'json_schema',
              name: 'mcq_pdf_recovery',
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
                      required: ['candidate_id', 'question_text', 'options', 'correct_label', 'difficulty', 'explanation_lines'],
                      properties: {
                        candidate_id: { type: 'string' },
                        question_text: { type: 'string' },
                        options: {
                          type: 'array',
                          items: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['label', 'text'],
                            properties: {
                              label: { type: 'string' },
                              text: { type: 'string' },
                            },
                          },
                        },
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
      if (!response.ok) throw new Error(`OpenAI PDF recovery failed (${response.status})`);
      const body = await response.json() as OpenAiResponse;
      const parsed = JSON.parse(this.responseText(body)) as { questions?: RecoveryRow[] };
      return Array.isArray(parsed.questions) ? parsed.questions : [];
    } finally {
      clearTimeout(timeout);
    }
  }

  private validateRecoveredOptions(options: RecoveryRow['options']): Array<{ label: string; text: string }> | null {
    if (!Array.isArray(options) || options.length < 2 || options.length > 6) return null;
    const normalized = options.map((option, index) => ({
      label: option.label.trim().toUpperCase(),
      text: option.text.trim(),
      expected: String.fromCharCode(65 + index),
    }));
    if (normalized.some((option) => !option.text || option.label !== option.expected)) return null;
    if (new Set(normalized.map((option) => option.text.toLocaleLowerCase())).size !== normalized.length) return null;
    return normalized.map(({ label, text }) => ({ label, text }));
  }

  private async deleteOpenAiFile(fileId: string, apiKey: string): Promise<void> {
    try {
      await fetch(`https://api.openai.com/v1/files/${encodeURIComponent(fileId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    } catch {
      // The file also has a one-hour expiry; cleanup failure must not fail inspection.
    }
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

  private statusFromIssues(issues: ImportIssue[]): ImportCandidate['status'] {
    if (issues.some((issue) => issue.severity === 'ERROR')) return 'INVALID';
    if (issues.some((issue) => issue.severity === 'WARNING')) return 'NEEDS_REVIEW';
    return 'VALID';
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
