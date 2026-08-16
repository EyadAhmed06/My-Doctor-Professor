import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('email_outbox')
@Index('idx_email_outbox_pending', ['sentAt', 'nextAttemptAt'])
export class EmailOutbox {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', name: 'encrypted_payload' })
  encryptedPayload: string;

  @Column({ type: 'varchar', length: 24, name: 'encryption_iv' })
  encryptionIv: string;

  @Column({ type: 'varchar', length: 32, name: 'encryption_tag' })
  encryptionTag: string;

  @Column({ type: 'smallint', default: 0 })
  attempts: number;

  @Column({ type: 'timestamp', nullable: true, name: 'next_attempt_at' })
  nextAttemptAt: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'sent_at' })
  sentAt: Date | null;

  @Column({ type: 'text', nullable: true, name: 'last_error' })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
