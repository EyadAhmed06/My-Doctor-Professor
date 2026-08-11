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
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { BundlesService } from './bundles.service';
import {
  AssignInstructorDto,
  BundleCatalogQueryDto,
  BundleResourceDto,
  ChangeBundleStatusDto,
  ConfirmBundlePaymentDto,
  CreateBundleDto,
  EnrollByCodeDto,
  GrantBundleDto,
  UpdateBundleDto,
} from './dtos/bundle.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

@Controller('catalog/bundles')
export class PublicBundlesController {
  constructor(private readonly bundles: BundlesService) {}

  @Get()
  catalog(@Query() query: BundleCatalogQueryDto) {
    return this.bundles.catalog(query.academic_year);
  }
}

@Controller('bundles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BundlesController {
  constructor(private readonly bundles: BundlesService) {}

  @Post()
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateBundleDto) {
    return this.bundles.create(actor, dto);
  }

  @Get('mine')
  @Roles(UserRole.STUDENT)
  mine(@CurrentUser() actor: AuthenticatedUser) {
    return this.bundles.mine(actor.userId);
  }

  @Get('managed')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  managed(@CurrentUser() actor: AuthenticatedUser) {
    return this.bundles.managed(actor);
  }

  @Post('enroll')
  @Roles(UserRole.STUDENT)
  enroll(@CurrentUser() actor: AuthenticatedUser, @Body() dto: EnrollByCodeDto) {
    return this.bundles.enrollByCode(actor.userId, dto.code);
  }

  @Post(':bundleId/enroll')
  @Roles(UserRole.STUDENT)
  enrollPublic(
    @Param('bundleId', uuid) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.bundles.enrollPublic(id, actor.userId);
  }

  @Get(':bundleId/management')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  management(
    @Param('bundleId', uuid) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.bundles.management(id, actor);
  }

  @Get(':bundleId')
  get(
    @Param('bundleId', uuid) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.bundles.getAccessible(id, actor);
  }

  @Get(':bundleId/content')
  getContent(
    @Param('bundleId', uuid) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.bundles.getContent(id, actor);
  }

  @Put(':bundleId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  update(
    @Param('bundleId', uuid) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateBundleDto,
  ) {
    return this.bundles.update(id, actor, dto);
  }

  @Put(':bundleId/status')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  changeStatus(
    @Param('bundleId', uuid) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: ChangeBundleStatusDto,
  ) {
    return this.bundles.changeStatus(id, actor, dto.status);
  }

  @Post(':bundleId/courses')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  addCourse(
    @Param('bundleId', uuid) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: BundleResourceDto,
  ) {
    return this.bundles.addCourse(id, actor, dto.resource_id);
  }

  @Delete(':bundleId/courses/:courseId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeCourse(
    @Param('bundleId', uuid) id: string,
    @Param('courseId', uuid) resourceId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.bundles.removeCourse(id, actor, resourceId);
  }

  @Post(':bundleId/weeks')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  addWeek(
    @Param('bundleId', uuid) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: BundleResourceDto,
  ) {
    return this.bundles.addWeek(id, actor, dto.resource_id);
  }

  @Delete(':bundleId/weeks/:weekId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeWeek(
    @Param('bundleId', uuid) id: string,
    @Param('weekId', uuid) resourceId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.bundles.removeWeek(id, actor, resourceId);
  }

  @Post(':bundleId/tests')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  addTest(
    @Param('bundleId', uuid) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: BundleResourceDto,
  ) {
    return this.bundles.addTest(id, actor, dto.resource_id);
  }

  @Delete(':bundleId/tests/:testId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTest(
    @Param('bundleId', uuid) id: string,
    @Param('testId', uuid) resourceId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.bundles.removeTest(id, actor, resourceId);
  }

  @Post(':bundleId/instructors')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  assignInstructor(
    @Param('bundleId', uuid) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: AssignInstructorDto,
  ) {
    return this.bundles.assignInstructor(id, actor, dto.instructor_id);
  }

  @Delete(':bundleId/instructors/:instructorId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeInstructor(
    @Param('bundleId', uuid) id: string,
    @Param('instructorId', uuid) instructorId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.bundles.removeInstructor(id, actor, instructorId);
  }

  @Post(':bundleId/enrollments')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  grant(
    @Param('bundleId', uuid) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: GrantBundleDto,
  ) {
    return this.bundles.grant(id, actor, dto);
  }

  @Post(':bundleId/enrollments/:studentId/confirm-payment')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  confirmPayment(
    @Param('bundleId', uuid) id: string,
    @Param('studentId', uuid) studentId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: ConfirmBundlePaymentDto,
  ) {
    return this.bundles.confirmPayment(id, actor, studentId, dto);
  }

  @Delete(':bundleId/enrollments/:studentId')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @Param('bundleId', uuid) id: string,
    @Param('studentId', uuid) studentId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.bundles.revoke(id, actor, studentId);
  }
}
