import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Bundle } from './bundle.entity';import { Week } from './week.entity';
@Entity('bundle_weeks') @Index('idx_bundle_weeks_week',['weekId'])
export class BundleWeek { @PrimaryColumn('uuid',{name:'bundle_id'}) bundleId:string; @PrimaryColumn('uuid',{name:'week_id'}) weekId:string; @CreateDateColumn({name:'created_at'}) createdAt:Date; @ManyToOne(()=>Bundle,{onDelete:'CASCADE'}) @JoinColumn({name:'bundle_id'}) bundle:Bundle; @ManyToOne(()=>Week,{onDelete:'RESTRICT'}) @JoinColumn({name:'week_id'}) week:Week; }
