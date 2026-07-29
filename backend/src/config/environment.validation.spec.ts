import { validateEnvironment } from './environment.validation';

describe('validateEnvironment', () => {
  const production = {
    NODE_ENV: 'production',
    DB_HOST: 'database',
    DB_PORT: '5432',
    DB_USERNAME: 'app',
    DB_PASSWORD: 'not-the-default',
    DB_NAME: 'app',
    JWT_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    FRONTEND_URL: 'https://example.com',
    SMTP_HOST: 'smtp',
    SMTP_PORT: '587',
    SMTP_USER: 'user',
    SMTP_PASSWORD: 'password',
    SMTP_FROM: 'noreply@example.com',
    EMAIL_OUTBOX_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
  };

  it('parses positive integer settings', () => {
    const result = validateEnvironment(production);
    expect(result.DB_PORT).toBe(5432);
    expect(result.SMTP_PORT).toBe(587);
  });

  it('rejects missing production configuration', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(
      'Missing required production environment variables',
    );
  });

  it('rejects shared JWT secrets', () => {
    expect(() => validateEnvironment({
      ...production,
      JWT_REFRESH_SECRET: production.JWT_SECRET,
    })).toThrow('must be different');
  });

  it('rejects non-HTTPS production origins', () => {
    expect(() => validateEnvironment({
      ...production,
      FRONTEND_URL: 'http://example.com',
    })).toThrow('must use HTTPS');
  });
});
