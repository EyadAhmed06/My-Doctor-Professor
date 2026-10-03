import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { CreateNotificationDto, NotificationQueryDto } from './dtos/notifications.dto';
import { NotificationsService } from './notifications.service';
const uuid=new ParseUUIDPipe({version:'4'});

@Controller('notifications')
@UseGuards(JwtAuthGuard,RolesGuard)
export class NotificationsController {
 constructor(private readonly notifications:NotificationsService){}

 @Get()
 list(@Query() query:NotificationQueryDto,@CurrentUser() actor:AuthenticatedUser){
  return this.notifications.list(query,actor.userId);
 }
 @Post() @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN)
 create(@Body() dto:CreateNotificationDto,@CurrentUser() actor:AuthenticatedUser){
  return this.notifications.create(dto,actor);
 }
 @Put('mark-read')
 markAllRead(@CurrentUser() actor:AuthenticatedUser){
  return this.notifications.markAllRead(actor.userId);
 }
 @Get('unread/count')
 unreadCount(@CurrentUser() actor:AuthenticatedUser){
  return this.notifications.unreadCount(actor.userId);
 }
 @Put(':notificationId')
 markRead(@Param('notificationId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){
  return this.notifications.markRead(id,actor.userId);
 }
 @Delete(':notificationId') @HttpCode(HttpStatus.NO_CONTENT)
 async remove(@Param('notificationId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){
  await this.notifications.remove(id,actor.userId);
 }
}
