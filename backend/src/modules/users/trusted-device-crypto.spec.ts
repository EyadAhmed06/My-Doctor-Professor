import { generateKeyPairSync, randomBytes, sign, webcrypto } from 'crypto';
import { randomUUID } from 'crypto';
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

function registrationMessage(deviceId: string, publicKeyJwk: Record<string, any>): Uint8Array {
  return new TextEncoder().encode([
    'MDP_DEVICE_BINDING_V1',
    deviceId,
    publicKeyJwk.kty,
    publicKeyJwk.crv,
    publicKeyJwk.x,
    publicKeyJwk.y,
  ].join('\n'));
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

  it('verifies signatures produced by the WebCrypto API used by browsers', async () => {
    const service = buildService();
    const pair = await webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign', 'verify'],
    ) as { publicKey: webcrypto.CryptoKey; privateKey: webcrypto.CryptoKey };
    const publicKeyJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
    const challenge = randomBytes(32).toString('base64url');
    const signature = Buffer.from(await webcrypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.privateKey,
      Buffer.from(challenge, 'base64url'),
    )).toString('base64url');

    expect((service as any).verifyDeviceSignature(
      publicKeyJwk as Record<string, unknown>,
      challenge,
      signature,
    )).toBe(true);
  });

  it('verifies browser registration proof before a device can be requested or enrolled', async () => {
    const service = buildService();
    const pair = await webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign', 'verify'],
    ) as { publicKey: webcrypto.CryptoKey; privateKey: webcrypto.CryptoKey };
    const publicKeyJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
    const deviceId = randomUUID();
    const signature = Buffer.from(await webcrypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.privateKey,
      registrationMessage(deviceId, publicKeyJwk),
    )).toString('base64url');

    expect((service as any).verifyDeviceRegistrationSignature(
      publicKeyJwk as Record<string, unknown>,
      deviceId,
      signature,
    )).toBe(true);

    expect((service as any).verifyDeviceRegistrationSignature(
      publicKeyJwk as Record<string, unknown>,
      randomUUID(),
      signature,
    )).toBe(false);
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
