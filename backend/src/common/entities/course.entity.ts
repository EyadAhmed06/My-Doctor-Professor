import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Semester } from './semester.entity';
import { Week } from './week.entity';
import { Instructor } from './instructor.entity';

@Entity('courses')
@Index('idx_courses_semester', ['semesterId'])
@Index('idx_courses_name', ['courseName'])
export class Course {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { nullable: false, name: 'semester_id' })
  semesterId: string;

  @Column({ type: 'varchar', length: 20, nullable: false, name: 'course_code' })
  courseCode: string;

  @Column({ type: 'varchar', length: 150, nullable: false, name: 'course_name' })
  courseName: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  slug: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'int', nullable: true, name: 'credit_hours' })
  creditHours: number | null;

  @Column({ type: 'boolean', nullable: false, default: true, name: 'is_active' })
  isActive: boolean;

  @Column({ type: 'int', nullable: false, default: 1, name: 'display_order' })
  displayOrder: number;

  @Column('uuid', { nullable: true, name: 'instructor_id' })
  instructorId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Semester, (semester) => semester.courses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'semester_id' })
  semester: Semester;

  @ManyToOne(() => Instructor, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'instructor_id' })
  instructor: Instructor | null;

  @OneToMany(() => Week, (week) => week.course, { cascade: true })
  weeks: Week[];
}

