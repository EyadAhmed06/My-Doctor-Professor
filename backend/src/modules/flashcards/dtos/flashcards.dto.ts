import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsEmpty, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { FlashcardDeckBundleAccessMode } from '../../../common/entities/flashcard-deck.entity';
import { QuestionDifficulty } from '../../../common/entities/question.entity';

export enum FlashcardDeckAcademicScope { COURSE='COURSE', WEEK='WEEK', LECTURE='LECTURE' }

export class CreateDeckDto {
 @IsEnum(FlashcardDeckAcademicScope) scope_type:FlashcardDeckAcademicScope;
 @IsUUID() course_id:string;
 @ValidateIf((dto:CreateDeckDto)=>dto.scope_type!==FlashcardDeckAcademicScope.COURSE) @IsUUID() week_id?:string;
 @ValidateIf((dto:CreateDeckDto)=>dto.scope_type===FlashcardDeckAcademicScope.COURSE) @IsEmpty() private course_scope_week_guard?:never;
 @ValidateIf((dto:CreateDeckDto)=>dto.scope_type===FlashcardDeckAcademicScope.LECTURE) @IsUUID() lecture_id?:string;
 @ValidateIf((dto:CreateDeckDto)=>dto.scope_type!==FlashcardDeckAcademicScope.LECTURE) @IsEmpty() private non_lecture_guard?:never;
 /** Legacy field kept only so older service code compiles. New requests may not use topic scope. */
 @IsOptional() @IsEmpty({message:'Topic is not a deck scope; use the parent lecture'}) topic_id?:string;
 @IsOptional() @IsEnum(FlashcardDeckBundleAccessMode) bundle_access_mode?:FlashcardDeckBundleAccessMode;
 @IsOptional() @IsArray() @ArrayUnique() @IsUUID('4',{each:true}) bundle_ids?:string[];
 @IsString() @IsNotEmpty() @MaxLength(200) title:string;
 @IsOptional() @IsString() @MaxLength(10000) description?:string;
 @IsOptional() @IsInt() @Min(1) display_order?:number;
}
export class UpdateDeckDto {
 @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) title?:string;
 @IsOptional() @IsString() @MaxLength(10000) description?:string;
 @IsOptional() @IsBoolean() is_published?:boolean;
 @IsOptional() @IsInt() @Min(1) display_order?:number;
 @IsOptional() @IsEnum(FlashcardDeckAcademicScope) scope_type?:FlashcardDeckAcademicScope;
 @IsOptional() @IsUUID() course_id?:string|null;
 @IsOptional() @IsUUID() week_id?:string|null;
 @IsOptional() @IsUUID() lecture_id?:string|null;
 /** Legacy field kept only so older service code compiles. */
 @IsOptional() @IsEmpty({message:'Topic is not a deck scope; use the parent lecture'}) topic_id?:string|null;
 @IsOptional() @IsEnum(FlashcardDeckBundleAccessMode) bundle_access_mode?:FlashcardDeckBundleAccessMode;
 @IsOptional() @IsArray() @ArrayUnique() @IsUUID('4',{each:true}) bundle_ids?:string[];
}
export class UpdateDeckDistributionDto {
 @IsEnum(FlashcardDeckBundleAccessMode) bundle_access_mode:FlashcardDeckBundleAccessMode;
 @IsOptional() @IsArray() @ArrayUnique() @IsUUID('4',{each:true}) bundle_ids?:string[];
}
export class DeckQueryDto {
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) page?:number;
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) @Max(100) limit?:number;
 @IsOptional() @IsUUID() course_id?:string;
 @IsOptional() @IsUUID() week_id?:string;
 @IsOptional() @IsUUID() lecture_id?:string;
 @IsOptional() @Transform(({value})=>value==='true'?true:value==='false'?false:value) @IsBoolean() is_published?:boolean;
 @IsOptional() @IsString() @MaxLength(200) search?:string;
}
export class CardQueryDto {
 @IsOptional() @IsUUID() course_id?:string;
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) page?:number;
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) @Max(100) limit?:number;
 @IsOptional() @IsEnum(QuestionDifficulty) difficulty?:QuestionDifficulty;
 @IsOptional() @Transform(({value})=>value==='true'?true:value==='false'?false:value) @IsBoolean() is_active?:boolean;
}
export class CreateFlashcardDto {
 @IsString() @IsNotEmpty() @MaxLength(200) title:string;
 @IsString() @IsNotEmpty() @MaxLength(50000) front_content:string;
 @IsString() @IsNotEmpty() @MaxLength(50000) back_content:string;
 @IsEnum(QuestionDifficulty) difficulty:QuestionDifficulty;
 @IsOptional() @IsString() @MaxLength(50000) explanation?:string;
 @IsOptional() @IsString() @MaxLength(10000) hint?:string;
 @IsOptional() @IsInt() @Min(1) estimated_review_seconds?:number;
 @IsOptional() @IsInt() @Min(1) display_order?:number;
}
export class UpdateFlashcardDto {
 @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) title?:string;
 @IsOptional() @IsString() @IsNotEmpty() @MaxLength(50000) front_content?:string;
 @IsOptional() @IsString() @IsNotEmpty() @MaxLength(50000) back_content?:string;
 @IsOptional() @IsEnum(QuestionDifficulty) difficulty?:QuestionDifficulty;
 @IsOptional() @IsString() @MaxLength(50000) explanation?:string;
 @IsOptional() @IsString() @MaxLength(10000) hint?:string;
 @IsOptional() @IsInt() @Min(1) estimated_review_seconds?:number;
 @IsOptional() @IsInt() @Min(1) display_order?:number;
 @IsOptional() @IsBoolean() is_active?:boolean;
}
export enum ReviewRating { VERY_HARD='VERY_HARD', HARD='HARD', GOOD='GOOD', EASY='EASY' }
export class ReviewFlashcardDto { @IsEnum(ReviewRating) rating:ReviewRating; }
