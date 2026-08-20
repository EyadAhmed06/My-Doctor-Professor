import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';

export class CaseQuestionDto {
  @IsOptional() @IsUUID() id?: string;
  @IsString() @IsNotEmpty() prompt: string;
  @IsString() @IsNotEmpty() model_answer: string;
}

export class CreateEssayCaseDto {
  @IsUUID() week_id: string;
  @IsString() @IsNotEmpty() @MaxLength(200) title: string;
  @IsString() @IsNotEmpty() stem: string;
  @IsOptional() @IsString() @MaxLength(120) section?: string;
  @IsOptional() @IsInt() @Min(1) source_case_number?: number;
  @IsOptional() @IsBoolean() is_published?: boolean;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CaseQuestionDto) questions: CaseQuestionDto[];
}

export class UpdateEssayCaseDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @IsNotEmpty() stem?: string;
  @IsOptional() @IsString() @MaxLength(120) section?: string;
  @IsOptional() @IsBoolean() is_published?: boolean;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CaseQuestionDto) questions?: CaseQuestionDto[];
}

export class SubmitEssayCaseDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => EssayAnswerDto) answers: EssayAnswerDto[];
}
export class EssayAnswerDto { @IsUUID() question_id: string; @IsString() @IsNotEmpty() answer: string; }
export class ImportPdfCasesDto { @IsUUID() course_id: string; }
