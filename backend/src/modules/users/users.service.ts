import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcrypt';
import { DataSource, Not, QueryFailedError, Repository } from 'typeorm';
import { AuthSession } from './entities/auth-session.entity';
import { Instructor } from './entities/instructor.entity';
import { Student } from './entities/student.entity';
import { SystemAdmin } from './entities/system-admin.entity';
import { Gender, User, UserRole, UserStatus } from './entities/user.entity';

export interface CreateStudentAccountInput {
  fullName:string;email:string;password:string;phoneNumber:string;
  studentNumber:string;currentSemester:number;dateOfBirth?:Date;gender?:Gender;
}
export interface CreateManagedAccountInput {
  fullName:string;email:string;password:string;phoneNumber:string;role:UserRole;
  studentNumber?:string;currentSemester?:number;
  specialization?:string;officeLocation?:string;
  employeeNumber?:string;isSuperAdmin?:boolean;
  dateOfBirth?:Date;gender?:Gender;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepository:Repository<User>,
    @InjectRepository(Student) private readonly studentsRepository:Repository<Student>,
    @InjectRepository(Instructor) private readonly instructorsRepository:Repository<Instructor>,
    @InjectRepository(SystemAdmin) private readonly systemAdminsRepository:Repository<SystemAdmin>,
    @InjectRepository(AuthSession) private readonly sessionsRepository:Repository<AuthSession>,
    private readonly dataSource:DataSource,
  ) {}

  findByEmail(email:string){return this.usersRepository.findOne({where:{email:email.trim().toLowerCase()}});}
  findById(id:string){return this.usersRepository.findOne({where:{id}});}

  validatePassword(password:string,passwordHash:string):Promise<boolean> {
    return passwordHash.startsWith('$argon2')
      ?argon2.verify(passwordHash,password):bcrypt.compare(password,passwordHash);
  }
  hashPassword(password:string):Promise<string> {
    return argon2.hash(password,{
      type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1,
    });
  }
  passwordHashNeedsUpgrade(passwordHash:string){return !passwordHash.startsWith('$argon2id$');}
  async upgradePasswordHash(userId:string,password:string) {
    await this.usersRepository.update({id:userId},{passwordHash:await this.hashPassword(password)});
  }

  createStudentAccount(input:CreateStudentAccountInput):Promise<User> {
    return this.createAccount({
      fullName:input.fullName,email:input.email,password:input.password,
      phoneNumber:input.phoneNumber,role:UserRole.STUDENT,
      studentNumber:input.studentNumber,currentSemester:input.currentSemester,
      dateOfBirth:input.dateOfBirth,gender:input.gender,
    },false);
  }

  createManagedAccount(input:CreateManagedAccountInput):Promise<User> {
    return this.createAccount(input,true);
  }

  private async createAccount(input:CreateManagedAccountInput,managed:boolean):Promise<User> {
    this.assertProfileFields(input);
    const email=input.email.trim().toLowerCase();
    const passwordHash=await this.hashPassword(input.password);
    try {
      return await this.dataSource.transaction(async(manager)=>{
        const duplicate=await manager.findOne(User,{
          where:[{email},{phoneNumber:input.phoneNumber}],
        });
        if(duplicate) throw new ConflictException('Email or phone number is already registered');
        if(input.studentNumber&&await manager.findOne(Student,{where:{studentNumber:input.studentNumber.trim()}})) {
          throw new ConflictException('Student number is already registered');
        }
        if(input.employeeNumber&&await manager.findOne(SystemAdmin,{where:{employeeNumber:input.employeeNumber.trim()}})) {
          throw new ConflictException('Employee number is already registered');
        }
        const user=await manager.save(User,manager.create(User,{
          fullName:input.fullName.trim(),email,passwordHash,
          phoneNumber:input.phoneNumber,dateOfBirth:input.dateOfBirth??null,
          gender:input.gender??null,role:input.role,
          status:managed?UserStatus.ACTIVE:UserStatus.PENDING_VERIFICATION,
          profilePictureUrl:null,emailVerified:managed,
          failedLoginAttempts:0,lockedUntil:null,lastLoginAt:null,
        }));
        if(input.role===UserRole.STUDENT) {
          await manager.save(Student,manager.create(Student,{
            userId:user.id,studentNumber:input.studentNumber!.trim(),
            currentSemester:input.currentSemester!,
          }));
        } else if(input.role===UserRole.INSTRUCTOR) {
          await manager.save(Instructor,manager.create(Instructor,{
            userId:user.id,specialization:input.specialization?.trim()||null,
            officeLocation:input.officeLocation?.trim()||null,biography:null,
          }));
        } else {
          await manager.save(SystemAdmin,manager.create(SystemAdmin,{
            userId:user.id,employeeNumber:input.employeeNumber?.trim()||null,
            isSuperAdmin:input.isSuperAdmin??false,
          }));
        }
        return user;
      });
    } catch(error) {
      if(error instanceof ConflictException||error instanceof BadRequestException) throw error;
      if(error instanceof QueryFailedError&&
        (error as QueryFailedError&{driverError?:{code?:string}}).driverError?.code==='23505') {
        throw new ConflictException('A unique account field is already registered');
      }
      throw error;
    }
  }

  async createInstructor(user:User,data?:{specialization?:string;office_location?:string}) {
    return this.instructorsRepository.save(this.instructorsRepository.create({
      userId:user.id,specialization:data?.specialization?.trim()||null,
      officeLocation:data?.office_location?.trim()||null,biography:null,
    }));
  }
  async createSystemAdmin(user:User,data?:{employee_number?:string;is_super_admin?:boolean}) {
    return this.systemAdminsRepository.save(this.systemAdminsRepository.create({
      userId:user.id,employeeNumber:data?.employee_number?.trim()||null,
      isSuperAdmin:data?.is_super_admin??false,
    }));
  }

  async updateLastLogin(userId:string){await this.usersRepository.update({id:userId},{lastLoginAt:new Date()});}
  async verifyEmail(userId:string){await this.usersRepository.update({id:userId},{emailVerified:true,status:UserStatus.ACTIVE});}

  async getUserProfile(userId:string) {
    const user=await this.findById(userId);
    if(!user) throw new NotFoundException('User not found');
    return this.safeUser(user);
  }

  async recordFailedLogin(userId:string) {
    const user=await this.findById(userId);if(!user)return;
    const attempts=user.failedLoginAttempts+1;
    await this.usersRepository.update({id:userId},{
      failedLoginAttempts:attempts,
      lockedUntil:attempts>=5?new Date(Date.now()+15*60_000):user.lockedUntil,
    });
  }
  async resetFailedLoginAttempts(userId:string) {
    await this.usersRepository.update({id:userId},{failedLoginAttempts:0,lockedUntil:null});
  }
  async isAccountLocked(userId:string) {
    const user=await this.findById(userId);
    if(!user?.lockedUntil)return false;
    if(user.lockedUntil>new Date())return true;
    await this.resetFailedLoginAttempts(userId);return false;
  }

  async saveSession(id:string,userId:string,refreshTokenHash:string,expiresAt:Date) {
    await this.sessionsRepository.save(this.sessionsRepository.create({
      id,userId,refreshTokenHash,expiresAt,revokedAt:null,lastUsedAt:null,
    }));
  }
  findSession(id:string){return this.sessionsRepository.findOne({where:{id}});}

  async getSecurityOverview(userId:string,currentSessionId:string) {
    const sessions=await this.sessionsRepository.createQueryBuilder('session')
      .where('session.user_id = :userId',{userId})
      .andWhere('session.revoked_at IS NULL')
      .andWhere('session.expires_at > CURRENT_TIMESTAMP')
      .orderBy('session.created_at','DESC')
      .getMany();
    const providers=await this.dataSource.query(
      `SELECT provider, provider_email, created_at, last_used_at
       FROM external_auth_identities
       WHERE user_id = $1
       ORDER BY provider`,
      [userId],
    ) as Array<{provider:string;provider_email:string;created_at:Date;last_used_at:Date|null}>;
    return {
      sessions:sessions.map(session=>({
        id:session.id,
        current:session.id===currentSessionId,
        created_at:session.createdAt,
        last_used_at:session.lastUsedAt,
        expires_at:session.expiresAt,
      })),
      providers:providers.map(provider=>({
        provider:provider.provider,
        email:provider.provider_email,
        linked_at:provider.created_at,
        last_used_at:provider.last_used_at,
      })),
    };
  }

  async revokeOtherSessions(userId:string,currentSessionId:string) {
    await this.sessionsRepository.createQueryBuilder().update(AuthSession)
      .set({revokedAt:new Date()})
      .where('user_id = :userId',{userId})
      .andWhere('id <> :currentSessionId',{currentSessionId})
      .andWhere('revoked_at IS NULL')
      .execute();
  }

  async rotateSessionSecure(
    id:string,userId:string,presentedTokenDigest:string,
    refreshTokenDigest:string,expiresAt:Date,
  ) {
    const outcome=await this.dataSource.transaction<'rotated'|'invalid'|'reuse'>(async manager=>{
      const rotation=await manager.createQueryBuilder()
        .update(AuthSession)
        .set({
          refreshTokenHash:refreshTokenDigest,
          expiresAt,
          lastUsedAt:new Date(),
        })
        .where('id = :id',{id})
        .andWhere('user_id = :userId',{userId})
        .andWhere('refresh_token_hash = :presentedTokenDigest',{presentedTokenDigest})
        .andWhere('revoked_at IS NULL')
        .andWhere('expires_at > CURRENT_TIMESTAMP')
        .execute();
      if(rotation.affected===1)return 'rotated';

      const revocation=await manager.createQueryBuilder()
        .update(AuthSession)
        .set({revokedAt:new Date()})
        .where('id = :id',{id})
        .andWhere('user_id = :userId',{userId})
        .andWhere('revoked_at IS NULL')
        .execute();
      return revocation.affected===1?'reuse':'invalid';
    });
    if(outcome!=='rotated') {
      throw new UnauthorizedException(
        outcome==='reuse'
          ?'Refresh token reuse detected; session revoked'
          :'Refresh session is no longer valid',
      );
    }
  }
  async revokeSession(id:string){await this.sessionsRepository.update({id},{revokedAt:new Date()});}
  async revokeAllSessions(userId:string) {
    await this.sessionsRepository.createQueryBuilder().update(AuthSession)
      .set({revokedAt:new Date()})
      .where('user_id = :userId AND revoked_at IS NULL',{userId}).execute();
  }

  async updateProfile(userId:string,input:{
    fullName?:string;phoneNumber?:string;dateOfBirth?:Date;
    gender?:Gender;profilePictureUrl?:string;
  }) {
    const user=await this.findById(userId);
    if(!user) throw new NotFoundException('User not found');
    if(input.phoneNumber!==undefined&&input.phoneNumber!==user.phoneNumber) {
      const duplicate=await this.usersRepository.findOne({
        where:{phoneNumber:input.phoneNumber,id:Not(userId)},
      });
      if(duplicate) throw new ConflictException('Phone number is already registered');
      user.phoneNumber=input.phoneNumber;
    }
    if(input.fullName!==undefined) user.fullName=input.fullName.trim();
    if(input.dateOfBirth!==undefined) user.dateOfBirth=input.dateOfBirth;
    if(input.gender!==undefined) user.gender=input.gender;
    if(input.profilePictureUrl!==undefined) user.profilePictureUrl=input.profilePictureUrl.trim()||null;
    return this.safeUser(await this.usersRepository.save(user));
  }

  async changePassword(userId:string,currentPassword:string,newPassword:string) {
    const user=await this.findById(userId);
    if(!user) throw new NotFoundException('User not found');
    if(!(await this.validatePassword(currentPassword,user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if(await this.validatePassword(newPassword,user.passwordHash)) {
      throw new BadRequestException('New password must be different from the current password');
    }
    user.passwordHash=await this.hashPassword(newPassword);
    user.failedLoginAttempts=0;user.lockedUntil=null;
    await this.usersRepository.save(user);
    await this.revokeAllSessions(userId);
  }

  safeUser(user:User) {
    const {passwordHash:_password,failedLoginAttempts:_failed,lockedUntil:_locked,...safe}=user;
    return safe;
  }

  private assertProfileFields(input:CreateManagedAccountInput) {
    if(input.role===UserRole.STUDENT&&(!input.studentNumber||!input.currentSemester)) {
      throw new BadRequestException('Student number and current semester are required for students');
    }
    if(input.role===UserRole.SYSTEM_ADMIN&&input.isSuperAdmin&&!input.employeeNumber) {
      throw new BadRequestException('Super administrators require an employee number');
    }
  }
}
