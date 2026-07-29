import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Notification, NotificationType } from '../../common/entities/notification.entity';
import {
  NotificationStatus,
  UserNotification,
} from '../../common/entities/user-notification.entity';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import {
  CreateNotificationDto,
  NotificationQueryDto,
} from './dtos/notifications.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifications:Repository<Notification>,
    @InjectRepository(UserNotification)
    private readonly inbox:Repository<UserNotification>,
    @InjectRepository(User)
    private readonly users:Repository<User>,
    private readonly dataSource:DataSource,
  ) {}

  async create(dto:CreateNotificationDto,actor:AuthenticatedUser) {
    this.assertNotificationType(actor,dto.notification_type);
    this.assertTargetUrl(dto.target_url);
    const recipients=await this.users.find({where:{id:In(dto.user_ids)}});
    if(recipients.length!==dto.user_ids.length) {
      const found=new Set(recipients.map((user)=>user.id));
      const missing=dto.user_ids.filter((id)=>!found.has(id));
      throw new BadRequestException({
        message:'One or more notification recipients do not exist',
        invalid_user_ids:missing,
      });
    }
    const unavailable=recipients.filter((user)=>user.status!==UserStatus.ACTIVE);
    if(unavailable.length) {
      throw new BadRequestException({
        message:'Notifications can be sent only to active users',
        invalid_user_ids:unavailable.map((user)=>user.id),
      });
    }
    if(actor.role===UserRole.INSTRUCTOR) {
      const invalid=recipients.filter((user)=>user.role!==UserRole.STUDENT);
      if(invalid.length) {
        throw new ForbiddenException('Instructors can send notifications only to students');
      }
    }
    return this.dataSource.transaction(async(manager)=>{
      const notification=await manager.save(Notification,manager.create(Notification,{
        title:dto.title.trim(),
        message:dto.message.trim(),
        targetUrl:dto.target_url?.trim()||null,
        notificationType:dto.notification_type,
        createdBy:actor.userId,
      }));
      await manager.save(UserNotification,dto.user_ids.map((userId)=>
        manager.create(UserNotification,{
          notificationId:notification.id,userId,
          notificationStatus:NotificationStatus.UNREAD,
          readAt:null,
        }),
      ));
      return {...notification,recipients_count:dto.user_ids.length};
    });
  }

  async list(query:NotificationQueryDto,userId:string) {
    const page=query.page??1,limit=query.limit??20;
    const builder=this.inbox.createQueryBuilder('inbox')
      .innerJoinAndSelect('inbox.notification','notification')
      .leftJoinAndSelect('notification.creator','creator')
      .where('inbox.user_id = :userId',{userId})
      .orderBy('inbox.created_at','DESC')
      .skip((page-1)*limit).take(limit);
    if(query.status) {
      builder.andWhere('inbox.notification_status = :status',{status:query.status});
    }
    if(query.notification_type) {
      builder.andWhere('notification.notification_type = :type',{type:query.notification_type});
    }
    const [rows,total]=await builder.getManyAndCount();
    return {
      data:rows.map((row)=>this.toView(row)),
      page,limit,total,total_pages:Math.ceil(total/limit),
    };
  }

  async unreadCount(userId:string) {
    const count=await this.inbox.count({
      where:{userId,notificationStatus:NotificationStatus.UNREAD},
    });
    return {count};
  }

  async markRead(notificationId:string,userId:string) {
    const item=await this.requireInboxItem(notificationId,userId);
    if(item.notificationStatus===NotificationStatus.UNREAD) {
      item.notificationStatus=NotificationStatus.READ;
      item.readAt=new Date();
      await this.inbox.save(item);
    }
    return this.toView(item);
  }

  async markAllRead(userId:string) {
    const result=await this.inbox.createQueryBuilder()
      .update(UserNotification)
      .set({notificationStatus:NotificationStatus.READ,readAt:()=> 'CURRENT_TIMESTAMP'})
      .where('user_id = :userId',{userId})
      .andWhere('notification_status = :status',{status:NotificationStatus.UNREAD})
      .execute();
    return {updated:result.affected??0};
  }

  async remove(notificationId:string,userId:string):Promise<void> {
    const item=await this.requireInboxItem(notificationId,userId);
    await this.inbox.remove(item);
  }

  private async requireInboxItem(notificationId:string,userId:string) {
    const item=await this.inbox.findOne({
      where:{notificationId,userId},
      relations:{notification:{creator:true}},
    });
    if(!item) throw new NotFoundException('Notification not found');
    return item;
  }

  private assertTargetUrl(value?:string) {
    if(value===undefined) return;
    const target=value.trim();
    if(!target.startsWith('/')||target.startsWith('//')||target.includes('\\')||/[\s\u0000-\u001F]/.test(target)) {
      throw new BadRequestException('target_url must be a safe internal application path');
    }
  }

  private assertNotificationType(actor:AuthenticatedUser,type:NotificationType) {
    if(actor.role===UserRole.SYSTEM_ADMIN) return;
    const allowed=[
      NotificationType.COURSE,NotificationType.LECTURE,
      NotificationType.FLASHCARD,NotificationType.TEST,
      NotificationType.REMINDER,NotificationType.GRADE,
      NotificationType.ANNOUNCEMENT,
    ];
    if(!allowed.includes(type)) {
      throw new ForbiddenException('This notification type is reserved for system administrators');
    }
  }

  private toView(item:UserNotification) {
    return {
      id:item.notification.id,
      title:item.notification.title,
      message:item.notification.message,
      target_url:item.notification.targetUrl,
      notification_type:item.notification.notificationType,
      created_by:item.notification.createdBy,
      creator:item.notification.creator?{
        id:item.notification.creator.id,
        full_name:item.notification.creator.fullName,
      }:null,
      status:item.notificationStatus,
      read_at:item.readAt,
      created_at:item.createdAt,
    };
  }
}
