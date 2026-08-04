import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { createPostgresSslOptions } from "./postgres-ssl";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        host: config.get<string>("DB_HOST", "localhost"),
        port: Number(config.get<string>("DB_PORT", "5432")),
        username: config.get<string>("DB_USERNAME", "postgres"),
        password: config.get<string>("DB_PASSWORD", "postgres"),
        database: config.get<string>("DB_NAME", "my_doctor_professor"),
        autoLoadEntities: true,
        synchronize: false,
        logging: config.get<string>("NODE_ENV") !== "production",
        ssl: createPostgresSslOptions({
          DB_SSL_ENABLED: config.get<string>("DB_SSL_ENABLED", "false"),
          DB_SSL_REJECT_UNAUTHORIZED: config.get<string>(
            "DB_SSL_REJECT_UNAUTHORIZED",
            "true",
          ),
          DB_SSL_CA_PATH: config.get<string>("DB_SSL_CA_PATH"),
        }),
      }),
    }),
  ],
})
export class DatabaseModule {}
