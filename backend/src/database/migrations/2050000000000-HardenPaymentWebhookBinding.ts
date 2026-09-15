import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenPaymentWebhookBinding2050000000000 implements MigrationInterface {
  name = 'HardenPaymentWebhookBinding2050000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE plan_purchases ADD COLUMN IF NOT EXISTS provider_order_id varchar(100)`);
    await queryRunner.query(`ALTER TABLE plan_purchases ADD COLUMN IF NOT EXISTS provider_transaction_id varchar(100)`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_purchases_provider_order
      ON plan_purchases(provider, provider_order_id)
      WHERE provider IS NOT NULL AND provider_order_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_purchases_provider_transaction
      ON plan_purchases(provider, provider_transaction_id)
      WHERE provider IS NOT NULL AND provider_transaction_id IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_plan_purchases_provider_transaction`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_plan_purchases_provider_order`);
    await queryRunner.query(`ALTER TABLE plan_purchases DROP COLUMN IF EXISTS provider_transaction_id`);
    await queryRunner.query(`ALTER TABLE plan_purchases DROP COLUMN IF EXISTS provider_order_id`);
  }
}
