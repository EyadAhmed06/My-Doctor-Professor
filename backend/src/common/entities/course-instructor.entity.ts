import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Instructor } from '../../modules/users/entities/instructor.entity';
import { Course } from './course.entity';

@Entity('course_instructors')
@Index('idx_course_instructors_instructor', ['instructorId'])
export class CourseInstructor {
  @PrimaryColumn('uuid', { name: 'course_id' })
  courseId: string;

  @PrimaryColumn('uuid', { name: 'instructor_id' })
  instructorId: string;

  @CreateDateColumn({ name: 'assigned_at' })
  assignedAt: Date;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course: Course;

  @ManyToOne(() => Instructor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'instructor_id' })
  instructor: Instructor;
}
