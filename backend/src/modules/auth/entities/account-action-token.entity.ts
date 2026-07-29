import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum AccountActionTokenPurpose {
  EMAIL_VERIFICATION = 'EMAIL_VERIFICATION',
  PASSWORD_RESET = 'PASSWORD_RESET',
}

@Entity('account_action_tokens')
@Index('idx_account_action_tokens_user_purpose', ['userId', 'purpose'])
@Index('idx_account_action_tokens_expiry', ['expiresAt'])
export class AccountActionToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 30 })
  purpose: AccountActionTokenPurpose;

  @Column({ type: 'char', length: 64, unique: true, name: 'token_digest' })
  tokenDigest: string;

  @Column({ type: 'timestamp', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'consumed_at' })
  consumedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
