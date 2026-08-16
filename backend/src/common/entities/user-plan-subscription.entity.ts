import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

@Entity('user_plan_subscriptions') @Index('idx_user_plan_subscriptions_plan', ['planId'])
export class UserPlanSubscription {
  @PrimaryColumn('uuid', { name: 'user_id' }) userId: string;
  @Column('uuid', { name: 'plan_id' }) planId: string;
  @CreateDateColumn({ name: 'started_at' }) startedAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user: User;
  @ManyToOne(() => SubscriptionPlan, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'plan_id' }) plan: SubscriptionPlan;
}
