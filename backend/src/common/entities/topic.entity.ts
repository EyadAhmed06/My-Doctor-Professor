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
import { Lecture } from './lecture.entity';
import { Question } from './question.entity';

@Entity('topics')
@Index('idx_topics_lecture', ['lectureId'])
@Index('idx_topics_name', ['topicName'])
export class Topic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { nullable: false, name: 'lecture_id' })
  lectureId: string;

  @Column({ type: 'varchar', length: 150, nullable: false, name: 'topic_name' })
  topicName: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'int', nullable: false, default: 1, name: 'display_order' })
  displayOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Lecture, (lecture) => lecture.topics, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lecture_id' })
  lecture: Lecture;

  @OneToMany(() => Question, (question) => question.topic, { cascade: true })
  questions: Question[];
}

