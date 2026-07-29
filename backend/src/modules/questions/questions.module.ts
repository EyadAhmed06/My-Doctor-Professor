import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EssayConfiguration } from '../../common/entities/essay-configuration.entity';
import { McqOption } from '../../common/entities/mcq-option.entity';
import { Question } from '../../common/entities/question.entity';
import { QuestionTag } from '../../common/entities/question-tag.entity';
import { Tag } from '../../common/entities/tag.entity';
import { Topic } from '../../common/entities/topic.entity';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Question,
      McqOption,
      EssayConfiguration,
      Tag,
      QuestionTag,
      Topic,
    ]),
  ],
  controllers: [QuestionsController],
  providers: [QuestionsService],
  exports: [QuestionsService, TypeOrmModule],
})
export class QuestionsModule {}
