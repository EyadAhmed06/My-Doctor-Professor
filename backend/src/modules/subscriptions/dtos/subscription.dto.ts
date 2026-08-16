import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';

export class SetAllowedPlansDto {
  @IsArray() @ArrayMaxSize(20) @IsUUID('4', { each: true }) plan_ids: string[];
}

export class ChangePlanDto {
  @IsUUID('4') plan_id: string;
}

export class UpdatePlanDto {
  @IsOptional() @IsString() @Length(1, 100) label?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(99999999.99) price_amount?: number | null;
  @IsOptional() @IsString() @Matches(/^[A-Za-z]{3}$/) price_currency?: string;
}
