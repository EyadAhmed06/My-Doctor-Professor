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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { AcademicAccessService } from './academic-access.service';
import { AcademicService } from './academic.service';
import {
  CourseQueryDto,
  CreateCourseDto,
  CreateLectureDto,
  CreateResourceDto,
  CreateSemesterDto,
  CreateTopicDto,
  CreateWeekDto,
  UpdateCourseDto,
  UpdateLectureDto,
  UpdateSemesterDto,
  UpdateTopicDto,
  UpdateWeekDto,
  UploadResourceDto,
} from './dtos/academic.dto';
import type { UploadedResourceFile } from './resource-storage.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@Controller('academic')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AcademicController {
  constructor(
    private readonly academic: AcademicService,
    private readonly access: AcademicAccessService,
  ) {}

  @Post('semesters')
  @Roles(UserRole.SYSTEM_ADMIN)
  createSemester(@Body() dto: CreateSemesterDto) {
    return this.academic.createSemester(dto);
  }

  @Get('semesters')
  listSemesters() {
    return this.academic.listSemesters();
  }

  @Get('semesters/:semesterId')
  getSemester(
    @Param('semesterId', uuid) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.academic.getSemester(id, user.role);
  }

  @Put('semesters/:semesterId')
  @Roles(UserRole.SYSTEM_ADMIN)
  updateSemester(
    @Param('semesterId', uuid) id: string,
    @Body() dto: UpdateSemesterDto,
  ) {
    return this.academic.updateSemester(id, dto);
  }

  @Delete('semesters/:semesterId')
  @Roles(UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSemester(@Param('semesterId', uuid) id: string): Promise<void> {
    await this.academic.deleteSemester(id);
  }

  @Post('semesters/:semesterId/courses')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  createCourse(
    @Param('semesterId', uuid) semesterId: string,
    @Body() dto: CreateCourseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.academic.createCourse(semesterId, dto, user);
  }

  @Get('courses')
  listCourses(
    @Query() query: CourseQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.academic.listCourses(query, user.role);
  }

  @Get('courses/:courseId')
  async getCourse(
    @Param('courseId', uuid) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.access.assertCourseReadable(id, user);
    return this.academic.getCourse(id, user.role);
  }

  @Get('courses/:courseId/instructors')
  @Roles(UserRole.SYSTEM_ADMIN)
  listCourseInstructors(@Param('courseId', uuid) courseId: string) {
    return this.academic.listCourseInstructors(courseId);
  }

  @Post('courses/:courseId/instructors/:instructorId')
  @Roles(UserRole.SYSTEM_ADMIN)
  assignCourseInstructor(
    @Param('courseId', uuid) courseId: string,
    @Param('instructorId', uuid) instructorId: string,
  ) {
    return this.academic.assignCourseInstructor(courseId, instructorId);
  }

  @Delete('courses/:courseId/instructors/:instructorId')
  @Roles(UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeCourseInstructor(
    @Param('courseId', uuid) courseId: string,
    @Param('instructorId', uuid) instructorId: string,
  ): Promise<void> {
    await this.academic.removeCourseInstructor(courseId, instructorId);
  }

  @Put('courses/:courseId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  updateCourse(
    @Param('courseId', uuid) id: string,
    @Body() dto: UpdateCourseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.academic.updateCourse(id, dto, user);
  }

  @Delete('courses/:courseId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCourse(
    @Param('courseId', uuid) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.academic.deleteCourse(id, user);
  }

  @Post('courses/:courseId/weeks')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  createWeek(
    @Param('courseId', uuid) courseId: string,
    @Body() dto: CreateWeekDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.academic.createWeek(courseId, dto, user);
  }

  @Get('courses/:courseId/weeks')
  async listWeeks(
    @Param('courseId', uuid) courseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.access.assertCourseReadable(courseId, user);
    return this.academic.listWeeks(courseId, user.role);
  }

  @Get('weeks/:weekId')
  async getWeek(
    @Param('weekId', uuid) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.access.assertWeekReadable(id, user);
    return this.academic.getWeek(id, user.role);
  }

  @Put('weeks/:weekId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  updateWeek(
    @Param('weekId', uuid) id: string,
    @Body() dto: UpdateWeekDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.academic.updateWeek(id, dto, user);
  }

  @Delete('weeks/:weekId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWeek(
    @Param('weekId', uuid) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.academic.deleteWeek(id, user);
  }

  @Post('weeks/:weekId/lectures')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  createLecture(
    @Param('weekId', uuid) weekId: string,
    @Body() dto: CreateLectureDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.academic.createLecture(weekId, dto, user);
  }

  @Get('weeks/:weekId/lectures')
  async listLectures(
    @Param('weekId', uuid) weekId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.access.assertWeekReadable(weekId, user);
    return this.academic.listLectures(weekId, user.role);
  }

  @Get('lectures/:lectureId')
  async getLecture(
    @Param('lectureId', uuid) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.access.assertLectureReadable(id, user);
    return this.academic.getLecture(id, user.role);
  }

  @Put('lectures/:lectureId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  updateLecture(
    @Param('lectureId', uuid) id: string,
    @Body() dto: UpdateLectureDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.academic.updateLecture(id, dto, user);
  }

  @Delete('lectures/:lectureId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLecture(
    @Param('lectureId', uuid) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.academic.deleteLecture(id, user);
  }

  @Post('lectures/:lectureId/topics')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  createTopic(
    @Param('lectureId', uuid) lectureId: string,
    @Body() dto: CreateTopicDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.academic.createTopic(lectureId, dto, user);
  }

  @Get('lectures/:lectureId/topics')
  async listTopics(
    @Param('lectureId', uuid) lectureId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.access.assertLectureReadable(lectureId, user);
    return this.academic.listTopics(lectureId, user.role);
  }

  @Get('topics/:topicId')
  async getTopic(
    @Param('topicId', uuid) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.access.assertTopicReadable(id, user);
    return this.academic.getTopic(id, user.role);
  }

  @Put('topics/:topicId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  updateTopic(
    @Param('topicId', uuid) id: string,
    @Body() dto: UpdateTopicDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.academic.updateTopic(id, dto, user);
  }

  @Delete('topics/:topicId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTopic(
    @Param('topicId', uuid) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.academic.deleteTopic(id, user);
  }

  @Post('lectures/:lectureId/resources')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  createResource(
    @Param('lectureId', uuid) lectureId: string,
    @Body() dto: CreateResourceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.academic.createResource(lectureId, dto, user);
  }

  @Post('lectures/:lectureId/resources/upload')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 52_428_800, files: 1 },
  }))
  uploadResource(
    @Param('lectureId', uuid) lectureId: string,
    @Body() dto: UploadResourceDto,
    @UploadedFile() file: UploadedResourceFile | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.academic.uploadResource(lectureId, dto, file, user);
  }

  @Get('resources/:resourceId/file')
  async downloadResource(
    @Param('resourceId', uuid) resourceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StreamableFile> {
    await this.access.assertResourceReadable(resourceId, user);
    const file = await this.academic.openResourceFile(resourceId, user.role);
    return new StreamableFile(file.stream, {
      type: file.mimeType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      length: file.size === null ? undefined : Number(file.size),
    });
  }

  @Get('lectures/:lectureId/resources')
  async listResources(
    @Param('lectureId', uuid) lectureId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.access.assertLectureReadable(lectureId, user);
    return this.academic.listResources(lectureId, user.role);
  }

  @Delete('resources/:resourceId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteResource(
    @Param('resourceId', uuid) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.academic.deleteResource(id, user);
  }
}
