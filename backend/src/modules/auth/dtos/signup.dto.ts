import { Equals, IsDateString, IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsPhoneNumber, IsString, Min, MinLength } from 'class-validator';
import { Gender, UserRole } from '../../users/entities/user.entity';

export class SignupDto {
  @IsString() @IsNotEmpty() full_name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
  @IsPhoneNumber() phone_number: string;
  @IsEnum(UserRole) @Equals(UserRole.STUDENT) role: UserRole.STUDENT;
  @IsString() @IsNotEmpty() student_number: string;
  @IsInt() @Min(1) current_semester: number;
  @IsOptional() @IsDateString() date_of_birth?: string;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
}
