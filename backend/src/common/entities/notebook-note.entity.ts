import { Column, CreateDateColumn, Entity, Index, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';
import { Lecture } from './lecture.entity';
import { NotebookAttachment } from './notebook-attachment.entity';
import { NotebookCollection } from './notebook-collection.entity';
import { NotebookTag } from './notebook-tag.entity';
import { Question } from './question.entity';

@Entity('notebook_notes')
@Index('idx_notebook_notes_owner_updated',['userId','updatedAt'])
export class NotebookNote {
 @PrimaryGeneratedColumn('uuid') id:string;
 @Column('uuid',{name:'user_id'}) userId:string;
 @Column({type:'varchar',length:200}) title:string;
 @Column({type:'varchar',length:30,name:'note_type'}) noteType:string;
 @Column({type:'text'}) content:string;
 @Column({type:'jsonb',default:()=>"'{}'::jsonb"}) metadata:Record<string,unknown>;
 @Column('uuid',{name:'collection_id',nullable:true}) collectionId:string|null;
 @Column({type:'boolean',name:'is_favorite',default:false}) isFavorite:boolean;
 @Column({type:'timestamp',name:'review_at',nullable:true}) reviewAt:Date|null;
 @Column('uuid',{name:'linked_question_id',nullable:true}) linkedQuestionId:string|null;
 @Column('uuid',{name:'linked_lecture_id',nullable:true}) linkedLectureId:string|null;
 @CreateDateColumn({name:'created_at'}) createdAt:Date;
 @UpdateDateColumn({name:'updated_at'}) updatedAt:Date;
 @ManyToOne(()=>User,{onDelete:'CASCADE'}) @JoinColumn({name:'user_id'}) user:User;
 @ManyToOne(()=>NotebookCollection,(collection)=>collection.notes,{onDelete:'SET NULL',nullable:true}) @JoinColumn({name:'collection_id'}) collection:NotebookCollection|null;
 @ManyToOne(()=>Question,{onDelete:'SET NULL',nullable:true}) @JoinColumn({name:'linked_question_id'}) linkedQuestion:Question|null;
 @ManyToOne(()=>Lecture,{onDelete:'SET NULL',nullable:true}) @JoinColumn({name:'linked_lecture_id'}) linkedLecture:Lecture|null;
 @ManyToMany(()=>NotebookTag,(tag)=>tag.notes) @JoinTable({name:'notebook_note_tags',joinColumn:{name:'note_id'},inverseJoinColumn:{name:'tag_id'}}) tags:NotebookTag[];
 @OneToMany(()=>NotebookAttachment,(attachment)=>attachment.note) attachments:NotebookAttachment[];
}
