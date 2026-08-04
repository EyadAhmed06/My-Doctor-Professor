import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { NotebookNote } from './notebook-note.entity';

@Entity('notebook_attachments')
@Index('idx_notebook_attachments_note', ['noteId'])
export class NotebookAttachment {
 @PrimaryGeneratedColumn('uuid') id:string;
 @Column('uuid',{name:'note_id'}) noteId:string;
 @Column({type:'varchar',length:20}) kind:string;
 @Column({type:'varchar',length:255,name:'file_name'}) fileName:string;
 @Column({type:'varchar',length:120,name:'mime_type'}) mimeType:string;
 @Column({type:'varchar',length:1000,name:'file_url'}) fileUrl:string;
 @Column({type:'bigint',name:'size_bytes',nullable:true}) sizeBytes:string|null;
 @CreateDateColumn({name:'created_at'}) createdAt:Date;
 @ManyToOne(()=>NotebookNote,(note)=>note.attachments,{onDelete:'CASCADE'}) @JoinColumn({name:'note_id'}) note:NotebookNote;
}
