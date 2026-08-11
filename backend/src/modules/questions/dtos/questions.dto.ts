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
import {
  QuestionDifficulty,
  QuestionType,
} from '../../../common/entities/question.entity';

const BooleanQuery = () =>
  Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  });

export class CreateQuestionDto {
  @IsUUID() topic_id: string;
  @IsEnum(QuestionType) question_type: QuestionType;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsString() @IsNotEmpty() question_text: string;
  @IsOptional() @IsString() explanation?: string;
  @IsOptional() @IsString() hint?: string;
  @IsOptional() @IsString() reference?: string;
  @IsEnum(QuestionDifficulty) difficulty: QuestionDifficulty;
  @IsOptional() @IsInt() @Min(1) estimated_time_seconds?: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999.99) marks: number;
}

export class UpdateQuestionDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @IsNotEmpty() question_text?: string;
  @IsOptional() @IsString() explanation?: string;
  @IsOptional() @IsString() hint?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsEnum(QuestionDifficulty) difficulty?: QuestionDifficulty;
  @IsOptional() @IsInt() @Min(1) estimated_time_seconds?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999.99)
  marks?: number;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

export class QuestionQueryDto {
  @IsOptional() @IsUUID() topic_id?: string;
  @IsOptional() @IsEnum(QuestionType) question_type?: QuestionType;
  @IsOptional() @IsEnum(QuestionDifficulty) difficulty?: QuestionDifficulty;
  @IsOptional() @IsUUID() tag_id?: string;
  @IsOptional() @BooleanQuery() @IsBoolean() is_active?: boolean;
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;
}

export class SearchQuestionsDto {
  @IsString() @IsNotEmpty() @MaxLength(200) q: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;
}

export class CreateMcqOptionDto {
  @IsString() @IsNotEmpty() option_text: string;
  @IsBoolean() is_correct: boolean;
  @IsInt() @Min(1) display_order: number;
}

export class UpdateMcqOptionDto {
  @IsOptional() @IsString() @IsNotEmpty() option_text?: string;
  @IsOptional() @IsBoolean() is_correct?: boolean;
  @IsOptional() @IsInt() @Min(1) display_order?: number;
}

export class EssayConfigurationDto {
  @IsOptional() @IsInt() @Min(0) minimum_word_count?: number;
  @IsOptional() @IsInt() @Min(1) maximum_word_count?: number;
  @IsOptional() @IsString() @IsNotEmpty() model_answer?: string;
  @IsOptional() @IsString() @IsNotEmpty() grading_rubric?: string;
}

export class CreateTagDto {
  @IsString() @IsNotEmpty() @MaxLength(100) tag_name: string;
}

export class InspectQuestionImportDto {
  @IsUUID() topic_id: string;
  @BooleanQuery() @IsBoolean() copyright_confirmed: boolean;
}

export class PublishImportedOptionDto {
  @IsString() @IsNotEmpty() @MaxLength(2000) option_text: string;
  @IsBoolean() is_correct: boolean;
}

export class PublishImportedQuestionDto {
  @IsBoolean() approved: boolean;
  @IsString() @IsNotEmpty() question_text: string;
  @IsString() @IsNotEmpty() explanation: string;
  @IsEnum(QuestionDifficulty) difficulty: QuestionDifficulty;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999.99) marks: number;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => PublishImportedOptionDto)
  options: PublishImportedOptionDto[];
  @IsOptional() @IsInt() @Min(1) source_page?: number;
  @IsOptional() @IsUUID() reuse_question_id?: string;
  @IsOptional() @IsBoolean() allow_topic_override?: boolean;
  @IsOptional() @IsBoolean() allow_duplicate?: boolean;
}

export class PublishQuestionImportDto {
  @IsUUID() topic_id: string;
  @IsString() @IsNotEmpty() @MaxLength(255) original_filename: string;
  @IsString() @IsNotEmpty() @MaxLength(64) file_sha256: string;
  @IsBoolean() copyright_confirmed: boolean;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PublishImportedQuestionDto)
  candidates: PublishImportedQuestionDto[];
}
