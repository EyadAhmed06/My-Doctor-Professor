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

type RepairRow = {
  repaired_questions: number;
  deleted_options: number;
};

async function main() {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_CONTENT_SEED !== 'true'
  ) {
    throw new Error(
      'Refusing to repair production seeded MCQs without ALLOW_CONTENT_SEED=true',
    );
  }

  await AppDataSource.initialize();
  try {
    const result = await AppDataSource.transaction(async (manager) => {
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtext('mdp-medical-content-v1'))",
      );

      const invalid = await manager.query<Array<{ id: string }>>(`
        SELECT q.id
        FROM questions q
        WHERE q.question_type = 'MCQ'
          AND q.reference = 'MDP medical content seed v1'
          AND (
            (SELECT COUNT(*) FROM mcq_options o WHERE o.question_id = q.id) <> 5
            OR (SELECT COUNT(*) FROM mcq_options o WHERE o.question_id = q.id AND o.is_correct = TRUE) <> 1
          )
      `);

      if (!invalid.length) {
        return { repaired_questions: 0, deleted_options: 0 } satisfies RepairRow;
      }

      const ids = invalid.map((row) => row.id);
      const deleted = await manager.query<Array<{ count: number }>>(
        `WITH removed AS (
           DELETE FROM mcq_options
           WHERE question_id = ANY($1::uuid[])
           RETURNING id
         )
         SELECT COUNT(*)::int AS count FROM removed`,
        [ids],
      );

      return {
        repaired_questions: ids.length,
        deleted_options: Number(deleted[0]?.count ?? 0),
      } satisfies RepairRow;
    });

    console.log(JSON.stringify({ seed: 'medical-v1', repair: result }, null, 2));
  } finally {
    await AppDataSource.destroy();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
