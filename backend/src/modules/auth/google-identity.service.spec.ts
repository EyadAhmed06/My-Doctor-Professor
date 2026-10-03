import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync, sign } from 'crypto';
import { GoogleIdentityService } from './google-identity.service';

const CLIENT_ID = '123456789-example.apps.googleusercontent.com';

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signedCredential(overrides: Record<string, unknown> = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  const header = encode({ alg: 'RS256', kid: 'test-key', typ: 'JWT' });
  const payload = encode({
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: 'google-subject-1',
    email: 'student@example.test',
    email_verified: true,
    name: 'Google Student',
    picture: 'https://example.test/student.png',
    iat: Math.floor(Date.now() / 1000) - 10,
    exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides,
  });
  const body = `${header}.${payload}`;
  const signature = sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url');
  return {
    credential: `${body}.${signature}`,
    jwk: { ...jwk, kid: 'test-key', alg: 'RS256', use: 'sig' },
  };
}

describe('GoogleIdentityService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function service() {
    return new GoogleIdentityService({
      get: jest.fn((key: string) => key === 'GOOGLE_CLIENT_ID' ? CLIENT_ID : undefined),
    } as unknown as ConfigService);
  }

  it('verifies a signed Google ID token against the configured web client', async () => {
    const token = signedCredential();
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ keys: [token.jwk] }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
    })) as typeof fetch;

    await expect(service().verifyCredential(token.credential)).resolves.toEqual({
      subject: 'google-subject-1',
      email: 'student@example.test',
      fullName: 'Google Student',
      picture: 'https://example.test/student.png',
    });
  });

  it('rejects a valid signature issued for another OAuth client', async () => {
    const token = signedCredential({ aud: '999999999-other.apps.googleusercontent.com' });
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ keys: [token.jwk] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;

    await expect(service().verifyCredential(token.credential)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a Google token whose email is not verified', async () => {
    const token = signedCredential({ email_verified: false });
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ keys: [token.jwk] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;

    await expect(service().verifyCredential(token.credential)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
