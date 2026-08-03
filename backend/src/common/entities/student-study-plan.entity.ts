import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Student } from '../../modules/users/entities/student.entity';

@Entity('student_study_plans')
export class StudentStudyPlan {
 @PrimaryColumn('uuid',{name:'student_id'}) studentId:string;
 @Column({type:'varchar',length:100,name:'target_exam',nullable:true}) targetExam:string|null;
 @Column({type:'date',name:'exam_date',nullable:true}) examDate:string|null;
 @Column({type:'int',name:'daily_question_target',default:20}) dailyQuestionTarget:number;
 @Column({type:'int',name:'weekly_hours_target',default:10}) weeklyHoursTarget:number;
 @Column({type:'int',name:'daily_flashcard_target',default:20}) dailyFlashcardTarget:number;
 @Column({type:'jsonb',default:()=>"'{}'::jsonb"}) preferences:Record<string,unknown>;
 @CreateDateColumn({name:'created_at'}) createdAt:Date;
 @UpdateDateColumn({name:'updated_at'}) updatedAt:Date;
 @OneToOne(()=>Student,{onDelete:'CASCADE'}) @JoinColumn({name:'student_id'}) student:Student;
}
