import {
  IsDateString,IsEnum,IsNotEmpty,IsOptional,IsPhoneNumber,IsString,
  IsUrl,Matches,MaxLength,MinLength,
} from 'class-validator';
import { Gender } from '../entities/user.entity';

export class UpdateUserProfileDto {
 @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150) full_name?:string;
 @IsOptional() @IsPhoneNumber() phone_number?:string;
 @IsOptional() @IsDateString() date_of_birth?:string;
 @IsOptional() @IsEnum(Gender) gender?:Gender;
 @IsOptional() @IsUrl({require_tld:false}) @MaxLength(2000) profile_picture_url?:string;
}
export class ChangePasswordDto {
 @IsString() @IsNotEmpty() current_password:string;
 @IsString() @MinLength(12) @MaxLength(128)
 @Matches(/[a-z]/) @Matches(/[A-Z]/) @Matches(/[0-9]/) new_password:string;
}

export class DeleteOwnAccountDto {
 @IsString() @IsNotEmpty() current_password:string;
 @IsString() @Matches(/^DELETE$/, { message: "confirmation must equal DELETE" }) confirmation:string;
}
