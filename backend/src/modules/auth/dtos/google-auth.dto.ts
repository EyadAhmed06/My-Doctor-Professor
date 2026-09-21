import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Max,
  Min,
  MinLength,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class GoogleCredentialDto {
  @IsString()
  @MinLength(100)
  credential: string;

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
  @MaxLength(200)
  device_label?: string;

  @IsOptional()
  @IsString()
  device_registration_signature?: string;

  @IsOptional()
  @IsUUID('4')
  device_challenge_id?: string;

  @IsOptional()
  @IsString()
  device_signature?: string;
}

export class CompleteGoogleSignupDto {
  @IsString()
  @MinLength(100)
  onboarding_token: string;

  @IsPhoneNumber()
  phone_number: string;

  @IsInt()
  @Min(1)
  @Max(6)
  current_semester: number;

  @IsOptional()
  @IsDateString()
  date_of_birth?: string;

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

export interface GoogleOnboardingResponseDto {
  requires_onboarding: true;
  onboarding_token: string;
  profile: {
    email: string;
    full_name: string;
    picture: string | null;
  };
}
