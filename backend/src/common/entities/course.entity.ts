import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Semester } from './semester.entity';
import { Week } from './week.entity';

@Entity('courses')
@Index('idx_courses_semester', ['semesterId'])
@Index('idx_courses_name', ['courseName'])
export class Course {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid', { name: 'semester_id' }) semesterId: string;
  @Column({ type: 'varchar', length: 20, name: 'course_code', unique: true }) courseCode: string;
  @Column({ type: 'varchar', length: 150, name: 'course_name' }) courseName: string;
  @Column({ type: 'varchar', length: 150, unique: true }) slug: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'int', nullable: true, name: 'credit_hours' }) creditHours: number | null;
  @Column({ type: 'boolean', default: true, name: 'is_active' }) isActive: boolean;
  @Column({ type: 'int', default: 1, name: 'display_order' }) displayOrder: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @ManyToOne(() => Semester, (semester) => semester.courses, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'semester_id' }) semester: Semester;
  @OneToMany(() => Week, (week) => week.course) weeks: Week[];
}
