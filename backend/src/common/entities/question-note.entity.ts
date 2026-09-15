import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Question } from './question.entity';
import { TestAttempt } from './test-attempt.entity';
@Entity('question_notes')
@Index('idx_notes_attempt',['attemptId'])
@Unique('uq_note',['attemptId','questionId'])
export class QuestionNote {
 @PrimaryGeneratedColumn('uuid') id:string;
 @Column('uuid',{name:'attempt_id'}) attemptId:string;
 @Column('uuid',{name:'question_id'}) questionId:string;
 @Column({type:'text'}) note:string;
 @CreateDateColumn({name:'created_at'}) createdAt:Date;
 @UpdateDateColumn({name:'updated_at'}) updatedAt:Date;
 @ManyToOne(()=>TestAttempt,{onDelete:'CASCADE'}) @JoinColumn({name:'attempt_id'}) attempt:TestAttempt;
 @ManyToOne(()=>Question,{onDelete:'RESTRICT'}) @JoinColumn({name:'question_id'}) question:Question;
}
