import { createHash } from 'crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { QuestionAiEnrichmentCache } from '../../common/entities/question-ai-enrichment-cache.entity';
import { QuestionDifficulty } from '../../common/entities/question.entity';
import {
  hasSequentialMcqLabels,
  isSupportedMcqOptionCount,
  sequentialMcqLabels,
} from '../../common/mcq-option-policy';
import {
  McqExplanationResult,
  OpenRouterEnrichmentError,
  OpenRouterQuestionEnrichmentService,
} from './openrouter-question-enrichment.service';

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
  status?: 'GENERATED' | 'CACHED' | 'STALE' | 'FAILED' | 'FAILED_RETRYABLE' | 'FAILED_VALIDATION' | 'DEFERRED_BILLING';
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
  allow_four_options?: boolean;
  ai_enrichment?: AiEnrichmentMetadata | null;
  [key: string]: unknown;
};
type ImportInspection = {
  candidates: ImportCandidate[];
  summary?: { extracted: number; valid: number; needs_review: number; invalid: number; duplicates: number };
  issues: ImportIssue[];
  topic?: { id?: string; name?: string };
  force_ai_regeneration?: boolean;
  enrichment_summary?: {
    generated: number;
    cached: number;
    failed: number;
    billing_deferred: number;
  };
  [key: string]: unknown;
};

const INITIAL_PARALLEL_REQUESTS = 2;
const MIN_PARALLEL_REQUESTS = 1;

@Injectable()
export class QuestionImportAiEnrichmentService {
  private readonly logger = new Logger(QuestionImportAiEnrichmentService.name);

  constructor(
    private readonly openRouter: OpenRouterQuestionEnrichmentService,
    @Optional()
    @InjectRepository(QuestionAiEnrichmentCache)
    private readonly cache?: Repository<QuestionAiEnrichmentCache>,
  ) {}

