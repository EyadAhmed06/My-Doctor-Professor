import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseInstructor } from '../../common/entities/course-instructor.entity';
import { Course } from '../../common/entities/course.entity';
import { Lecture } from '../../common/entities/lecture.entity';
import { Resource } from '../../common/entities/resource.entity';
import { Semester } from '../../common/entities/semester.entity';
import { Topic } from '../../common/entities/topic.entity';
import { Week } from '../../common/entities/week.entity';
import { AcademicAccessService } from './academic-access.service';
import { AcademicController } from './academic.controller';
import { AcademicService } from './academic.service';
import { ResourceStorageService } from './resource-storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Semester,
      Course,
      CourseInstructor,
      Week,
      Lecture,
      Topic,
      Resource,
    ]),
  ],
  controllers: [AcademicController],
  providers: [AcademicService, AcademicAccessService, ResourceStorageService],
  exports: [AcademicService, AcademicAccessService, TypeOrmModule],
})
export class AcademicModule {}
