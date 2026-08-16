import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { AssessmentAuthoringService } from './assessment-authoring.service';
import { AddTestQuestionDto, CreateTestDto, GeneratePracticeTestDto, GradeEssayDto, PracticeCatalogQueryDto, QuestionNoteDto, ReorderTestQuestionsDto, SaveAnswerDto, StartTestAttemptDto, TestQueryDto, UpdateTestDto } from './dtos/tests.dto';
import { McqPracticeService } from './mcq-practice.service';
import { TestsService } from './tests.service';

// Persisted/imported assessment data can contain any standards-compliant UUID version.
// PostgreSQL's uuid type does not require v4, so route parsing must not reject a valid
// question/option workflow merely because a historical/imported id is v1/v5/etc.
const uuid = new ParseUUIDPipe();

@Controller('tests')
@UseGuards(JwtAuthGuard,RolesGuard)
export class TestsController {
 constructor(private readonly tests:TestsService,private readonly authoring:AssessmentAuthoringService,private readonly mcqPractice:McqPracticeService){}

 @Post() @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN)
 create(@Body() dto:CreateTestDto,@CurrentUser() actor:AuthenticatedUser){return this.tests.create(dto,actor);}
 @Get()
 list(@Query() query:TestQueryDto,@CurrentUser() actor:AuthenticatedUser){return this.tests.list(query,actor);}
 @Get('practice/catalog') @Roles(UserRole.STUDENT)
 practiceCatalog(@Query() query:PracticeCatalogQueryDto,@CurrentUser() actor:AuthenticatedUser){return this.tests.practiceCatalog(query.bundle_id,query.course_id,actor);}
 @Post('practice/generate') @Roles(UserRole.STUDENT)
 generatePractice(@Body() dto:GeneratePracticeTestDto,@CurrentUser() actor:AuthenticatedUser){return this.mcqPractice.generate(dto,actor);}
 @Get(':testId')
 getOne(@Param('testId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){return this.tests.getOne(id,actor);}
 @Put(':testId') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN)
 update(@Param('testId',uuid) id:string,@Body() dto:UpdateTestDto,@CurrentUser() actor:AuthenticatedUser){return this.tests.update(id,dto,actor);}
 @Delete(':testId') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN) @HttpCode(HttpStatus.NO_CONTENT)
 async remove(@Param('testId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){await this.tests.remove(id,actor);}
 @Get(':testId/authoring-state') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN)
 authoringState(@Param('testId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){return this.authoring.getAuthoringState(id,actor);}
 @Post(':testId/duplicate') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN)
 duplicate(@Param('testId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){return this.authoring.duplicate(id,actor);}

 @Post(':testId/questions') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN)
 addQuestion(@Param('testId',uuid) id:string,@Body() dto:AddTestQuestionDto,@CurrentUser() actor:AuthenticatedUser){return this.tests.addQuestion(id,dto,actor);}
 @Get(':testId/questions')
 listQuestions(@Param('testId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){return this.tests.listQuestions(id,actor);}
 @Put(':testId/questions/reorder') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN)
 reorderQuestions(@Param('testId',uuid) id:string,@Body() dto:ReorderTestQuestionsDto,@CurrentUser() actor:AuthenticatedUser){return this.authoring.reorder(id,dto,actor);}
 @Delete(':testId/questions/:questionId') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN) @HttpCode(HttpStatus.NO_CONTENT)
 async removeQuestion(@Param('testId',uuid) testId:string,@Param('questionId',uuid) questionId:string,@CurrentUser() actor:AuthenticatedUser){await this.tests.removeQuestion(testId,questionId,actor);}

 @Get(':testId/attempts') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN)
 listAttempts(@Param('testId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){return this.tests.listAttempts(id,actor);}
 @Post(':testId/attempts') @Roles(UserRole.STUDENT)
 startAttempt(@Param('testId',uuid) id:string,@Body() dto:StartTestAttemptDto,@CurrentUser() actor:AuthenticatedUser){return this.tests.startAttempt(id,dto,actor);}

 @Get('attempts/:attemptId')
 getAttempt(@Param('attemptId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){return this.tests.getAttempt(id,actor);}
 @Put('attempts/:attemptId/answers/:questionId') @Roles(UserRole.STUDENT)
 saveAnswer(@Param('attemptId',uuid) attemptId:string,@Param('questionId',uuid) questionId:string,@Body() dto:SaveAnswerDto,@CurrentUser() actor:AuthenticatedUser){return this.tests.saveAnswer(attemptId,questionId,dto,actor);}
 @Post('attempts/:attemptId/submit') @Roles(UserRole.STUDENT)
 submit(@Param('attemptId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){return this.tests.submit(id,actor);}
 @Get('attempts/:attemptId/workspace-state')
 getWorkspaceState(@Param('attemptId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){return this.tests.getWorkspaceState(id,actor);}
 @Get('attempts/:attemptId/answers')
 getAnswers(@Param('attemptId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){return this.tests.getAnswers(id,actor);}
 @Get('attempts/:attemptId/review')
 getReview(@Param('attemptId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){return this.tests.getReview(id,actor);}

 @Post('attempts/:attemptId/flags/:questionId') @Roles(UserRole.STUDENT)
 flag(@Param('attemptId',uuid) attemptId:string,@Param('questionId',uuid) questionId:string,@CurrentUser() actor:AuthenticatedUser){return this.tests.flag(attemptId,questionId,actor);}
 @Delete('attempts/:attemptId/flags/:questionId') @Roles(UserRole.STUDENT) @HttpCode(HttpStatus.NO_CONTENT)
 async unflag(@Param('attemptId',uuid) attemptId:string,@Param('questionId',uuid) questionId:string,@CurrentUser() actor:AuthenticatedUser){await this.tests.unflag(attemptId,questionId,actor);}

 @Post('attempts/:attemptId/notes/:questionId') @Roles(UserRole.STUDENT)
 addNote(@Param('attemptId',uuid) attemptId:string,@Param('questionId',uuid) questionId:string,@Body() dto:QuestionNoteDto,@CurrentUser() actor:AuthenticatedUser){return this.tests.setNote(attemptId,questionId,dto,actor);}
 @Put('attempts/:attemptId/notes/:questionId') @Roles(UserRole.STUDENT)
 updateNote(@Param('attemptId',uuid) attemptId:string,@Param('questionId',uuid) questionId:string,@Body() dto:QuestionNoteDto,@CurrentUser() actor:AuthenticatedUser){return this.tests.setNote(attemptId,questionId,dto,actor);}
 @Delete('attempts/:attemptId/notes/:questionId') @Roles(UserRole.STUDENT) @HttpCode(HttpStatus.NO_CONTENT)
 async removeNote(@Param('attemptId',uuid) attemptId:string,@Param('questionId',uuid) questionId:string,@CurrentUser() actor:AuthenticatedUser){await this.tests.removeNote(attemptId,questionId,actor);}

 @Put('attempts/:attemptId/answers/:answerId/grade') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN)
 gradeEssay(@Param('attemptId',uuid) attemptId:string,@Param('answerId',uuid) answerId:string,@Body() dto:GradeEssayDto,@CurrentUser() actor:AuthenticatedUser){return this.tests.gradeEssay(attemptId,answerId,dto,actor);}
}