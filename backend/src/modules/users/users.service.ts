import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole, UserStatus, Gender } from './entities/user.entity';
import { Student } from './entities/student.entity';
import { Instructor } from './entities/instructor.entity';
import { SystemAdmin } from './entities/system-admin.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Student)
    private studentsRepository: Repository<Student>,
    @InjectRepository(Instructor)
    private instructorsRepository: Repository<Instructor>,
    @InjectRepository(SystemAdmin)
    private systemAdminsRepository: Repository<SystemAdmin>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email: email.toLowerCase() },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async validatePassword(
    password: string,
    passwordHash: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }

  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  async createUser(userData: {
    full_name: string;
    email: string;
    password: string;
    phone_number: string;
    role: UserRole;
    date_of_birth?: Date;
    gender?: string | Gender;
  }): Promise<User> {
    // Check if user already exists
    const existingUser = await this.findByEmail(userData.email);
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const existingPhone = await this.usersRepository.findOne({
      where: { phoneNumber: userData.phone_number },
    });
    if (existingPhone) {
      throw new ConflictException('Phone number already registered');
    }

    // Hash password
    const passwordHash = await this.hashPassword(userData.password);

    // Create user
    const user = new User();
    user.fullName = userData.full_name;
    user.email = userData.email.toLowerCase();
    user.passwordHash = passwordHash;
    user.phoneNumber = userData.phone_number;
    user.role = userData.role;
    user.dateOfBirth = userData.date_of_birth || null;
    user.gender = (userData.gender as Gender) || null;
    user.status = UserStatus.PENDING_VERIFICATION;
    user.emailVerified = false;

    return this.usersRepository.save(user);
  }

  async createStudent(
    user: User,
    studentData?: { student_number: string; current_semester: number },
  ): Promise<Student> {
    if (!studentData) {
      throw new BadRequestException('Student data is required');
    }

    // Check if student number already exists
    const existingStudent = await this.studentsRepository.findOne({
      where: { studentNumber: studentData.student_number },
    });
    if (existingStudent) {
      throw new ConflictException('Student number already registered');
    }

    const student = this.studentsRepository.create({
      userId: user.id,
      studentNumber: studentData.student_number,
      currentSemester: studentData.current_semester || 1,
    });

    return this.studentsRepository.save(student);
  }

  async createInstructor(
    user: User,
    instructorData?: { specialization?: string; office_location?: string },
  ): Promise<Instructor> {
    const instructor = this.instructorsRepository.create({
      userId: user.id,
      specialization: instructorData?.specialization || null,
      officeLocation: instructorData?.office_location || null,
    });

    return this.instructorsRepository.save(instructor);
  }

  async createSystemAdmin(
    user: User,
    adminData?: { employee_number?: string; is_super_admin?: boolean },
  ): Promise<SystemAdmin> {
    const admin = this.systemAdminsRepository.create({
      userId: user.id,
      employeeNumber: adminData?.employee_number || null,
      isSuperAdmin: adminData?.is_super_admin || false,
    });

    return this.systemAdminsRepository.save(admin);
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.usersRepository.update(
      { id: userId },
      { lastLoginAt: new Date() },
    );
  }

  async verifyEmail(userId: string): Promise<void> {
    await this.usersRepository.update(
      { id: userId },
      { emailVerified: true, status: UserStatus.ACTIVE },
    );
  }

  async getUserProfile(userId: string) {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async recordFailedLogin(userId: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) return;

    const failedAttempts = user.failedLoginAttempts + 1;
    const lockDuration = 15; // minutes

    if (failedAttempts >= 5) {
      const lockedUntil = new Date(
        Date.now() + lockDuration * 60 * 1000,
      );
      await this.usersRepository.update(
        { id: userId },
        {
          failedLoginAttempts: failedAttempts,
          lockedUntil,
        },
      );
    } else {
      await this.usersRepository.update(
        { id: userId },
        { failedLoginAttempts: failedAttempts },
      );
    }
  }

  async resetFailedLoginAttempts(userId: string): Promise<void> {
    await this.usersRepository.update(
      { id: userId },
      {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    );
  }

  async isAccountLocked(userId: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user || !user.lockedUntil) return false;

    const now = new Date();
    if (user.lockedUntil > now) {
      return true;
    }

    // Unlock account if lock period has expired
    await this.resetFailedLoginAttempts(userId);
    return false;
  }
}




