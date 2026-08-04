import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface PostgresSslEnvironment {
  DB_SSL_ENABLED?: string;
  DB_SSL_REJECT_UNAUTHORIZED?: string;
  DB_SSL_CA_PATH?: string;
}

export function createPostgresSslOptions(
  environment: PostgresSslEnvironment,
): false | { rejectUnauthorized: boolean; ca?: string } {
  if (environment.DB_SSL_ENABLED !== "true") return false;

  const rejectUnauthorized = environment.DB_SSL_REJECT_UNAUTHORIZED !== "false";
  const caPath = environment.DB_SSL_CA_PATH?.trim();

  if (rejectUnauthorized && !caPath) {
    throw new Error(
      "DB_SSL_CA_PATH is required when PostgreSQL SSL certificate verification is enabled",
    );
  }

  return {
    rejectUnauthorized,
    ...(caPath ? { ca: readFileSync(resolve(caPath), "utf8") } : {}),
  };
}
