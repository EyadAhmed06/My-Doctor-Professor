import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ProfilePictureStorageService } from './profile-picture-storage.service';

describe('ProfilePictureStorageService', () => {
  let directory: string;
  let service: ProfilePictureStorageService;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'mdp-profile-picture-'));
    service = new ProfilePictureStorageService({
      get: jest.fn((key: string) => key === 'FILE_UPLOAD_PATH' ? directory : undefined),
    } as never);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('stores a PNG under a random opaque key and serves it with the detected type', async () => {
    const png = Buffer.concat([
      Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),
      Buffer.from('profile-image-content'),
    ]);

    const key = await service.store(png, 'image/png');
    const stored = await service.read(key);

    expect(key).toMatch(/^[a-f0-9]{48}\.png$/);
    expect(service.publicUrl(key)).toBe(`/api/v1/profile-pictures/${key}`);
    expect(stored.contentType).toBe('image/png');
    expect(stored.buffer.equals(png)).toBe(true);
  });

  it('rejects SVG and other content that only claims to be an image', async () => {
    await expect(service.store(Buffer.from('<svg><script>alert(1)</script></svg>'), 'image/png'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects declared MIME types that disagree with image magic bytes', async () => {
    const jpeg = Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10]);
    await expect(service.store(jpeg, 'image/png')).rejects.toThrow('does not match');
  });

  it('deletes only managed opaque profile-picture URLs', async () => {
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.from('data')]);
    const key = await service.store(webp, 'image/webp');
    await service.deleteByUrl(service.publicUrl(key));
    await expect(service.read(key)).rejects.toBeInstanceOf(NotFoundException);

    await expect(service.deleteByUrl('https://accounts.google.com/avatar.jpg')).resolves.toBeUndefined();
  });
});
