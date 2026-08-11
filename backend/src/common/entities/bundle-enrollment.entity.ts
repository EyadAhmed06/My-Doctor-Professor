import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';
import { Bundle } from './bundle.entity';

export enum BundleEnrollmentStatus { ACTIVE='ACTIVE', EXPIRED='EXPIRED', REVOKED='REVOKED' }
export enum BundleEnrollmentSource { MANUAL='MANUAL', CODE='CODE', PUBLIC='PUBLIC', SUBSCRIPTION='SUBSCRIPTION' }
export enum BundlePaymentStatus { NOT_REQUIRED='NOT_REQUIRED', PENDING='PENDING', PAID='PAID', CANCELLED='CANCELLED' }

@Entity('bundle_enrollments')
@Unique('uq_bundle_student',['bundleId','studentId'])
@Index('idx_bundle_enrollment_student_status',['studentId','status'])
export class BundleEnrollment {
 @PrimaryGeneratedColumn('uuid') id:string;
 @Column('uuid',{name:'bundle_id'}) bundleId:string;
 @Column('uuid',{name:'student_id'}) studentId:string;
 @Column({type:'enum',enum:BundleEnrollmentStatus,enumName:'bundle_enrollment_status',default:BundleEnrollmentStatus.ACTIVE}) status:BundleEnrollmentStatus;
 @Column({type:'enum',enum:BundleEnrollmentSource,enumName:'bundle_enrollment_source'}) source:BundleEnrollmentSource;
 @Column({type:'enum',enum:BundlePaymentStatus,enumName:'bundle_payment_status',name:'payment_status',default:BundlePaymentStatus.NOT_REQUIRED}) paymentStatus:BundlePaymentStatus;
 @Column({type:'timestamp',name:'paid_at',nullable:true}) paidAt:Date|null;
 @Column({type:'varchar',length:200,name:'payment_reference',nullable:true}) paymentReference:string|null;
 @Column({type:'timestamp',name:'starts_at',default:()=> 'CURRENT_TIMESTAMP'}) startsAt:Date;
 @Column({type:'timestamp',name:'expires_at',nullable:true}) expiresAt:Date|null;
 @Column('uuid',{name:'granted_by',nullable:true}) grantedBy:string|null;
 @CreateDateColumn({name:'created_at'}) createdAt:Date;
 @UpdateDateColumn({name:'updated_at'}) updatedAt:Date;
 @ManyToOne(()=>Bundle,{onDelete:'RESTRICT'}) @JoinColumn({name:'bundle_id'}) bundle:Bundle;
 @ManyToOne(()=>User,{onDelete:'RESTRICT'}) @JoinColumn({name:'student_id'}) student:User;
 @ManyToOne(()=>User,{onDelete:'SET NULL',nullable:true}) @JoinColumn({name:'granted_by'}) granter:User|null;
}
