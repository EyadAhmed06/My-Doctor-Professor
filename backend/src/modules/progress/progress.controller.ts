import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { AnalyticsQueryDto, BookmarkQuestionDto, DashboardQueryDto, UpdateLectureProgressDto } from './dtos/progress.dto';
import { ProgressService } from './progress.service';
const uuid=new ParseUUIDPipe({version:'4'});

@Controller()
@UseGuards(JwtAuthGuard,RolesGuard)
export class ProgressController {
 constructor(private readonly progress:ProgressService){}

 @Get('progress/courses') @Roles(UserRole.STUDENT)
 listCourseProgress(@CurrentUser() actor:AuthenticatedUser){return this.progress.listCourseProgress(actor.userId);}
 @Get('progress/courses/:courseId') @Roles(UserRole.STUDENT)
 getCourseProgress(@Param('courseId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){return this.progress.getCourseProgress(id,actor.userId);}
 @Get('progress/lectures/:lectureId') @Roles(UserRole.STUDENT)
 getLectureProgress(@Param('lectureId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){return this.progress.getLectureProgress(id,actor.userId);}
 @Put('progress/lectures/:lectureId') @Roles(UserRole.STUDENT)
 updateLectureProgress(@Param('lectureId',uuid) id:string,@Body() dto:UpdateLectureProgressDto,@CurrentUser() actor:AuthenticatedUser){return this.progress.updateLectureProgress(id,dto,actor.userId);}
 @Get('progress/topics/:topicId') @Roles(UserRole.STUDENT)
 getTopicProgress(@Param('topicId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){return this.progress.getTopicProgress(id,actor.userId);}
 @Get('progress/questions/:questionId') @Roles(UserRole.STUDENT)
 getQuestionProgress(@Param('questionId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){return this.progress.getQuestionProgress(id,actor.userId);}
 @Put('progress/questions/:questionId/bookmark') @Roles(UserRole.STUDENT)
 bookmarkQuestion(@Param('questionId',uuid) id:string,@Body() dto:BookmarkQuestionDto,@CurrentUser() actor:AuthenticatedUser){return this.progress.bookmarkQuestion(id,dto,actor.userId);}

 @Get('dashboard/student') @Roles(UserRole.STUDENT)
 studentDashboard(@CurrentUser() actor:AuthenticatedUser){return this.progress.studentDashboard(actor.userId);}
 @Get('dashboard/instructor') @Roles(UserRole.INSTRUCTOR)
 instructorDashboard(@Query() query:DashboardQueryDto,@CurrentUser() actor:AuthenticatedUser){return this.progress.instructorDashboard(actor,query);}
 @Get('dashboard/admin') @Roles(UserRole.SYSTEM_ADMIN)
 adminDashboard(){return this.progress.adminDashboard();}

 @Get('analytics/questions') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN)
 questionAnalytics(@Query() query:AnalyticsQueryDto,@CurrentUser() actor:AuthenticatedUser){return this.progress.questionAnalytics(actor,query);}
 @Get('analytics/tests') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN)
 testAnalytics(@Query() query:AnalyticsQueryDto,@CurrentUser() actor:AuthenticatedUser){return this.progress.testAnalytics(actor,query);}
 @Get('analytics/performance') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN)
 performanceAnalytics(@Query() query:AnalyticsQueryDto,@CurrentUser() actor:AuthenticatedUser){return this.progress.performanceAnalytics(actor,query);}
 @Get('analytics/student') @Roles(UserRole.STUDENT)
 studentAnalytics(@CurrentUser() actor:AuthenticatedUser,@Query() query:AnalyticsQueryDto){return this.progress.studentAnalytics(actor.userId,query);}
}
