import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from '../../common/entities/notification.entity';
import { UserNotification } from '../../common/entities/user-notification.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, UserNotification])],
  exports: [TypeOrmModule],
})
export class NotificationsModule {}
