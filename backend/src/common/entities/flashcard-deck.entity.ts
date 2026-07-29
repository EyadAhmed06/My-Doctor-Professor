import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Instructor } from '../../modules/users/entities/instructor.entity';
import { Course } from './course.entity'; import { Lecture } from './lecture.entity'; import { Topic } from './topic.entity'; import { Flashcard } from './flashcard.entity';
@Entity('flashcard_decks')
export class FlashcardDeck {
 @PrimaryGeneratedColumn('uuid') id:string;
 @Column('uuid',{name:'course_id',nullable:true}) courseId:string|null;
 @Column('uuid',{name:'topic_id',nullable:true}) topicId:string|null;
 @Column('uuid',{name:'lecture_id',nullable:true}) lectureId:string|null;
 @Column('uuid',{name:'created_by'}) createdBy:string;
 @Column({type:'varchar',length:200}) title:string;
 @Column({type:'text',nullable:true}) description:string|null;
 @Column({type:'boolean',default:false,name:'is_published'}) isPublished:boolean;
 @Column({type:'int',default:1,name:'display_order'}) displayOrder:number;
 @CreateDateColumn({name:'created_at'}) createdAt:Date; @UpdateDateColumn({name:'updated_at'}) updatedAt:Date;
 @ManyToOne(()=>Course,{onDelete:'CASCADE',nullable:true}) @JoinColumn({name:'course_id'}) course:Course|null;
 @ManyToOne(()=>Topic,{onDelete:'SET NULL',nullable:true}) @JoinColumn({name:'topic_id'}) topic:Topic|null;
 @ManyToOne(()=>Lecture,{onDelete:'SET NULL',nullable:true}) @JoinColumn({name:'lecture_id'}) lecture:Lecture|null;
 @ManyToOne(()=>Instructor,{onDelete:'RESTRICT'}) @JoinColumn({name:'created_by'}) creator:Instructor;
 @OneToMany(()=>Flashcard,(card)=>card.deck) cards:Flashcard[];
}
