import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Lecture } from './lecture.entity';
import { StudentStudyPlan } from './student-study-plan.entity';

export enum StudyPlanItemType { QUESTIONS='QUESTIONS', FLASHCARDS='FLASHCARDS', LECTURE='LECTURE', REVIEW='REVIEW', REST='REST' }
export enum StudyPlanItemStatus { PLANNED='PLANNED', COMPLETED='COMPLETED', SKIPPED='SKIPPED' }

@Entity('study_plan_items')
@Index('idx_study_plan_items_student_date',['studentId','scheduledDate'])
export class StudyPlanItem {
 @PrimaryGeneratedColumn('uuid') id:string;
 @Column('uuid',{name:'student_id'}) studentId:string;
 @Column({type:'date',name:'scheduled_date'}) scheduledDate:string;
 @Column({type:'enum',enum:StudyPlanItemType,enumName:'study_plan_item_type',name:'item_type'}) itemType:StudyPlanItemType;
 @Column({type:'enum',enum:StudyPlanItemStatus,enumName:'study_plan_item_status',default:StudyPlanItemStatus.PLANNED}) status:StudyPlanItemStatus;
 @Column('uuid',{name:'lecture_id',nullable:true}) lectureId:string|null;
 @Column({type:'int',name:'target_count',nullable:true}) targetCount:number|null;
 @Column({type:'int',name:'duration_minutes'}) durationMinutes:number;
 @Column({type:'jsonb',default:()=>"'{}'::jsonb"}) metadata:Record<string,unknown>;
 @Column({type:'timestamp',name:'completed_at',nullable:true}) completedAt:Date|null;
 @CreateDateColumn({name:'created_at'}) createdAt:Date;
 @UpdateDateColumn({name:'updated_at'}) updatedAt:Date;
 @ManyToOne(()=>StudentStudyPlan,(plan)=>plan.items,{onDelete:'CASCADE'}) @JoinColumn({name:'student_id'}) plan:StudentStudyPlan;
 @ManyToOne(()=>Lecture,{onDelete:'SET NULL',nullable:true}) @JoinColumn({name:'lecture_id'}) lecture:Lecture|null;
}
