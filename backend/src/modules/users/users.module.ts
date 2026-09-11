import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthSession } from './entities/auth-session.entity';
import { InstructorAvailability } from './entities/instructor-availability.entity';
import { Instructor } from './entities/instructor.entity';
import { Student } from './entities/student.entity';
import { SystemAdmin } from './entities/system-admin.entity';
import { User } from './entities/user.entity';
import { ProfilePictureStorageService } from './profile-picture-storage.service';
import { ProfilePicturesController } from './profile-pictures.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Student, Instructor, SystemAdmin, InstructorAvailability, AuthSession])],
  controllers: [UsersController, ProfilePicturesController],
  providers: [UsersService, ProfilePictureStorageService],
  exports: [UsersService, ProfilePictureStorageService],
})
export class UsersModule {}
