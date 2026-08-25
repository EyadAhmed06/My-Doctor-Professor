import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { UploadedResourceFile } from '../academic/resource-storage.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RateLimit } from '../auth/decorators/rate-limit.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import {
  AddNotebookAttachmentDto,
  ConvertNoteToFlashcardDto,
  CreateNotebookNoteDto,
  DrugReferenceQueryDto,
  NotebookQueryDto,
  SaveDrugReferenceDto,
  SaveNotebookCollectionDto,
  SaveNotebookTagDto,
  StudyPlanCalendarQueryDto,
  UpdateDrugReferenceDto,
  UpdateNotebookCollectionDto,
  UpdateNotebookNoteDto,
  UpdateStudyPlanDto,
  UpdateStudyPlanItemDto,
} from './dtos/workspace.dto';
import { NotebookAttachmentFileService } from './notebook-attachment-file.service';
import { StudyPlanItemActionsService } from './study-plan-item-actions.service';
import { WorkspaceService } from './workspace.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkspaceController {
  constructor(
    private readonly workspace: WorkspaceService,
    private readonly studyPlanActions: StudyPlanItemActionsService,
    private readonly notebookFiles: NotebookAttachmentFileService,
  ) {}

  @Get('notebook/notes')
  listNotes(@CurrentUser() actor: AuthenticatedUser, @Query() query: NotebookQueryDto) {
    return this.workspace.listNotes(actor.userId, query);
  }

  @Get('notebook/notes/:noteId')
  getNote(@CurrentUser() actor: AuthenticatedUser, @Param('noteId', uuid) id: string) {
    return this.workspace.getNote(actor.userId, id);
  }

  @Post('notebook/notes')
  createNote(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateNotebookNoteDto) {
    return this.workspace.createNote(actor.userId, dto);
  }

  @Put('notebook/notes/:noteId')
  updateNote(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('noteId', uuid) id: string,
    @Body() dto: UpdateNotebookNoteDto,
  ) {
    return this.workspace.updateNote(actor.userId, id, dto);
  }

  @Delete('notebook/notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeNote(@CurrentUser() actor: AuthenticatedUser, @Param('noteId', uuid) id: string) {
    await this.notebookFiles.removeManagedFilesForNote(actor.userId, id);
    await this.workspace.removeNote(actor.userId, id);
  }

  @Post('notebook/notes/:noteId/attachments')
  addAttachment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('noteId', uuid) id: string,
    @Body() dto: AddNotebookAttachmentDto,
  ) {
    return this.workspace.addAttachment(actor.userId, id, dto);
  }

  @Post('notebook/notes/:noteId/attachments/upload')
  @RateLimit({
    key: 'notebook-attachment-upload',
    maximum: 20,
    windowSeconds: 3600,
    scope: 'user',
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 52_428_800, files: 1 } }))
  uploadAttachment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('noteId', uuid) noteId: string,
    @UploadedFile() file: UploadedResourceFile | undefined,
  ) {
    return this.notebookFiles.upload(actor.userId, noteId, file);
  }

  @Get('notebook/notes/:noteId/attachments/:attachmentId/file')
  async downloadAttachment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('noteId', uuid) noteId: string,
    @Param('attachmentId', uuid) attachmentId: string,
  ): Promise<StreamableFile> {
    const file = await this.notebookFiles.open(actor.userId, noteId, attachmentId);
    return new StreamableFile(file.stream, {
      type: file.mimeType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      length: file.size === null ? undefined : Number(file.size),
    });
  }

  @Delete('notebook/notes/:noteId/attachments/:attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeAttachment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('noteId', uuid) noteId: string,
    @Param('attachmentId', uuid) attachmentId: string,
  ) {
    await this.notebookFiles.remove(actor.userId, noteId, attachmentId);
  }

  @Post('notebook/notes/:noteId/flashcard')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  convertToFlashcard(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('noteId', uuid) id: string,
    @Body() dto: ConvertNoteToFlashcardDto,
  ) {
    return this.workspace.convertToFlashcard(actor, id, dto);
  }

  @Get('notebook/collections')
  listCollections(@CurrentUser() actor: AuthenticatedUser) {
    return this.workspace.listCollections(actor.userId);
  }

  @Post('notebook/collections')
  createCollection(@CurrentUser() actor: AuthenticatedUser, @Body() dto: SaveNotebookCollectionDto) {
    return this.workspace.createCollection(actor.userId, dto);
  }

  @Put('notebook/collections/:collectionId')
  updateCollection(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('collectionId', uuid) id: string,
    @Body() dto: UpdateNotebookCollectionDto,
  ) {
    return this.workspace.updateCollection(actor.userId, id, dto);
  }

  @Delete('notebook/collections/:collectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeCollection(@CurrentUser() actor: AuthenticatedUser, @Param('collectionId', uuid) id: string) {
    await this.workspace.removeCollection(actor.userId, id);
  }

  @Get('notebook/tags')
  listTags(@CurrentUser() actor: AuthenticatedUser) {
    return this.workspace.listTags(actor.userId);
  }

  @Post('notebook/tags')
  createTag(@CurrentUser() actor: AuthenticatedUser, @Body() dto: SaveNotebookTagDto) {
    return this.workspace.createTag(actor.userId, dto);
  }

  @Delete('notebook/tags/:tagId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeTag(@CurrentUser() actor: AuthenticatedUser, @Param('tagId', uuid) id: string) {
    await this.workspace.removeTag(actor.userId, id);
  }

  @Get('study-plan')
  @Roles(UserRole.STUDENT)
  getPlan(@CurrentUser() actor: AuthenticatedUser) {
    return this.workspace.getPlan(actor.userId);
  }

  @Put('study-plan')
  @Roles(UserRole.STUDENT)
  updatePlan(@CurrentUser() actor: AuthenticatedUser, @Body() dto: UpdateStudyPlanDto) {
    return this.workspace.updatePlan(actor.userId, dto);
  }

  @Post('study-plan/preview')
  @Roles(UserRole.STUDENT)
  previewPlan(@CurrentUser() actor: AuthenticatedUser) {
    return this.studyPlanActions.preview(actor.userId);
  }

  @Post('study-plan/generate')
  @Roles(UserRole.STUDENT)
  generatePlan(@CurrentUser() actor: AuthenticatedUser) {
    return this.studyPlanActions.generate(actor.userId);
  }

  @Get('study-plan/calendar')
  @Roles(UserRole.STUDENT)
  getCalendar(@CurrentUser() actor: AuthenticatedUser, @Query() query: StudyPlanCalendarQueryDto) {
    return this.workspace.getCalendar(actor.userId, query);
  }

  @Get('study-plan/readiness')
  @Roles(UserRole.STUDENT)
  readiness(@CurrentUser() actor: AuthenticatedUser) {
    return this.workspace.readiness(actor.userId);
  }

  @Put('study-plan/items/:itemId')
  @Roles(UserRole.STUDENT)
  updatePlanItem(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('itemId', uuid) id: string,
    @Body() dto: UpdateStudyPlanItemDto,
  ) {
    return this.studyPlanActions.update(actor.userId, id, dto);
  }

  @Get('drug-references')
  listDrugs(@CurrentUser() actor: AuthenticatedUser, @Query() query: DrugReferenceQueryDto) {
    return this.workspace.listDrugs(actor, query);
  }

  @Get('drug-references/:slug')
  getDrug(@CurrentUser() actor: AuthenticatedUser, @Param('slug') slug: string) {
    return this.workspace.getDrug(actor, slug);
  }

  @Post('drug-references')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  createDrug(@CurrentUser() actor: AuthenticatedUser, @Body() dto: SaveDrugReferenceDto) {
    return this.workspace.createDrug(actor, dto);
  }

  @Put('drug-references/:drugId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  updateDrug(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('drugId', uuid) id: string,
    @Body() dto: UpdateDrugReferenceDto,
  ) {
    return this.workspace.updateDrug(actor, id, dto);
  }
}
