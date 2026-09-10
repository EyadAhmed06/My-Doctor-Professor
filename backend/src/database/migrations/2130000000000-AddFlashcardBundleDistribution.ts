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

    -- Collapse the old Topic deck scope into its canonical Lecture scope.
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
    await queryRunner.query(`UPDATE "flashcard_decks" SET "topic_id" = NULL WHERE "topic_id" IS NOT NULL`);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION validate_flashcard_deck_scope_hierarchy()
      RETURNS trigger AS $$
      DECLARE
        resolved_week uuid;
        resolved_course uuid;
      BEGIN
        IF NEW.course_id IS NULL THEN
          RAISE EXCEPTION 'Flashcard deck requires a course';
        END IF;
        IF NEW.topic_id IS NOT NULL THEN
          RAISE EXCEPTION 'Topic is not a flashcard deck scope; use its parent lecture';
        END IF;
        IF NEW.lecture_id IS NOT NULL AND NEW.week_id IS NULL THEN
          RAISE EXCEPTION 'Lecture-scoped flashcard deck requires its parent week';
        END IF;

        IF NEW.week_id IS NOT NULL THEN
          SELECT course_id INTO resolved_course FROM weeks WHERE id = NEW.week_id;
          IF resolved_course IS NULL THEN RAISE EXCEPTION 'Flashcard deck week does not exist'; END IF;
          IF resolved_course <> NEW.course_id THEN
            RAISE EXCEPTION 'Flashcard deck week does not belong to selected course';
          END IF;
        END IF;

        IF NEW.lecture_id IS NOT NULL THEN
          SELECT week_id INTO resolved_week FROM lectures WHERE id = NEW.lecture_id;
          IF resolved_week IS NULL THEN RAISE EXCEPTION 'Flashcard deck lecture does not exist'; END IF;
          IF resolved_week <> NEW.week_id THEN
            RAISE EXCEPTION 'Flashcard deck lecture does not belong to selected week';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_flashcard_deck_scope_hierarchy" ON "flashcard_decks"`);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_flashcard_deck_scope_hierarchy"
      BEFORE INSERT OR UPDATE OF course_id,week_id,lecture_id,topic_id ON "flashcard_decks"
      FOR EACH ROW EXECUTE FUNCTION validate_flashcard_deck_scope_hierarchy()
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
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_flashcard_deck_scope_hierarchy" ON "flashcard_decks"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS validate_flashcard_deck_scope_hierarchy()`);
    await queryRunner.query(`ALTER TABLE "flashcard_decks" DROP CONSTRAINT IF EXISTS "CHK_flashcard_decks_bundle_access_mode"`);
    await queryRunner.query(`ALTER TABLE "flashcard_decks" DROP COLUMN IF EXISTS "bundle_access_mode"`);
  }
}
