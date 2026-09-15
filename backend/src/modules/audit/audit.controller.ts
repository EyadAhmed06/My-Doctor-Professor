import { Controller, Get, Header, Param, ParseUUIDPipe, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dtos/audit.dto';
const uuid=new ParseUUIDPipe({version:'4'});

@Controller('audit-logs')
@UseGuards(JwtAuthGuard,RolesGuard)
@Roles(UserRole.SYSTEM_ADMIN)
export class AuditController {
 constructor(private readonly audit:AuditService){}

 @Get()
 list(@Query() query:AuditQueryDto){return this.audit.list(query);}

 @Get('export/file')
 @Header('Content-Type','text/csv; charset=utf-8')
 @Header('Content-Disposition','attachment; filename="audit-logs.csv"')
 async export(@Query() query:AuditQueryDto){
  const csv=await this.audit.exportCsv(query);
  return new StreamableFile(Buffer.from(csv,'utf8'));
 }

 @Get(':auditId')
 getOne(@Param('auditId',uuid) id:string){return this.audit.getOne(id);}
}
