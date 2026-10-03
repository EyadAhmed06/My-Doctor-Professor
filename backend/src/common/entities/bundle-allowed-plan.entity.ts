import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Bundle } from './bundle.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

@Entity('bundle_allowed_plans') @Index('idx_bundle_allowed_plans_plan', ['planId'])
export class BundleAllowedPlan {
  @PrimaryColumn('uuid', { name: 'bundle_id' }) bundleId: string;
  @PrimaryColumn('uuid', { name: 'plan_id' }) planId: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @ManyToOne(() => Bundle, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'bundle_id' }) bundle: Bundle;
  @ManyToOne(() => SubscriptionPlan, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'plan_id' }) plan: SubscriptionPlan;
}
