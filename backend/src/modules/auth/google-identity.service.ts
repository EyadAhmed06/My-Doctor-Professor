import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicKey, verify as verifySignature } from 'crypto';
import type { JsonWebKey } from 'crypto';

type GoogleJwtHeader = {
  alg?: string;
  kid?: string;
  typ?: string;
};

type GoogleIdTokenClaims = {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
  exp?: number;
  iat?: number;
  nbf?: number;
};

type GoogleJwk = JsonWebKey & { kid?: string; alg?: string; use?: string };
type GoogleJwksResponse = { keys?: GoogleJwk[] };

export type VerifiedGoogleIdentity = {
  subject: string;
  email: string;
  fullName: string;
  picture: string | null;
};

@Injectable()
export class GoogleIdentityService {
  private readonly clientId: string | null;
  private cachedKeys: GoogleJwk[] = [];
  private keysExpireAt = 0;

  constructor(config: ConfigService) {
    this.clientId = config.get<string>('GOOGLE_CLIENT_ID')?.trim() || null;
  }

  async verifyCredential(credential: string): Promise<VerifiedGoogleIdentity> {
    if (!this.clientId) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }

    const segments = credential.split('.');
    if (segments.length !== 3) throw new UnauthorizedException('Invalid Google credential');

    const header = this.decodeJson<GoogleJwtHeader>(segments[0]);
    const claims = this.decodeJson<GoogleIdTokenClaims>(segments[1]);
    if (header.alg !== 'RS256' || !header.kid) {
      throw new UnauthorizedException('Unsupported Google credential');
    }

    let key = (await this.getKeys()).find((candidate) => candidate.kid === header.kid);
    if (!key) {
      this.keysExpireAt = 0;
      key = (await this.getKeys()).find((candidate) => candidate.kid === header.kid);
    }
    if (!key) throw new UnauthorizedException('Unknown Google signing key');

    const publicKey = createPublicKey({ key, format: 'jwk' });
    const signatureValid = verifySignature(
      'RSA-SHA256',
      Buffer.from(`${segments[0]}.${segments[1]}`, 'utf8'),
      publicKey,
      Buffer.from(segments[2], 'base64url'),
    );
    if (!signatureValid) throw new UnauthorizedException('Invalid Google credential signature');

    const now = Math.floor(Date.now() / 1000);
    const audienceValid = Array.isArray(claims.aud)
      ? claims.aud.includes(this.clientId)
      : claims.aud === this.clientId;
    const issuerValid = claims.iss === 'accounts.google.com' || claims.iss === 'https://accounts.google.com';
    const emailVerified = claims.email_verified === true || claims.email_verified === 'true';

    if (
      !audienceValid ||
      !issuerValid ||
      !claims.sub ||
      !claims.email ||
      !emailVerified ||
      !claims.exp ||
      claims.exp < now - 60 ||
      (claims.nbf !== undefined && claims.nbf > now + 60)
    ) {
      throw new UnauthorizedException('Google credential claims are invalid');
    }

    return {
      subject: claims.sub,
      email: claims.email.trim().toLowerCase(),
      fullName: claims.name?.trim() || claims.email.split('@')[0],
      picture: claims.picture?.trim() || null,
    };
  }

  private decodeJson<T>(segment: string): T {
    try {
      return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
    } catch {
      throw new UnauthorizedException('Malformed Google credential');
    }
  }

  private async getKeys(): Promise<GoogleJwk[]> {
    if (this.cachedKeys.length && Date.now() < this.keysExpireAt) return this.cachedKeys;

    let response: Response;
    try {
      response = await fetch('https://www.googleapis.com/oauth2/v3/certs', {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new ServiceUnavailableException('Google identity verification is temporarily unavailable');
    }
    if (!response.ok) {
      throw new ServiceUnavailableException('Google identity verification is temporarily unavailable');
    }

    const body = await response.json() as GoogleJwksResponse;
    const keys = body.keys?.filter((key) => key.kid && (!key.alg || key.alg === 'RS256')) || [];
    if (!keys.length) {
      throw new ServiceUnavailableException('Google signing keys are unavailable');
    }

    const cacheControl = response.headers.get('cache-control') || '';
    const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 300);
    this.cachedKeys = keys;
    this.keysExpireAt = Date.now() + Math.max(60, Math.min(maxAge, 24 * 60 * 60)) * 1000;
    return keys;
  }
}
