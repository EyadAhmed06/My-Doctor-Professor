import 'dotenv/config';
import { join } from 'node:path';
import { DataSource } from 'typeorm';

const backendDirectory = process.cwd();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'my_doctor_professor',
  entities: [
    join(backendDirectory, 'src/**/*.entity.ts'),
    join(backendDirectory, 'dist/**/*.entity.js'),
  ],
  migrations: [
    join(backendDirectory, 'src/database/migrations/*.ts'),
    join(backendDirectory, 'dist/database/migrations/*.js'),
  ],
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
  ssl:
    process.env.NODE_ENV === 'production'
      ? {
          rejectUnauthorized:
            process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
        }
      : false,
});
