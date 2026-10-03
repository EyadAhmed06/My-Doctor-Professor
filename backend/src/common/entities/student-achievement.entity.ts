import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';

@Entity('student_achievements')
@Index('uq_student_achievement_code', ['studentId', 'achievementCode'], { unique: true })
@Index('idx_student_achievements_unlocked', ['studentId', 'unlockedAt'])
export class StudentAchievement {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column('uuid', { name: 'student_id' }) studentId: string;

  @Column({ type: 'varchar', length: 80, name: 'achievement_code' }) achievementCode: string;

  @Column({ type: 'timestamp', name: 'unlocked_at', default: () => 'CURRENT_TIMESTAMP' }) unlockedAt: Date;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: User;
}
