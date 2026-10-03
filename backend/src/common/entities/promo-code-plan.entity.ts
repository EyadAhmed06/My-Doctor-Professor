import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { PromoCode } from './promo-code.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

/** No rows for a given promoCodeId = the code applies to every plan. */
@Entity('promo_code_plans') @Index('idx_promo_code_plans_plan', ['planId'])
export class PromoCodePlan {
  @PrimaryColumn('uuid', { name: 'promo_code_id' }) promoCodeId: string;
  @PrimaryColumn('uuid', { name: 'plan_id' }) planId: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @ManyToOne(() => PromoCode, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'promo_code_id' }) promoCode: PromoCode;
  @ManyToOne(() => SubscriptionPlan, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'plan_id' }) plan: SubscriptionPlan;
}
