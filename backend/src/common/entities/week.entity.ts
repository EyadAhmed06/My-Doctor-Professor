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
import { Course } from './course.entity';
import { Lecture } from './lecture.entity';

@Entity('weeks')
@Index('idx_weeks_course', ['courseId'])
export class Week {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { nullable: false, name: 'course_id' })
  courseId: string;

  @Column({ type: 'int', nullable: false, name: 'week_number' })
  weekNumber: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'int', nullable: false, default: 1, name: 'display_order' })
  displayOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Course, (course) => course.weeks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course: Course;

  @OneToMany(() => Lecture, (lecture) => lecture.week, { cascade: true })
  lectures: Lecture[];
}

