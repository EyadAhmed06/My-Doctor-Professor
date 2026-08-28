import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class GoogleCredentialDto {
  @IsString()
  @MinLength(100)
  credential: string;

  @IsOptional()
  @IsBoolean()
  remember?: boolean;
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
