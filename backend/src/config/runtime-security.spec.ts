import { assertSecureRuntimeConfiguration } from "./runtime-security";

const secure = {
  NODE_ENV: "production",
  FRONTEND_URL: "https://app.example.com",
  DB_PASSWORD: "not-the-default-password",
  DB_SSL_ENABLED: "true",
  DB_SSL_REJECT_UNAUTHORIZED: "true",
  ALLOW_ACCOUNT_BOOTSTRAP: "false",
  JWT_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
  EMAIL_OUTBOX_ENCRYPTION_KEY: "base64-placeholder",
} as NodeJS.ProcessEnv;

const securePaymob = {
  PAYMOB_API_KEY: "provider-api-key",
  PAYMOB_PUBLIC_KEY: "provider-public-key",
  PAYMOB_HMAC_SECRET: "c".repeat(32),
  PAYMOB_CARD_INTEGRATION_ID: "card-123",
  PAYMOB_FAWRY_INTEGRATION_ID: "fawry-456",
  API_URL: "https://api.example.com/api/v1",
  PAYMOB_BASE_URL: "https://accept.paymob.com",
} as NodeJS.ProcessEnv;

describe("runtime security configuration", () => {
  it("accepts a secure production configuration", () => {
    expect(() => assertSecureRuntimeConfiguration(secure)).not.toThrow();
  });

  it("accepts a fully configured HTTPS Paymob production setup", () => {
    expect(() => assertSecureRuntimeConfiguration({ ...secure, ...securePaymob })).not.toThrow();
  });

  it.each([
    ["weak JWT", { JWT_SECRET: "secret" }],
    ["shared JWT secrets", { JWT_REFRESH_SECRET: "a".repeat(32) }],
    ["plain HTTP frontend", { FRONTEND_URL: "http://app.example.com" }],
    ["database TLS disabled", { DB_SSL_ENABLED: "false" }],
    ["bootstrap enabled", { ALLOW_ACCOUNT_BOOTSTRAP: "true" }],
    ["insecure AUTH_COOKIE_PATH in production", { AUTH_COOKIE_PATH: "/auth" }],
    ["root AUTH_COOKIE_PATH in production", { AUTH_COOKIE_PATH: "/" }],
  ])("rejects %s", (_name, override) => {
    expect(() => assertSecureRuntimeConfiguration({ ...secure, ...override })).toThrow();
  });

  it("accepts explicitly configured /api/v1/auth cookie path in production", () => {
    expect(() => assertSecureRuntimeConfiguration({ ...secure, AUTH_COOKIE_PATH: "/api/v1/auth" })).not.toThrow();
  });

  it.each([
    ["partial Paymob credentials", { PAYMOB_API_KEY: "provider-api-key" }],
    ["weak Paymob HMAC secret", { ...securePaymob, PAYMOB_HMAC_SECRET: "short" }],
    ["missing Fawry integration", { ...securePaymob, PAYMOB_FAWRY_INTEGRATION_ID: "" }],
    ["HTTP callback API", { ...securePaymob, API_URL: "http://api.example.com/api/v1" }],
    ["HTTP Paymob base URL", { ...securePaymob, PAYMOB_BASE_URL: "http://accept.paymob.com" }],
  ])("rejects %s", (_name, override) => {
    expect(() => assertSecureRuntimeConfiguration({ ...secure, ...override })).toThrow();
  });
});