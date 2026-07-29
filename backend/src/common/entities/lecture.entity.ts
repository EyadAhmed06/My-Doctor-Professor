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
import { Week } from './week.entity';
import { Topic } from './topic.entity';
import { Resource } from './resource.entity';

@Entity('lectures')
@Index('idx_lectures_week', ['weekId'])
@Index('idx_lectures_title', ['title'])
export class Lecture {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { nullable: false, name: 'week_id' })
  weekId: string;

  @Column({ type: 'int', nullable: false, name: 'lecture_number' })
  lectureNumber: number;

  @Column({ type: 'varchar', length: 150, nullable: false })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'int', nullable: true, name: 'estimated_duration_minutes' })
  estimatedDurationMinutes: number | null;

  @Column({ type: 'boolean', nullable: false, default: false, name: 'is_published' })
  isPublished: boolean;

  @Column({ type: 'int', nullable: false, default: 1, name: 'display_order' })
  displayOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Week, (week) => week.lectures, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'week_id' })
  week: Week;

  @OneToMany(() => Topic, (topic) => topic.lecture, { cascade: true })
  topics: Topic[];

  @OneToMany(() => Resource, (resource) => resource.lecture, { cascade: true })
  resources: Resource[];
}

