import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';
import { NotebookNote } from './notebook-note.entity';

@Entity('notebook_collections')
@Index('idx_notebook_collections_owner', ['userId', 'updatedAt'])
export class NotebookCollection {
 @PrimaryGeneratedColumn('uuid') id:string;
 @Column('uuid',{name:'user_id'}) userId:string;
 @Column({type:'varchar',length:120}) name:string;
 @Column({type:'text',nullable:true}) description:string|null;
 @Column({type:'varchar',length:20,default:'#5b8f8a'}) color:string;
 @Column({type:'boolean',name:'is_pinned',default:false}) isPinned:boolean;
 @CreateDateColumn({name:'created_at'}) createdAt:Date;
 @UpdateDateColumn({name:'updated_at'}) updatedAt:Date;
 @ManyToOne(()=>User,{onDelete:'CASCADE'}) @JoinColumn({name:'user_id'}) user:User;
 @OneToMany(()=>NotebookNote,(note)=>note.collection) notes:NotebookNote[];
}
