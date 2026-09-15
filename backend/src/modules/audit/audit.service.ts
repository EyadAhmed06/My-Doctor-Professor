import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { AuditAction, AuditLog } from '../../common/entities/audit-log.entity';
import { AuditQueryDto } from './dtos/audit.dto';

export interface AuditRecordInput {
  userId?:string|null;
  action:AuditAction;
  entityName:string;
  entityId?:string|null;
  description?:string|null;
  oldValues?:unknown;
  newValues?:unknown;
  ipAddress?:string|null;
  userAgent?:string|null;
}

@Injectable()
export class AuditService {
  private readonly logger=new Logger(AuditService.name);
  private readonly sensitiveKeys=[
    'password','password_hash','passwordHash','token','access_token','refresh_token',
    'secret','authorization','cookie','verification_code','reset_code','code_hash',
  ];

  constructor(
    @InjectRepository(AuditLog) private readonly logs:Repository<AuditLog>,
  ) {}

  async record(input:AuditRecordInput):Promise<AuditLog> {
    const entityName=input.entityName.trim().slice(0,100);
    if(!entityName) throw new BadRequestException('Audit entity name is required');
    return this.logs.save(this.logs.create({
      userId:input.userId??null,
      action:input.action,
      entityName,
      entityId:input.entityId??null,
      description:input.description?.slice(0,2000)??null,
      oldValues:this.prepareValues(input.oldValues),
      newValues:this.prepareValues(input.newValues),
      ipAddress:this.normalizeIp(input.ipAddress),
      userAgent:input.userAgent?.slice(0,1000)??null,
    }));
  }

  async tryRecord(input:AuditRecordInput):Promise<void> {
    try {
      await this.record(input);
    } catch(error) {
      this.logger.error(
        `Audit write failed for ${input.action} ${input.entityName}`,
        error instanceof Error?error.stack:undefined,
      );
    }
  }

  async list(query:AuditQueryDto) {
    this.assertDateRange(query);
    const page=query.page??1,limit=query.limit??50;
    const builder=this.buildQuery(query)
      .orderBy('audit.created_at','DESC')
      .skip((page-1)*limit).take(limit);
    const [rows,total]=await builder.getManyAndCount();
    return {
      data:rows.map((row)=>this.toView(row)),
      page,limit,total,total_pages:Math.ceil(total/limit),
    };
  }

  async getOne(id:string) {
    const log=await this.logs.findOne({where:{id},relations:{user:true}});
    if(!log) throw new NotFoundException('Audit log not found');
    return this.toView(log);
  }

  async exportCsv(query:AuditQueryDto):Promise<string> {
    this.assertDateRange(query,true);
    const rows=await this.buildQuery(query)
      .orderBy('audit.created_at','DESC').take(50_000).getMany();
    const headers=[
      'id','created_at','user_id','user_email','action','entity_name','entity_id',
      'description','ip_address','user_agent','old_values','new_values',
    ];
    const lines=[headers.join(',')];
    for(const row of rows) {
      lines.push([
        row.id,row.createdAt.toISOString(),row.userId,row.user?.email,row.action,
        row.entityName,row.entityId,row.description,row.ipAddress,row.userAgent,
        row.oldValues?JSON.stringify(row.oldValues):null,
        row.newValues?JSON.stringify(row.newValues):null,
      ].map((value)=>this.csv(value)).join(','));
    }
    return lines.join('\n');
  }

  sanitize(value:unknown):Record<string,unknown>|null {
    const sanitized=this.redact(value,0);
    return sanitized&&typeof sanitized==='object'&&!Array.isArray(sanitized)
      ?sanitized as Record<string,unknown>
      :sanitized===null?null:{value:sanitized};
  }

  private buildQuery(query:AuditQueryDto):SelectQueryBuilder<AuditLog> {
    const builder=this.logs.createQueryBuilder('audit')
      .leftJoinAndSelect('audit.user','user');
    if(query.user_id) builder.andWhere('audit.user_id = :userId',{userId:query.user_id});
    if(query.action) builder.andWhere('audit.action = :action',{action:query.action});
    if(query.entity_name) builder.andWhere('audit.entity_name = :entityName',{entityName:query.entity_name.trim()});
    if(query.entity_id) builder.andWhere('audit.entity_id = :entityId',{entityId:query.entity_id});
    if(query.date_from) builder.andWhere('audit.created_at >= :dateFrom',{dateFrom:new Date(query.date_from)});
    if(query.date_until) builder.andWhere('audit.created_at <= :dateUntil',{dateUntil:new Date(query.date_until)});
    return builder;
  }

  private assertDateRange(query:AuditQueryDto,forExport=false) {
    if(query.date_from&&query.date_until) {
      const from=new Date(query.date_from),until=new Date(query.date_until);
      if(until<from) throw new BadRequestException('date_until must not be earlier than date_from');
      if(forExport&&until.getTime()-from.getTime()>31*86_400_000) {
        throw new BadRequestException('Audit exports are limited to a 31-day range');
      }
    } else if(forExport) {
      throw new BadRequestException('Audit export requires date_from and date_until');
    }
  }

  private prepareValues(value:unknown):Record<string,unknown>|null {
    if(value===undefined||value===null) return null;
    const sanitized=this.sanitize(value);
    if(!sanitized) return null;
    const serialized=JSON.stringify(sanitized);
    if(Buffer.byteLength(serialized,'utf8')>32_768) {
      return {truncated:true,original_size_bytes:Buffer.byteLength(serialized,'utf8')};
    }
    return sanitized;
  }

  private redact(value:unknown,depth:number):unknown {
    if(depth>8) return '[MAX_DEPTH]';
    if(value===null||value===undefined||typeof value==='boolean'||
      typeof value==='number'||typeof value==='string') {
      return typeof value==='string'&&value.length>4000?value.slice(0,4000):value??null;
    }
    if(Array.isArray(value)) return value.slice(0,100).map((item)=>this.redact(item,depth+1));
    if(typeof value==='object') {
      const output:Record<string,unknown>={};
      for(const [key,item] of Object.entries(value as Record<string,unknown>).slice(0,100)) {
        const normalized=key.toLowerCase();
        output[key]=this.sensitiveKeys.some((secret)=>normalized.includes(secret.toLowerCase()))
          ?'[REDACTED]':this.redact(item,depth+1);
      }
      return output;
    }
    return String(value);
  }

  private normalizeIp(value?:string|null):string|null {
    if(!value) return null;
    const first=value.split(',')[0].trim();
    return first.startsWith('::ffff:')?first.slice(7):first;
  }

  private csv(value:unknown):string {
    if(value===null||value===undefined) return '';
    let text=String(value);
    if(/^[=+\-@]/.test(text)) text=`'${text}`;
    return `"${text.replace(/"/g,'""')}"`;
  }

  private toView(log:AuditLog) {
    return {
      id:log.id,user_id:log.userId,
      user:log.user?{id:log.user.id,full_name:log.user.fullName,email:log.user.email,role:log.user.role}:null,
      action:log.action,entity_name:log.entityName,entity_id:log.entityId,
      description:log.description,old_values:log.oldValues,new_values:log.newValues,
      ip_address:log.ipAddress,user_agent:log.userAgent,created_at:log.createdAt,
    };
  }
}
