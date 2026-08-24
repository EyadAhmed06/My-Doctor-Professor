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

describe("runtime security configuration", () => {
  it("accepts a secure production configuration", () => {
    expect(() => assertSecureRuntimeConfiguration(secure)).not.toThrow();
  });

  it.each([
    ["weak JWT", { JWT_SECRET: "secret" }],
    ["shared JWT secrets", { JWT_REFRESH_SECRET: "a".repeat(32) }],
    ["plain HTTP frontend", { FRONTEND_URL: "http://app.example.com" }],
    ["database TLS disabled", { DB_SSL_ENABLED: "false" }],
    ["bootstrap enabled", { ALLOW_ACCOUNT_BOOTSTRAP: "true" }],
  ])("rejects %s", (_name, override) => {
    expect(() => assertSecureRuntimeConfiguration({ ...secure, ...override })).toThrow();
  });
});
