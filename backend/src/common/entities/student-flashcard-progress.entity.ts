import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Student } from '../../modules/users/entities/student.entity';
import { Flashcard } from './flashcard.entity';

@Entity('student_flashcard_progress')
@Unique('uq_student_flashcard',['studentId','flashcardId'])
@Index('idx_student_flashcards_student',['studentId'])
@Index('idx_student_flashcards_flashcard',['flashcardId'])
@Index('idx_student_flashcards_due',['studentId','nextReviewAt'])
export class StudentFlashcardProgress {
 @PrimaryGeneratedColumn('uuid') id:string;
 @Column('uuid',{name:'student_id'}) studentId:string;
 @Column('uuid',{name:'flashcard_id'}) flashcardId:string;
 @Column({type:'int',default:0,name:'times_reviewed'}) timesReviewed:number;
 @Column({type:'int',default:0,name:'times_correct'}) timesCorrect:number;
 @Column({type:'int',default:0,name:'times_incorrect'}) timesIncorrect:number;
 @Column({type:'int',default:0,name:'review_streak'}) reviewStreak:number;
 @Column({type:'timestamp',nullable:true,name:'last_reviewed_at'}) lastReviewedAt:Date|null;
 @Column({type:'timestamp',nullable:true,name:'next_review_at'}) nextReviewAt:Date|null;
 @Column({type:'boolean',default:false,name:'is_mastered'}) isMastered:boolean;
 @Column({type:'timestamp',nullable:true,name:'mastered_at'}) masteredAt:Date|null;
 @Column({type:'numeric',precision:4,scale:2,default:2.5,name:'ease_factor'}) easeFactor:string;
 @Column({type:'int',default:0,name:'interval_days'}) intervalDays:number;
 @CreateDateColumn({name:'created_at'}) createdAt:Date;
 @UpdateDateColumn({name:'updated_at'}) updatedAt:Date;
 @ManyToOne(()=>Student,{onDelete:'CASCADE'}) @JoinColumn({name:'student_id'}) student:Student;
 @ManyToOne(()=>Flashcard,{onDelete:'RESTRICT'}) @JoinColumn({name:'flashcard_id'}) flashcard:Flashcard;
}
