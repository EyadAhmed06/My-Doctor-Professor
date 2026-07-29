import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { McqOption } from './mcq-option.entity';
import { Question } from './question.entity';
import { TestAttempt } from './test-attempt.entity';

@Entity('student_answers')
@Index('idx_answers_attempt', ['attemptId'])
@Index('idx_answers_question', ['questionId'])
export class StudentAnswer {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid', { name: 'attempt_id' }) attemptId: string;
  @Column('uuid', { name: 'question_id' }) questionId: string;
  @Column('uuid', { name: 'selected_option_id', nullable: true }) selectedOptionId: string | null;
  @Column({ type: 'text', name: 'essay_answer', nullable: true }) essayAnswer: string | null;
  @Column({ type: 'numeric', precision: 5, scale: 2, name: 'awarded_marks', nullable: true }) awardedMarks: string | null;
  @Column({ type: 'boolean', name: 'is_correct', nullable: true }) isCorrect: boolean | null;
  @Column({ type: 'timestamp', name: 'answered_at', nullable: true }) answeredAt: Date | null;
  @ManyToOne(() => TestAttempt, (attempt) => attempt.answers, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'attempt_id' }) attempt: TestAttempt;
  @ManyToOne(() => Question, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'question_id' }) question: Question;
  @ManyToOne(() => McqOption, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'selected_option_id' }) selectedOption: McqOption | null;
}
