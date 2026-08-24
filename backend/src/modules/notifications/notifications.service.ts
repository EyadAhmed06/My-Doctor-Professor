import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
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
  private readonly logger = new Logger(NotificationsService.name);

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
      if(invalid.length) throw new ForbiddenException('Instructors can send notifications only to students');
      const allowedRows=await this.dataSource.query(`
        SELECT DISTINCT enrollment.student_id
        FROM bundle_enrollments enrollment
        JOIN bundles bundle ON bundle.id=enrollment.bundle_id
        LEFT JOIN bundle_instructors assignment ON assignment.bundle_id=bundle.id
        LEFT JOIN bundle_courses bundle_course ON bundle_course.bundle_id=bundle.id
        LEFT JOIN course_instructors course_assignment ON course_assignment.course_id=bundle_course.course_id
        WHERE (assignment.instructor_id=$1 OR course_assignment.instructor_id=$1)
          AND enrollment.student_id=ANY($2::uuid[])
          AND enrollment.status='ACTIVE'
          AND (enrollment.expires_at IS NULL OR enrollment.expires_at>CURRENT_TIMESTAMP)
          AND bundle.status='PUBLISHED'
          AND (bundle.is_free=TRUE OR enrollment.payment_status='PAID')
      `,[actor.userId,dto.user_ids]) as Array<{student_id:string}>;
      const allowed=new Set(allowedRows.map((row)=>row.student_id));
      const unrelated=dto.user_ids.filter((id)=>!allowed.has(id));
      if(unrelated.length) {
        throw new ForbiddenException('Instructors can notify only active students in their published bundles');
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

  async notifyUser(
    userId:string,
    event:Omit<CreateNotificationDto,'user_ids'>,
    actor:AuthenticatedUser,
  ):Promise<void> {
    await this.tryCreate({...event,user_ids:[userId]},actor);
  }

  async notifyCourseStudents(
    courseId:string,
    event:Omit<CreateNotificationDto,'user_ids'>,
    actor:AuthenticatedUser,
  ):Promise<void> {
    const ids=await this.activeSubscriberIds(`
      JOIN bundle_courses scope ON scope.bundle_id=bundle.id
      WHERE scope.course_id=$1
    `,courseId);
    await this.deliver(ids,event,actor);
  }

  async notifyWeekStudents(
    weekId:string,
    event:Omit<CreateNotificationDto,'user_ids'>,
    actor:AuthenticatedUser,
  ):Promise<void> {
    const ids=await this.activeSubscriberIds(`
      JOIN bundle_weeks scope ON scope.bundle_id=bundle.id
      WHERE scope.week_id=$1
    `,weekId);
    await this.deliver(ids,event,actor);
  }

  async notifyBundleStudents(
    bundleId:string,
    event:Omit<CreateNotificationDto,'user_ids'>,
    actor:AuthenticatedUser,
  ):Promise<void> {
    const ids=await this.activeSubscriberIds('WHERE bundle.id=$1',bundleId);
    await this.deliver(ids,event,actor);
  }

  private async activeSubscriberIds(scopeSql:string,scopeId:string):Promise<string[]> {
    const rows=await this.dataSource.query(`
      SELECT DISTINCT user_account.id
      FROM bundle_enrollments enrollment
      JOIN bundles bundle ON bundle.id=enrollment.bundle_id
      JOIN users user_account ON user_account.id=enrollment.student_id
      ${scopeSql}
        AND enrollment.status='ACTIVE'
        AND enrollment.starts_at<=CURRENT_TIMESTAMP
        AND (enrollment.expires_at IS NULL OR enrollment.expires_at>CURRENT_TIMESTAMP)
        AND bundle.status='PUBLISHED'
        AND (bundle.is_free=TRUE OR enrollment.payment_status='PAID')
        AND (bundle.available_from IS NULL OR bundle.available_from<=CURRENT_TIMESTAMP)
        AND (bundle.available_until IS NULL OR bundle.available_until>CURRENT_TIMESTAMP)
        AND user_account.role='STUDENT'
        AND user_account.status='ACTIVE'
    `,[scopeId]) as Array<{id:string}>;
    return rows.map((row)=>row.id);
  }

  private async deliver(
    ids:string[],
    event:Omit<CreateNotificationDto,'user_ids'>,
    actor:AuthenticatedUser,
  ):Promise<void> {
    for(let offset=0;offset<ids.length;offset+=500) {
      await this.tryCreate({...event,user_ids:ids.slice(offset,offset+500)},actor);
    }
  }

  private async tryCreate(dto:CreateNotificationDto,actor:AuthenticatedUser):Promise<void> {
    try {
      await this.create(dto,actor);
    } catch(error) {
      this.logger.error(
        'Automatic notification delivery failed',
        error instanceof Error?error.stack:undefined,
      );
    }
  }

  async list(query:NotificationQueryDto,userId:string) {
    await this.ensureStudentReminders(userId);
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
    await this.ensureStudentReminders(userId);
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

  private async ensureStudentReminders(userId:string):Promise<void> {
    const user=await this.users.findOne({where:{id:userId}});
    if(!user||user.role!==UserRole.STUDENT||user.status!==UserStatus.ACTIVE) return;
    const [planRows,flashcardRows]=await Promise.all([
      this.dataSource.query(`
        SELECT COUNT(*)::int AS due
        FROM study_plan_items
        WHERE student_id=$1 AND status='PLANNED' AND scheduled_date<=CURRENT_DATE
      `,[userId]),
      this.dataSource.query(`
        SELECT COUNT(*)::int AS due
        FROM student_flashcard_progress progress
        JOIN flashcards card ON card.id=progress.flashcard_id AND card.is_active=TRUE
        JOIN flashcard_decks deck ON deck.id=card.deck_id AND deck.is_published=TRUE
        WHERE progress.student_id=$1 AND progress.times_reviewed>0
          AND progress.next_review_at<=CURRENT_TIMESTAMP
          AND EXISTS (
            SELECT 1 FROM bundle_enrollments enrollment
            JOIN bundles bundle ON bundle.id=enrollment.bundle_id
            JOIN bundle_courses bundle_course ON bundle_course.bundle_id=bundle.id
            WHERE enrollment.student_id=$1 AND bundle_course.course_id=deck.course_id
              AND enrollment.status='ACTIVE'
              AND (enrollment.expires_at IS NULL OR enrollment.expires_at>CURRENT_TIMESTAMP)
              AND bundle.status='PUBLISHED'
              AND (bundle.is_free=TRUE OR enrollment.payment_status='PAID')
              AND (bundle.available_until IS NULL OR bundle.available_until>CURRENT_TIMESTAMP)
          )
      `,[userId]),
    ]);
    const planDue=Number(planRows[0]?.due||0);
    const cardsDue=Number(flashcardRows[0]?.due||0);
    if(planDue>0) await this.createDailyReminder(
      userId,'Study plan reminder',
      `You have ${planDue} planned session${planDue===1?'':'s'} due. Open your calendar to keep your momentum.`,
      '/study-plan/calendar',
    );
    if(cardsDue>0) await this.createDailyReminder(
      userId,'Flashcards due',
      `${cardsDue} flashcard${cardsDue===1?' is':'s are'} ready for review.`,
      '/flashcards',
    );
  }

  private async createDailyReminder(
    userId:string,title:string,message:string,targetUrl:string,
  ):Promise<void> {
    const existing=await this.dataSource.query(`
      SELECT 1 FROM user_notifications inbox
      JOIN notifications notification ON notification.id=inbox.notification_id
      WHERE inbox.user_id=$1 AND notification.notification_type='REMINDER'
        AND notification.title=$2 AND inbox.created_at::date=CURRENT_DATE
      LIMIT 1
    `,[userId,title]);
    if(existing.length) return;
    await this.dataSource.transaction(async(manager)=>{
      const notification=await manager.save(Notification,manager.create(Notification,{
        title,message,targetUrl,notificationType:NotificationType.REMINDER,createdBy:null,
      }));
      await manager.save(UserNotification,manager.create(UserNotification,{
        notificationId:notification.id,userId,
        notificationStatus:NotificationStatus.UNREAD,readAt:null,
      }));
    });
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
