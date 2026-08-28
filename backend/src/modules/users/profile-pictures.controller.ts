import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common';
import { ProfilePictureStorageService } from './profile-picture-storage.service';

@Controller('profile-pictures')
export class ProfilePicturesController {
  constructor(private readonly storage: ProfilePictureStorageService) {}

  @Get(':key')
  @Header('Cache-Control', 'public, max-age=86400')
  @Header('X-Content-Type-Options', 'nosniff')
  async get(@Param('key') key: string) {
    const picture = await this.storage.read(key);
    return new StreamableFile(picture.buffer, {
      type: picture.contentType,
      length: picture.buffer.length,
      disposition: 'inline',
    });
  }
}
