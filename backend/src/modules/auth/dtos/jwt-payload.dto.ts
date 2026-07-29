export class JwtPayload {
  sub: string; // User ID
  email: string;
  role: string;
  iat?: number; // Issued at
  exp?: number; // Expiration time
}

