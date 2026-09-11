import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Instructor } from '../users/entities/instructor.entity';
import { Student } from '../users/entities/student.entity';
import { SystemAdmin } from '../users/entities/system-admin.entity';
import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { AdminController } from './admin.controller';
import { AdminBootstrapController } from './admin-bootstrap.controller';
import { AdminService } from './admin.service';

@Module({
 imports:[
  TypeOrmModule.forFeature([User,Student,Instructor,SystemAdmin]),
  UsersModule,AuthModule,
 ],
 controllers:[AdminController,AdminBootstrapController],
 providers:[AdminService],
 exports:[AdminService],
})
export class AdminModule {}
