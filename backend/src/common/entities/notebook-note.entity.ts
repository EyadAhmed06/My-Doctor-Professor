import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';

@Entity('notebook_notes')
@Index('idx_notebook_notes_owner_updated',['userId','updatedAt'])
export class NotebookNote {
 @PrimaryGeneratedColumn('uuid') id:string;
 @Column('uuid',{name:'user_id'}) userId:string;
 @Column({type:'varchar',length:200}) title:string;
 @Column({type:'varchar',length:30,name:'note_type'}) noteType:string;
 @Column({type:'text'}) content:string;
 @Column({type:'jsonb',default:()=>"'{}'::jsonb"}) metadata:Record<string,unknown>;
 @CreateDateColumn({name:'created_at'}) createdAt:Date;
 @UpdateDateColumn({name:'updated_at'}) updatedAt:Date;
 @ManyToOne(()=>User,{onDelete:'CASCADE'}) @JoinColumn({name:'user_id'}) user:User;
}
