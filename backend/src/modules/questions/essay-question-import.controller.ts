import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { UploadedResourceFile } from '../academic/resource-storage.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RateLimit } from '../auth/decorators/rate-limit.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { InspectEssayQuestionImportDto, PublishEssayQuestionImportDto } from './dtos/essay-question-import.dto';
import { EssayQuestionImportService } from './essay-question-import.service';
import { EssayImportSessionsService } from './essay-import-sessions.service';

@Controller('questions/imports/essay')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EssayQuestionImportController {
  constructor(private readonly imports: EssayQuestionImportService, private readonly sessions: EssayImportSessionsService) {}

  @RateLimit({ key: 'essay-import-inspect', maximum: 10, windowSeconds: 3600 })
  @Post('inspect')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024, files: 1 } }))
  inspect(
    @Body() dto: InspectEssayQuestionImportDto,
    @UploadedFile() file: UploadedResourceFile | undefined,
  ) {
    const standaloneType = dto.content_type === 'CASE' ? 'CASE' : 'LECTURE';
    return /\.(json|txt)$/i.test(file?.originalname || '')
      ? this.imports.inspectJson(dto.copyright_confirmed, file, standaloneType)
      : this.imports.inspectPdf(dto.copyright_confirmed, file, standaloneType);
  }

  @RateLimit({ key: 'essay-import-session-inspect', maximum: 10, windowSeconds: 3600 })
  @Post('sessions/inspect')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024, files: 1 } }))
  async inspectSession(
    @Body() dto: InspectEssayQuestionImportDto,
    @UploadedFile() file: UploadedResourceFile | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const kind = dto.content_type === 'CASE' ? 'CASE' : 'LECTURE';
    const inspection = /\.(json|txt)$/i.test(file?.originalname || '')
      ? await this.imports.inspectJson(dto.copyright_confirmed, file, kind)
      : await this.imports.inspectPdf(dto.copyright_confirmed, file, kind);
    return this.sessions.create(actor.userId, inspection);
  }

  @Get('sessions')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  listSessions(@CurrentUser() actor: AuthenticatedUser) {
    return this.sessions.list(actor.userId);
  }

  @Get('sessions/:sessionId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  getSession(@CurrentUser() actor: AuthenticatedUser, @Param('sessionId', new ParseUUIDPipe({version:'4'})) id: string) {
    return this.sessions.metadata(actor.userId, id);
  }

  @Get('sessions/:sessionId/candidates')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  getSessionCandidates(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('sessionId', new ParseUUIDPipe({version:'4'})) id: string,
    @Query('offset') offset = '0',
    @Query('limit') limit = '100',
  ) {
    return this.sessions.candidates(actor.userId, id, Number(offset), Number(limit));
  }

  @Put('sessions/:sessionId/review')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  saveSessionReview(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('sessionId', new ParseUUIDPipe({version:'4'})) id: string,
    @Body() body: { revision: number; review: unknown },
  ) {
    return this.sessions.saveReview(actor.userId, id, body?.revision, body?.review);
  }

  @Delete('sessions/:sessionId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  deleteSession(@CurrentUser() actor: AuthenticatedUser, @Param('sessionId', new ParseUUIDPipe({version:'4'})) id: string) {
    return this.sessions.delete(actor.userId, id);
  }

  // Large essay imports are safely split into 100-question requests. Allow multiple
  // imports and retry batches without exhausting an hourly allowance after one file.
  @RateLimit({ key: 'essay-import-publish', maximum: 60, windowSeconds: 3600 })
  @Post('publish')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  publish(@Body() dto: PublishEssayQuestionImportDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.imports.publish(dto, actor);
  }
}

