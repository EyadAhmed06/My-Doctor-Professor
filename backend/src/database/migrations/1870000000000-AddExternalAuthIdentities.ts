import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExternalAuthIdentities1870000000000 implements MigrationInterface {
  name = 'AddExternalAuthIdentities1870000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE external_auth_identities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        provider varchar(30) NOT NULL,
        provider_subject varchar(255) NOT NULL,
        provider_email citext NOT NULL,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_used_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT ck_external_auth_provider CHECK (provider IN ('GOOGLE')),
        CONSTRAINT fk_external_auth_identity_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT uq_external_auth_provider_subject UNIQUE (provider, provider_subject),
        CONSTRAINT uq_external_auth_user_provider UNIQUE (user_id, provider)
      );
      CREATE INDEX idx_external_auth_provider_email
        ON external_auth_identities(provider, provider_email);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS external_auth_identities');
  }
}
