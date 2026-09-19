import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';
import { Course } from './course.entity';
import { Lecture } from './lecture.entity';
import { Week } from './week.entity';
import { TestQuestion } from './test-question.entity';
import { TestAttempt } from './test-attempt.entity';

export enum TestType { LECTURE='LECTURE', WEEK='WEEK', COURSE='COURSE', CUSTOM='CUSTOM', QUESTION_BANK='QUESTION_BANK' }

@Entity('tests')
@Index('idx_tests_course', ['courseId'])
@Index('idx_tests_type', ['testType'])
@Index('uq_tests_creator_generation_key', ['createdBy', 'generationKey'], { unique: true, where: '"generation_key" IS NOT NULL' })
export class Test {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type:'varchar', length:200 }) title: string;
  @Column({ type:'text', nullable:true }) description: string | null;
  @Column({ type:'enum', enum:TestType, enumName:'test_type', name:'test_type' }) testType: TestType;
  @Column('uuid',{name:'course_id',nullable:true}) courseId:string|null;
  @Column('uuid',{name:'week_id',nullable:true}) weekId:string|null;
  @Column('uuid',{name:'lecture_id',nullable:true}) lectureId:string|null;
  @Column({type:'int',name:'duration_minutes',nullable:true}) durationMinutes:number|null;
  @Column({type:'numeric',precision:6,scale:2,name:'total_marks',nullable:true}) totalMarks:string|null;
  @Column({type:'numeric',precision:6,scale:2,name:'passing_marks',nullable:true}) passingMarks:string|null;
  @Column({type:'boolean',default:false,name:'is_published'}) isPublished:boolean;
  @Column({type:'timestamp',name:'available_from',nullable:true}) availableFrom:Date|null;
  @Column({type:'timestamp',name:'available_until',nullable:true}) availableUntil:Date|null;
  @Column({type:'varchar',length:128,name:'generation_key',nullable:true,select:false}) generationKey:string|null;
  @Column({type:'varchar',length:64,name:'generation_fingerprint',nullable:true,select:false}) generationFingerprint:string|null;
  @Column('uuid',{name:'created_by'}) createdBy:string;
  @CreateDateColumn({name:'created_at'}) createdAt:Date;
  @UpdateDateColumn({name:'updated_at'}) updatedAt:Date;
  @ManyToOne(()=>Course,{onDelete:'SET NULL',nullable:true}) @JoinColumn({name:'course_id'}) course:Course|null;
  @ManyToOne(()=>Week,{onDelete:'SET NULL',nullable:true}) @JoinColumn({name:'week_id'}) week:Week|null;
  @ManyToOne(()=>Lecture,{onDelete:'SET NULL',nullable:true}) @JoinColumn({name:'lecture_id'}) lecture:Lecture|null;
  @ManyToOne(()=>User,{onDelete:'RESTRICT'}) @JoinColumn({name:'created_by'}) creator:User;
  @OneToMany(()=>TestQuestion,(item)=>item.test) questions:TestQuestion[];
  @OneToMany(()=>TestAttempt,(attempt)=>attempt.test) attempts:TestAttempt[];
}