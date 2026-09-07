import { Controller, Get, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';

/**
 * Student review workspace for questions explicitly marked HARD during quizzes.
 * Only questions from closed attempts are returned so Studio can never reveal a
 * correct answer while an assessment is still in progress.
 */
@Controller('tests/studio')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
export class StudentStudioController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('hard-questions')
  async hardQuestions(@CurrentUser() actor: AuthenticatedUser) {
    const data = await this.dataSource.query(`
      WITH latest_hard_flags AS (
        SELECT DISTINCT ON (flag.question_id)
          flag.question_id,
          flag.attempt_id,
          flag.created_at AS flagged_at
        FROM question_flags flag
        INNER JOIN test_attempts attempt ON attempt.id = flag.attempt_id
        WHERE attempt.student_id = $1
          AND attempt.status IN ('SUBMITTED', 'EXPIRED')
          AND flag.flag_type = 'HARD'
        ORDER BY flag.question_id, flag.created_at DESC
      )
      SELECT
        question.id AS question_id,
        question.question_text,
        question.explanation,
        question.difficulty,
        question.marks,
        test.id AS test_id,
        test.title AS test_title,
        latest.attempt_id,
        latest.flagged_at,
        course.id AS course_id,
        course.course_name,
        lecture.id AS lecture_id,
        lecture.title AS lecture_title,
        answer.selected_option_id,
        answer.is_correct AS student_was_correct,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', option.id,
              'option_text', option.option_text,
              'is_correct', option.is_correct,
              'display_order', option.display_order,
              'explanation', option.explanation
            ) ORDER BY option.display_order
          ) FILTER (WHERE option.id IS NOT NULL),
          '[]'::jsonb
        ) AS options
      FROM latest_hard_flags latest
      INNER JOIN questions question ON question.id = latest.question_id
      INNER JOIN test_attempts attempt ON attempt.id = latest.attempt_id
      INNER JOIN tests test ON test.id = attempt.test_id
      LEFT JOIN student_answers answer
        ON answer.attempt_id = latest.attempt_id
       AND answer.question_id = latest.question_id
      LEFT JOIN topics topic ON topic.id = question.topic_id
      LEFT JOIN lectures lecture ON lecture.id = topic.lecture_id
      LEFT JOIN weeks week ON week.id = lecture.week_id
      LEFT JOIN courses course ON course.id = week.course_id
      LEFT JOIN mcq_options option ON option.question_id = question.id
      GROUP BY
        question.id,
        test.id,
        latest.attempt_id,
        latest.flagged_at,
        course.id,
        lecture.id,
        answer.selected_option_id,
        answer.is_correct
      ORDER BY latest.flagged_at DESC
    `, [actor.userId]);

    return { data, total: data.length };
  }
}
