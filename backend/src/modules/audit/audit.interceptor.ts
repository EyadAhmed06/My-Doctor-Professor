import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, mergeMap } from 'rxjs';
import { AuditAction } from '../../common/entities/audit-log.entity';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit:AuditService) {}

  intercept(context:ExecutionContext,next:CallHandler):Observable<unknown> {
    if(context.getType()!=='http') return next.handle();
    const request=context.switchToHttp().getRequest();
    const method=String(request.method??'GET').toUpperCase();
    const path=String(request.originalUrl??request.url??'').split('?')[0];
    if(!this.shouldAudit(method,path)) return next.handle();
    const body=this.audit.sanitize(request.body);
    return next.handle().pipe(mergeMap(async(result)=>{
      const entityId=this.entityId(request.params,result);
      await this.audit.tryRecord({
        userId:request.user?.userId??this.responseUserId(result),
        action:this.action(method,path),
        entityName:this.entityName(path),
        entityId,
        description:`${method} ${path}`,
        newValues:body,
        ipAddress:request.ip??request.socket?.remoteAddress,
        userAgent:request.headers?.['user-agent'],
      });
      return result;
    }));
  }

  private shouldAudit(method:string,path:string):boolean {
    return ['POST','PUT','PATCH','DELETE'].includes(method)||
      (method==='GET'&&path.includes('/audit-logs'));
  }

  private action(method:string,path:string):AuditAction {
    if(path.includes('/auth/login')) return AuditAction.LOGIN;
    if(path.includes('/auth/logout')) return AuditAction.LOGOUT;
    if(path.includes('/password-reset')&&path.includes('request')) return AuditAction.PASSWORD_RESET_REQUEST;
    if(path.includes('/change-password')||path.includes('/password-reset/confirm')) return AuditAction.PASSWORD_CHANGED;
    if(path.includes('/attempts')&&path.endsWith('/submit')) return AuditAction.SUBMIT_TEST;
    if(method==='POST'&&/\/tests\/[^/]+\/attempts$/.test(path)) return AuditAction.START_TEST;
    if(path.includes('/bookmark')) return method==='DELETE'?AuditAction.REMOVE_BOOKMARK:AuditAction.BOOKMARK_QUESTION;
    if(path.includes('/flashcards/')&&path.endsWith('/review')) return AuditAction.REVIEW_FLASHCARDS;
    if(path.includes('/audit-logs/export')) return AuditAction.EXPORT_DATA;
    if(method==='GET'&&path.includes('/audit-logs')) return AuditAction.VIEW_REPORTS;
    if(method==='POST') return AuditAction.CREATE;
    if(method==='DELETE') return AuditAction.DELETE;
    return AuditAction.UPDATE;
  }

  private entityName(path:string):string {
    const clean=path.replace(/^\/api\/v1\//,'').replace(/^\//,'');
    return (clean.split('/')[0]||'system').slice(0,100);
  }

  private entityId(params:Record<string,unknown>,result:unknown):string|null {
    const candidates=[
      result&&typeof result==='object'?(result as Record<string,unknown>).id:null,
      ...Object.values(params??{}),
    ];
    return candidates.find((value)=>typeof value==='string'&&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) as string|undefined??null;
  }

  private responseUserId(result:unknown):string|null {
    if(!result||typeof result!=='object') return null;
    const record=result as Record<string,unknown>;
    const user=record.user;
    if(user&&typeof user==='object'&&typeof (user as Record<string,unknown>).id==='string') {
      return (user as Record<string,unknown>).id as string;
    }
    return null;
  }
}
