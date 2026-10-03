import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';
import { Course } from './course.entity';
import { Flashcard } from './flashcard.entity';
import { Lecture } from './lecture.entity';
import { Topic } from './topic.entity';
import { Week } from './week.entity';

export enum FlashcardDeckBundleAccessMode {
 INHERIT='INHERIT',
 RESTRICTED='RESTRICTED',
}

@Entity('flashcard_decks')
@Index('idx_flashcard_decks_course',['courseId'])
@Index('idx_flashcard_decks_week',['weekId'])
@Index('idx_flashcard_decks_topic',['topicId'])
@Index('idx_flashcard_decks_lecture',['lectureId'])
@Index('idx_flashcard_decks_created_by',['createdBy'])
export class FlashcardDeck {
 @PrimaryGeneratedColumn('uuid') id:string;
 @Column('uuid',{name:'course_id',nullable:true}) courseId:string|null;
 @Column('uuid',{name:'week_id',nullable:true}) weekId:string|null;
 @Column('uuid',{name:'topic_id',nullable:true}) topicId:string|null;
 @Column('uuid',{name:'lecture_id',nullable:true}) lectureId:string|null;
 @Column('uuid',{name:'created_by'}) createdBy:string;
 @Column({type:'varchar',length:200}) title:string;
 @Column({type:'text',nullable:true}) description:string|null;
 @Column({type:'boolean',default:false,name:'is_published'}) isPublished:boolean;
 @Column({type:'varchar',length:20,name:'bundle_access_mode',default:FlashcardDeckBundleAccessMode.INHERIT}) bundleAccessMode:FlashcardDeckBundleAccessMode;
 @Column({type:'int',default:1,name:'display_order'}) displayOrder:number;
 @CreateDateColumn({name:'created_at'}) createdAt:Date;
 @UpdateDateColumn({name:'updated_at'}) updatedAt:Date;
 @ManyToOne(()=>Course,{onDelete:'RESTRICT',nullable:true}) @JoinColumn({name:'course_id'}) course:Course|null;
 @ManyToOne(()=>Week,{onDelete:'SET NULL',nullable:true}) @JoinColumn({name:'week_id'}) week:Week|null;
 @ManyToOne(()=>Topic,{onDelete:'SET NULL',nullable:true}) @JoinColumn({name:'topic_id'}) topic:Topic|null;
 @ManyToOne(()=>Lecture,{onDelete:'SET NULL',nullable:true}) @JoinColumn({name:'lecture_id'}) lecture:Lecture|null;
 @ManyToOne(()=>User,{onDelete:'RESTRICT'}) @JoinColumn({name:'created_by'}) creator:User;
 @OneToMany(()=>Flashcard,(card)=>card.deck) cards:Flashcard[];
}
