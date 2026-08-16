import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Bundle } from './bundle.entity';
import { Week } from './week.entity';

export enum BundlePlan { FIRST='FIRST', FINAL='FINAL' }

@Entity('bundle_plan_weeks') @Index('idx_bundle_plan_weeks_week',['weekId'])
export class BundlePlanWeek {
  @PrimaryColumn('uuid',{name:'bundle_id'}) bundleId:string;
  @PrimaryColumn({type:'enum',enum:BundlePlan,enumName:'bundle_plan'}) plan:BundlePlan;
  @PrimaryColumn('uuid',{name:'week_id'}) weekId:string;
  @CreateDateColumn({name:'created_at'}) createdAt:Date;
  @ManyToOne(()=>Bundle,{onDelete:'CASCADE'}) @JoinColumn({name:'bundle_id'}) bundle:Bundle;
  @ManyToOne(()=>Week,{onDelete:'RESTRICT'}) @JoinColumn({name:'week_id'}) week:Week;
}
