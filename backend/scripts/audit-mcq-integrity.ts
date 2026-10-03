import 'dotenv/config';
import type { DataSource } from 'typeorm';

// Production images ship compiled application code in dist/ and intentionally
// omit src/. Local runs continue to load the TypeScript data source.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AppDataSource } = require(
  process.env.NODE_ENV === 'production'
    ? '../dist/database/data-source'
    : '../src/database/data-source',
) as { AppDataSource: DataSource };

const EXPECTED_SEEDED_MCQS = 560;

type SummaryRow = {
  total_mcqs: number;
  active_question_bank_mcqs: number;
  eligible_five_option_mcqs: number;
  invalid_option_count_mcqs: number;
  invalid_correct_answer_mcqs: number;
  seeded_total: number;
  seeded_eligible: number;
};

type InvalidRow = {
  id: string;
  question_text: string;
  reference: string | null;
  option_count: number;
  correct_count: number;
};

type LecturePipelineRow = {
  course_code: string;
  course_name: string;
  week_number: number;
  lecture_number: number;
  lecture_title: string;
  total_questions: number;
  mcqs: number;
  active_mcqs: number;
  question_bank_mcqs: number;
  five_option_mcqs: number;
  one_correct_mcqs: number;
  eligible_mcqs: number;
};

async function main() {
  await AppDataSource.initialize();
  try {
    const [summary] = await AppDataSource.query<SummaryRow[]>(`
      SELECT
        COUNT(*) FILTER (WHERE q.question_type = 'MCQ')::int AS total_mcqs,
        COUNT(*) FILTER (
          WHERE q.question_type = 'MCQ'
            AND q.is_active = TRUE
            AND q.is_question_bank = TRUE
        )::int AS active_question_bank_mcqs,
        COUNT(*) FILTER (
          WHERE q.question_type = 'MCQ'
            AND q.is_active = TRUE
            AND q.is_question_bank = TRUE
            AND (SELECT COUNT(*) FROM mcq_options o WHERE o.question_id = q.id) = 5
            AND (SELECT COUNT(*) FROM mcq_options o WHERE o.question_id = q.id AND o.is_correct = TRUE) = 1
        )::int AS eligible_five_option_mcqs,
        COUNT(*) FILTER (
          WHERE q.question_type = 'MCQ'
            AND q.is_active = TRUE
            AND q.is_question_bank = TRUE
            AND (SELECT COUNT(*) FROM mcq_options o WHERE o.question_id = q.id) <> 5
        )::int AS invalid_option_count_mcqs,
        COUNT(*) FILTER (
          WHERE q.question_type = 'MCQ'
            AND q.is_active = TRUE
            AND q.is_question_bank = TRUE
            AND (SELECT COUNT(*) FROM mcq_options o WHERE o.question_id = q.id AND o.is_correct = TRUE) <> 1
        )::int AS invalid_correct_answer_mcqs,
        COUNT(*) FILTER (
          WHERE q.question_type = 'MCQ'
            AND q.reference = 'MDP medical content seed v1'
        )::int AS seeded_total,
        COUNT(*) FILTER (
          WHERE q.question_type = 'MCQ'
            AND q.reference = 'MDP medical content seed v1'
            AND q.is_active = TRUE
            AND q.is_question_bank = TRUE
            AND (SELECT COUNT(*) FROM mcq_options o WHERE o.question_id = q.id) = 5
            AND (SELECT COUNT(*) FROM mcq_options o WHERE o.question_id = q.id AND o.is_correct = TRUE) = 1
        )::int AS seeded_eligible
      FROM questions q
    `);

    const lecturePipeline = await AppDataSource.query<LecturePipelineRow[]>(`
      SELECT
        course.course_code,
        course.course_name,
        week.week_number,
        lecture.lecture_number,
        lecture.title AS lecture_title,
        COUNT(DISTINCT question.id)::int AS total_questions,
        COUNT(DISTINCT question.id) FILTER (
          WHERE question.question_type = 'MCQ'
        )::int AS mcqs,
        COUNT(DISTINCT question.id) FILTER (
          WHERE question.question_type = 'MCQ'
            AND question.is_active = TRUE
        )::int AS active_mcqs,
        COUNT(DISTINCT question.id) FILTER (
          WHERE question.question_type = 'MCQ'
            AND question.is_active = TRUE
            AND question.is_question_bank = TRUE
        )::int AS question_bank_mcqs,
        COUNT(DISTINCT question.id) FILTER (
          WHERE question.question_type = 'MCQ'
            AND question.is_active = TRUE
            AND question.is_question_bank = TRUE
            AND (SELECT COUNT(*) FROM mcq_options option WHERE option.question_id = question.id) = 5
        )::int AS five_option_mcqs,
        COUNT(DISTINCT question.id) FILTER (
          WHERE question.question_type = 'MCQ'
            AND question.is_active = TRUE
            AND question.is_question_bank = TRUE
            AND (SELECT COUNT(*) FROM mcq_options option WHERE option.question_id = question.id AND option.is_correct = TRUE) = 1
        )::int AS one_correct_mcqs,
        COUNT(DISTINCT question.id) FILTER (
          WHERE question.question_type = 'MCQ'
            AND question.is_active = TRUE
            AND question.is_question_bank = TRUE
            AND (SELECT COUNT(*) FROM mcq_options option WHERE option.question_id = question.id) = 5
            AND (SELECT COUNT(*) FROM mcq_options option WHERE option.question_id = question.id AND option.is_correct = TRUE) = 1
        )::int AS eligible_mcqs
      FROM courses course
      JOIN weeks week ON week.course_id = course.id
      JOIN lectures lecture ON lecture.week_id = week.id
      LEFT JOIN topics topic ON topic.lecture_id = lecture.id
      LEFT JOIN questions question ON question.topic_id = topic.id
      GROUP BY course.course_code, course.course_name, week.week_number,
        lecture.lecture_number, lecture.id, lecture.title
      ORDER BY course.course_code, week.week_number, lecture.lecture_number
    `);

    const invalid = await AppDataSource.query<InvalidRow[]>(`
      SELECT
        q.id,
        q.question_text,
        q.reference,
        (SELECT COUNT(*) FROM mcq_options o WHERE o.question_id = q.id)::int AS option_count,
        (SELECT COUNT(*) FROM mcq_options o WHERE o.question_id = q.id AND o.is_correct = TRUE)::int AS correct_count
      FROM questions q
      WHERE q.question_type = 'MCQ'
        AND q.is_active = TRUE
        AND q.is_question_bank = TRUE
        AND (
          (SELECT COUNT(*) FROM mcq_options o WHERE o.question_id = q.id) <> 5
          OR (SELECT COUNT(*) FROM mcq_options o WHERE o.question_id = q.id AND o.is_correct = TRUE) <> 1
        )
      ORDER BY q.created_at ASC
      LIMIT 25
    `);

    const brokenLectures = lecturePipeline.filter((row) =>
      row.question_bank_mcqs > 0 && row.eligible_mcqs < row.question_bank_mcqs,
    );
    const emptyLectures = lecturePipeline.filter((row) => row.mcqs === 0);

    console.log(JSON.stringify({
      summary,
      lecture_pipeline: lecturePipeline,
      broken_lecture_pipeline: brokenLectures,
      lectures_with_no_mcqs: emptyLectures,
      invalid_sample: invalid,
    }, null, 2));

    if (
      process.env.MCQ_INTEGRITY_STRICT === 'true'
      && summary.invalid_option_count_mcqs + summary.invalid_correct_answer_mcqs > 0
    ) {
      process.exitCode = 2;
    }
    if (
      process.env.MCQ_SEEDED_STRICT === 'true'
      && (
        summary.seeded_total !== EXPECTED_SEEDED_MCQS
        || summary.seeded_eligible !== EXPECTED_SEEDED_MCQS
      )
    ) {
      process.exitCode = 3;
    }
  } finally {
    await AppDataSource.destroy();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
