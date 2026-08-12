import "dotenv/config";
import { join } from "node:path";
import { DataSource } from "typeorm";
import { createPostgresSslOptions } from "./postgres-ssl";

const backendDirectory = process.cwd();
const runningFromTypeScript = __filename.endsWith(".ts");

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USERNAME || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "my_doctor_professor",
  // Never load src and dist simultaneously. When both globs are active TypeORM
  // discovers the same entity/migration class twice after a local build, which
  // causes "Duplicate migrations" and can also duplicate entity metadata.
  entities: [
    join(
      backendDirectory,
      runningFromTypeScript ? "src/**/*.entity.ts" : "dist/**/*.entity.js",
    ),
  ],
  migrations: [
    join(
      backendDirectory,
      runningFromTypeScript
        ? "src/database/migrations/*.ts"
        : "dist/database/migrations/*.js",
    ),
  ],
  synchronize: false,
  logging: process.env.NODE_ENV !== "production",
  ssl: createPostgresSslOptions(process.env),
});
