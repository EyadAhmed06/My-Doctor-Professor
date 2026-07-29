import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Student } from '../../modules/users/entities/student.entity';
import { StudentAnswer } from './student-answer.entity';
import { Test } from './test.entity';
export enum TestMode { TIMED='TIMED', TUTOR='TUTOR' }
export enum TestAttemptStatus { NOT_STARTED='NOT_STARTED', IN_PROGRESS='IN_PROGRESS', SUBMITTED='SUBMITTED', EXPIRED='EXPIRED' }
@Entity('test_attempts')
@Index('idx_attempt_student',['studentId'])
@Index('idx_attempt_test',['testId'])
export class TestAttempt {
 @PrimaryGeneratedColumn('uuid') id:string;
 @Column('uuid',{name:'student_id'}) studentId:string;
 @Column('uuid',{name:'test_id'}) testId:string;
 @Column({type:'enum',enum:TestMode,enumName:'test_mode',name:'test_mode'}) testMode:TestMode;
 @Column({type:'enum',enum:TestAttemptStatus,enumName:'test_attempt_status',default:TestAttemptStatus.NOT_STARTED}) status:TestAttemptStatus;
 @Column({type:'numeric',precision:6,scale:2,nullable:true}) score:string|null;
 @Column({type:'timestamp',name:'started_at',nullable:true}) startedAt:Date|null;
 @Column({type:'timestamp',name:'submitted_at',nullable:true}) submittedAt:Date|null;
 @Column({type:'timestamp',name:'last_activity_at',nullable:true}) lastActivityAt:Date|null;
 @Column({type:'boolean',name:'auto_submitted',default:false}) autoSubmitted:boolean;
 @CreateDateColumn({name:'created_at'}) createdAt:Date;
 @ManyToOne(()=>Student,{onDelete:'CASCADE'}) @JoinColumn({name:'student_id'}) student:Student;
 @ManyToOne(()=>Test,(test)=>test.attempts,{onDelete:'RESTRICT'}) @JoinColumn({name:'test_id'}) test:Test;
 @OneToMany(()=>StudentAnswer,(answer)=>answer.attempt) answers:StudentAnswer[];
}
