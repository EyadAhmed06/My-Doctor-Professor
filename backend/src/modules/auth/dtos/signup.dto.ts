import {
  Equals,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
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

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  student_number: string;

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
}
