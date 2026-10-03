import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises';
import { join } from 'path';

export type StoredProfilePicture = {
  key: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  buffer: Buffer;
};

type DetectedImage = {
  contentType: StoredProfilePicture['contentType'];
  extension: 'jpg' | 'png' | 'webp';
};

@Injectable()
export class ProfilePictureStorageService {
  readonly maxBytes: number;
  private readonly directory: string;

  constructor(private readonly config: ConfigService) {
    const uploadRoot = this.config.get<string>('FILE_UPLOAD_PATH')?.trim() || join(process.cwd(), 'uploads');
    this.directory = join(uploadRoot, 'profile-pictures');
    const configured = Number(this.config.get<string | number>('PROFILE_PICTURE_MAX_BYTES') ?? 5 * 1024 * 1024);
    this.maxBytes = Number.isSafeInteger(configured) && configured > 0 && configured <= 10 * 1024 * 1024
      ? configured
      : 5 * 1024 * 1024;
  }

  async store(buffer: Buffer, declaredContentType: string | undefined): Promise<string> {
    if (!buffer.length) throw new BadRequestException('Profile picture is empty');
    if (buffer.length > this.maxBytes) throw new BadRequestException(`Profile picture must be ${Math.floor(this.maxBytes / 1024 / 1024)} MB or smaller`);

    const detected = this.detectImage(buffer);
    if (!detected) throw new BadRequestException('Only JPEG, PNG, and WebP profile pictures are allowed');
    const normalizedDeclared = String(declaredContentType || '').split(';')[0].trim().toLowerCase();
    if (normalizedDeclared && normalizedDeclared !== detected.contentType) {
      throw new BadRequestException('Profile picture content does not match its declared content type');
    }

    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const key = `${randomBytes(24).toString('hex')}.${detected.extension}`;
    const temporary = join(this.directory, `.${key}.tmp`);
    const destination = join(this.directory, key);
    await writeFile(temporary, buffer, { mode: 0o600, flag: 'wx' });
    await rename(temporary, destination);
    return key;
  }

  async read(key: string): Promise<StoredProfilePicture> {
    const detected = this.contentTypeFromKey(key);
    if (!detected) throw new NotFoundException('Profile picture not found');
    try {
      return {
        key,
        contentType: detected,
        buffer: await readFile(join(this.directory, key)),
      };
    } catch {
      throw new NotFoundException('Profile picture not found');
    }
  }

  async deleteByUrl(url: string | null | undefined): Promise<void> {
    const key = this.keyFromManagedUrl(url);
    if (!key) return;
    try {
      await unlink(join(this.directory, key));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw error;
    }
  }

  publicUrl(key: string): string {
    return `/api/v1/profile-pictures/${key}`;
  }

  private keyFromManagedUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const match = url.match(/^\/api\/v1\/profile-pictures\/([a-f0-9]{48}\.(?:jpg|png|webp))$/);
    return match?.[1] ?? null;
  }

  private contentTypeFromKey(key: string): StoredProfilePicture['contentType'] | null {
    if (!/^[a-f0-9]{48}\.(?:jpg|png|webp)$/.test(key)) return null;
    if (key.endsWith('.jpg')) return 'image/jpeg';
    if (key.endsWith('.png')) return 'image/png';
    if (key.endsWith('.webp')) return 'image/webp';
    return null;
  }

  private detectImage(buffer: Buffer): DetectedImage | null {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { contentType: 'image/jpeg', extension: 'jpg' };
    }
    if (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      return { contentType: 'image/png', extension: 'png' };
    }
    if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return { contentType: 'image/webp', extension: 'webp' };
    }
    return null;
  }
}
