import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFlashcardBundleDistribution2130000000000 implements MigrationInterface {
  name = 'AddFlashcardBundleDistribution2130000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "flashcard_decks"
      ADD COLUMN IF NOT EXISTS "bundle_access_mode" varchar(20) NOT NULL DEFAULT 'INHERIT'
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'CHK_flashcard_decks_bundle_access_mode'
        ) THEN
          ALTER TABLE "flashcard_decks"
          ADD CONSTRAINT "CHK_flashcard_decks_bundle_access_mode"
          CHECK ("bundle_access_mode" IN ('INHERIT', 'RESTRICTED'));
        END IF;
      END $$
    `);

    -- Topic was previously offered as a separate deck scope. Keep the legacy
    -- column for backwards compatibility, but normalize existing topic decks to
    -- their lecture/week/course hierarchy and stop using topic as a new scope.
    await queryRunner.query(`
      UPDATE "flashcard_decks" deck
      SET
        "lecture_id" = COALESCE(deck."lecture_id", topic."lecture_id"),
        "week_id" = COALESCE(deck."week_id", lecture."week_id"),
        "course_id" = COALESCE(deck."course_id", week."course_id")
      FROM "topics" topic
      JOIN "lectures" lecture ON lecture."id" = topic."lecture_id"
      JOIN "weeks" week ON week."id" = lecture."week_id"
      WHERE deck."topic_id" = topic."id"
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "flashcard_deck_bundle_restrictions" (
        "deck_id" uuid NOT NULL,
        "bundle_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_flashcard_deck_bundle_restrictions" PRIMARY KEY ("deck_id", "bundle_id"),
        CONSTRAINT "FK_flashcard_bundle_restriction_deck"
          FOREIGN KEY ("deck_id") REFERENCES "flashcard_decks"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_flashcard_bundle_restriction_bundle"
          FOREIGN KEY ("bundle_id") REFERENCES "bundles"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_flashcard_bundle_restrictions_bundle"
      ON "flashcard_deck_bundle_restrictions" ("bundle_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_flashcard_bundle_restrictions_bundle"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "flashcard_deck_bundle_restrictions"`);
    await queryRunner.query(`ALTER TABLE "flashcard_decks" DROP CONSTRAINT IF EXISTS "CHK_flashcard_decks_bundle_access_mode"`);
    await queryRunner.query(`ALTER TABLE "flashcard_decks" DROP COLUMN IF EXISTS "bundle_access_mode"`);
  }
}
