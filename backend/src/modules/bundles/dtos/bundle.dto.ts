import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { BundleAccessMode, BundleStatus } from '../../../common/entities/bundle.entity';

export class CreateBundleDto {
 @IsString() @Length(3,180) title:string;
 @IsString() @Length(3,180) slug:string;
 @IsOptional() @IsString() description?:string;
 @Type(()=>Number) @IsInt() @Min(1) @Max(12) academic_year:number;
 @IsOptional() @IsEnum(BundleAccessMode) access_mode?:BundleAccessMode;
 @IsOptional() @IsBoolean() is_free?:boolean;
 @IsOptional() @IsDateString() available_from?:string;
 @IsOptional() @IsDateString() available_until?:string;
 @IsOptional() @IsString() @Length(6,64) enrollment_code?:string;
}
export class UpdateBundleDto {
 @IsOptional() @IsString() @Length(3,180) title?:string; @IsOptional() @IsString() description?:string;
 @IsOptional() @IsEnum(BundleAccessMode) access_mode?:BundleAccessMode; @IsOptional() @IsBoolean() is_free?:boolean;
 @IsOptional() @IsDateString() available_from?:string|null; @IsOptional() @IsDateString() available_until?:string|null;
 @IsOptional() @IsString() @Length(6,64) enrollment_code?:string;
}
export class BundleCatalogQueryDto { @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(12) academic_year?:number; }
export class BundleResourceDto { @IsUUID('4') resource_id:string; }
export class GrantBundleDto { @IsUUID('4') student_id:string; @IsOptional() @IsDateString() expires_at?:string; }
export class AssignInstructorDto { @IsUUID('4') instructor_id:string; }
export class EnrollByCodeDto { @IsString() @Length(6,64) code:string; }
export class ChangeBundleStatusDto { @IsEnum(BundleStatus) status:BundleStatus; }
