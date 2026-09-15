import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { QuestionDifficulty } from '../../common/entities/question.entity';
import { OpenRouterQuestionEnrichmentService } from './openrouter-question-enrichment.service';

type ImportIssue = { code: string; severity: string; message: string };
type ImportOption = {
  label: string;
  option_text: string;
  is_correct: boolean;
  explanation?: string | null;
};
type AiEnrichmentMetadata = {
  provider?: string;
  model?: string;
  prompt_version?: string;
  content_hash?: string;
  confidence?: number;
  answer_consistency?: string;
  status?: 'GENERATED' | 'STALE' | 'FAILED';
};
type ImportCandidate = {
  candidate_id: string;
  question_text: string;
  options: ImportOption[];
  explanation: string | null;
  difficulty: QuestionDifficulty;
  status: 'VALID' | 'NEEDS_REVIEW' | 'INVALID';
  issues: ImportIssue[];
  source_section?: string | null;
  ai_enrichment?: AiEnrichmentMetadata | null;
  [key: string]: unknown;
};
type ImportInspection = {
  candidates: ImportCandidate[];
  summary?: { extracted: number; valid: number; needs_review: number; invalid: number; duplicates: number };
  issues: ImportIssue[];
  topic?: { id?: string; name?: string };
  force_ai_regeneration?: boolean;
  [key: string]: unknown;
};

// Serialize requests so OpenRouter does not reserve multiple output budgets at once.
const MAX_PARALLEL_REQUESTS = 1;

@Injectable()
export class QuestionImportAiEnrichmentService {
  constructor(private readonly openRouter: OpenRouterQuestionEnrichmentService) {}

  async enrichInspection<T extends ImportInspection>(inspection: T): Promise<T> {
    if (!inspection.candidates.length) return inspection;

    const eligible = inspection.candidates.filter((candidate) => this.isEligible(candidate));
    if (!eligible.length) {
      return this.withIssue(inspection, {
        code: 'AI_ENRICHMENT_NOT_APPLICABLE',
        severity: 'INFO',
        message: 'No source-validated five-option MCQs were eligible for automatic explanations.',
      });
    }

    const force = Boolean(inspection.force_ai_regeneration);
    const cachedIds = new Set(
      force ? [] : eligible.filter((candidate) => this.isCurrentEnrichment(candidate)).map((candidate) => candidate.candidate_id),
    );
    const pending = eligible.filter((candidate) => !cachedIds.has(candidate.candidate_id));

    if (!pending.length) {
      return this.recalculate(inspection, inspection.candidates, {
        code: 'AI_ENRICHMENT_CACHED',
        severity: 'INFO',
        message: `${cachedIds.size} question(s) already have current Muse explanations; no duplicate AI requests were made.`,
      });
    }

    if (!this.openRouter.isConfigured()) {
      const ids = new Set(pending.map((candidate) => candidate.candidate_id));
      const candidates = inspection.candidates.map((candidate) => ids.has(candidate.candidate_id)
        ? this.markFailure(candidate, 'OPENROUTER_API_KEY is not configured on the backend.')
        : candidate);
      return this.recalculate(inspection, candidates, {
        code: 'AI_ENRICHMENT_UNAVAILABLE',
        severity: 'WARNING',
        message: 'MCQ explanations were skipped because OpenRouter is not configured.',
      });
    }

    const results = new Map<string, Awaited<ReturnType<OpenRouterQuestionEnrichmentService['generate']>>>();
    const failures = new Map<string, string>();

    for (let offset = 0; offset < pending.length; offset += MAX_PARALLEL_REQUESTS) {
      const wave = pending.slice(offset, offset + MAX_PARALLEL_REQUESTS);
      const settled = await Promise.allSettled(wave.map((candidate) => {
        const correct = candidate.options.find((option) => option.is_correct)!;
        return this.openRouter.generate({
          candidateId: candidate.candidate_id,
          questionText: candidate.question_text,
          options: candidate.options.map((option) => ({ label: option.label, text: option.option_text })),
          sourceCorrectLabel: correct.label,
          subject: inspection.topic?.name ?? null,
          section: candidate.source_section ?? null,
        });
      }));

      settled.forEach((result, index) => {
        const candidate = wave[index];
        if (result.status === 'fulfilled') results.set(candidate.candidate_id, result.value);
        else failures.set(candidate.candidate_id, this.safeError(result.reason));
      });
    }

    const candidates = inspection.candidates.map((candidate) => {
      const result = results.get(candidate.candidate_id);
      if (result) return this.applyResult(candidate, result);
      const failure = failures.get(candidate.candidate_id);
      if (failure) return this.markFailure(candidate, failure);
      return candidate;
    });

    const failedCount = failures.size;
    const reviewCount = Array.from(results.values()).filter((result) => result.answerConsistency === 'QUESTIONABLE').length;
    return this.recalculate(inspection, candidates, {
      code: failedCount ? 'AI_ENRICHMENT_PARTIAL' : 'AI_ENRICHMENT_COMPLETE',
      severity: failedCount ? 'WARNING' : 'INFO',
      message: failedCount
        ? `${results.size} generated · ${cachedIds.size} reused · ${failedCount} failed and remain reviewable.`
        : `${results.size} generated · ${cachedIds.size} reused${reviewCount ? ` · ${reviewCount} answer key(s) flagged for instructor review` : ''}.`,
    });
  }

