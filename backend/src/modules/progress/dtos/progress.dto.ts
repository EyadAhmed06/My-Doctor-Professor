import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class UpdateLectureProgressDto {
 @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(100) completion_percentage?:number;
 @IsOptional() @IsInt() @Min(0) @Max(1440) time_spent_minutes_delta?:number;
 @IsOptional() @IsBoolean() is_completed?:boolean;
}
export class BookmarkQuestionDto { @IsBoolean() bookmarked:boolean; }
export class DashboardQueryDto { @IsOptional() @IsUUID() course_id?:string; }
export class AnalyticsQueryDto {
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) page?:number;
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) @Max(100) limit?:number;
 @IsOptional() @IsUUID() course_id?:string;
 @IsOptional() @IsUUID() topic_id?:string;
 @IsOptional() @IsUUID() question_id?:string;
 @IsOptional() @IsUUID() test_id?:string;
 @IsOptional() @IsUUID() student_id?:string;
 @IsOptional() @IsDateString() date_from?:string;
 @IsOptional() @IsDateString() date_until?:string;
}
