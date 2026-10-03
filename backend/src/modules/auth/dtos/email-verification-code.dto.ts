import { IsEmail, Matches, MaxLength } from 'class-validator';

export class ConfirmEmailVerificationCodeDto {
  @IsEmail()
  @MaxLength(320)
  email: string;

  @Matches(/^\d{6}$/, { message: 'code must be exactly 6 digits' })
  code: string;
}
