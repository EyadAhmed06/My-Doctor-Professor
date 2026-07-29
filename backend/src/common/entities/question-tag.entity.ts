import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Question } from './question.entity';
import { Tag } from './tag.entity';

@Entity('question_tags')
export class QuestionTag {
  @PrimaryColumn('uuid', { name: 'question_id' }) questionId: string;
  @PrimaryColumn('uuid', { name: 'tag_id' }) tagId: string;
  @ManyToOne(() => Question, (question) => question.questionTags, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'question_id' }) question: Question;
  @ManyToOne(() => Tag, (tag) => tag.questionTags, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'tag_id' }) tag: Tag;
}
