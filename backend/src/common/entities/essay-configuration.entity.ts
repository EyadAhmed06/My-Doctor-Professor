import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { Question } from './question.entity';

@Entity('essay_configurations')
export class EssayConfiguration {
  @PrimaryColumn('uuid', { name: 'question_id' }) questionId: string;
  @Column({ type: 'int', nullable: true, name: 'minimum_word_count' }) minimumWordCount: number | null;
  @Column({ type: 'int', nullable: true, name: 'maximum_word_count' }) maximumWordCount: number | null;
  @Column({ type: 'text', nullable: true, name: 'model_answer' }) modelAnswer: string | null;
  @Column({ type: 'text', nullable: true, name: 'grading_rubric' }) gradingRubric: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @OneToOne(() => Question, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'question_id' }) question: Question;
}
