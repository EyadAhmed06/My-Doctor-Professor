import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DeniedRoles } from '../auth/decorators/denied-roles.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { CreateEssayCaseDto, ReorderEssayCasesDto, SubmitEssayCaseDto, UpdateEssayCaseDto } from './essay-cases.dto';
import { EssayCasesService } from './essay-cases.service';
const uuid = new ParseUUIDPipe({ version: '4' });

@Controller('essay-cases')
@UseGuards(JwtAuthGuard, RolesGuard)
@DeniedRoles(UserRole.SYSTEM_ADMIN)
export class EssayCasesController {
  constructor(private readonly cases: EssayCasesService) {}
  @Get('courses') listCourses(@CurrentUser() actor: AuthenticatedUser) { return this.cases.listCourses(actor); }
  @Get() list(@Query('course_id', uuid) courseId: string, @CurrentUser() actor: AuthenticatedUser) { return this.cases.listCurriculum(courseId, actor); }
  @Get(':caseId') get(@Param('caseId', uuid) id: string, @CurrentUser() actor: AuthenticatedUser) { return this.cases.getCase(id, actor); }
  @Post() @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  create(@Body() dto: CreateEssayCaseDto, @CurrentUser() actor: AuthenticatedUser) { return this.cases.create(dto, actor); }
  @Put('order') @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  reorder(@Body() dto: ReorderEssayCasesDto, @CurrentUser() actor: AuthenticatedUser) { return this.cases.reorder(dto, actor); }
  @Put(':caseId') @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  update(@Param('caseId', uuid) id: string, @Body() dto: UpdateEssayCaseDto, @CurrentUser() actor: AuthenticatedUser) { return this.cases.update(id, dto, actor); }
  @Delete(':caseId') @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN) @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('caseId', uuid) id: string, @CurrentUser() actor: AuthenticatedUser) { return this.cases.remove(id, actor); }
  @Post(':caseId/submit') @Roles(UserRole.STUDENT)
  submit(@Param('caseId', uuid) id: string, @Body() dto: SubmitEssayCaseDto, @CurrentUser() actor: AuthenticatedUser) { return this.cases.submit(id, dto, actor); }
  @Post(':caseId/reveal') @Roles(UserRole.STUDENT)
  reveal(@Param('caseId', uuid) id: string, @CurrentUser() actor: AuthenticatedUser) { return this.cases.reveal(id, actor); }
}
