import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';
import { Bundle } from './bundle.entity';

export enum UnlockReason {
  PURCHASE = 'purchase',
  PLAN_ACCESS = 'plan_access',
}

@Entity('user_bundle_unlocks')
@Unique('uq_user_bundle_unlocks', ['userId', 'bundleId'])
@Index('idx_user_bundle_unlocks_bundle', ['bundleId'])
export class UserBundleUnlock {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid', { name: 'user_id' }) userId: string;
  @Column('uuid', { name: 'bundle_id' }) bundleId: string;
  @CreateDateColumn({ name: 'unlocked_at' }) unlockedAt: Date;
  @Column({ type: 'enum', enum: UnlockReason, enumName: 'unlock_reason', name: 'unlock_reason' }) unlockReason: UnlockReason;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user: User;
  @ManyToOne(() => Bundle, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'bundle_id' }) bundle: Bundle;
}
