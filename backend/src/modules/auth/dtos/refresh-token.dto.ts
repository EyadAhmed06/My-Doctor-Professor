import { IsJWT, IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  @IsOptional()
  @IsString()
  @IsJWT()
  refresh_token?: string;
}
