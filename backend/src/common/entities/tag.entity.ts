import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { QuestionTag } from './question-tag.entity';

@Entity('tags')
export class Tag {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 100, name: 'tag_name', unique: true }) tagName: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @OneToMany(() => QuestionTag, (questionTag) => questionTag.tag) questionTags: QuestionTag[];
}
