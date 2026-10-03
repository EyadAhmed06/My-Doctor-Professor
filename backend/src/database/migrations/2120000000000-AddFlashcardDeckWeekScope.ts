import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFlashcardDeckWeekScope2120000000000 implements MigrationInterface {
  name = 'AddFlashcardDeckWeekScope2120000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "flashcard_decks" ADD COLUMN IF NOT EXISTS "week_id" uuid`);
    await queryRunner.query(`
      UPDATE "flashcard_decks" AS deck
      SET "week_id" = lecture."week_id"
      FROM "lectures" AS lecture
      WHERE deck."lecture_id" = lecture."id" AND deck."week_id" IS NULL
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_flashcard_decks_week" ON "flashcard_decks" ("week_id")`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_flashcard_decks_week') THEN
          ALTER TABLE "flashcard_decks"
          ADD CONSTRAINT "FK_flashcard_decks_week"
          FOREIGN KEY ("week_id") REFERENCES "weeks"("id") ON DELETE SET NULL;
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "flashcard_decks" DROP CONSTRAINT IF EXISTS "FK_flashcard_decks_week"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_flashcard_decks_week"`);
    await queryRunner.query(`ALTER TABLE "flashcard_decks" DROP COLUMN IF EXISTS "week_id"`);
  }
}
