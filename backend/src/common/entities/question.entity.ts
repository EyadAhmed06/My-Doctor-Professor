import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';
import { EssayConfiguration } from './essay-configuration.entity';
import { McqOption } from './mcq-option.entity';
import { QuestionTag } from './question-tag.entity';
import { Topic } from './topic.entity';

export enum QuestionType { MCQ = 'MCQ', ESSAY = 'ESSAY' }
export enum QuestionDifficulty { EASY = 'EASY', MEDIUM = 'MEDIUM', HARD = 'HARD' }

@Entity('questions')
@Index('idx_questions_topic', ['topicId'])
@Index('idx_questions_type', ['questionType'])
@Index('idx_questions_difficulty', ['difficulty'])
export class Question {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid', { name: 'topic_id' }) topicId: string;
  @Column({ type: 'enum', enum: QuestionType, enumName: 'question_type', name: 'question_type' }) questionType: QuestionType;
  @Column({ type: 'varchar', length: 200, nullable: true }) title: string | null;
  @Column({ type: 'text', name: 'question_text' }) questionText: string;
  @Column({ type: 'text', nullable: true }) explanation: string | null;
  @Column({ type: 'text', nullable: true }) hint: string | null;
  @Column({ type: 'text', nullable: true }) reference: string | null;
  @Column({ type: 'enum', enum: QuestionDifficulty, enumName: 'question_difficulty', default: QuestionDifficulty.MEDIUM }) difficulty: QuestionDifficulty;
  @Column({ type: 'int', nullable: true, name: 'estimated_time_seconds' }) estimatedTimeSeconds: number | null;
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 1 }) marks: string;
  @Column({ type: 'boolean', default: true, name: 'is_question_bank' }) isQuestionBank: boolean;
  @Column({ type: 'int', default: 1 }) version: number;
  @Column({ type: 'boolean', default: true, name: 'is_active' }) isActive: boolean;
  @Column('uuid', { name: 'created_by' }) createdBy: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @ManyToOne(() => Topic, (topic) => topic.questions, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'topic_id' }) topic: Topic;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'created_by' }) creator: User;
  @OneToMany(() => McqOption, (option) => option.question) options: McqOption[];
  @OneToMany(() => QuestionTag, (questionTag) => questionTag.question) questionTags: QuestionTag[];
  @OneToOne(() => EssayConfiguration, (config) => config.question) essayConfiguration: EssayConfiguration | null;
}
