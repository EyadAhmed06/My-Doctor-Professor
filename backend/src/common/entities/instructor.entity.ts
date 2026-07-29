import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from './user.entity';
import { InstructorAvailability } from './instructor-availability.entity';

@Entity('instructors')
export class Instructor {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  specialization: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'office_location' })
  officeLocation: string | null;

  @Column({ type: 'text', nullable: true })
  biography: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => InstructorAvailability, (avail) => avail.instructor, { cascade: true })
  availability: InstructorAvailability[];
}

