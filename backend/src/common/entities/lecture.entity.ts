import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Resource } from './resource.entity';
import { Topic } from './topic.entity';
import { Week } from './week.entity';

@Entity('lectures')
@Index('idx_lectures_week', ['weekId'])
@Index('idx_lectures_title', ['title'])
@Unique('uq_week_lecture', ['weekId', 'lectureNumber'])
export class Lecture {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid', { name: 'week_id' }) weekId: string;
  @Column({ type: 'int', name: 'lecture_number' }) lectureNumber: number;
  @Column({ type: 'varchar', length: 200 }) title: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'int', nullable: true, name: 'estimated_duration_minutes' }) estimatedDurationMinutes: number | null;
  @Column({ type: 'boolean', default: false, name: 'is_published' }) isPublished: boolean;
  @Column({ type: 'int', default: 1, name: 'display_order' }) displayOrder: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @ManyToOne(() => Week, (week) => week.lectures, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'week_id' }) week: Week;
  @OneToMany(() => Topic, (topic) => topic.lecture) topics: Topic[];
  @OneToMany(() => Resource, (resource) => resource.lecture) resources: Resource[];
}
