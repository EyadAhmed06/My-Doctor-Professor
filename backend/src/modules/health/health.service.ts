import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly dataSource: DataSource) {}

  liveness() {
    return {
      status: 'ok',
      service: 'my-doctor-professor-api',
      timestamp: new Date().toISOString(),
    };
  }

  async readiness() {
    const startedAt = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
    } catch (error) {
      this.logger.error(
        `Database readiness probe failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException({
        status: 'not_ready',
        database: 'down',
        timestamp: new Date().toISOString(),
      });
    }

    try {
      const [contract] = await this.dataSource.query(`
        WITH required(table_name, column_name) AS (
          VALUES
            ('student_answers','answered_at'),
            ('student_answers','essay_answer'),
            ('test_attempts','submitted_at'),
            ('student_question_progress','bookmarked'),
            ('student_flashcard_progress','last_reviewed_at'),
            ('student_flashcard_progress','next_review_at'),
            ('student_lecture_progress','last_accessed_at'),
            ('student_lecture_progress','time_spent_minutes'),
            ('student_topic_progress','mastery_percentage'),
            ('study_plan_items','student_id'),
            ('study_plan_items','status'),
            ('study_plan_items','item_type'),
            ('study_plan_items','duration_minutes'),
            ('study_plan_items','completed_at'),
            ('essay_case_attempts','student_id'),
            ('essay_case_attempts','case_id'),
            ('essay_case_attempts','status'),
            ('essay_case_attempts','submitted_at'),
            ('essay_cases','week_id'),
            ('essay_cases','is_published')
        ), missing AS (
          SELECT required.table_name || '.' || required.column_name AS name
          FROM required
          LEFT JOIN information_schema.columns column_info
            ON column_info.table_schema = current_schema()
           AND column_info.table_name = required.table_name
           AND column_info.column_name = required.column_name
          WHERE column_info.column_name IS NULL
        )
        SELECT COUNT(*)::int AS missing_count,
          COALESCE(string_agg(name, ', ' ORDER BY name), '') AS missing
        FROM missing
      `) as Array<{ missing_count: number; missing: string }>;

      if (Number(contract?.missing_count ?? 0) > 0) {
        this.logger.error(
          `Database schema readiness probe failed; missing dashboard contract: ${contract.missing}`,
        );
        throw new ServiceUnavailableException({
          status: 'not_ready',
          database: 'up',
          schema: 'out_of_date',
          timestamp: new Date().toISOString(),
        });
      }

      return {
        status: 'ready',
        database: 'up',
        schema: 'ready',
        response_time_ms: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.error(
        `Database schema readiness probe failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException({
        status: 'not_ready',
        database: 'up',
        schema: 'check_failed',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
