import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from '../../common/entities/course.entity';
import { Lecture } from '../../common/entities/lecture.entity';
import { McqOption } from '../../common/entities/mcq-option.entity';
import { QuestionFlag } from '../../common/entities/question-flag.entity';
import { QuestionNote } from '../../common/entities/question-note.entity';
import { Question } from '../../common/entities/question.entity';
import { StudentAnswer } from '../../common/entities/student-answer.entity';
import { TestAttempt } from '../../common/entities/test-attempt.entity';
import { TestQuestion } from '../../common/entities/test-question.entity';
import { Test } from '../../common/entities/test.entity';
import { Week } from '../../common/entities/week.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { Student } from '../users/entities/student.entity';
import { AssessmentAuthoringService } from './assessment-authoring.service';
import { TestLaunchController } from './test-launch.controller';
import { TestsController } from './tests.controller';
import { TestsService } from './tests.service';

@Module({
 imports:[NotificationsModule,TypeOrmModule.forFeature([
  Test,TestQuestion,TestAttempt,StudentAnswer,QuestionFlag,QuestionNote,
  Question,McqOption,Course,Week,Lecture,Student,
 ])],
 controllers:[TestsController,TestLaunchController],
 providers:[TestsService,AssessmentAuthoringService],
 exports:[TestsService,TypeOrmModule],
})
export class TestsModule {}
