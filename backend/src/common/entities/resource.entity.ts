import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Lecture } from './lecture.entity';

export enum ResourceType { PDF = 'PDF', VIDEO = 'VIDEO', IMAGE = 'IMAGE', LINK = 'LINK' }
export enum UploadStatus { UPLOADED = 'UPLOADED', PROCESSING = 'PROCESSING', COMPLETED = 'COMPLETED', FAILED = 'FAILED' }

@Entity('resources')
@Index('idx_resources_lecture', ['lectureId'])
@Index('idx_resources_type', ['resourceType'])
export class Resource {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid', { name: 'lecture_id' }) lectureId: string;
  @Column({ type: 'varchar', length: 200, name: 'resource_name' }) resourceName: string;
  @Column({ type: 'enum', enum: ResourceType, enumName: 'resource_type', name: 'resource_type' }) resourceType: ResourceType;
  @Column({ type: 'enum', enum: UploadStatus, enumName: 'upload_status', default: UploadStatus.UPLOADED, name: 'upload_status' }) uploadStatus: UploadStatus;
  @Column({ type: 'text', name: 'file_url' }) fileUrl: string;
  @Column({ type: 'bigint', nullable: true, name: 'file_size' }) fileSize: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true, name: 'storage_key' }) storageKey: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true, name: 'original_filename' }) originalFilename: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true, name: 'mime_type' }) mimeType: string | null;
  @Column({ type: 'char', length: 64, nullable: true, name: 'checksum_sha256' }) checksumSha256: string | null;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @ManyToOne(() => Lecture, (lecture) => lecture.resources, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'lecture_id' }) lecture: Lecture;
}
