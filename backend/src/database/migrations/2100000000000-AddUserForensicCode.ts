import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserForensicCode2100000000000 implements MigrationInterface {
  name = 'AddUserForensicCode2100000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add forensic_code column if it does not already exist
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS forensic_code VARCHAR(6);
    `);

    // 2. Backfill every existing user with a unique cryptographically random 6-character code
    // using the approved alphabet: 23456789ABCDEFGHJKMNPQRSTUVWXYZ (no 0, O, 1, I, L)
    await queryRunner.query(`
      DO $$
      DECLARE
        alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
        alpha_len int := length(alphabet);
        user_record RECORD;
        new_code text;
        code_exists boolean;
        i int;
      BEGIN
        FOR user_record IN SELECT id FROM users WHERE forensic_code IS NULL LOOP
          LOOP
            new_code := '';
            FOR i IN 1..6 LOOP
              new_code := new_code || substr(alphabet, 1 + floor(random() * alpha_len)::int, 1);
            END LOOP;

            SELECT EXISTS(SELECT 1 FROM users WHERE forensic_code = new_code) INTO code_exists;
            IF NOT code_exists THEN
              EXIT;
            END IF;
          END LOOP;

          UPDATE users SET forensic_code = new_code WHERE id = user_record.id;
        END LOOP;
      END $$;
    `);

    // 3. Set column NOT NULL
    await queryRunner.query(`
      ALTER TABLE users
        ALTER COLUMN forensic_code SET NOT NULL;
    `);

    // 4. Create unique constraint / index
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'uq_users_forensic_code'
        ) THEN
          ALTER TABLE users
            ADD CONSTRAINT uq_users_forensic_code UNIQUE (forensic_code);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        DROP CONSTRAINT IF EXISTS uq_users_forensic_code;
    `);
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS forensic_code;
    `);
  }
}
