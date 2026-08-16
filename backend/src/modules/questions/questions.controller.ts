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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { UploadedResourceFile } from '../academic/resource-storage.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import {
  CreateMcqOptionDto,
  CreateQuestionDto,
  CreateTagDto,
  EssayConfigurationDto,
  InspectQuestionImportDto,
  PublishQuestionImportDto,
  QuestionQueryDto,
  SearchQuestionsDto,
  UpdateMcqOptionDto,
  UpdateQuestionDto,
} from './dtos/questions.dto';
import { QuestionImportEnrichmentService } from './question-import-enrichment.service';
import { QuestionImportService } from './question-import.service';
import { QuestionsService } from './questions.service';

const uuid = new ParseUUIDPipe({ version: '4' });
const PDF_INSPECTOR_CONTRACT_VERSION = 3;

@Controller('questions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuestionsController {
  constructor(
    private readonly questions: QuestionsService,
    private readonly imports: QuestionImportService,
    private readonly importEnrichment: QuestionImportEnrichmentService,
  ) {}

  @Post()
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  create(
    @Body() dto: CreateQuestionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.questions.create(dto, actor);
  }

  @Get()
  list(
    @Query() query: QuestionQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.questions.list(query, actor);
  }

  @Get('search')
  search(
    @Query() query: SearchQuestionsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.questions.search(query, actor);
  }

  @Get('tags/all')
  listTags() {
    return this.questions.listTags();
  }

  @Post('tags')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  createTag(@Body() dto: CreateTagDto) {
    return this.questions.createTag(dto);
  }

  @Post('imports/inspect')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  }))
  async inspectImport(
    @Body() dto: InspectQuestionImportDto,
    @UploadedFile() file: UploadedResourceFile | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const inspection = await this.imports.inspectPdf(dto, file, actor);
    const enriched = await this.importEnrichment.enrichInspection(inspection, file);

    const candidates = enriched.candidates.map((candidate) => ({
      ...candidate,
      issues: candidate.issues.filter((issue) => issue.code !== 'NO_SOURCE_EXPLANATION'),
    }));

    return {
      ...enriched,
      inspector_contract_version: PDF_INSPECTOR_CONTRACT_VERSION,
      enrichment_contract: 'answer+explanation+difficulty',
      candidates,
    };
  }

  @Post('imports/publish')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  publishImport(
    @Body() dto: PublishQuestionImportDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.imports.publish(dto, actor);
  }

  @Put('options/:optionId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  updateOption(
    @Param('optionId', uuid) id: string,
    @Body() dto: UpdateMcqOptionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.questions.updateOption(id, dto, actor);
  }

  @Delete('options/:optionId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeOption(
    @Param('optionId', uuid) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.questions.removeOption(id, actor);
  }

  @Delete('tags/:tagId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeTag(@Param('tagId', uuid) id: string): Promise<void> {
    await this.questions.removeTag(id);
  }

  @Get(':questionId')
  getOne(
    @Param('questionId', uuid) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.questions.getOne(id, actor);
  }

  @Put(':questionId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  update(
    @Param('questionId', uuid) id: string,
    @Body() dto: UpdateQuestionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.questions.update(id, dto, actor);
  }

  @Delete(':questionId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('questionId', uuid) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.questions.remove(id, actor);
  }

  @Post(':questionId/duplicate')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  duplicate(
    @Param('questionId', uuid) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.questions.duplicate(id, actor);
  }

  @Get(':questionId/options')
  getOptions(
    @Param('questionId', uuid) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.questions.getOptions(id, actor);
  }

  @Post(':questionId/options')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  addOption(
    @Param('questionId', uuid) id: string,
    @Body() dto: CreateMcqOptionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.questions.addOption(id, dto, actor);
  }

  @Post(':questionId/essay-configuration')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  setEssayConfiguration(
    @Param('questionId', uuid) id: string,
    @Body() dto: EssayConfigurationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.questions.setEssayConfiguration(id, dto, actor);
  }

  @Get(':questionId/essay-configuration')
  getEssayConfiguration(
    @Param('questionId', uuid) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.questions.getEssayConfiguration(id, actor);
  }

  @Post(':questionId/tags/:tagId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  addTag(
    @Param('questionId', uuid) questionId: string,
    @Param('tagId', uuid) tagId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.questions.addTag(questionId, tagId, actor);
  }

  @Delete(':questionId/tags/:tagId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeQuestionTag(
    @Param('questionId', uuid) questionId: string,
    @Param('tagId', uuid) tagId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.questions.removeQuestionTag(questionId, tagId, actor);
  }
}
