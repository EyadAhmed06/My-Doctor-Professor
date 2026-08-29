import 'dotenv/config';
import type { DataSource, QueryRunner } from 'typeorm';

// Production images ship compiled application code in dist/ and intentionally omit src/.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AppDataSource } = require(
  process.env.NODE_ENV === 'production'
    ? '../dist/database/data-source'
    : '../src/database/data-source',
) as { AppDataSource: DataSource };

type DbError = Error & {
  code?: string;
  constraint?: string;
  detail?: string;
  table?: string;
  column?: string;
};

const TARGET_EMAIL = (process.env.DIAG_STUDENT_EMAIL ?? 'student@mydoctorprofessor.com')
  .trim()
  .toLowerCase();

function summarizeError(error: unknown) {
  const value = error as DbError;
  return {
    name: value?.name,
    message: value?.message,
    code: value?.code,
    constraint: value?.constraint,
    detail: value?.detail,
    table: value?.table,
    column: value?.column,
  };
}

async function step<T>(name: string, action: () => Promise<T>): Promise<T> {
  try {
    const result = await action();
    console.log(JSON.stringify({ step: name, status: 'ok' }));
    return result;
  } catch (error) {
    console.error(JSON.stringify({ step: name, status: 'failed', error: summarizeError(error) }, null, 2));
    throw error;
  }
}

async function inspectContract() {
  const columns = await AppDataSource.query(`
    SELECT table_name, column_name, data_type, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name IN ('tests','bundle_tests','test_questions','test_attempts')
    ORDER BY table_name, ordinal_position
  `);
  const enums = await AppDataSource.query(`
    SELECT t.typname AS enum_name,
      array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = current_schema()
      AND t.typname IN ('test_type','test_mode','test_attempt_status')
    GROUP BY t.typname
    ORDER BY t.typname
  `);
  const triggers = await AppDataSource.query(`
    SELECT event_object_table AS table_name, trigger_name, action_timing, event_manipulation
    FROM information_schema.triggers
    WHERE trigger_schema = current_schema()
      AND event_object_table IN ('tests','test_questions','mcq_options')
    ORDER BY event_object_table, trigger_name, event_manipulation
  `);
  console.log(JSON.stringify({ contract: { columns, enums, triggers } }, null, 2));
}

async function findScenario() {
  const [student] = await AppDataSource.query<Array<{ user_id: string; email: string }>>(`
    SELECT s.user_id, u.email
    FROM students s
    JOIN users u ON u.id = s.user_id
    WHERE lower(u.email) = lower($1)
    LIMIT 1
  `, [TARGET_EMAIL]);
  if (!student) throw new Error(`Student not found for DIAG_STUDENT_EMAIL=${TARGET_EMAIL}`);

  const candidates = await AppDataSource.query<Array<{
    bundle_id: string;
    course_id: string;
    course_code: string;
    eligible_count: number;
  }>>(`
    SELECT b.id AS bundle_id,
      c.id AS course_id,
      c.course_code,
      COUNT(DISTINCT q.id)::int AS eligible_count
    FROM bundle_enrollments be
    JOIN bundles b ON b.id = be.bundle_id
    JOIN bundle_courses bc ON bc.bundle_id = b.id
    JOIN courses c ON c.id = bc.course_id
    JOIN weeks w ON w.course_id = c.id
    JOIN lectures l ON l.week_id = w.id AND l.is_published = TRUE
    JOIN topics tp ON tp.lecture_id = l.id
    JOIN questions q ON q.topic_id = tp.id
      AND q.question_type = 'MCQ'
      AND q.is_active = TRUE
      AND q.is_question_bank = TRUE
    WHERE be.student_id = $1
      AND be.status = 'ACTIVE'
      AND be.payment_status IN ('NOT_REQUIRED','PAID')
      AND (be.starts_at IS NULL OR be.starts_at <= CURRENT_TIMESTAMP)
      AND (be.expires_at IS NULL OR be.expires_at > CURRENT_TIMESTAMP)
      AND b.status = 'PUBLISHED'
      AND (b.available_from IS NULL OR b.available_from <= CURRENT_TIMESTAMP)
      AND (b.available_until IS NULL OR b.available_until > CURRENT_TIMESTAMP)
      AND (SELECT COUNT(*) FROM mcq_options mo WHERE mo.question_id = q.id) = 5
      AND (SELECT COUNT(*) FROM mcq_options mo WHERE mo.question_id = q.id AND mo.is_correct = TRUE) = 1
      AND (
        EXISTS (SELECT 1 FROM bundle_weeks bw WHERE bw.bundle_id = b.id AND bw.week_id = w.id)
        OR NOT EXISTS (
          SELECT 1 FROM bundle_weeks bw
          JOIN weeks sw ON sw.id = bw.week_id
          WHERE bw.bundle_id = b.id AND sw.course_id = c.id
        )
      )
    GROUP BY b.id, c.id, c.course_code
    HAVING COUNT(DISTINCT q.id) >= 40
    ORDER BY CASE WHEN c.course_code = 'HEMA-S5' THEN 0 ELSE 1 END, c.course_code
    LIMIT 1
  `, [student.user_id]);

  const scenario = candidates[0];
  if (!scenario) throw new Error(`No active enrolled course with at least 40 eligible MCQs for ${TARGET_EMAIL}`);

  const lectureRows = await AppDataSource.query<Array<{ lecture_id: string }>>(`
    SELECT DISTINCT l.id AS lecture_id
    FROM bundle_courses bc
    JOIN weeks w ON w.course_id = bc.course_id
    JOIN lectures l ON l.week_id = w.id AND l.is_published = TRUE
    WHERE bc.bundle_id = $1 AND bc.course_id = $2
      AND (
        EXISTS (SELECT 1 FROM bundle_weeks bw WHERE bw.bundle_id = $1 AND bw.week_id = w.id)
        OR NOT EXISTS (
          SELECT 1 FROM bundle_weeks bw
          JOIN weeks sw ON sw.id = bw.week_id
          WHERE bw.bundle_id = $1 AND sw.course_id = $2
        )
      )
    ORDER BY l.id
  `, [scenario.bundle_id, scenario.course_id]);

  const questionRows = await AppDataSource.query<Array<{ question_id: string; marks: string }>>(`
    SELECT q.id AS question_id, q.marks::text AS marks
    FROM questions q
    JOIN topics tp ON tp.id = q.topic_id
    WHERE tp.lecture_id = ANY($1::uuid[])
      AND q.question_type = 'MCQ'
      AND q.is_active = TRUE
      AND q.is_question_bank = TRUE
      AND (SELECT COUNT(*) FROM mcq_options mo WHERE mo.question_id = q.id) = 5
      AND (SELECT COUNT(*) FROM mcq_options mo WHERE mo.question_id = q.id AND mo.is_correct = TRUE) = 1
    ORDER BY q.id
    LIMIT 40
  `, [lectureRows.map((row) => row.lecture_id)]);

  if (questionRows.length !== 40) throw new Error(`Expected 40 eligible diagnostic MCQs, found ${questionRows.length}`);
  return { student, scenario, lectureRows, questionRows };
}