  async enrichInspection<T extends ImportInspection>(inspection: T): Promise<T> {
    if (!inspection.candidates.length) return inspection;

    const eligible = inspection.candidates.filter((candidate) => this.isEligible(candidate));
    if (!eligible.length) {
      return this.withIssue(inspection, {
        code: 'AI_ENRICHMENT_NOT_APPLICABLE',
        severity: 'INFO',
        message: 'No source-validated four- or five-option MCQs were eligible for automatic explanations.',
      });
    }

    const force = Boolean(inspection.force_ai_regeneration);
    const requestCachedIds = new Set(
      force ? [] : eligible.filter((candidate) => this.isCurrentEnrichment(candidate)).map((candidate) => candidate.candidate_id),
    );
    const cacheResults = force
      ? new Map<string, McqExplanationResult>()
      : await this.loadCachedResults(eligible.filter((candidate) => !requestCachedIds.has(candidate.candidate_id)));
    const cachedIds = new Set([...requestCachedIds, ...cacheResults.keys()]);
    const pending = eligible.filter((candidate) => !cachedIds.has(candidate.candidate_id));
    const cachedCandidates = inspection.candidates.map((candidate) => {
      const cached = cacheResults.get(candidate.candidate_id);
      if (cached) return this.applyResult(candidate, cached, 'CACHED');
      if (requestCachedIds.has(candidate.candidate_id)) return this.markCached(candidate);
      return candidate;
    });

    if (!pending.length) {
      return this.recalculate(inspection, cachedCandidates, {
        code: 'AI_ENRICHMENT_CACHED',
        severity: 'INFO',
        message: `${cachedIds.size} question(s) already have current Muse explanations; no duplicate AI requests were made.`,
      }, { generated: 0, cached: cachedIds.size, failed: 0, billing_deferred: 0 });
    }

    if (!this.openRouter.isConfigured()) {
      const ids = new Set(pending.map((candidate) => candidate.candidate_id));
      const candidates = cachedCandidates.map((candidate) => ids.has(candidate.candidate_id)
        ? this.markFailure(candidate, 'OPENROUTER_API_KEY is not configured on the backend.')
        : candidate);
      return this.recalculate(inspection, candidates, {
        code: 'AI_ENRICHMENT_UNAVAILABLE',
        severity: 'WARNING',
        message: 'MCQ explanations were skipped because OpenRouter is not configured.',
      }, { generated: 0, cached: cachedIds.size, failed: pending.length, billing_deferred: 0 });
    }

    const results = new Map<string, McqExplanationResult>();
    const failures = new Map<string, OpenRouterEnrichmentError | string>();
    const billingDeferred = new Map<string, string>();
    // Admit one probe before opening the second lane. This catches an already-exhausted
    // account without fanning a permanent billing failure out to a second question.
    let currentConcurrency = MIN_PARALLEL_REQUESTS;
    let initialProbeComplete = false;
    let offset = 0;
    let billingBlocked = false;
    let routingBlocked = false;
    let routingFailure: OpenRouterEnrichmentError | null = null;

    while (offset < pending.length && !billingBlocked && !routingBlocked) {
      const wave = pending.slice(offset, offset + currentConcurrency);
      let reduceConcurrency = false;
      const settled = await Promise.allSettled(wave.map((candidate) => {
        const correct = candidate.options.find((option) => option.is_correct)!;
        return this.openRouter.generate({
          candidateId: candidate.candidate_id,
          questionText: candidate.question_text,
          options: candidate.options.map((option) => ({ label: option.label, text: option.option_text })),
          sourceCorrectLabel: correct.label,
          subject: inspection.topic?.name ?? null,
          section: candidate.source_section ?? null,
        }, {
          onRetry: ({ failure }) => {
            if (failure.kind === 'IN_FLIGHT_BUDGET_EXHAUSTED') {
              reduceConcurrency = true;
              this.logger.warn(JSON.stringify({
                event: 'openrouter_enrichment_backpressure',
                candidate_id: candidate.candidate_id,
                failure_kind: failure.kind,
                http_status: failure.status,
                provider_reason: failure.reason,
                request_id: failure.requestId,
                current_concurrency: currentConcurrency,
              }));
            }
          },
        });
      }));

      for (let index = 0; index < settled.length; index += 1) {
        const result = settled[index];
        const candidate = wave[index];
        if (result.status === 'fulfilled') {
          results.set(candidate.candidate_id, result.value);
          await this.persistResult(candidate, result.value);
          continue;
        }
        if (result.reason instanceof OpenRouterEnrichmentError && result.reason.kind === 'INSUFFICIENT_CREDITS') {
          billingBlocked = true;
          billingDeferred.set(candidate.candidate_id, this.safeError(result.reason));
          this.logger.warn(JSON.stringify({
            event: 'openrouter_enrichment_billing_circuit_open',
            candidate_id: candidate.candidate_id,
            failure_kind: result.reason.kind,
            http_status: result.reason.status,
            provider_reason: result.reason.reason,
            request_id: result.reason.requestId,
            current_concurrency: currentConcurrency,
            remaining_count: pending.length - offset - wave.length,
            generated_count: results.size,
            cached_count: cachedIds.size,
          }));
        } else {
          const failure = result.reason instanceof OpenRouterEnrichmentError
            ? result.reason
            : null;
          failures.set(candidate.candidate_id, failure ?? this.safeError(result.reason));
          if (failure?.kind === 'NO_COMPATIBLE_ENDPOINT') {
            routingBlocked = true;
            routingFailure = failure;
            this.logger.warn(JSON.stringify({
              event: 'openrouter_enrichment_routing_circuit_open',
              candidate_id: candidate.candidate_id,
              failure_kind: failure.kind,
              http_status: failure.status,
              provider_reason: failure.reason,
              request_id: failure.requestId,
              remaining_count: pending.length - offset - wave.length,
            }));
          }
        }
      }

      offset += wave.length;
      if (reduceConcurrency) currentConcurrency = MIN_PARALLEL_REQUESTS;
      else if (!initialProbeComplete && !billingBlocked) currentConcurrency = INITIAL_PARALLEL_REQUESTS;
      initialProbeComplete = true;
    }

    if (billingBlocked) {
      const message = Array.from(billingDeferred.values())[0]
        ?? 'OpenRouter has insufficient usable credit; add credits or raise the key limit before retrying.';
      pending.slice(offset).forEach((candidate) => billingDeferred.set(candidate.candidate_id, message));
    }
    if (routingBlocked && routingFailure) {
      pending.slice(offset).forEach((candidate) => failures.set(candidate.candidate_id, routingFailure!));
    }

    const candidates = cachedCandidates.map((candidate) => {
      const result = results.get(candidate.candidate_id);
      if (result) return this.applyResult(candidate, result);
      const deferred = billingDeferred.get(candidate.candidate_id);
      if (deferred) return this.markBillingDeferred(candidate, deferred);
      const failure = failures.get(candidate.candidate_id);
      if (failure) return this.markFailure(candidate, failure);
      return candidate;
    });

    const failedCount = failures.size;
    const deferredCount = billingDeferred.size;
    const reviewCount = Array.from(results.values()).filter((result) => result.answerConsistency === 'QUESTIONABLE').length;
    const summary = {
      generated: results.size,
      cached: cachedIds.size,
      failed: failedCount,
      billing_deferred: deferredCount,
    };
    return this.recalculate(inspection, candidates, {
      code: deferredCount ? 'AI_ENRICHMENT_BILLING_DEFERRED' : failedCount ? 'AI_ENRICHMENT_PARTIAL' : 'AI_ENRICHMENT_COMPLETE',
      severity: deferredCount || failedCount ? 'WARNING' : 'INFO',
      message: deferredCount
        ? `${results.size} generated · ${cachedIds.size} reused · ${deferredCount} deferred because OpenRouter credit is unavailable.`
        : failedCount
          ? `${results.size} generated · ${cachedIds.size} reused · ${failedCount} failed and remain reviewable.`
          : `${results.size} generated · ${cachedIds.size} reused${reviewCount ? ` · ${reviewCount} answer key(s) flagged for instructor review` : ''}.`,
    }, summary);
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
    if (!metadata || !['GENERATED', 'CACHED'].includes(metadata.status ?? '')) return false;
    if (metadata.provider !== signature.provider || metadata.model !== signature.model || metadata.prompt_version !== signature.promptVersion) return false;
    if (metadata.content_hash !== this.contentHash(candidate)) return false;
    if (!candidate.explanation?.trim()) return false;
    return isSupportedMcqOptionCount(candidate.options.length)
      && candidate.options.every((option) => Boolean(option.explanation?.trim()));
  }

