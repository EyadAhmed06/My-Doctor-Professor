import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Lecture } from './lecture.entity';

export enum ResourceType {
  PDF = 'PDF',
  VIDEO = 'VIDEO',
  IMAGE = 'IMAGE',
  LINK = 'LINK',
}

export enum UploadStatus {
  PENDING = 'PENDING',
  UPLOADING = 'UPLOADING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('resources')
@Index('idx_resources_lecture', ['lectureId'])
export class Resource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { nullable: false, name: 'lecture_id' })
  lectureId: string;

  @Column({ type: 'varchar', length: 150, nullable: false, name: 'resource_name' })
  resourceName: string;

  @Column({ type: 'enum', enum: ResourceType, nullable: false, name: 'resource_type' })
  resourceType: ResourceType;

  @Column({ type: 'text', nullable: false, name: 'file_url' })
  fileUrl: string;

  @Column({ type: 'bigint', nullable: true, name: 'file_size' })
  fileSize: number | null;

  @Column({ type: 'enum', enum: UploadStatus, nullable: false, default: UploadStatus.COMPLETED, name: 'upload_status' })
  uploadStatus: UploadStatus;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'int', nullable: false, default: 1, name: 'display_order' })
  displayOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Lecture, (lecture) => lecture.resources, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lecture_id' })
  lecture: Lecture;
}

