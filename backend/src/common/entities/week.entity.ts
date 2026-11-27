import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Course } from './course.entity';
import { Lecture } from './lecture.entity';

@Entity('weeks')
@Index('idx_weeks_course', ['courseId'])
@Index('uq_course_week', ['courseId', 'weekNumber'], { unique: true, where: 'archived_at IS NULL' })
export class Week {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid', { name: 'course_id' }) courseId: string;
  @Column({ type: 'int', name: 'week_number' }) weekNumber: number;
  @Column({ type: 'varchar', length: 150, nullable: true }) title: string | null;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'boolean', default: false, name: 'is_locked' }) isLocked: boolean;
  @Column({ type: 'int', default: 1, name: 'display_order' }) displayOrder: number;
  @DeleteDateColumn({ name: 'archived_at', type: 'timestamptz' }) archivedAt: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @ManyToOne(() => Course, (course) => course.weeks, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'course_id' }) course: Course;
  @OneToMany(() => Lecture, (lecture) => lecture.week) lectures: Lecture[];
}
