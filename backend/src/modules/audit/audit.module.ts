import { Module } from '@nestjs/common'; import { TypeOrmModule } from '@nestjs/typeorm'; import { AuditLog } from '../../common/entities/audit-log.entity'; import { AuditController } from './audit.controller';
@Module({imports:[TypeOrmModule.forFeature([AuditLog])],controllers:[AuditController],exports:[TypeOrmModule]}) export class AuditModule {}
