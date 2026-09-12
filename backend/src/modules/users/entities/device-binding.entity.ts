import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('device_bindings')
@Index('idx_device_bindings_user', ['userId'])
@Index('uq_device_bindings_active_user', ['userId'], {
  unique: true,
  where: 'released_at IS NULL',
})
export class DeviceBinding {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid', { name: 'user_id' }) userId: string;
  @Column({ type: 'text', name: 'device_token_hash' }) deviceTokenHash: string;
  @Column({ type: 'inet', nullable: true, name: 'ip_address' }) ipAddress:
    string | null;
  @Column({ type: 'text', nullable: true, name: 'user_agent' }) userAgent:
    string | null;
  @CreateDateColumn({ name: 'bound_at' }) boundAt: Date;
  @Column({ type: 'timestamp', nullable: true, name: 'last_seen_at' })
  lastSeenAt: Date | null;
  @Column({ type: 'timestamp', nullable: true, name: 'released_at' })
  releasedAt: Date | null;
  @Column('uuid', { nullable: true, name: 'released_by_admin_id' })
  releasedByAdminId: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'released_by_admin_id' })
  releasedByAdmin: User | null;
}
