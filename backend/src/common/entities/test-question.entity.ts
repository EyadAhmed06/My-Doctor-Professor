import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Question } from './question.entity';
import { Test } from './test.entity';
@Entity('test_questions')
@Unique('uq_test_question',['testId','questionId'])
@Unique('uq_display_order',['testId','displayOrder'])
export class TestQuestion {
 @PrimaryGeneratedColumn('uuid') id:string;
 @Column('uuid',{name:'test_id'}) testId:string;
 @Column('uuid',{name:'question_id'}) questionId:string;
 @Column({type:'int',name:'display_order'}) displayOrder:number;
 @Column({type:'numeric',precision:5,scale:2,default:1}) marks:string;
 @Column({type:'int',name:'time_limit_seconds',nullable:true}) timeLimitSeconds:number|null;
 @CreateDateColumn({name:'created_at'}) createdAt:Date;
 @ManyToOne(()=>Test,(test)=>test.questions,{onDelete:'CASCADE'}) @JoinColumn({name:'test_id'}) test:Test;
 @ManyToOne(()=>Question,{onDelete:'RESTRICT'}) @JoinColumn({name:'question_id'}) question:Question;
}
