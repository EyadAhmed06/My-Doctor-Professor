import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum SubscriptionPlanKey {
  FREE = 'free',
  FIRST_5_WEEKS = 'first_5_weeks',
  LAST_5_WEEKS = 'last_5_weeks',
  MAX = 'max',
}

@Entity('subscription_plans')
export class SubscriptionPlan {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 30, unique: true }) key: SubscriptionPlanKey;
  @Column({ type: 'varchar', length: 100 }) label: string;
  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'price_amount', nullable: true }) priceAmount: string | null;
  @Column({ type: 'varchar', length: 3, name: 'price_currency', default: 'EGP' }) priceCurrency: string;
  /** Purchased period length in days. Null for Free, which is never purchased. */
  @Column({ type: 'int', name: 'duration_days', nullable: true }) durationDays: number | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
