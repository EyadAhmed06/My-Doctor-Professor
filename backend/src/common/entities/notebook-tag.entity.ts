import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToMany, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';
import { NotebookNote } from './notebook-note.entity';

@Entity('notebook_tags')
@Index('idx_notebook_tags_owner', ['userId', 'name'])
export class NotebookTag {
 @PrimaryGeneratedColumn('uuid') id:string;
 @Column('uuid',{name:'user_id'}) userId:string;
 @Column({type:'varchar',length:60}) name:string;
 @Column({type:'varchar',length:20,default:'#5b8f8a'}) color:string;
 @CreateDateColumn({name:'created_at'}) createdAt:Date;
 @UpdateDateColumn({name:'updated_at'}) updatedAt:Date;
 @ManyToOne(()=>User,{onDelete:'CASCADE'}) @JoinColumn({name:'user_id'}) user:User;
 @ManyToMany(()=>NotebookNote,(note)=>note.tags,{onDelete:'CASCADE'}) notes:NotebookNote[];
}
