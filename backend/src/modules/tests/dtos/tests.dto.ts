import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { QuestionDifficulty } from '../../../common/entities/question.entity';
import { TestMode } from '../../../common/entities/test-attempt.entity';
import { TestType } from '../../../common/entities/test.entity';

// PostgreSQL's uuid type accepts the canonical 8-4-4-4-12 hexadecimal shape even
// when historical/demo rows do not carry an RFC variant nibble. Persisted content
// identifiers must therefore be validated against PostgreSQL's UUID text shape,
// not against one specific RFC UUID version.
const POSTGRES_UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateTestDto {
 @IsString() @IsNotEmpty() @MaxLength(200) title:string;
 @IsOptional() @IsString() description?:string;
 @IsEnum(TestType) test_type:TestType;
 @IsOptional() @IsUUID() course_id?:string;
 @IsOptional() @IsUUID() week_id?:string;
 @IsOptional() @IsUUID() lecture_id?:string;
 @IsOptional() @IsInt() @Min(1) duration_minutes?:number;
 @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) passing_marks?:number;
 @IsOptional() @IsDateString() available_from?:string;
 @IsOptional() @IsDateString() available_until?:string;
}
export class UpdateTestDto {
 @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) title?:string;
 @IsOptional() @IsString() description?:string;
 @IsOptional() @IsInt() @Min(1) duration_minutes?:number;
 @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) passing_marks?:number;
 @IsOptional() @IsBoolean() is_published?:boolean;
 @IsOptional() @IsDateString() available_from?:string;
 @IsOptional() @IsDateString() available_until?:string;
}
export class TestQueryDto {
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) page?:number;
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) @Max(100) limit?:number;
 @IsOptional() @IsEnum(TestType) test_type?:TestType;
 @IsOptional() @IsUUID() course_id?:string;
 @IsOptional() @Transform(({value})=>value==='true'?true:value==='false'?false:value) @IsBoolean() is_published?:boolean;
}
export class AddTestQuestionDto {
 @IsUUID() question_id:string;
 @IsInt() @Min(1) display_order:number;
 @IsNumber({maxDecimalPlaces:2}) @Min(0.01) marks:number;
 @IsOptional() @IsInt() @Min(1) time_limit_seconds?:number;
}
export class ReorderTestQuestionDto {
 @IsUUID() question_id:string;
 @IsInt() @Min(1) display_order:number;
}
export class ReorderTestQuestionsDto {
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500)
 @ValidateNested({each:true}) @Type(()=>ReorderTestQuestionDto)
 items:ReorderTestQuestionDto[];
}
export class StartTestAttemptDto { @IsEnum(TestMode) test_mode:TestMode; }
export class PracticeCatalogQueryDto { @IsUUID() bundle_id:string; @IsUUID() course_id:string; }
export class GeneratePracticeTestDto {
 @IsUUID() bundle_id:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ArrayUnique()
 @IsString({each:true}) @Matches(POSTGRES_UUID_TEXT,{each:true,message:'each lecture_id must use UUID text format'})
 lecture_ids:string[];
 @IsInt() @Min(1) @Max(200) question_count:number;
 @IsOptional() @IsEnum(QuestionDifficulty) difficulty?:QuestionDifficulty;
 @IsEnum(TestMode) test_mode:TestMode;
 @IsOptional() @IsInt() @Min(1) @Max(600) duration_minutes?:number;
}
export class SaveAnswerDto {
 @IsOptional() @IsString() @Matches(POSTGRES_UUID_TEXT,{message:'selected_option_id must use UUID text format'}) selected_option_id?:string;
 @IsOptional() @IsString() @MaxLength(50000) essay_answer?:string;
 @IsOptional() @IsString() @IsIn(['LOW','MEDIUM','HIGH']) confidence_level?:'LOW'|'MEDIUM'|'HIGH';
}
export class QuestionNoteDto { @IsString() @IsNotEmpty() @MaxLength(5000) note:string; }
export class GradeEssayDto {
 @IsNumber({maxDecimalPlaces:2}) @Min(0) awarded_marks:number;
 @IsOptional() @IsString() @MaxLength(10000) feedback?:string;
}
