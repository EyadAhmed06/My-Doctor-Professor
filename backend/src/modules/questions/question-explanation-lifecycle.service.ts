import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Published explanations are derived content. If an instructor changes the
 * question stem, option text, option correctness, or option cardinality, the
 * previous explanation can no longer be assumed to describe the current MCQ.
 *
 * Fail closed: clear stale derived explanations. A caller may preserve the
 * question-level explanation only when the same update explicitly supplied a
 * replacement for it; option explanations are always invalidated when source
 * MCQ semantics change.
 */
@Injectable()
export class QuestionExplanationLifecycleService {
  constructor(private readonly dataSource: DataSource) {}

  async questionIdForOption(optionId: string): Promise<string | null> {
    const rows = await this.dataSource.query(
      'SELECT question_id FROM mcq_options WHERE id = $1 LIMIT 1',
      [optionId],
    ) as Array<{ question_id: string }>;
    return rows[0]?.question_id ?? null;
  }

  async invalidateQuestion(questionId: string, preserveQuestionExplanation = false): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      if (!preserveQuestionExplanation) {
        await manager.query(
          'UPDATE questions SET explanation = NULL WHERE id = $1',
          [questionId],
        );
      }
      await manager.query(
        'UPDATE mcq_options SET explanation = NULL WHERE question_id = $1',
        [questionId],
      );
    });
  }
}