async function reproduce(runner: QueryRunner, scenario: Awaited<ReturnType<typeof findScenario>>) {
  const { student, scenario: target, questionRows } = scenario;
  const totalMarks = questionRows.reduce((sum, row) => sum + Number(row.marks), 0);

  const [test] = await step('insert tests', async () => runner.query(`
    INSERT INTO tests(
      title, description, test_type, course_id, week_id, lecture_id,
      duration_minutes, total_marks, passing_marks, is_published,
      available_from, available_until, generation_key, generation_fingerprint, created_by
    ) VALUES (
      $1, $2, 'CUSTOM', $3, NULL, NULL,
      NULL, $4, NULL, TRUE,
      NULL, NULL, NULL, NULL, $5
    ) RETURNING id
  `, [
    'MCQ generation diagnostic - rolled back',
    'No persistent data: diagnostic transaction is always rolled back.',
    target.course_id,
    totalMarks.toFixed(2),
    student.user_id,
  ]));

  await step('insert bundle_tests', () => runner.query(
    `INSERT INTO bundle_tests(bundle_id, test_id) VALUES($1,$2)`,
    [target.bundle_id, test.id],
  ));

  await step('insert 40 test_questions', async () => {
    for (const [index, question] of questionRows.entries()) {
      await runner.query(`
        INSERT INTO test_questions(test_id, question_id, display_order, marks, time_limit_seconds)
        VALUES($1,$2,$3,$4,NULL)
      `, [test.id, question.question_id, index + 1, question.marks]);
    }
  });

  await step('insert tutor test_attempt', () => runner.query(`
    INSERT INTO test_attempts(
      student_id, test_id, test_mode, status, score,
      started_at, submitted_at, last_activity_at, auto_submitted
    ) VALUES($1,$2,'TUTOR','IN_PROGRESS',NULL,CURRENT_TIMESTAMP,NULL,CURRENT_TIMESTAMP,FALSE)
  `, [student.user_id, test.id]));
}

async function main() {
  await AppDataSource.initialize();
  try {
    await inspectContract();
    const scenario = await step('resolve enrolled 40-MCQ scenario', findScenario);
    console.log(JSON.stringify({
      scenario: {
        student_email: scenario.student.email,
        bundle_id: scenario.scenario.bundle_id,
        course_id: scenario.scenario.course_id,
        course_code: scenario.scenario.course_code,
        eligible_count: Number(scenario.scenario.eligible_count),
        lecture_count: scenario.lectureRows.length,
        sampled_questions: scenario.questionRows.length,
      },
    }, null, 2));

    const runner = AppDataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await reproduce(runner, scenario);
      console.log(JSON.stringify({ result: 'all generation inserts succeeded; rolling back diagnostic transaction' }, null, 2));
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  } finally {
    await AppDataSource.destroy();
  }
}

void main().catch((error) => {
  console.error(JSON.stringify({ fatal: summarizeError(error) }, null, 2));
  process.exitCode = 1;
});
