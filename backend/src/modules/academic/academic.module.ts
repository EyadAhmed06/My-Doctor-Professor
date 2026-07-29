import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from '../../common/entities/course.entity';
import { Lecture } from '../../common/entities/lecture.entity';
import { Resource } from '../../common/entities/resource.entity';
import { Semester } from '../../common/entities/semester.entity';
import { Topic } from '../../common/entities/topic.entity';
import { Week } from '../../common/entities/week.entity';
import { AcademicController } from './academic.controller';
import { AcademicService } from './academic.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Semester,
      Course,
      Week,
      Lecture,
      Topic,
      Resource,
    ]),
  ],
  controllers: [AcademicController],
  providers: [AcademicService],
  exports: [AcademicService, TypeOrmModule],
})
export class AcademicModule {}
