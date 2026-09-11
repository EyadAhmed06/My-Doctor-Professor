import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,ArrayMinSize,ArrayUnique,IsArray,IsEnum,IsInt,
  IsNotEmpty,IsOptional,IsString,IsUUID,Max,MaxLength,Min,
} from 'class-validator';
import { NotificationType } from '../../../common/entities/notification.entity';
import { NotificationStatus } from '../../../common/entities/user-notification.entity';

export class CreateNotificationDto {
 @IsString() @IsNotEmpty() @MaxLength(200) title:string;
 @IsString() @IsNotEmpty() @MaxLength(10000) message:string;
 @IsOptional() @IsString() @MaxLength(2000) target_url?:string;
 @IsEnum(NotificationType) notification_type:NotificationType;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ArrayUnique()
 @IsUUID('4',{each:true}) user_ids:string[];
}
export class NotificationQueryDto {
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) page?:number;
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) @Max(100) limit?:number;
 @IsOptional() @IsEnum(NotificationStatus) status?:NotificationStatus;
 @IsOptional() @IsEnum(NotificationType) notification_type?:NotificationType;
}
