import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuestionAiEnrichmentCache2170000000000 implements MigrationInterface {
  name = 'AddQuestionAiEnrichmentCache2170000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS question_ai_enrichment_cache (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider varchar(32) NOT NULL,
        model varchar(160) NOT NULL,
        prompt_version varchar(160) NOT NULL,
        content_hash varchar(64) NOT NULL,
        result_json jsonb NOT NULL,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_question_ai_enrichment_signature
          UNIQUE(provider, model, prompt_version, content_hash)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_question_ai_enrichment_content_hash
      ON question_ai_enrichment_cache(content_hash)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS question_ai_enrichment_cache');
  }
}
