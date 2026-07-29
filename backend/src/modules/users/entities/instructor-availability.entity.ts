import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Instructor } from './instructor.entity';

@Entity('instructor_availability')
@Index('idx_instructor_availability', ['instructorId'])
export class InstructorAvailability {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { nullable: false, name: 'instructor_id' })
  instructorId: string;

  @Column({ type: 'smallint', nullable: false, name: 'day_of_week' })
  dayOfWeek: number;

  @Column({ type: 'time', nullable: false, name: 'start_time' })
  startTime: string;

  @Column({ type: 'time', nullable: false, name: 'end_time' })
  endTime: string;

  @ManyToOne(() => Instructor, (instructor) => instructor.availability, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'instructor_id' })
  instructor: Instructor;
}


