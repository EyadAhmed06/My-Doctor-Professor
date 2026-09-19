import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Bundle } from './bundle.entity';
import { Course } from './course.entity';
@Entity('bundle_courses') @Index('idx_bundle_courses_course',['courseId'])
export class BundleCourse {
 @PrimaryColumn('uuid',{name:'bundle_id'}) bundleId:string;
 @PrimaryColumn('uuid',{name:'course_id'}) courseId:string;
 @CreateDateColumn({name:'created_at'}) createdAt:Date;
 @ManyToOne(()=>Bundle,{onDelete:'CASCADE'}) @JoinColumn({name:'bundle_id'}) bundle:Bundle;
 @ManyToOne(()=>Course,{onDelete:'RESTRICT'}) @JoinColumn({name:'course_id'}) course:Course;
}
