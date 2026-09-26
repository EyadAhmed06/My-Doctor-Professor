import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from '../../common/entities/notification.entity';
import { UserNotification } from '../../common/entities/user-notification.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
 imports:[TypeOrmModule.forFeature([Notification,UserNotification,User])],
 controllers:[NotificationsController],
 providers:[NotificationsService],
 exports:[NotificationsService,TypeOrmModule],
})
export class NotificationsModule {}
