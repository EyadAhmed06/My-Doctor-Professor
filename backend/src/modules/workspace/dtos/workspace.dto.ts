import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class NotebookQueryDto {
 @IsOptional() @IsIn(['PERSONAL','EXPLANATION','PEARL','IMAGE','LINKED_CASE']) note_type?:string;
 @IsOptional() @IsString() @MaxLength(100) search?:string;
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) page?:number;
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) @Max(100) limit?:number;
}
export class CreateNotebookNoteDto {
 @IsString() @MinLength(1) @MaxLength(200) title:string;
 @IsIn(['PERSONAL','EXPLANATION','PEARL','IMAGE','LINKED_CASE']) note_type:string;
 @IsString() @MinLength(1) @MaxLength(50000) content:string;
 @IsOptional() @IsObject() metadata?:Record<string,unknown>;
}
export class UpdateNotebookNoteDto {
 @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?:string;
 @IsOptional() @IsIn(['PERSONAL','EXPLANATION','PEARL','IMAGE','LINKED_CASE']) note_type?:string;
 @IsOptional() @IsString() @MinLength(1) @MaxLength(50000) content?:string;
 @IsOptional() @IsObject() metadata?:Record<string,unknown>;
}
export class UpdateStudyPlanDto {
 @IsOptional() @IsString() @MaxLength(100) target_exam?:string;
 @IsOptional() @IsDateString() exam_date?:string;
 @IsOptional() @IsInt() @Min(1) @Max(500) daily_question_target?:number;
 @IsOptional() @IsInt() @Min(1) @Max(168) weekly_hours_target?:number;
 @IsOptional() @IsInt() @Min(1) @Max(1000) daily_flashcard_target?:number;
 @IsOptional() @IsObject() preferences?:Record<string,unknown>;
}
export class DrugReferenceQueryDto {
 @IsOptional() @IsString() @MaxLength(100) search?:string;
 @IsOptional() @IsString() @MaxLength(120) category?:string;
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) page?:number;
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) @Max(100) limit?:number;
}
export class SaveDrugReferenceDto {
 @IsString() @MinLength(1) @MaxLength(180) name:string;
 @IsString() @MinLength(1) @MaxLength(200) slug:string;
 @IsString() @MinLength(1) @MaxLength(120) category:string;
 @IsString() @MinLength(1) @MaxLength(180) drug_class:string;
 @IsObject() content:Record<string,unknown>;
 @IsOptional() @IsBoolean() is_published?:boolean;
}
export class UpdateDrugReferenceDto {
 @IsOptional() @IsString() @MinLength(1) @MaxLength(180) name?:string;
 @IsOptional() @IsString() @MinLength(1) @MaxLength(200) slug?:string;
 @IsOptional() @IsString() @MinLength(1) @MaxLength(120) category?:string;
 @IsOptional() @IsString() @MinLength(1) @MaxLength(180) drug_class?:string;
 @IsOptional() @IsObject() content?:Record<string,unknown>;
 @IsOptional() @IsBoolean() is_published?:boolean;
}
