import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { QuestionDifficulty } from '../../../common/entities/question.entity';

const BooleanForm = () => Transform(({ value }) => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
});

export class InspectEssayQuestionImportDto {
  @BooleanForm() @IsBoolean() copyright_confirmed: boolean;
}

export class PublishEssayImportCandidateDto {
  @IsBoolean() approved: boolean;
  @IsUUID() topic_id: string;
  @IsString() @IsNotEmpty() case_label: string;
  @IsString() @IsNotEmpty() @MaxLength(30000) case_stem: string;
  @IsString() @IsNotEmpty() @MaxLength(10000) question_text: string;
  @IsString() @IsNotEmpty() @MaxLength(30000) model_answer: string;
  @IsOptional() @IsString() @MaxLength(20000) grading_rubric?: string;
  @IsEnum(QuestionDifficulty) difficulty: QuestionDifficulty;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999.99) marks: number;
  @IsOptional() @IsInt() @Min(1) source_page?: number;
  @IsOptional() @IsInt() @Min(1) answer_page?: number;
  @IsOptional() @IsUUID() reuse_question_id?: string;
  @IsOptional() @IsBoolean() allow_duplicate?: boolean;
}

export class PublishEssayQuestionImportDto {
  @IsString() @IsNotEmpty() @MaxLength(255) original_filename: string;
  @IsString() @IsNotEmpty() @MaxLength(64) file_sha256: string;
  @IsBoolean() copyright_confirmed: boolean;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PublishEssayImportCandidateDto)
  candidates: PublishEssayImportCandidateDto[];
}
