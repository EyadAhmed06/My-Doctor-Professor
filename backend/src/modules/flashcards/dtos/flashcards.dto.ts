import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { QuestionDifficulty } from '../../../common/entities/question.entity';

export class CreateDeckDto {
 @IsOptional() @IsUUID() course_id?:string;
 @IsOptional() @IsUUID() topic_id?:string;
 @IsOptional() @IsUUID() lecture_id?:string;
 @IsString() @IsNotEmpty() @MaxLength(200) title:string;
 @IsOptional() @IsString() @MaxLength(10000) description?:string;
 @IsOptional() @IsInt() @Min(1) display_order?:number;
}
export class UpdateDeckDto {
 @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) title?:string;
 @IsOptional() @IsString() @MaxLength(10000) description?:string;
 @IsOptional() @IsBoolean() is_published?:boolean;
 @IsOptional() @IsInt() @Min(1) display_order?:number;
}
export class DeckQueryDto {
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) page?:number;
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) @Max(100) limit?:number;
 @IsOptional() @IsUUID() course_id?:string;
 @IsOptional() @IsUUID() lecture_id?:string;
 @IsOptional() @IsUUID() topic_id?:string;
 @IsOptional() @Transform(({value})=>value==='true'?true:value==='false'?false:value) @IsBoolean() is_published?:boolean;
 @IsOptional() @IsString() @MaxLength(200) search?:string;
}
export class CardQueryDto {
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
