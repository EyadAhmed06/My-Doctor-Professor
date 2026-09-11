import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  buildActiveEnrollmentSql,
  buildBundleWeekFallbackSql,
  buildFullCourseBundleSql,
} from '../bundle-access/bundle-access.predicates';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';

type StudioFilter = 'ALL' | 'FLAGGED' | 'HARD';

const RESOLVED_COURSE = 'COALESCE(course.id, test_course.id)';
const RESOLVED_WEEK = 'COALESCE(week.id, test_week.id, test_lecture_week.id)';
const ACTIVE_ENTITLEMENT = buildActiveEnrollmentSql('enrollment', 'bundle');
const WEEK_ENTITLEMENT = buildBundleWeekFallbackSql('bundle', RESOLVED_WEEK, RESOLVED_COURSE);
const FULL_COURSE_ENTITLEMENT = buildFullCourseBundleSql('bundle', RESOLVED_COURSE);

/**
 * Student review workspace for questions the student deliberately saved while solving.
 * NORMAL means "review later" and HARD means "I personally struggled with this".
 * Answers are exposed only after the originating attempt is closed and while the student
 * still has a live entitlement to the test or its academic content.
 *
 * `student/studio` is the canonical namespace. `tests/studio` remains as a legacy alias,
 * but it must be registered before parameterized test routes such as `tests/:testId/questions`.
 */
@Controller(['student/studio', 'tests/studio'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
export class StudentStudioController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('questions')
  questions(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('filter') requestedFilter?: string,
  ) {
    return this.savedQuestions(actor, this.normalizeFilter(requestedFilter));
  }

  /** Backwards-compatible hard-only view for older clients. */
  @Get('hard-questions')
  hardQuestions(@CurrentUser() actor: AuthenticatedUser) {
    return this.savedQuestions(actor, 'HARD');
  }

  private normalizeFilter(value?: string): StudioFilter {
    const normalized = (value || 'ALL').trim().toUpperCase();
    if (normalized === 'ALL' || normalized === 'FLAGGED' || normalized === 'HARD') return normalized;
    throw new BadRequestException('Studio filter must be ALL, FLAGGED, or HARD');
  }

  private async savedQuestions(actor: AuthenticatedUser, filter: StudioFilter) {
    const data = await this.dataSource.query(`
      WITH closed_flags AS (
        SELECT
          flag.question_id,
          flag.attempt_id,
          flag.flag_type,
          flag.created_at
        FROM question_flags flag
        INNER JOIN test_attempts attempt ON attempt.id = flag.attempt_id
        WHERE attempt.student_id = $1
          AND attempt.status IN ('SUBMITTED', 'EXPIRED')
      ),
      saved_questions AS (
        SELECT
          flag.question_id,
          BOOL_OR(flag.flag_type = 'NORMAL') AS is_flagged,
          BOOL_OR(flag.flag_type = 'HARD') AS is_hard,
          MAX(flag.created_at) AS saved_at
        FROM closed_flags flag
        GROUP BY flag.question_id
      ),
      latest_context AS (
        SELECT DISTINCT ON (flag.question_id)
          flag.question_id,
          flag.attempt_id,
          flag.created_at AS context_saved_at
        FROM closed_flags flag
        ORDER BY flag.question_id, flag.created_at DESC, flag.attempt_id DESC
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
        saved.saved_at,
        saved.saved_at AS flagged_at,
        saved.is_flagged,
        saved.is_hard,
        ${RESOLVED_COURSE} AS course_id,
        COALESCE(course.course_name, test_course.course_name) AS course_name,
        COALESCE(lecture.id, test_lecture.id) AS lecture_id,
        COALESCE(lecture.title, test_lecture.title) AS lecture_title,
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
      FROM saved_questions saved
      INNER JOIN latest_context latest ON latest.question_id = saved.question_id
      INNER JOIN questions question ON question.id = saved.question_id
      INNER JOIN test_attempts attempt ON attempt.id = latest.attempt_id
      INNER JOIN tests test ON test.id = attempt.test_id
      LEFT JOIN student_answers answer
        ON answer.attempt_id = latest.attempt_id
       AND answer.question_id = latest.question_id
      LEFT JOIN topics topic ON topic.id = question.topic_id
      LEFT JOIN lectures lecture ON lecture.id = topic.lecture_id
      LEFT JOIN weeks week ON week.id = lecture.week_id
      LEFT JOIN courses course ON course.id = week.course_id
      LEFT JOIN weeks test_week ON test_week.id = test.week_id
      LEFT JOIN lectures test_lecture ON test_lecture.id = test.lecture_id
      LEFT JOIN weeks test_lecture_week ON test_lecture_week.id = test_lecture.week_id
      LEFT JOIN courses test_course
        ON test_course.id = COALESCE(test.course_id, test_week.course_id, test_lecture_week.course_id)
      LEFT JOIN mcq_options option ON option.question_id = question.id
      WHERE question.is_active = TRUE
        AND ($2 = 'ALL' OR ($2 = 'FLAGGED' AND saved.is_flagged = TRUE) OR ($2 = 'HARD' AND saved.is_hard = TRUE))
        AND COALESCE(course.is_active, test_course.is_active, FALSE) = TRUE
        AND (
          COALESCE(lecture.id, test_lecture.id) IS NULL
          OR COALESCE(lecture.is_published, test_lecture.is_published, FALSE) = TRUE
        )
        AND EXISTS (
          SELECT 1
          FROM bundle_enrollments enrollment
          INNER JOIN bundles bundle ON bundle.id = enrollment.bundle_id
          WHERE enrollment.student_id = $1
            AND ${ACTIVE_ENTITLEMENT}
            AND (
              EXISTS (
                SELECT 1
                FROM bundle_tests bundle_test
                WHERE bundle_test.bundle_id = bundle.id
                  AND bundle_test.test_id = test.id
              )
              OR EXISTS (
                SELECT 1
                FROM bundle_courses bundle_course
                WHERE bundle_course.bundle_id = bundle.id
                  AND bundle_course.course_id = ${RESOLVED_COURSE}
                  AND (
                    (${RESOLVED_WEEK} IS NOT NULL AND ${WEEK_ENTITLEMENT})
                    OR (${RESOLVED_WEEK} IS NULL AND ${FULL_COURSE_ENTITLEMENT})
                  )
              )
            )
        )
      GROUP BY
        question.id,
        question.question_text,
        question.explanation,
        question.difficulty,
        question.marks,
        test.id,
        test.title,
        latest.attempt_id,
        saved.saved_at,
        saved.is_flagged,
        saved.is_hard,
        course.id,
        course.course_name,
        test_course.id,
        test_course.course_name,
        lecture.id,
        lecture.title,
        test_lecture.id,
        test_lecture.title,
        answer.selected_option_id,
        answer.is_correct
      ORDER BY saved.saved_at DESC
    `, [actor.userId, filter]);

    return { data, total: data.length, filter };
  }
}
