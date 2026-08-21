import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';
import { PromoCode } from './promo-code.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

export enum PlanPurchaseStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  EXPIRED = 'expired',
}

export enum PlanPaymentMethod {
  CARD = 'card',
  FAWRY = 'fawry',
  PROMOCODE = 'promocode',
}

/** One-time payment for a single plan period. Plan periods run in parallel — a paid
 * row grants that plan for [startsAt, endsAt]; buying another plan never touches this row. */
@Entity('plan_purchases')
@Index('idx_plan_purchases_user_status', ['userId', 'status'])
@Index('idx_plan_purchases_active_window', ['userId', 'status', 'startsAt', 'endsAt'])
@Index('idx_plan_purchases_provider_reference', ['providerReference'])
export class PlanPurchase {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid', { name: 'user_id' }) userId: string;
  @Column('uuid', { name: 'plan_id' }) planId: string;
  @Column({ type: 'enum', enum: PlanPurchaseStatus, enumName: 'plan_purchase_status', default: PlanPurchaseStatus.PENDING }) status: PlanPurchaseStatus;
  @Column({ type: 'enum', enum: PlanPaymentMethod, enumName: 'plan_payment_method', name: 'payment_method' }) paymentMethod: PlanPaymentMethod;
  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'amount_paid', default: 0 }) amountPaid: string;
  @Column({ type: 'varchar', length: 3, default: 'EGP' }) currency: string;
  @Column({ type: 'varchar', length: 50, nullable: true }) provider: string | null;
  @Column({ type: 'varchar', length: 200, name: 'provider_reference', nullable: true }) providerReference: string | null;
  @Column('uuid', { name: 'promo_code_id', nullable: true }) promoCodeId: string | null;
  @Column({ type: 'timestamp', name: 'starts_at', nullable: true }) startsAt: Date | null;
  @Column({ type: 'timestamp', name: 'ends_at', nullable: true }) endsAt: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user: User;
  @ManyToOne(() => SubscriptionPlan, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'plan_id' }) plan: SubscriptionPlan;
  @ManyToOne(() => PromoCode, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'promo_code_id' }) promoCode: PromoCode | null;
}
