import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { mkdir, stat, unlink, writeFile } from 'fs/promises';
import { extname, resolve, sep } from 'path';
import { ResourceType } from '../../common/entities/resource.entity';

export interface UploadedResourceFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface StoredResourceFile {
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  checksum: string;
}

@Injectable()
export class ResourceStorageService implements OnModuleInit {
  private readonly root: string;
  private readonly maximumSize: number;

  constructor(private readonly config: ConfigService) {
    this.root = resolve(this.config.get<string>('FILE_UPLOAD_PATH', './uploads'));
    this.maximumSize = Number(this.config.get<number>('MAX_FILE_SIZE', 52_428_800));
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  async store(
    resourceId: string,
    type: ResourceType,
    file: UploadedResourceFile | undefined,
  ): Promise<StoredResourceFile> {
    if (!file?.buffer?.length) throw new BadRequestException('A non-empty file is required');
    if (file.size > this.maximumSize) {
      throw new BadRequestException('Resource exceeds the configured maximum file size');
    }
    if (type === ResourceType.LINK) {
      throw new BadRequestException('LINK resources use the URL metadata endpoint');
    }

    const detected = this.detect(file.buffer);
    const allowed = this.allowedMimeTypes(type);
    if (!detected || !allowed.includes(detected.mimeType)) {
      throw new BadRequestException(`Uploaded content is not a valid ${type} file`);
    }
    if (file.mimetype && file.mimetype !== detected.mimeType) {
      throw new BadRequestException('Declared file type does not match uploaded content');
    }

    const storageKey = `${resourceId}${detected.extension}`;
    const destination = this.resolveKey(storageKey);
    await writeFile(destination, file.buffer, { flag: 'wx', mode: 0o600 });
    return {
      storageKey,
      originalFilename: this.safeFilename(file.originalname, detected.extension),
      mimeType: detected.mimeType,
      size: file.size,
      checksum: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }

  async open(storageKey: string) {
    const location = this.resolveKey(storageKey);
    try {
      const details = await stat(location);
      if (!details.isFile()) throw new NotFoundException('Resource file not found');
      return createReadStream(location);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new NotFoundException('Resource file not found');
    }
  }

  async remove(storageKey: string | null): Promise<void> {
    if (!storageKey) return;
    try {
      await unlink(this.resolveKey(storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private resolveKey(storageKey: string): string {
    if (!/^[0-9a-f-]{36}\.(pdf|png|jpe?g|webp|mp4|webm)$/.test(storageKey)) {
      throw new BadRequestException('Invalid resource storage key');
    }
    const location = resolve(this.root, storageKey);
    if (!location.startsWith(this.root + sep)) {
      throw new BadRequestException('Invalid resource storage path');
    }
    return location;
  }

  private allowedMimeTypes(type: ResourceType): string[] {
    if (type === ResourceType.PDF) return ['application/pdf'];
    if (type === ResourceType.IMAGE) return ['image/png', 'image/jpeg', 'image/webp'];
    if (type === ResourceType.VIDEO) return ['video/mp4', 'video/webm'];
    return [];
  }

  private detect(buffer: Buffer): { mimeType: string; extension: string } | null {
    if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
      return { mimeType: 'application/pdf', extension: '.pdf' };
    }
    if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
      return { mimeType: 'image/png', extension: '.png' };
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { mimeType: 'image/jpeg', extension: '.jpg' };
    }
    if (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return { mimeType: 'image/webp', extension: '.webp' };
    }
    if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
      return { mimeType: 'video/mp4', extension: '.mp4' };
    }
    if (buffer.subarray(0, 4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))) {
      return { mimeType: 'video/webm', extension: '.webm' };
    }
    return null;
  }

  private safeFilename(value: string, extension: string): string {
    const base = value.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180);
    const withoutExtension = base.slice(0, Math.max(1, base.length - extname(base).length));
    return `${withoutExtension || 'resource'}${extension}`;
  }
}
