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
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
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
} from './dtos/academic.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

@Controller('academic')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AcademicController {
  constructor(private readonly academic: AcademicService) {}

  @Post('semesters')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  createSemester(@Body() dto: CreateSemesterDto) {
    return this.academic.createSemester(dto);
  }

  @Get('semesters')
  listSemesters() {
    return this.academic.listSemesters();
  }

  @Get('semesters/:semesterId')
  getSemester(@Param('semesterId', uuid) id: string) {
    return this.academic.getSemester(id);
  }

  @Put('semesters/:semesterId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
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
  ) {
    return this.academic.createCourse(semesterId, dto);
  }

  @Get('courses')
  listCourses(
    @Query() query: CourseQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.academic.listCourses(query, user.role);
  }

  @Get('courses/:courseId')
  getCourse(
    @Param('courseId', uuid) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.academic.getCourse(id, user.role);
  }

  @Put('courses/:courseId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  updateCourse(
    @Param('courseId', uuid) id: string,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.academic.updateCourse(id, dto);
  }

  @Delete('courses/:courseId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCourse(@Param('courseId', uuid) id: string): Promise<void> {
    await this.academic.deleteCourse(id);
  }

  @Post('courses/:courseId/weeks')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  createWeek(
    @Param('courseId', uuid) courseId: string,
    @Body() dto: CreateWeekDto,
  ) {
    return this.academic.createWeek(courseId, dto);
  }

  @Get('courses/:courseId/weeks')
  listWeeks(
    @Param('courseId', uuid) courseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.academic.listWeeks(courseId, user.role);
  }

  @Get('weeks/:weekId')
  getWeek(
    @Param('weekId', uuid) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.academic.getWeek(id, user.role);
  }

  @Put('weeks/:weekId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  updateWeek(
    @Param('weekId', uuid) id: string,
    @Body() dto: UpdateWeekDto,
  ) {
    return this.academic.updateWeek(id, dto);
  }

  @Delete('weeks/:weekId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWeek(@Param('weekId', uuid) id: string): Promise<void> {
    await this.academic.deleteWeek(id);
  }

  @Post('weeks/:weekId/lectures')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  createLecture(
    @Param('weekId', uuid) weekId: string,
    @Body() dto: CreateLectureDto,
  ) {
    return this.academic.createLecture(weekId, dto);
  }

  @Get('weeks/:weekId/lectures')
  listLectures(
    @Param('weekId', uuid) weekId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.academic.listLectures(weekId, user.role);
  }

  @Get('lectures/:lectureId')
  getLecture(
    @Param('lectureId', uuid) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.academic.getLecture(id, user.role);
  }

  @Put('lectures/:lectureId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  updateLecture(
    @Param('lectureId', uuid) id: string,
    @Body() dto: UpdateLectureDto,
  ) {
    return this.academic.updateLecture(id, dto);
  }

  @Delete('lectures/:lectureId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLecture(@Param('lectureId', uuid) id: string): Promise<void> {
    await this.academic.deleteLecture(id);
  }

  @Post('lectures/:lectureId/topics')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  createTopic(
    @Param('lectureId', uuid) lectureId: string,
    @Body() dto: CreateTopicDto,
  ) {
    return this.academic.createTopic(lectureId, dto);
  }

  @Get('lectures/:lectureId/topics')
  listTopics(
    @Param('lectureId', uuid) lectureId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.academic.listTopics(lectureId, user.role);
  }

  @Get('topics/:topicId')
  getTopic(
    @Param('topicId', uuid) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.academic.getTopic(id, user.role);
  }

  @Put('topics/:topicId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  updateTopic(
    @Param('topicId', uuid) id: string,
    @Body() dto: UpdateTopicDto,
  ) {
    return this.academic.updateTopic(id, dto);
  }

  @Delete('topics/:topicId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTopic(@Param('topicId', uuid) id: string): Promise<void> {
    await this.academic.deleteTopic(id);
  }

  @Post('lectures/:lectureId/resources')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  createResource(
    @Param('lectureId', uuid) lectureId: string,
    @Body() dto: CreateResourceDto,
  ) {
    return this.academic.createResource(lectureId, dto);
  }

  @Get('lectures/:lectureId/resources')
  listResources(
    @Param('lectureId', uuid) lectureId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.academic.listResources(lectureId, user.role);
  }

  @Delete('resources/:resourceId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteResource(@Param('resourceId', uuid) id: string): Promise<void> {
    await this.academic.deleteResource(id);
  }
}
