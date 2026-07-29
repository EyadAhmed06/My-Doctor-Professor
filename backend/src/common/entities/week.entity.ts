import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Course } from './course.entity';
import { Lecture } from './lecture.entity';

@Entity('weeks')
@Index('idx_weeks_course', ['courseId'])
@Unique('uq_course_week', ['courseId', 'weekNumber'])
export class Week {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid', { name: 'course_id' }) courseId: string;
  @Column({ type: 'int', name: 'week_number' }) weekNumber: number;
  @Column({ type: 'varchar', length: 150, nullable: true }) title: string | null;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'int', default: 1, name: 'display_order' }) displayOrder: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @ManyToOne(() => Course, (course) => course.weeks, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'course_id' }) course: Course;
  @OneToMany(() => Lecture, (lecture) => lecture.week) lectures: Lecture[];
}
