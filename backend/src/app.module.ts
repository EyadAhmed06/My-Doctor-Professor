import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnvironment } from './config/environment.validation';
import { DatabaseModule } from './database/database.module';
import { AcademicModule } from './modules/academic/academic.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { FlashcardsModule } from './modules/flashcards/flashcards.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ProgressModule } from './modules/progress/progress.module';
import { QuestionsModule } from './modules/questions/questions.module';
import { TestsModule } from './modules/tests/tests.module';
import { UsersModule } from './modules/users/users.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { BundlesModule } from './modules/bundles/bundles.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnvironment,
    }),
    DatabaseModule,
    UsersModule,
    AuthModule,
    AcademicModule,
    QuestionsModule,
    TestsModule,
    FlashcardsModule,
    HealthModule,
    ProgressModule,
    NotificationsModule,
    AuditModule,
    AdminModule,
    WorkspaceModule,
    BundlesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
