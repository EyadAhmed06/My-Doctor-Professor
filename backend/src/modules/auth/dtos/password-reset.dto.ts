import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(320)
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  token: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(/[a-z]/, { message: 'new_password must contain a lowercase letter' })
  @Matches(/[A-Z]/, { message: 'new_password must contain an uppercase letter' })
  @Matches(/[0-9]/, { message: 'new_password must contain a number' })
  new_password: string;

  @IsString()
  @IsNotEmpty()
  confirm_password: string;
}
