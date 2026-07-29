import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EssayConfiguration } from '../../common/entities/essay-configuration.entity';
import { McqOption } from '../../common/entities/mcq-option.entity';
import { Question } from '../../common/entities/question.entity';
import { QuestionTag } from '../../common/entities/question-tag.entity';
import { Tag } from '../../common/entities/tag.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Question, McqOption, EssayConfiguration, Tag, QuestionTag])],
  exports: [TypeOrmModule],
})
export class QuestionsModule {}
