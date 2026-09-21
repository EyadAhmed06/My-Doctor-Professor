import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenTrustedStudentDeviceRequests2190000000000 implements MigrationInterface {
  name = 'HardenTrustedStudentDeviceRequests2190000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Requests created before the browser started proving possession of the
    // proposed private key are not safe to approve. Force those clients to
    // submit a fresh, cryptographically verified request after this rollout.
    await queryRunner.query(`
      UPDATE device_access_requests
      SET status = 'CANCELLED',
          reviewed_at = COALESCE(reviewed_at, CURRENT_TIMESTAMP)
      WHERE status = 'PENDING';
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_device_access_requests_pending_user;
    `);

    // Keep one pending request per browser device rather than one mutable row
    // per user. Two different devices must never overwrite each other's public
    // keys while an administrator is reviewing them.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_device_access_requests_pending_user_device
        ON device_access_requests(user_id, client_device_id)
        WHERE status = 'PENDING';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_device_access_requests_pending_user_device;
    `);

    // Collapse any multiple pending rows before restoring the old invariant.
    await queryRunner.query(`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY user_id
                 ORDER BY requested_at DESC, id DESC
               ) AS position
        FROM device_access_requests
        WHERE status = 'PENDING'
      )
      UPDATE device_access_requests request
      SET status = 'CANCELLED',
          reviewed_at = COALESCE(request.reviewed_at, CURRENT_TIMESTAMP)
      FROM ranked
      WHERE request.id = ranked.id
        AND ranked.position > 1;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_device_access_requests_pending_user
        ON device_access_requests(user_id)
        WHERE status = 'PENDING';
    `);
  }
}
