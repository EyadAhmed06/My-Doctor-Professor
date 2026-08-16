import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('auth_sessions')
@Index('idx_auth_sessions_user', ['userId'])
@Index('idx_auth_sessions_expiry', ['expiresAt'])
export class AuthSession {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid', { name: 'user_id' }) userId: string;
  @Column({ type: 'text', name: 'refresh_token_hash' }) refreshTokenHash: string;
  @Column({ type: 'timestamp', name: 'expires_at' }) expiresAt: Date;
  @Column({ type: 'timestamp', nullable: true, name: 'revoked_at' }) revokedAt: Date | null;
  @Column({ type: 'timestamp', nullable: true, name: 'last_used_at' }) lastUsedAt: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user: User;
}
