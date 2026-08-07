import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from '../../common/entities/course.entity';
import { Lecture } from '../../common/entities/lecture.entity';
import { Question } from '../../common/entities/question.entity';
import { StudentCourseProgress } from '../../common/entities/student-course-progress.entity';
import { StudentLectureProgress } from '../../common/entities/student-lecture-progress.entity';
import { StudentQuestionProgress } from '../../common/entities/student-question-progress.entity';
import { StudentTopicProgress } from '../../common/entities/student-topic-progress.entity';
import { Topic } from '../../common/entities/topic.entity';
import { AcademicModule } from '../academic/academic.module';
import { Student } from '../users/entities/student.entity';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

@Module({
 imports:[AcademicModule,TypeOrmModule.forFeature([
  StudentCourseProgress,StudentLectureProgress,StudentTopicProgress,
  StudentQuestionProgress,Course,Lecture,Topic,Question,Student,
 ])],
 controllers:[ProgressController],
 providers:[ProgressService],
 exports:[ProgressService,TypeOrmModule],
})
export class ProgressModule {}
