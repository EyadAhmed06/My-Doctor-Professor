import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';

export enum BundleStatus { DRAFT='DRAFT', PUBLISHED='PUBLISHED', ARCHIVED='ARCHIVED' }
export enum BundleAccessMode { MANUAL='MANUAL', CODE='CODE', PUBLIC='PUBLIC', SUBSCRIPTION='SUBSCRIPTION' }

@Entity('bundles')
@Index('uq_bundles_slug', ['slug'], { unique: true })
@Index('idx_bundles_year_status', ['academicYear', 'status'])
export class Bundle {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type:'varchar', length:180 }) title: string;
  @Column({ type:'varchar', length:180 }) slug: string;
  @Column({ type:'text', nullable:true }) description: string|null;
  @Column({ type:'int', name:'academic_year' }) academicYear: number;
  @Column({ type:'enum', enum:BundleStatus, enumName:'bundle_status', default:BundleStatus.DRAFT }) status: BundleStatus;
  @Column({ type:'enum', enum:BundleAccessMode, enumName:'bundle_access_mode', name:'access_mode', default:BundleAccessMode.PUBLIC }) accessMode: BundleAccessMode;
  @Column({ type:'boolean', name:'is_free', default:true }) isFree: boolean;
  @Column({ type:'numeric', precision:10, scale:2, name:'price_amount', nullable:true }) priceAmount: string|null;
  @Column({ type:'varchar', length:3, name:'price_currency', default:'EGP' }) priceCurrency: string;
  @Column({ type:'boolean', name:'first_plan_enabled', default:false }) firstPlanEnabled: boolean;
  @Column({ type:'numeric', precision:10, scale:2, name:'first_plan_price_mcq', nullable:true }) firstPlanPriceMcq: string|null;
  @Column({ type:'numeric', precision:10, scale:2, name:'first_plan_price_mcq_essay', nullable:true }) firstPlanPriceMcqEssay: string|null;
  @Column({ type:'boolean', name:'final_plan_enabled', default:false }) finalPlanEnabled: boolean;
  @Column({ type:'numeric', precision:10, scale:2, name:'final_plan_price_mcq', nullable:true }) finalPlanPriceMcq: string|null;
  @Column({ type:'numeric', precision:10, scale:2, name:'final_plan_price_mcq_essay', nullable:true }) finalPlanPriceMcqEssay: string|null;
  @Column({ type:'text', name:'enrollment_code_hash', nullable:true, select:false }) enrollmentCodeHash: string|null;
  @Column({ type:'timestamp', name:'available_from', nullable:true }) availableFrom: Date|null;
  @Column({ type:'timestamp', name:'available_until', nullable:true }) availableUntil: Date|null;
  @Column('uuid', { name:'created_by' }) createdBy: string;
  @CreateDateColumn({ name:'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name:'updated_at' }) updatedAt: Date;
  @ManyToOne(()=>User,{onDelete:'RESTRICT'}) @JoinColumn({name:'created_by'}) creator: User;
}
