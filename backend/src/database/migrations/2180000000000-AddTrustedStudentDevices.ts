import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTrustedStudentDevices2180000000000 implements MigrationInterface {
  name = 'AddTrustedStudentDevices2180000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS trusted_devices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        client_device_id uuid NOT NULL,
        public_key_jwk jsonb NOT NULL,
        key_algorithm varchar(64) NOT NULL DEFAULT 'ECDSA_P256_SHA256',
        status varchar(16) NOT NULL DEFAULT 'ACTIVE'
          CHECK (status IN ('ACTIVE','REVOKED')),
        device_label varchar(200),
        user_agent text,
        first_ip inet,
        last_ip inet,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at timestamp,
        revoked_at timestamp,
        approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE (user_id, client_device_id)
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_trusted_devices_active_user
        ON trusted_devices(user_id)
        WHERE status = 'ACTIVE';
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_trusted_devices_user
        ON trusted_devices(user_id, created_at DESC);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS device_auth_challenges (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        trusted_device_id uuid NOT NULL REFERENCES trusted_devices(id) ON DELETE CASCADE,
        challenge varchar(128) NOT NULL,
        expires_at timestamp NOT NULL,
        consumed_at timestamp,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_device_auth_challenges_lookup
        ON device_auth_challenges(user_id, trusted_device_id, expires_at);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS device_access_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        client_device_id uuid NOT NULL,
        proposed_public_key_jwk jsonb NOT NULL,
        key_algorithm varchar(64) NOT NULL DEFAULT 'ECDSA_P256_SHA256',
        device_label varchar(200),
        user_agent text,
        ip_address inet,
        status varchar(16) NOT NULL DEFAULT 'PENDING'
          CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
        requested_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reviewed_at timestamp,
        reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_device_access_requests_pending_user
        ON device_access_requests(user_id)
        WHERE status = 'PENDING';
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_device_access_requests_status
        ON device_access_requests(status, requested_at DESC);
    `);

    await queryRunner.query(`
      ALTER TABLE auth_sessions
        ADD COLUMN IF NOT EXISTS trusted_device_id uuid;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_auth_sessions_trusted_device'
        ) THEN
          ALTER TABLE auth_sessions
            ADD CONSTRAINT fk_auth_sessions_trusted_device
            FOREIGN KEY (trusted_device_id)
            REFERENCES trusted_devices(id)
            ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_trusted_device
        ON auth_sessions(trusted_device_id);
    `);

    // Force pre-device student sessions through the new trusted-device login flow.
    // There is no cryptographic way to bind an already-issued legacy session to a
    // browser after the fact, so revocation is the safe migration boundary.
    await queryRunner.query(`
      UPDATE auth_sessions session
      SET revoked_at = CURRENT_TIMESTAMP
      FROM users account
      WHERE session.user_id = account.id
        AND account.role = 'STUDENT'
        AND session.revoked_at IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_auth_sessions_trusted_device;`);
    await queryRunner.query(`ALTER TABLE auth_sessions DROP CONSTRAINT IF EXISTS fk_auth_sessions_trusted_device;`);
    await queryRunner.query(`ALTER TABLE auth_sessions DROP COLUMN IF EXISTS trusted_device_id;`);
    await queryRunner.query(`DROP TABLE IF EXISTS device_auth_challenges;`);
    await queryRunner.query(`DROP TABLE IF EXISTS device_access_requests;`);
    await queryRunner.query(`DROP TABLE IF EXISTS trusted_devices;`);
  }
}
