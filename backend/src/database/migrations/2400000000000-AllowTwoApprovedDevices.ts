import { MigrationInterface, QueryRunner } from 'typeorm';
export class AllowTwoApprovedDevices2400000000000 implements MigrationInterface {
  name = 'AllowTwoApprovedDevices2400000000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE users ADD COLUMN max_active_devices smallint NOT NULL DEFAULT 1 CHECK (max_active_devices IN (1,2));
      DROP INDEX IF EXISTS uq_auth_sessions_active_user;
      DROP INDEX IF EXISTS uq_trusted_devices_active_user;
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_active_user ON auth_sessions(user_id) WHERE revoked_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_trusted_devices_active_user ON trusted_devices(user_id) WHERE status='ACTIVE';
      CREATE FUNCTION enforce_account_device_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE capacity integer; occupied integer;
      BEGIN
        SELECT max_active_devices INTO capacity FROM users WHERE id=NEW.user_id FOR UPDATE;
        IF TG_TABLE_NAME='auth_sessions' THEN
          IF NEW.revoked_at IS NOT NULL OR NEW.expires_at <= CURRENT_TIMESTAMP THEN RETURN NEW; END IF;
          SELECT COUNT(*) INTO occupied FROM auth_sessions
            WHERE user_id=NEW.user_id AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP AND id<>NEW.id;
        ELSE
          IF NEW.status<>'ACTIVE' THEN RETURN NEW; END IF;
          SELECT COUNT(*) INTO occupied FROM trusted_devices
            WHERE user_id=NEW.user_id AND status='ACTIVE' AND id<>NEW.id;
        END IF;
        IF occupied >= capacity THEN
          RAISE EXCEPTION 'Account device capacity reached' USING ERRCODE='23505';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER enforce_auth_session_capacity BEFORE INSERT OR UPDATE OF revoked_at,user_id ON auth_sessions
        FOR EACH ROW EXECUTE FUNCTION enforce_account_device_capacity();
      CREATE TRIGGER enforce_trusted_device_capacity BEFORE INSERT OR UPDATE OF status,user_id ON trusted_devices
        FOR EACH ROW EXECUTE FUNCTION enforce_account_device_capacity();
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TRIGGER IF EXISTS enforce_auth_session_capacity ON auth_sessions;
      DROP TRIGGER IF EXISTS enforce_trusted_device_capacity ON trusted_devices;
      DROP FUNCTION IF EXISTS enforce_account_device_capacity();
      WITH ranked AS (SELECT id,row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC,id DESC) rn FROM auth_sessions WHERE revoked_at IS NULL)
      UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id IN (SELECT id FROM ranked WHERE rn>1);
      WITH ranked AS (SELECT id,row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC,id DESC) rn FROM trusted_devices WHERE status='ACTIVE')
      UPDATE trusted_devices SET status='REVOKED',revoked_at=CURRENT_TIMESTAMP WHERE id IN (SELECT id FROM ranked WHERE rn>1);
      CREATE UNIQUE INDEX uq_auth_sessions_active_user ON auth_sessions(user_id) WHERE revoked_at IS NULL;
      CREATE UNIQUE INDEX uq_trusted_devices_active_user ON trusted_devices(user_id) WHERE status='ACTIVE';
      ALTER TABLE users DROP COLUMN max_active_devices;
    `);
  }
}
