import { UserRole } from '../users/entities/user.entity';
import { Body, Controller, Delete, Get, NotImplementedException, Param, Patch, Post, Put, Query, UploadedFile, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('academic')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AcademicController {
  private pending(): never { throw new NotImplementedException('Academic workflow will be implemented after DTO contracts'); }

  @Post('semesters') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN) createSemester(@Body() _body: unknown) { return this.pending(); }
  @Get('semesters') listSemesters() { return this.pending(); }
  @Get('semesters/:semesterId') getSemester(@Param('semesterId') _id: string) { return this.pending(); }
  @Put('semesters/:semesterId') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN) updateSemester(@Param('semesterId') _id:string,@Body() _body:unknown){return this.pending();}
  @Delete('semesters/:semesterId') @Roles(UserRole.SYSTEM_ADMIN) deleteSemester(@Param('semesterId') _id:string){return this.pending();}

  @Post('semesters/:semesterId/courses') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN) createCourse(@Param('semesterId') _id:string,@Body() _body:unknown){return this.pending();}
  @Get('courses') listCourses(@Query() _query:Record<string,string>){return this.pending();}
  @Get('courses/:courseId') getCourse(@Param('courseId') _id:string){return this.pending();}
  @Put('courses/:courseId') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN) updateCourse(@Param('courseId') _id:string,@Body() _body:unknown){return this.pending();}
  @Delete('courses/:courseId') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN) deleteCourse(@Param('courseId') _id:string){return this.pending();}

  @Post('courses/:courseId/weeks') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN) createWeek(@Param('courseId') _id:string,@Body() _body:unknown){return this.pending();}
  @Get('courses/:courseId/weeks') listWeeks(@Param('courseId') _id:string){return this.pending();}
  @Get('weeks/:weekId') getWeek(@Param('weekId') _id:string){return this.pending();}
  @Put('weeks/:weekId') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN) updateWeek(@Param('weekId') _id:string,@Body() _body:unknown){return this.pending();}
  @Delete('weeks/:weekId') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN) deleteWeek(@Param('weekId') _id:string){return this.pending();}

  @Post('weeks/:weekId/lectures') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN) createLecture(@Param('weekId') _id:string,@Body() _body:unknown){return this.pending();}
  @Get('weeks/:weekId/lectures') listLectures(@Param('weekId') _id:string){return this.pending();}
  @Get('lectures/:lectureId') getLecture(@Param('lectureId') _id:string){return this.pending();}
  @Put('lectures/:lectureId') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN) updateLecture(@Param('lectureId') _id:string,@Body() _body:unknown){return this.pending();}
  @Delete('lectures/:lectureId') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN) deleteLecture(@Param('lectureId') _id:string){return this.pending();}

  @Post('lectures/:lectureId/topics') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN) createTopic(@Param('lectureId') _id:string,@Body() _body:unknown){return this.pending();}
  @Get('lectures/:lectureId/topics') listTopics(@Param('lectureId') _id:string){return this.pending();}
  @Get('topics/:topicId') getTopic(@Param('topicId') _id:string){return this.pending();}
  @Put('topics/:topicId') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN) updateTopic(@Param('topicId') _id:string,@Body() _body:unknown){return this.pending();}
  @Delete('topics/:topicId') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN) deleteTopic(@Param('topicId') _id:string){return this.pending();}

  @Post('lectures/:lectureId/resources') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN) createResource(@Param('lectureId') _id:string,@Body() _body:unknown){return this.pending();}
  @Get('lectures/:lectureId/resources') listResources(@Param('lectureId') _id:string){return this.pending();}
  @Delete('resources/:resourceId') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN) deleteResource(@Param('resourceId') _id:string){return this.pending();}
}
