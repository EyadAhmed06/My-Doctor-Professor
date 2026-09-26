import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Course } from './course.entity';

@Entity('semesters')
@Index('idx_semesters_number', ['semesterNumber'])
export class Semester {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'int', name: 'semester_number', unique: true }) semesterNumber: number;
  @Column({ type: 'varchar', length: 100, nullable: true }) title: string | null;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @OneToMany(() => Course, (course) => course.semester) courses: Course[];
}
