import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import type { McqExplanationResult } from '../../modules/questions/openrouter-question-enrichment.service';

@Entity('question_ai_enrichment_cache')
@Unique('uq_question_ai_enrichment_signature', ['provider', 'model', 'promptVersion', 'contentHash'])
@Index('idx_question_ai_enrichment_content_hash', ['contentHash'])
export class QuestionAiEnrichmentCache {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 32 }) provider: string;
  @Column({ type: 'varchar', length: 160 }) model: string;
  @Column({ type: 'varchar', length: 160, name: 'prompt_version' }) promptVersion: string;
  @Column({ type: 'varchar', length: 64, name: 'content_hash' }) contentHash: string;
  @Column({ type: 'jsonb', name: 'result_json' }) result: McqExplanationResult;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
