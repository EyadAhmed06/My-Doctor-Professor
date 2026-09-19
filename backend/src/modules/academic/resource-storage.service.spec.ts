import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ResourceType } from '../../common/entities/resource.entity';
import { ResourceStorageService } from './resource-storage.service';

describe('ResourceStorageService', () => {
  let directory: string;
  let service: ResourceStorageService;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'mdp-resource-'));
    service = new ResourceStorageService(new ConfigService({
      FILE_UPLOAD_PATH: directory,
      MAX_FILE_SIZE: 1024,
    }));
    await service.onModuleInit();
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('stores verified PDF content and records a checksum', async () => {
    const buffer = Buffer.from('%PDF-1.7\ncontent');
    const stored = await service.store(
      '11111111-1111-4111-8111-111111111111',
      ResourceType.PDF,
      {
        originalname: 'lecture.pdf',
        mimetype: 'application/pdf',
        size: buffer.length,
        buffer,
      },
    );
    expect(stored.storageKey).toBe('11111111-1111-4111-8111-111111111111.pdf');
    expect(stored.checksum).toHaveLength(64);
    await expect(readFile(join(directory, stored.storageKey))).resolves.toEqual(buffer);
  });

  it('rejects a file whose bytes do not match its declared type', async () => {
    await expect(service.store(
      '11111111-1111-4111-8111-111111111111',
      ResourceType.PDF,
      {
        originalname: 'fake.pdf',
        mimetype: 'application/pdf',
        size: 4,
        buffer: Buffer.from('fake'),
      },
    )).rejects.toThrow('not a valid PDF');
  });

  it('rejects files above the configured limit', async () => {
    const buffer = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(1024)]);
    await expect(service.store(
      '11111111-1111-4111-8111-111111111111',
      ResourceType.PDF,
      {
        originalname: 'large.pdf',
        mimetype: 'application/pdf',
        size: buffer.length,
        buffer,
      },
    )).rejects.toThrow('maximum file size');
  });
});
