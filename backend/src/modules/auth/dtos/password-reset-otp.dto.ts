import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';

export class RequestPasswordResetOtpDto {
  @IsEmail()
  @MaxLength(320)
  email: string;
}

export class VerifyPasswordResetOtpDto {
  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must contain exactly 6 digits' })
  code: string;
}
