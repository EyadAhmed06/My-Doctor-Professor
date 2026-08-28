const weakSecrets = new Set([
  "secret",
  "changeme",
  "replace-with-at-least-32-random-characters",
  "replace-with-a-different-32-character-random-secret",
]);

function requireStrongSecret(name: string, value: string | undefined, production: boolean) {
  if (!value || value.length < 32 || weakSecrets.has(value)) {
    if (production) throw new Error(`${name} must be a unique secret of at least 32 characters`);
  }
}

function requireHttpsUrl(name: string, value: string | undefined): void {
  if (!value) throw new Error(`${name} is required when Paymob is configured`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL`);
  }
  if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS in production`);
}

export function assertSecureRuntimeConfiguration(env: NodeJS.ProcessEnv = process.env): void {
  const production = env.NODE_ENV === "production";
  requireStrongSecret("JWT_SECRET", env.JWT_SECRET, production);
  requireStrongSecret("JWT_REFRESH_SECRET", env.JWT_REFRESH_SECRET, production);
  if (env.JWT_SECRET && env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
    throw new Error("JWT access and refresh secrets must be different");
  }
  if (production) {
    if (!env.FRONTEND_URL?.startsWith("https://")) throw new Error("FRONTEND_URL must use HTTPS in production");
    if (env.DB_PASSWORD === "postgres" || !env.DB_PASSWORD) throw new Error("A non-default DB_PASSWORD is required in production");
    if (env.DB_SSL_ENABLED !== "true") throw new Error("DB_SSL_ENABLED must be true in production");
    if (env.DB_SSL_REJECT_UNAUTHORIZED !== "true") throw new Error("Database TLS certificate verification is required in production");
    if (env.ALLOW_ACCOUNT_BOOTSTRAP === "true") throw new Error("Account bootstrap must be disabled in production");
    if (!env.EMAIL_OUTBOX_ENCRYPTION_KEY) throw new Error("EMAIL_OUTBOX_ENCRYPTION_KEY is required in production");

    const paymobEnabled = Boolean(
      env.PAYMOB_API_KEY
      || env.PAYMOB_PUBLIC_KEY
      || env.PAYMOB_HMAC_SECRET
      || env.PAYMOB_CARD_INTEGRATION_ID
      || env.PAYMOB_FAWRY_INTEGRATION_ID,
    );
    if (paymobEnabled) {
      if (!env.PAYMOB_API_KEY || !env.PAYMOB_PUBLIC_KEY) {
        throw new Error("Paymob API and public keys must both be configured in production");
      }
      requireStrongSecret("PAYMOB_HMAC_SECRET", env.PAYMOB_HMAC_SECRET, true);
      if (!env.PAYMOB_CARD_INTEGRATION_ID || !env.PAYMOB_FAWRY_INTEGRATION_ID) {
        throw new Error("Both Paymob card and Fawry integration ids are required in production");
      }
      requireHttpsUrl("API_URL", env.API_URL);
      if (env.PAYMOB_BASE_URL) requireHttpsUrl("PAYMOB_BASE_URL", env.PAYMOB_BASE_URL);
    }
  }
}