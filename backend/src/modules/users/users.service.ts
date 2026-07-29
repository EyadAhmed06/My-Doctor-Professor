import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { AuthSession } from './entities/auth-session.entity';
import { Instructor } from './entities/instructor.entity';
import { Student } from './entities/student.entity';
import { SystemAdmin } from './entities/system-admin.entity';
import { Gender, User, UserRole, UserStatus } from './entities/user.entity';

export interface CreateStudentAccountInput {
  fullName: string;
  email: string;
  password: string;
  phoneNumber: string;
  studentNumber: string;
  currentSemester: number;
  dateOfBirth?: Date;
  gender?: Gender;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    @InjectRepository(Student) private readonly studentsRepository: Repository<Student>,
    @InjectRepository(Instructor) private readonly instructorsRepository: Repository<Instructor>,
    @InjectRepository(SystemAdmin) private readonly systemAdminsRepository: Repository<SystemAdmin>,
    @InjectRepository(AuthSession) private readonly sessionsRepository: Repository<AuthSession>,
    private readonly dataSource: DataSource,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email: email.trim().toLowerCase() } });
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  validatePassword(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }

  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  async createStudentAccount(input: CreateStudentAccountInput): Promise<User> {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await this.hashPassword(input.password);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const duplicate = await manager.findOne(User, {
          where: [
            { email },
            { phoneNumber: input.phoneNumber },
          ],
        });
        if (duplicate) throw new ConflictException('Email or phone number is already registered');

        const duplicateStudent = await manager.findOne(Student, {
          where: { studentNumber: input.studentNumber },
        });
        if (duplicateStudent) throw new ConflictException('Student number is already registered');

        const user = manager.create(User, {
          fullName: input.fullName.trim(),
          email,
          passwordHash,
          phoneNumber: input.phoneNumber,
          role: UserRole.STUDENT,
          status: UserStatus.PENDING_VERIFICATION,
          dateOfBirth: input.dateOfBirth ?? null,
          gender: input.gender ?? null,
          emailVerified: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: null,
          profilePictureUrl: null,
        });
        const savedUser = await manager.save(User, user);
        const student = manager.create(Student, {
          userId: savedUser.id,
          studentNumber: input.studentNumber.trim(),
          currentSemester: input.currentSemester,
        });
        await manager.save(Student, student);
        return savedUser;
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw new ConflictException('A unique account field is already registered');
      }
      throw error;
    }
  }

  async createInstructor(user: User, data?: { specialization?: string; office_location?: string }): Promise<Instructor> {
    return this.instructorsRepository.save(this.instructorsRepository.create({ userId: user.id, specialization: data?.specialization ?? null, officeLocation: data?.office_location ?? null }));
  }

  async createSystemAdmin(user: User, data?: { employee_number?: string; is_super_admin?: boolean }): Promise<SystemAdmin> {
    return this.systemAdminsRepository.save(this.systemAdminsRepository.create({ userId: user.id, employeeNumber: data?.employee_number ?? null, isSuperAdmin: data?.is_super_admin ?? false }));
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.usersRepository.update({ id: userId }, { lastLoginAt: new Date() });
  }

  async verifyEmail(userId: string): Promise<void> {
    await this.usersRepository.update({ id: userId }, { emailVerified: true, status: UserStatus.ACTIVE });
  }

  async getUserProfile(userId: string) {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    const { passwordHash: _passwordHash, failedLoginAttempts: _failed, lockedUntil: _locked, ...safeUser } = user;
    return safeUser;
  }

  async recordFailedLogin(userId: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) return;
    const failedLoginAttempts = user.failedLoginAttempts + 1;
    const lockedUntil = failedLoginAttempts >= 5 ? new Date(Date.now() + 15 * 60_000) : user.lockedUntil;
    await this.usersRepository.update({ id: userId }, { failedLoginAttempts, lockedUntil });
  }

  async resetFailedLoginAttempts(userId: string): Promise<void> {
    await this.usersRepository.update({ id: userId }, { failedLoginAttempts: 0, lockedUntil: null });
  }

  async isAccountLocked(userId: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user?.lockedUntil) return false;
    if (user.lockedUntil > new Date()) return true;
    await this.resetFailedLoginAttempts(userId);
    return false;
  }

  async saveSession(id: string, userId: string, refreshTokenHash: string, expiresAt: Date): Promise<void> {
    await this.sessionsRepository.save(this.sessionsRepository.create({ id, userId, refreshTokenHash, expiresAt, revokedAt: null, lastUsedAt: null }));
  }

  findSession(id: string): Promise<AuthSession | null> {
    return this.sessionsRepository.findOne({ where: { id } });
  }

  async rotateSession(id: string, refreshTokenHash: string, expiresAt: Date): Promise<void> {
    await this.sessionsRepository.update({ id }, { refreshTokenHash, expiresAt, lastUsedAt: new Date() });
  }

  async revokeSession(id: string): Promise<void> {
    await this.sessionsRepository.update({ id }, { revokedAt: new Date() });
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.sessionsRepository.createQueryBuilder().update(AuthSession).set({ revokedAt: new Date() }).where('user_id = :userId AND revoked_at IS NULL', { userId }).execute();
  }
}