  contentHash(candidate: Pick<ImportCandidate, 'question_text' | 'options'>): string {
    const correct = candidate.options.find((option) => option.is_correct)?.label.trim().toUpperCase() ?? null;
    const canonical = {
      question: candidate.question_text.replace(/\s+/g, ' ').trim(),
      options: candidate.options.map((option) => ({
        label: option.label.trim().toUpperCase(),
        text: option.option_text.replace(/\s+/g, ' ').trim(),
      })),
      correct,
    };
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  private isCurrentEnrichment(candidate: ImportCandidate): boolean {
    const signature = this.openRouter.getSignature();
    const metadata = candidate.ai_enrichment;
    if (!metadata || metadata.status === 'STALE' || metadata.status === 'FAILED') return false;
    if (metadata.provider !== signature.provider || metadata.model !== signature.model || metadata.prompt_version !== signature.promptVersion) return false;
    if (metadata.content_hash !== this.contentHash(candidate)) return false;
    if (!candidate.explanation?.trim()) return false;
    return candidate.options.length === 5 && candidate.options.every((option) => Boolean(option.explanation?.trim()));
  }

  private isEligible(candidate: ImportCandidate): boolean {
    if (candidate.status === 'INVALID') return false;
    if (candidate.question_text.trim().length < 8) return false;
    if (candidate.options.length !== 5) return false;
    if (candidate.options.map((option) => option.label.trim().toUpperCase()).join(',') !== 'A,B,C,D,E') return false;
    return candidate.options.filter((option) => option.is_correct).length === 1;
  }

  private applyResult(
    candidate: ImportCandidate,
    result: Awaited<ReturnType<OpenRouterQuestionEnrichmentService['generate']>>,
  ): ImportCandidate {
    const byLabel = new Map(result.optionExplanations.map((row) => [row.label, row.explanation]));
    const issues = candidate.issues.filter((issue) =>
      !['AI_ENRICHMENT_FAILED', 'AI_ENRICHED', 'AI_ANSWER_KEY_REVIEW_REQUIRED', 'AI_EXPLANATION_STALE', 'NO_SOURCE_EXPLANATION', 'DIFFICULTY_ESTIMATED'].includes(issue.code),
    );
    issues.push({
      code: 'AI_ENRICHED',
      severity: 'INFO',
      message: `Question and option explanations were generated with ${result.model} (${result.promptVersion}).`,
    });
    if (result.answerConsistency === 'QUESTIONABLE') {
      issues.push({
        code: 'AI_ANSWER_KEY_REVIEW_REQUIRED',
        severity: 'WARNING',
        message: result.reviewReason || 'The model flagged the source answer key for instructor review.',
      });
    }

    const updated = {
      ...candidate,
      explanation: result.questionExplanation,
      options: candidate.options.map((option) => ({
        ...option,
        explanation: byLabel.get(option.label.trim().toUpperCase()) || null,
      })),
      difficulty: result.difficulty as QuestionDifficulty,
      status: result.answerConsistency === 'QUESTIONABLE' ? 'NEEDS_REVIEW' as const : this.statusFromIssues(issues),
      issues,
    };

    return {
      ...updated,
      ai_enrichment: {
        provider: 'OPENROUTER',
        model: result.model,
        prompt_version: result.promptVersion,
        content_hash: this.contentHash(updated),
        confidence: result.confidence,
        answer_consistency: result.answerConsistency,
        status: 'GENERATED',
      },
    };
  }

  private markFailure(candidate: ImportCandidate, message: string): ImportCandidate {
    const issues = [
      ...candidate.issues.filter((issue) => issue.code !== 'AI_ENRICHMENT_FAILED'),
      { code: 'AI_ENRICHMENT_FAILED', severity: 'WARNING', message },
    ];
    return {
      ...candidate,
      status: candidate.status === 'INVALID' ? 'INVALID' : 'NEEDS_REVIEW',
      issues,
      ai_enrichment: { ...candidate.ai_enrichment, status: 'FAILED' },
    };
  }

  private safeError(reason: unknown): string {
    const message = reason instanceof Error ? reason.message : 'Unknown OpenRouter enrichment failure.';
    return message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 500);
  }

  private statusFromIssues(issues: ImportIssue[]): 'VALID' | 'NEEDS_REVIEW' | 'INVALID' {
    if (issues.some((issue) => issue.severity === 'ERROR')) return 'INVALID';
    if (issues.some((issue) => issue.severity === 'WARNING')) return 'NEEDS_REVIEW';
    return 'VALID';
  }

  private withIssue<T extends ImportInspection>(inspection: T, issue: ImportIssue): T {
    return { ...inspection, issues: [...inspection.issues.filter((row) => row.code !== issue.code), issue] } as T;
  }

  private recalculate<T extends ImportInspection>(inspection: T, candidates: ImportCandidate[], issue: ImportIssue): T {
    return {
      ...inspection,
      candidates,
      summary: inspection.summary ? {
        ...inspection.summary,
        extracted: candidates.length,
        valid: candidates.filter((candidate) => candidate.status === 'VALID').length,
        needs_review: candidates.filter((candidate) => candidate.status === 'NEEDS_REVIEW').length,
        invalid: candidates.filter((candidate) => candidate.status === 'INVALID').length,
      } : inspection.summary,
      issues: [...inspection.issues.filter((row) => !row.code.startsWith('AI_ENRICHMENT_')), issue],
    } as T;
  }
}
