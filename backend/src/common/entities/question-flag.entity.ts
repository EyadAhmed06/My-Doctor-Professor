import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';
import { Question } from './question.entity';
import { TestAttempt } from './test-attempt.entity';

export enum QuestionFlagType { NORMAL = 'NORMAL', HARD = 'HARD' }

@Entity('question_flags')
@Index('idx_flags_attempt',['attemptId'])
@Unique('uq_flag_type',['attemptId','questionId','flagType'])
export class QuestionFlag {
 @PrimaryGeneratedColumn('uuid') id:string;
 @Column('uuid',{name:'attempt_id'}) attemptId:string;
 @Column('uuid',{name:'question_id'}) questionId:string;
 @Column({type:'varchar',length:10,name:'flag_type',default:QuestionFlagType.NORMAL}) flagType:QuestionFlagType;
 @CreateDateColumn({name:'created_at'}) createdAt:Date;
 @ManyToOne(()=>TestAttempt,{onDelete:'CASCADE'}) @JoinColumn({name:'attempt_id'}) attempt:TestAttempt;
 @ManyToOne(()=>Question,{onDelete:'RESTRICT'}) @JoinColumn({name:'question_id'}) question:Question;
}
