import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  ForeignKey,
} from 'typeorm';
import { User } from './user.entity';

@Entity('students')
@Index('idx_students_semester', ['currentSemester'])
export class Student {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 30, nullable: false, unique: true, name: 'student_number' })
  studentNumber: string;

  @Column({ type: 'int', nullable: false, name: 'current_semester' })
  currentSemester: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}

