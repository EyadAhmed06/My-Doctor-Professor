import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Question } from './question.entity';

@Entity('mcq_options')
@Index('idx_mcq_question', ['questionId'])
@Unique('uq_question_option_order', ['questionId', 'displayOrder'])
export class McqOption {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid', { name: 'question_id' }) questionId: string;
  @Column({ type: 'text', name: 'option_text' }) optionText: string;
  @Column({ type: 'boolean', default: false, name: 'is_correct' }) isCorrect: boolean;
  @Column({ type: 'int', name: 'display_order' }) displayOrder: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @ManyToOne(() => Question, (question) => question.options, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'question_id' }) question: Question;
}
