import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Student } from './entities/student.entity';
import { Instructor } from './entities/instructor.entity';
import { SystemAdmin } from './entities/system-admin.entity';
import { InstructorAvailability } from './entities/instructor-availability.entity';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Student,
      Instructor,
      SystemAdmin,
      InstructorAvailability,
    ]),
  ],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