  private isEligible(candidate: ImportCandidate): boolean {
    if (candidate.status === 'INVALID') return false;
    if (candidate.question_text.trim().length < 8) return false;
    if (!isSupportedMcqOptionCount(candidate.options.length)) return false;
    if (!hasSequentialMcqLabels(candidate.options.map((option) => option.label))) return false;
    if (candidate.options.length === 4 && !candidate.allow_four_options) return false;
    return candidate.options.filter((option) => option.is_correct).length === 1;
  }

  private applyResult(
    candidate: ImportCandidate,
    result: Awaited<ReturnType<OpenRouterQuestionEnrichmentService['generate']>>,
    enrichmentStatus: 'GENERATED' | 'CACHED' = 'GENERATED',
  ): ImportCandidate {
    const byLabel = new Map(result.optionExplanations.map((row) => [row.label, row.explanation]));
    const issues = candidate.issues.filter((issue) =>
      !['AI_ENRICHMENT_FAILED', 'AI_ENRICHMENT_FAILED_RETRYABLE', 'AI_ENRICHMENT_FAILED_VALIDATION', 'AI_ENRICHMENT_DEFERRED_BILLING', 'AI_ENRICHED', 'AI_ENRICHMENT_CACHED', 'AI_ANSWER_KEY_REVIEW_REQUIRED', 'AI_EXPLANATION_STALE', 'NO_SOURCE_EXPLANATION', 'DIFFICULTY_ESTIMATED'].includes(issue.code),
    );
    issues.push({
      code: enrichmentStatus === 'CACHED' ? 'AI_ENRICHMENT_CACHED' : 'AI_ENRICHED',
      severity: 'INFO',
      message: enrichmentStatus === 'CACHED'
        ? `Question and option explanations were reused from the durable ${result.model} cache.`
        : `Question and option explanations were generated with ${result.model} (${result.promptVersion}).`,
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
        status: enrichmentStatus,
      },
    };
  }

  private markCached(candidate: ImportCandidate): ImportCandidate {
    return {
      ...candidate,
      issues: [
        ...candidate.issues.filter((issue) => issue.code !== 'AI_ENRICHMENT_CACHED'),
        { code: 'AI_ENRICHMENT_CACHED', severity: 'INFO', message: 'Current AI explanations were reused without another provider request.' },
      ],
      ai_enrichment: { ...candidate.ai_enrichment, status: 'CACHED' },
    };
  }

  private markFailure(candidate: ImportCandidate, failure: OpenRouterEnrichmentError | string): ImportCandidate {
    const status = failure instanceof OpenRouterEnrichmentError
      ? failure.kind === 'INVALID_RESPONSE' ? 'FAILED_VALIDATION' : failure.retryable ? 'FAILED_RETRYABLE' : 'FAILED'
      : 'FAILED';
    const code = status === 'FAILED_VALIDATION'
      ? 'AI_ENRICHMENT_FAILED_VALIDATION'
      : status === 'FAILED_RETRYABLE' ? 'AI_ENRICHMENT_FAILED_RETRYABLE' : 'AI_ENRICHMENT_FAILED';
    const message = typeof failure === 'string' ? failure : this.safeError(failure);
    const issues = [
      ...candidate.issues.filter((issue) => !issue.code.startsWith('AI_ENRICHMENT_FAILED')),
      { code, severity: 'WARNING', message },
    ];
    return {
      ...candidate,
      status: candidate.status === 'INVALID' ? 'INVALID' : 'NEEDS_REVIEW',
      issues,
      ai_enrichment: { ...candidate.ai_enrichment, status },
    };
  }

