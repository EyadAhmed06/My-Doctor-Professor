import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';

@Entity('drug_references')
@Index('uq_drug_reference_slug',['slug'],{unique:true})
@Index('idx_drug_reference_category',['category'])
export class DrugReference {
 @PrimaryGeneratedColumn('uuid') id:string;
 @Column({type:'varchar',length:180}) name:string;
 @Column({type:'varchar',length:200}) slug:string;
 @Column({type:'varchar',length:120}) category:string;
 @Column({type:'varchar',length:180,name:'drug_class'}) drugClass:string;
 @Column({type:'jsonb'}) content:Record<string,unknown>;
 @Column({type:'boolean',default:false,name:'is_published'}) isPublished:boolean;
 @Column('uuid',{name:'created_by'}) createdBy:string;
 @CreateDateColumn({name:'created_at'}) createdAt:Date;
 @UpdateDateColumn({name:'updated_at'}) updatedAt:Date;
 @ManyToOne(()=>User,{onDelete:'RESTRICT'}) @JoinColumn({name:'created_by'}) creator:User;
}
