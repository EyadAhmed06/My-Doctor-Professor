import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuestionFlag } from '../../common/entities/question-flag.entity';
import { QuestionNote } from '../../common/entities/question-note.entity';
import { StudentAnswer } from '../../common/entities/student-answer.entity';
import { TestAttempt } from '../../common/entities/test-attempt.entity';
import { TestQuestion } from '../../common/entities/test-question.entity';
import { Test } from '../../common/entities/test.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Test, TestQuestion, TestAttempt, StudentAnswer, QuestionFlag, QuestionNote])],
  exports: [TypeOrmModule],
})
export class TestsModule {}
