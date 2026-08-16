import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
import { BundleAccessMode, BundleStatus } from '../../../common/entities/bundle.entity';
import { BundlePlanTier } from '../../../common/entities/bundle-plan-grant.entity';

export class CreateBundleDto {
 @IsString() @Length(3,180) title:string;
 @IsString() @Length(3,180) slug:string;
 @IsOptional() @IsString() description?:string;
 @Type(()=>Number) @IsInt() @Min(1) @Max(12) academic_year:number;
 @IsOptional() @IsEnum(BundleAccessMode) access_mode?:BundleAccessMode;
 @IsOptional() @IsBoolean() is_free?:boolean;
 @IsOptional() @Type(()=>Number) @IsNumber({maxDecimalPlaces:2}) @Min(0.01) @Max(99999999.99) price_amount?:number;
 @IsOptional() @IsString() @Matches(/^[A-Za-z]{3}$/) price_currency?:string;
 @IsOptional() @IsDateString() available_from?:string;
 @IsOptional() @IsDateString() available_until?:string;
 @IsOptional() @IsString() @Length(6,64) enrollment_code?:string;
}

export class UpdateBundleDto {
 @IsOptional() @IsString() @Length(3,180) title?:string;
 @IsOptional() @IsString() description?:string;
 @IsOptional() @IsEnum(BundleAccessMode) access_mode?:BundleAccessMode;
 @IsOptional() @IsBoolean() is_free?:boolean;
 @IsOptional() @Type(()=>Number) @IsNumber({maxDecimalPlaces:2}) @Min(0.01) @Max(99999999.99) price_amount?:number|null;
 @IsOptional() @IsString() @Matches(/^[A-Za-z]{3}$/) price_currency?:string;
 @IsOptional() @IsDateString() available_from?:string|null;
 @IsOptional() @IsDateString() available_until?:string|null;
 @IsOptional() @IsString() @Length(6,64) enrollment_code?:string;
}

export class BundleCatalogQueryDto { @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(12) academic_year?:number; }
export class BundleResourceDto { @IsUUID('4') resource_id:string; }
export class GrantBundleDto {
 @IsUUID('4') student_id:string;
 @IsOptional() @IsDateString() expires_at?:string;
 @IsOptional() @IsBoolean() payment_confirmed?:boolean;
 @IsOptional() @IsString() @Length(1,200) payment_reference?:string;
}
export class ConfirmBundlePaymentDto { @IsOptional() @IsString() @Length(1,200) payment_reference?:string; }
export class AssignInstructorDto { @IsUUID('4') instructor_id:string; }
export class EnrollByCodeDto { @IsString() @Length(6,64) code:string; }
export class ChangeBundleStatusDto { @IsEnum(BundleStatus) status:BundleStatus; }

export class UpdateBundlePlansDto {
 @IsOptional() @IsBoolean() first_plan_enabled?:boolean;
 @IsOptional() @Type(()=>Number) @IsNumber({maxDecimalPlaces:2}) @Min(0.01) @Max(99999999.99) first_plan_price_mcq?:number|null;
 @IsOptional() @Type(()=>Number) @IsNumber({maxDecimalPlaces:2}) @Min(0.01) @Max(99999999.99) first_plan_price_mcq_essay?:number|null;
 @IsOptional() @IsBoolean() final_plan_enabled?:boolean;
 @IsOptional() @Type(()=>Number) @IsNumber({maxDecimalPlaces:2}) @Min(0.01) @Max(99999999.99) final_plan_price_mcq?:number|null;
 @IsOptional() @Type(()=>Number) @IsNumber({maxDecimalPlaces:2}) @Min(0.01) @Max(99999999.99) final_plan_price_mcq_essay?:number|null;
}
export class SetPlanWeeksDto {
 @IsArray() @ArrayMaxSize(200) @IsUUID('4',{each:true}) week_ids:string[];
}
export class EnrollPlanDto {
 @IsOptional() @IsEnum(BundlePlanTier) tier?:BundlePlanTier;
}
export class GrantPlanDto {
 @IsUUID('4') student_id:string;
 @IsOptional() @IsEnum(BundlePlanTier) tier?:BundlePlanTier;
 @IsOptional() @IsDateString() expires_at?:string;
 @IsOptional() @IsBoolean() payment_confirmed?:boolean;
 @IsOptional() @IsString() @Length(1,200) payment_reference?:string;
}
