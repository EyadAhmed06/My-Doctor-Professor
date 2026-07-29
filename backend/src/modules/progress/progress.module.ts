import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentCourseProgress } from '../../common/entities/student-course-progress.entity';
import { StudentLectureProgress } from '../../common/entities/student-lecture-progress.entity';
import { StudentQuestionProgress } from '../../common/entities/student-question-progress.entity';
import { StudentTopicProgress } from '../../common/entities/student-topic-progress.entity';

@Module({
  imports: [TypeOrmModule.forFeature([StudentCourseProgress, StudentLectureProgress, StudentTopicProgress, StudentQuestionProgress])],
  exports: [TypeOrmModule],
})
export class ProgressModule {}