  private markBillingDeferred(candidate: ImportCandidate, message: string): ImportCandidate {
    return {
      ...candidate,
      status: candidate.status === 'INVALID' ? 'INVALID' : 'NEEDS_REVIEW',
      issues: [
        ...candidate.issues.filter((issue) => issue.code !== 'AI_ENRICHMENT_DEFERRED_BILLING'),
        { code: 'AI_ENRICHMENT_DEFERRED_BILLING', severity: 'WARNING', message },
      ],
      ai_enrichment: { ...candidate.ai_enrichment, status: 'DEFERRED_BILLING' },
    };
  }

  private safeError(reason: unknown): string {
    const message = reason instanceof Error ? reason.message : 'Unknown OpenRouter enrichment failure.';
    return message
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, '[redacted OpenRouter key]')
      .slice(0, 500);
  }

  private async loadCachedResults(candidates: ImportCandidate[]): Promise<Map<string, McqExplanationResult>> {
    const results = new Map<string, McqExplanationResult>();
    if (!this.cache || !candidates.length) return results;
    const signature = this.openRouter.getSignature();
    const byHash = new Map<string, ImportCandidate[]>();
    for (const candidate of candidates) {
      const contentHash = this.contentHash(candidate);
      byHash.set(contentHash, [...(byHash.get(contentHash) ?? []), candidate]);
    }
    try {
      const rows = await this.cache.find({
        where: {
          provider: signature.provider,
          model: signature.model,
          promptVersion: signature.promptVersion,
          contentHash: In([...byHash.keys()]),
        },
      });
      for (const row of rows) {
        const matchingCandidates = byHash.get(row.contentHash) ?? [];
        for (const candidate of matchingCandidates) {
          if (!this.isUsableCachedResult(candidate, row.result, signature)) continue;
          results.set(candidate.candidate_id, { ...row.result, candidateId: candidate.candidate_id });
        }
      }
    } catch (error) {
      this.logger.warn(`AI enrichment cache lookup failed: ${this.safeError(error)}`);
    }
    return results;
  }

  private isUsableCachedResult(
    candidate: ImportCandidate,
    result: McqExplanationResult,
    signature: ReturnType<OpenRouterQuestionEnrichmentService['getSignature']>,
  ): boolean {
    const correct = candidate.options.find((option) => option.is_correct)?.label.trim().toUpperCase();
    return Boolean(result)
      && result.model === signature.model
      && result.promptVersion === signature.promptVersion
      && result.sourceCorrectLabel === correct
      && Boolean(result.questionExplanation?.trim())
      && result.optionExplanations?.length === candidate.options.length
      && result.optionExplanations.map((option) => option.label).join(',') === sequentialMcqLabels(candidate.options.length).join(',')
      && result.optionExplanations.every((option) => Boolean(option.explanation?.trim()));
  }

  private async persistResult(candidate: ImportCandidate, result: McqExplanationResult): Promise<void> {
    if (!this.cache) return;
    const signature = this.openRouter.getSignature();
    const contentHash = this.contentHash(candidate);
    try {
      await this.cache.upsert({
        provider: signature.provider,
        model: signature.model,
        promptVersion: signature.promptVersion,
        contentHash,
        result,
      }, ['provider', 'model', 'promptVersion', 'contentHash']);
    } catch (error) {
      this.logger.warn(`AI enrichment cache write failed for ${contentHash.slice(0, 12)}: ${this.safeError(error)}`);
    }
  }

  private statusFromIssues(issues: ImportIssue[]): 'VALID' | 'NEEDS_REVIEW' | 'INVALID' {
    if (issues.some((issue) => issue.severity === 'ERROR')) return 'INVALID';
    if (issues.some((issue) => issue.severity === 'WARNING')) return 'NEEDS_REVIEW';
    return 'VALID';
  }

  private withIssue<T extends ImportInspection>(inspection: T, issue: ImportIssue): T {
    return { ...inspection, issues: [...inspection.issues.filter((row) => row.code !== issue.code), issue] } as T;
  }

  private recalculate<T extends ImportInspection>(
    inspection: T,
    candidates: ImportCandidate[],
    issue: ImportIssue,
    enrichmentSummary?: ImportInspection['enrichment_summary'],
  ): T {
    return {
      ...inspection,
      candidates,
      ...(enrichmentSummary ? { enrichment_summary: enrichmentSummary } : {}),
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
