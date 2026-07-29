import { User, Gender, UserRole, UserStatus } from '../../users/entities/user.entity';

export class AuthResponseDto {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    full_name: string;
    role: string;
    status: string;
  };
}

export class UserProfileDto {
  id: string;
  email: string;
  fullName: string;
  phoneNumber: string;
  role: UserRole;
  status: UserStatus;
  profilePictureUrl: string | null;
  dateOfBirth: Date | null;
  gender: Gender | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}



