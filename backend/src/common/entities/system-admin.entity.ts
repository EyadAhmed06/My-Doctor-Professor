import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('system_admins')
export class SystemAdmin {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 30, nullable: true, unique: true, name: 'employee_number' })
  employeeNumber: string | null;

  @Column({ type: 'boolean', nullable: false, default: false, name: 'is_super_admin' })
  isSuperAdmin: boolean;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}

