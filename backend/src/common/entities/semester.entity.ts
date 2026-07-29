import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Course } from './course.entity';

@Entity('semesters')
@Index('idx_semesters_number', ['semesterNumber'])
export class Semester {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int', nullable: false, name: 'semester_number' })
  semesterNumber: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', nullable: false, default: true, name: 'is_active' })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => Course, (course) => course.semester, { cascade: true })
  courses: Course[];
}

