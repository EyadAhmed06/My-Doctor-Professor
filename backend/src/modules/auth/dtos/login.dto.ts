import { IsBoolean, IsEmail, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsBoolean()
  remember?: boolean;

  @IsOptional()
  @IsUUID('4')
  device_id?: string;

  @IsOptional()
  @IsObject()
  device_public_key_jwk?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  device_label?: string;

  @IsOptional()
  @IsUUID('4')
  device_challenge_id?: string;

  @IsOptional()
  @IsString()
  device_signature?: string;
}
