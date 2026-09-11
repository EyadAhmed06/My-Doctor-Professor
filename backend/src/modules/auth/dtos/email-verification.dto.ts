import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RequestEmailVerificationDto {
  @IsEmail()
  @MaxLength(320)
  email: string;
}

export class ConfirmEmailVerificationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  token: string;
}
