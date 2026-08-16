import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';
import { Question } from './question.entity';
import { TestAttempt } from './test-attempt.entity';
@Entity('question_flags')
@Index('idx_flags_attempt',['attemptId'])
@Unique('uq_flag',['attemptId','questionId'])
export class QuestionFlag {
 @PrimaryGeneratedColumn('uuid') id:string;
 @Column('uuid',{name:'attempt_id'}) attemptId:string;
 @Column('uuid',{name:'question_id'}) questionId:string;
 @CreateDateColumn({name:'created_at'}) createdAt:Date;
 @ManyToOne(()=>TestAttempt,{onDelete:'CASCADE'}) @JoinColumn({name:'attempt_id'}) attempt:TestAttempt;
 @ManyToOne(()=>Question,{onDelete:'RESTRICT'}) @JoinColumn({name:'question_id'}) question:Question;
}
