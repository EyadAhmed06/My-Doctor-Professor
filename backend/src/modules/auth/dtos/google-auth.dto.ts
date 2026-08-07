import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class GoogleCredentialDto {
  @IsString()
  @MinLength(100)
  credential: string;
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
  @Max(20)
  current_semester: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
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
