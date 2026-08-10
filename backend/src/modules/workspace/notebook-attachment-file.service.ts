import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { NotebookAttachment } from '../../common/entities/notebook-attachment.entity';
import { NotebookNote } from '../../common/entities/notebook-note.entity';
import { ResourceType } from '../../common/entities/resource.entity';
import { ResourceStorageService, type UploadedResourceFile } from '../academic/resource-storage.service';

@Injectable()
export class NotebookAttachmentFileService {
  constructor(
    @InjectRepository(NotebookNote) private readonly notes: Repository<NotebookNote>,
    @InjectRepository(NotebookAttachment) private readonly attachments: Repository<NotebookAttachment>,
    private readonly storage: ResourceStorageService,
  ) {}

  async upload(userId: string, noteId: string, file: UploadedResourceFile | undefined) {
    await this.requireOwnedNote(userId, noteId);
    const type = this.resourceTypeFor(file);
    const id = randomUUID();
    const stored = await this.storage.store(id, type, file);
    const attachment = this.attachments.create({
      id,
      noteId,
      kind: type === ResourceType.IMAGE ? 'IMAGE' : 'RESOURCE',
      fileName: stored.originalFilename,
      mimeType: stored.mimeType,
      fileUrl: `managed:${stored.storageKey}`,
      sizeBytes: String(stored.size),
    });
    try {
      return await this.attachments.save(attachment);
    } catch (error) {
      await this.storage.remove(stored.storageKey);
      throw error;
    }
  }

  async open(userId: string, noteId: string, attachmentId: string) {
    await this.requireOwnedNote(userId, noteId);
    const attachment = await this.requireAttachment(noteId, attachmentId);
    const storageKey = this.managedStorageKey(attachment);
    if (!storageKey) throw new NotFoundException('This attachment is an external link');
    return {
      stream: await this.storage.open(storageKey),
      filename: attachment.fileName,
      mimeType: attachment.mimeType,
      size: attachment.sizeBytes,
    };
  }

  async remove(userId: string, noteId: string, attachmentId: string) {
    await this.requireOwnedNote(userId, noteId);
    const attachment = await this.requireAttachment(noteId, attachmentId);
    const storageKey = this.managedStorageKey(attachment);
    if (storageKey) await this.storage.remove(storageKey);
    await this.attachments.remove(attachment);
  }

  async removeManagedFilesForNote(userId: string, noteId: string) {
    await this.requireOwnedNote(userId, noteId);
    const rows = await this.attachments.find({ where: { noteId } });
    for (const attachment of rows) {
      const storageKey = this.managedStorageKey(attachment);
      if (storageKey) await this.storage.remove(storageKey);
    }
  }

  private resourceTypeFor(file: UploadedResourceFile | undefined): ResourceType {
    if (!file?.buffer?.length) throw new BadRequestException('Choose a file to attach');
    if (file.mimetype === 'application/pdf') return ResourceType.PDF;
    if (['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) return ResourceType.IMAGE;
    if (['video/mp4', 'video/webm'].includes(file.mimetype)) return ResourceType.VIDEO;
    throw new BadRequestException('Allowed attachments: PDF, PNG, JPEG, WebP, MP4, and WebM');
  }

  private async requireOwnedNote(userId: string, noteId: string) {
    const note = await this.notes.findOne({ where: { id: noteId, userId } });
    if (!note) throw new NotFoundException('Notebook note not found');
    return note;
  }

  private async requireAttachment(noteId: string, attachmentId: string) {
    const attachment = await this.attachments.findOne({ where: { id: attachmentId, noteId } });
    if (!attachment) throw new NotFoundException('Notebook attachment not found');
    return attachment;
  }

  private managedStorageKey(attachment: NotebookAttachment): string | null {
    return attachment.fileUrl.startsWith('managed:') ? attachment.fileUrl.slice('managed:'.length) : null;
  }
}
