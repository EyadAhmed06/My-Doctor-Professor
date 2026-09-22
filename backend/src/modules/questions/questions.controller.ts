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
import { QuestionDifficulty } from '../../common/entities/question.entity';
import { AcademicAccessService } from '../academic/academic-access.service';
import type { UploadedResourceFile } from '../academic/resource-storage.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DeniedRoles } from '../auth/decorators/denied-roles.decorator';
import { RateLimit } from '../auth/decorators/rate-limit.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import {
  CreateMcqOptionDto,
  CreateQuestionDto,
  CreateTagDto,
  EnrichQuestionImportDto,
  EssayConfigurationDto,
  InspectQuestionImportDto,
  PublishQuestionImportDto,
  QuestionQueryDto,
  SearchQuestionsDto,
  UpdateMcqOptionDto,
  UpdateQuestionDto,
} from './dtos/questions.dto';
import { InstructorQuestionAccessService } from './instructor-question-access.service';
import { QuestionExplanationLifecycleService } from './question-explanation-lifecycle.service';
import { QuestionImportAiEnrichmentService } from './question-import-ai-enrichment.service';
import { QuestionImportService } from './question-import.service';
import { QuestionsService } from './questions.service';
import { StudentQuestionAccessService } from './student-question-access.service';

const uuid = new ParseUUIDPipe({ version: '4' });
const PDF_INSPECTOR_CONTRACT_VERSION = 7;

@Controller('questions')
@UseGuards(JwtAuthGuard, RolesGuard)
@DeniedRoles(UserRole.SYSTEM_ADMIN)
export class QuestionsController {
  constructor(
    private readonly questions: QuestionsService,
    private readonly studentQuestions: StudentQuestionAccessService,
    private readonly instructorQuestions: InstructorQuestionAccessService,
    private readonly access: AcademicAccessService,
    private readonly imports: QuestionImportService,
    private readonly importEnrichment: QuestionImportAiEnrichmentService,
    private readonly explanationLifecycle: QuestionExplanationLifecycleService,
  ) {}

  @Post()
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  async create(@Body() dto: CreateQuestionDto, @CurrentUser() actor: AuthenticatedUser) {
    if (actor.role === UserRole.INSTRUCTOR) await this.access.assertTopicReadable(dto.topic_id, actor);
    return this.questions.create(dto, actor);
  }

  @Get()
  list(@Query() query: QuestionQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    if (actor.role === UserRole.STUDENT) return this.studentQuestions.list(query, actor);
    if (actor.role === UserRole.INSTRUCTOR) return this.instructorQuestions.list(query, actor);
    return this.questions.list(query, actor);
  }

  @Get('search')
  search(@Query() query: SearchQuestionsDto, @CurrentUser() actor: AuthenticatedUser) {
    if (actor.role === UserRole.STUDENT) return this.studentQuestions.search(query, actor);
    if (actor.role === UserRole.INSTRUCTOR) return this.instructorQuestions.search(query, actor);
    return this.questions.search(query, actor);
  }

  @Get('tags/all')
  listTags() { return this.questions.listTags(); }

  @Post('tags')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  createTag(@Body() dto: CreateTagDto) { return this.questions.createTag(dto); }

