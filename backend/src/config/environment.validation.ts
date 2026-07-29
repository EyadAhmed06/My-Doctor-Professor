import { isAbsolute } from 'path';
const POSITIVE_INTEGER_KEYS = [
  'PORT',
  'DB_PORT',
  'JWT_ACCESS_TTL_SECONDS',
  'JWT_REFRESH_TTL_SECONDS',
  'EMAIL_VERIFICATION_TTL_SECONDS',
  'PASSWORD_RESET_TTL_SECONDS',
  'SMTP_PORT',
  'MAX_FILE_SIZE',
] as const;

const PRODUCTION_REQUIRED_KEYS = [
  'DB_HOST',
  'DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_NAME',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'FRONTEND_URL',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'SMTP_FROM',
  'EMAIL_OUTBOX_ENCRYPTION_KEY',
  'FILE_UPLOAD_PATH',
  'MAX_FILE_SIZE',
] as const;

export function validateEnvironment(input: Record<string, unknown>): Record<string, unknown> {
  const environment = { ...input };
  const nodeEnvironment = String(environment.NODE_ENV ?? 'development');
  if (!['development', 'test', 'production'].includes(nodeEnvironment)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }
  environment.NODE_ENV = nodeEnvironment;

  for (const key of POSITIVE_INTEGER_KEYS) {
    if (environment[key] === undefined || environment[key] === '') continue;
    const value = Number(environment[key]);
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${key} must be a positive integer`);
    }
    environment[key] = value;
  }

  if (nodeEnvironment === 'production') {
    const missing = PRODUCTION_REQUIRED_KEYS.filter(
      (key) => environment[key] === undefined || String(environment[key]).trim() === '',
    );
    if (missing.length) {
      throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
    }
    if (String(environment.DB_PASSWORD) === 'postgres') {
      throw new Error('DB_PASSWORD must not use the development default in production');
    }
  }

  if (
    nodeEnvironment === 'production' &&
    !isAbsolute(String(environment.FILE_UPLOAD_PATH))
  ) {
    throw new Error('FILE_UPLOAD_PATH must be absolute in production');
  }

  const accessSecret = environment.JWT_SECRET === undefined ? undefined : String(environment.JWT_SECRET);
  const refreshSecret = environment.JWT_REFRESH_SECRET === undefined ? undefined : String(environment.JWT_REFRESH_SECRET);
  if (accessSecret && accessSecret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters');
  }
  if (refreshSecret && refreshSecret.length < 32) {
    throw new Error('JWT_REFRESH_SECRET must contain at least 32 characters');
  }
  if (accessSecret && refreshSecret && accessSecret === refreshSecret) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be different');
  }

  if (environment.FRONTEND_URL) {
    const url = new URL(String(environment.FRONTEND_URL));
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('FRONTEND_URL must use HTTP or HTTPS');
    }
    if (nodeEnvironment === 'production' && url.protocol !== 'https:') {
      throw new Error('FRONTEND_URL must use HTTPS in production');
    }
  }

  if (environment.EMAIL_OUTBOX_ENCRYPTION_KEY) {
    const key = Buffer.from(String(environment.EMAIL_OUTBOX_ENCRYPTION_KEY), 'base64');
    if (key.length !== 32) {
      throw new Error('EMAIL_OUTBOX_ENCRYPTION_KEY must decode to exactly 32 bytes');
    }
  }

  return environment;
}
