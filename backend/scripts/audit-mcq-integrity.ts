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

    console.log(JSON.stringify({ summary, invalid_sample: invalid }, null, 2));

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
