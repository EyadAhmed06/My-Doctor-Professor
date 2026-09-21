import {
  Equals,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  IsUUID,
} from 'class-validator';
import { Gender, UserRole } from '../../users/entities/user.entity';

export class SignupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  full_name: string;

  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(/[a-z]/, { message: 'password must contain a lowercase letter' })
  @Matches(/[A-Z]/, { message: 'password must contain an uppercase letter' })
  @Matches(/[0-9]/, { message: 'password must contain a number' })
  password: string;

  @IsPhoneNumber()
  phone_number: string;

  @IsEnum(UserRole)
  @Equals(UserRole.STUDENT)
  role: UserRole.STUDENT;

  @IsInt()
  @Min(1)
  @Max(6)
  current_semester: number;

  @IsOptional()
  @IsDateString()
  date_of_birth?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsUUID('4')
  device_id: string;

  @IsObject()
  device_public_key_jwk: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  device_label?: string;

  @IsString()
  device_registration_signature: string;
}
