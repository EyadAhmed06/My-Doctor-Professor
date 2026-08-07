import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

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

  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/)
  phone_number: string;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  student_number: string;

  @IsInt()
  @Min(1)
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
