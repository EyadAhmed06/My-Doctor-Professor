import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class NotebookQueryDto {
 @IsOptional() @IsIn(['PERSONAL','EXPLANATION','PEARL','IMAGE','LINKED_CASE']) note_type?:string;
 @IsOptional() @IsString() @MaxLength(100) search?:string;
 @IsOptional() @IsUUID() collection_id?:string;
 @IsOptional() @IsUUID() tag_id?:string;
 @IsOptional() @Transform(({value})=>value==='true'||value===true) @IsBoolean() favorite?:boolean;
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) page?:number;
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) @Max(100) limit?:number;
}
export class CreateNotebookNoteDto {
 @IsString() @MinLength(1) @MaxLength(200) title:string;
 @IsIn(['PERSONAL','EXPLANATION','PEARL','IMAGE','LINKED_CASE']) note_type:string;
 @IsString() @MinLength(1) @MaxLength(50000) content:string;
 @IsOptional() @IsObject() metadata?:Record<string,unknown>;
 @IsOptional() @IsUUID() collection_id?:string;
 @IsOptional() @IsBoolean() is_favorite?:boolean;
 @IsOptional() @IsDateString() review_at?:string;
 @IsOptional() @IsUUID() linked_question_id?:string;
 @IsOptional() @IsUUID() linked_lecture_id?:string;
 @IsOptional() @IsArray() @IsUUID('4',{each:true}) tag_ids?:string[];
}
export class UpdateNotebookNoteDto {
 @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?:string;
 @IsOptional() @IsIn(['PERSONAL','EXPLANATION','PEARL','IMAGE','LINKED_CASE']) note_type?:string;
 @IsOptional() @IsString() @MinLength(1) @MaxLength(50000) content?:string;
 @IsOptional() @IsObject() metadata?:Record<string,unknown>;
 @IsOptional() @IsUUID() collection_id?:string|null;
 @IsOptional() @IsBoolean() is_favorite?:boolean;
 @IsOptional() @IsDateString() review_at?:string|null;
 @IsOptional() @IsUUID() linked_question_id?:string|null;
 @IsOptional() @IsUUID() linked_lecture_id?:string|null;
 @IsOptional() @IsArray() @IsUUID('4',{each:true}) tag_ids?:string[];
}
export class SaveNotebookCollectionDto {
 @IsString() @MinLength(1) @MaxLength(120) name:string;
 @IsOptional() @IsString() @MaxLength(1000) description?:string;
 @IsOptional() @IsString() @MaxLength(20) color?:string;
 @IsOptional() @IsBoolean() is_pinned?:boolean;
}
export class UpdateNotebookCollectionDto {
 @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?:string;
 @IsOptional() @IsString() @MaxLength(1000) description?:string;
 @IsOptional() @IsString() @MaxLength(20) color?:string;
 @IsOptional() @IsBoolean() is_pinned?:boolean;
}
export class SaveNotebookTagDto {
 @IsString() @MinLength(1) @MaxLength(60) name:string;
 @IsOptional() @IsString() @MaxLength(20) color?:string;
}
export class AddNotebookAttachmentDto {
 @IsIn(['IMAGE','RESOURCE']) kind:string;
 @IsString() @MinLength(1) @MaxLength(255) file_name:string;
 @IsString() @MinLength(1) @MaxLength(120) mime_type:string;
 @IsString() @MinLength(1) @MaxLength(1000) file_url:string;
 @IsOptional() @IsInt() @Min(0) size_bytes?:number;
}
export class ConvertNoteToFlashcardDto {
 @IsUUID() deck_id:string;
 @IsString() @MinLength(1) @MaxLength(200) title:string;
 @IsString() @MinLength(1) @MaxLength(10000) front_content:string;
 @IsString() @MinLength(1) @MaxLength(20000) back_content:string;
}
export class UpdateStudyPlanDto {
 @IsOptional() @IsString() @MaxLength(100) target_exam?:string;
 @IsOptional() @IsDateString() exam_date?:string;
 @IsOptional() @IsInt() @Min(1) @Max(500) daily_question_target?:number;
 @IsOptional() @IsInt() @Min(1) @Max(168) weekly_hours_target?:number;
 @IsOptional() @IsInt() @Min(1) @Max(1000) daily_flashcard_target?:number;
 @IsOptional() @IsObject() preferences?:Record<string,unknown>;
}
export class StudyPlanCalendarQueryDto {
 @IsOptional() @IsDateString() from?:string;
 @IsOptional() @IsDateString() to?:string;
}
export class UpdateStudyPlanItemDto {
 @IsOptional() @IsIn(['COMPLETED','SKIPPED','PLANNED']) status?:string;
 @IsOptional() @IsDateString() scheduled_date?:string;
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(5) @Max(1440) duration_minutes?:number;
 @IsOptional() @IsBoolean() is_locked?:boolean;
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