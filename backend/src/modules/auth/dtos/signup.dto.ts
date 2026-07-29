import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsPhoneNumber,
  IsEnum,
  IsOptional,
  IsDateString,
} from 'class-validator';
import { UserRole, Gender } from '../../users/entities/user.entity';

export class SignupDto {
  @IsString()
  @IsNotEmpty()
  full_name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @IsPhoneNumber()
  @IsNotEmpty()
  phone_number: string;

  @IsEnum(UserRole)
  @IsNotEmpty()
  role: UserRole;

  @IsOptional()
  @IsDateString()
  date_of_birth?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  // For students
  @IsOptional()
  @IsString()
  student_number?: string;

  @IsOptional()
  current_semester?: number;

  // For instructors
  @IsOptional()
  @IsString()
  specialization?: string;

  @IsOptional()
  @IsString()
  office_location?: string;
}

