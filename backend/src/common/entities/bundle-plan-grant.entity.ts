import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';
import { Bundle } from './bundle.entity';
import { BundlePlan } from './bundle-plan-week.entity';
import { BundleEnrollmentStatus, BundlePaymentStatus } from './bundle-enrollment.entity';

export enum BundlePlanTier { MCQ='MCQ', MCQ_ESSAY='MCQ_ESSAY' }

@Entity('bundle_plan_grants')
@Unique('uq_bundle_plan_student',['bundleId','studentId','plan'])
@Index('idx_bundle_plan_grants_student_status',['studentId','status'])
export class BundlePlanGrant {
  @PrimaryGeneratedColumn('uuid') id:string;
  @Column('uuid',{name:'bundle_id'}) bundleId:string;
  @Column('uuid',{name:'student_id'}) studentId:string;
  @Column({type:'enum',enum:BundlePlan,enumName:'bundle_plan'}) plan:BundlePlan;
  @Column({type:'enum',enum:BundlePlanTier,enumName:'bundle_plan_tier',default:BundlePlanTier.MCQ}) tier:BundlePlanTier;
  @Column({type:'enum',enum:BundleEnrollmentStatus,enumName:'bundle_enrollment_status',default:BundleEnrollmentStatus.ACTIVE}) status:BundleEnrollmentStatus;
  @Column({type:'enum',enum:BundlePaymentStatus,enumName:'bundle_payment_status',name:'payment_status',default:BundlePaymentStatus.PENDING}) paymentStatus:BundlePaymentStatus;
  @Column({type:'timestamp',name:'paid_at',nullable:true}) paidAt:Date|null;
  @Column({type:'varchar',length:200,name:'payment_reference',nullable:true}) paymentReference:string|null;
  @Column({type:'timestamp',name:'expires_at',nullable:true}) expiresAt:Date|null;
  @Column('uuid',{name:'granted_by',nullable:true}) grantedBy:string|null;
  @CreateDateColumn({name:'created_at'}) createdAt:Date;
  @UpdateDateColumn({name:'updated_at'}) updatedAt:Date;
  @ManyToOne(()=>Bundle,{onDelete:'RESTRICT'}) @JoinColumn({name:'bundle_id'}) bundle:Bundle;
  @ManyToOne(()=>User,{onDelete:'RESTRICT'}) @JoinColumn({name:'student_id'}) student:User;
  @ManyToOne(()=>User,{onDelete:'SET NULL',nullable:true}) @JoinColumn({name:'granted_by'}) granter:User|null;
}