  @RateLimit({ key: 'question-import-inspect', maximum: 10, windowSeconds: 3600 })
  @Post('imports/inspect')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024, files: 1 } }))
  async inspectImport(
    @Body() dto: InspectQuestionImportDto,
    @UploadedFile() file: UploadedResourceFile | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const inspection = await this.imports.inspectPdf(dto, file, actor);
    const candidates = inspection.candidates.map((candidate) => ({
      ...candidate,
      issues: candidate.issues.filter((issue) => issue.code !== 'NO_SOURCE_EXPLANATION'),
      ai_enrichment: null,
    }));
    return {
      ...inspection,
      inspector_contract_version: PDF_INSPECTOR_CONTRACT_VERSION,
      enrichment_contract: 'deferred-source-answer+question-explanation+four-or-five-option-explanations+difficulty',
      candidates,
    };
  }

  @RateLimit({ key: 'question-import-enrich', maximum: 120, windowSeconds: 3600 })
  @Post('imports/enrich')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  async enrichImport(@Body() dto: EnrichQuestionImportDto) {
    const inspection = {
      topic: { name: dto.topic_name ?? undefined },
      issues: [],
      force_ai_regeneration: Boolean(dto.force),
      candidates: dto.candidates.map((candidate) => ({
        candidate_id: candidate.candidate_id,
        question_text: candidate.question_text,
        options: candidate.options.map((option) => ({
          label: option.label,
          option_text: option.option_text,
          is_correct: option.is_correct,
          explanation: option.explanation?.trim() || null,
        })),
        explanation: candidate.explanation?.trim() || null,
        difficulty: candidate.difficulty ?? QuestionDifficulty.MEDIUM,
        status: 'VALID' as const,
        issues: [],
        source_section: candidate.source_section ?? null,
        ai_enrichment: candidate.ai_enrichment ? {
          provider: candidate.ai_enrichment.provider,
          model: candidate.ai_enrichment.model,
          prompt_version: candidate.ai_enrichment.prompt_version,
          content_hash: candidate.ai_enrichment.content_hash,
          confidence: candidate.ai_enrichment.confidence,
          answer_consistency: candidate.ai_enrichment.answer_consistency,
          status: candidate.ai_enrichment.status as 'GENERATED' | 'CACHED' | 'STALE' | 'FAILED' | 'FAILED_RETRYABLE' | 'FAILED_VALIDATION' | 'DEFERRED_BILLING' | undefined,
        } : null,
      })),
    };
    const enriched = await this.importEnrichment.enrichInspection(inspection);
    return {
      enrichment_contract: 'source-answer+question-explanation+four-or-five-option-explanations+difficulty',
      candidates: enriched.candidates,
      issues: enriched.issues,
      enrichment_summary: (enriched as typeof enriched & {
        enrichment_summary?: { generated: number; cached: number; failed: number; billing_deferred: number };
      }).enrichment_summary,
    };
  }

  @RateLimit({ key: 'question-import-publish', maximum: 20, windowSeconds: 3600 })
  @Post('imports/publish')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  publishImport(@Body() dto: PublishQuestionImportDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.imports.publish(dto, actor);
  }

  @Put('options/:optionId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  async updateOption(
    @Param('optionId', uuid) id: string,
    @Body() dto: UpdateMcqOptionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const questionId = await this.explanationLifecycle.questionIdForOption(id);
    const result = await this.questions.updateOption(id, dto, actor);
    if (questionId && (dto.option_text !== undefined || dto.is_correct !== undefined)) {
      await this.explanationLifecycle.invalidateQuestion(questionId);
    }
    return result;
  }

  @Delete('options/:optionId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeOption(@Param('optionId', uuid) id: string, @CurrentUser() actor: AuthenticatedUser): Promise<void> {
    const questionId = await this.explanationLifecycle.questionIdForOption(id);
    await this.questions.removeOption(id, actor);
    if (questionId) await this.explanationLifecycle.invalidateQuestion(questionId);
  }

  @Delete('tags/:tagId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeTag(@Param('tagId', uuid) id: string): Promise<void> { await this.questions.removeTag(id); }

  @Get(':questionId')
  async getOne(@Param('questionId', uuid) id: string, @CurrentUser() actor: AuthenticatedUser) {
    await this.assertQuestionRead(id, actor);
    return this.questions.getOne(id, actor);
  }

  @Put(':questionId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  async update(@Param('questionId', uuid) id: string, @Body() dto: UpdateQuestionDto, @CurrentUser() actor: AuthenticatedUser) {
    const result = await this.questions.update(id, dto, actor);
    if (dto.question_text !== undefined) {
      await this.explanationLifecycle.invalidateQuestion(id, dto.explanation !== undefined);
    }
    return result;
  }

  @Delete(':questionId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('questionId', uuid) id: string, @CurrentUser() actor: AuthenticatedUser): Promise<void> {
    await this.questions.remove(id, actor);
  }

  @Post(':questionId/duplicate')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  async duplicate(@Param('questionId', uuid) id: string, @CurrentUser() actor: AuthenticatedUser) {
    if (actor.role === UserRole.INSTRUCTOR) await this.access.assertQuestionManagedReadable(id, actor);
    return this.questions.duplicate(id, actor);
  }

  @Get(':questionId/options')
  async getOptions(@Param('questionId', uuid) id: string, @CurrentUser() actor: AuthenticatedUser) {
    await this.assertQuestionRead(id, actor);
    return this.questions.getOptions(id, actor);
  }

  @Post(':questionId/options')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  async createOption(@Param('questionId', uuid) id: string, @Body() dto: CreateMcqOptionDto, @CurrentUser() actor: AuthenticatedUser) {
    const result = await this.questions.addOption(id, dto, actor);
    await this.explanationLifecycle.invalidateQuestion(id);
    return result;
  }

  @Put(':questionId/essay-configuration')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  async configureEssay(@Param('questionId', uuid) id: string, @Body() dto: EssayConfigurationDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.questions.setEssayConfiguration(id, dto, actor);
  }

  @Post(':questionId/tags/:tagId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  async addTag(@Param('questionId', uuid) questionId: string, @Param('tagId', uuid) tagId: string, @CurrentUser() actor: AuthenticatedUser) {
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

  private async assertQuestionRead(questionId: string, actor: AuthenticatedUser): Promise<void> {
    if (actor.role === UserRole.STUDENT) await this.access.assertQuestionReadable(questionId, actor);
    else if (actor.role === UserRole.INSTRUCTOR) await this.access.assertQuestionManagedReadable(questionId, actor);
  }
}
