import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { AuditAction } from '../../../common/entities/audit-log.entity';

export class AuditQueryDto {
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) page?:number;
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) @Max(100) limit?:number;
 @IsOptional() @IsUUID() user_id?:string;
 @IsOptional() @IsEnum(AuditAction) action?:AuditAction;
 @IsOptional() @IsString() @MaxLength(100) entity_name?:string;
 @IsOptional() @IsUUID() entity_id?:string;
 @IsOptional() @IsDateString() date_from?:string;
 @IsOptional() @IsDateString() date_until?:string;
}
