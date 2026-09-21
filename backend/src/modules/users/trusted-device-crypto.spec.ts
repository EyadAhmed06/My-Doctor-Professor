import { generateKeyPairSync, randomBytes, sign } from 'crypto';
import { UsersService } from './users.service';

function buildService() {
  return new UsersService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe('Trusted student device cryptography', () => {
  it('verifies a P-256 device signature over the issued challenge bytes', () => {
    const service = buildService();
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const publicKeyJwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
    const challenge = randomBytes(32).toString('base64url');
    const signature = sign(
      'sha256',
      Buffer.from(challenge, 'base64url'),
      { key: privateKey, dsaEncoding: 'ieee-p1363' },
    ).toString('base64url');

    expect((service as any).verifyDeviceSignature(publicKeyJwk, challenge, signature)).toBe(true);
  });

  it('rejects a signature when the challenge is changed', () => {
    const service = buildService();
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const publicKeyJwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
    const challenge = randomBytes(32).toString('base64url');
    const signature = sign(
      'sha256',
      Buffer.from(challenge, 'base64url'),
      { key: privateKey, dsaEncoding: 'ieee-p1363' },
    ).toString('base64url');
    const differentChallenge = randomBytes(32).toString('base64url');

    expect((service as any).verifyDeviceSignature(publicKeyJwk, differentChallenge, signature)).toBe(false);
  });

  it('rejects a JWK that contains private-key material', () => {
    const service = buildService();
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const privateJwk = privateKey.export({ format: 'jwk' }) as Record<string, unknown>;

    expect(() => (service as any).normalizePublicKeyJwk(privateJwk)).toThrow('Invalid device public key');
  });
});
