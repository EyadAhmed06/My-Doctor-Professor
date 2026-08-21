import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PromoDiscountType } from '../../../common/entities/promo-code.entity';

export class SetAllowedPlansDto {
  @IsArray() @ArrayMaxSize(20) @IsUUID('4', { each: true }) plan_ids: string[];
}

export class UpdatePlanDto {
  @IsOptional() @IsString() @Length(1, 100) label?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(99999999.99) price_amount?: number | null;
  @IsOptional() @IsString() @Matches(/^[A-Za-z]{3}$/) price_currency?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) duration_days?: number | null;
}

export class CheckoutDto {
  @IsIn(['card', 'fawry']) payment_method: 'card' | 'fawry';
  @IsOptional() @IsString() @Length(1, 50) promo_code?: string;
}

export class CreatePromoCodeDto {
  @IsString() @Length(1, 50) code: string;
  @IsEnum(PromoDiscountType) discount_type: PromoDiscountType;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) discount_value: number;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('4', { each: true }) applicable_plan_ids?: string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) max_uses?: number;
  @IsOptional() @IsDateString() expires_at?: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

export class UpdatePromoCodeDto {
  @IsOptional() @IsEnum(PromoDiscountType) discount_type?: PromoDiscountType;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) discount_value?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('4', { each: true }) applicable_plan_ids?: string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) max_uses?: number | null;
  @IsOptional() @IsDateString() expires_at?: string | null;
  @IsOptional() @IsBoolean() is_active?: boolean;
}
