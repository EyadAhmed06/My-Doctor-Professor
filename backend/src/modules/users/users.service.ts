import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcrypt';
import { createHash, createPublicKey, randomBytes, verify as verifySignature } from 'crypto';
import { isIP } from 'net';
import { DataSource, EntityManager, Not, QueryFailedError, Repository } from 'typeorm';
import { AuthSession } from './entities/auth-session.entity';
import { Instructor } from './entities/instructor.entity';
import { Student } from './entities/student.entity';
import { SystemAdmin } from './entities/system-admin.entity';
import { Gender, User, UserRole, UserStatus } from './entities/user.entity';
import { generateForensicCode } from './forensic-code';

export interface TrustedDeviceRegistrationInput {
  clientDeviceId:string;
  publicKeyJwk:Record<string,unknown>;
  deviceLabel?:string;
  ipAddress?:string|null;
  userAgent?:string|null;
}
export interface StudentDeviceProofInput {
  clientDeviceId?:string;
  publicKeyJwk?:Record<string,unknown>;
  deviceLabel?:string;
  challengeId?:string;
  signature?:string;
}
export interface CreateStudentAccountInput {
  fullName:string;email:string;password:string;phoneNumber:string;
  studentNumber:string;currentSemester:number;dateOfBirth?:Date;gender?:Gender;
  trustedDevice?:TrustedDeviceRegistrationInput;
}
export interface CreateManagedAccountInput {
  fullName:string;email:string;password:string;phoneNumber:string;role:UserRole;
  studentNumber?:string;currentSemester?:number;
  specialization?:string;officeLocation?:string;
  employeeNumber?:string;isSuperAdmin?:boolean;
  dateOfBirth?:Date;gender?:Gender;
  trustedDevice?:TrustedDeviceRegistrationInput;
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
      trustedDevice:input.trustedDevice,
    },false);
  }

  createManagedAccount(input:CreateManagedAccountInput):Promise<User> {
    return this.createAccount(input,true);
  }

  private async createAccount(input:CreateManagedAccountInput,managed:boolean):Promise<User> {
    this.assertProfileFields(input);
    const trustedDevice=input.trustedDevice?this.normalizeTrustedDevice(input.trustedDevice):null;
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
        const forensicCode = await this.generateUniqueForensicCode(manager);
        const user=await manager.save(User,manager.create(User,{
          fullName:input.fullName.trim(),email,passwordHash,
          phoneNumber:input.phoneNumber,dateOfBirth:input.dateOfBirth??null,
          gender:input.gender??null,role:input.role,
          status:managed?UserStatus.ACTIVE:UserStatus.PENDING_VERIFICATION,
          profilePictureUrl:null,emailVerified:managed,
          failedLoginAttempts:0,lockedUntil:null,lastLoginAt:null,
          forensicCode,
        }));
        if(input.role===UserRole.STUDENT) {
          await manager.save(Student,manager.create(Student,{
            userId:user.id,studentNumber:input.studentNumber!.trim(),
            currentSemester:input.currentSemester!,
          }));
          if(trustedDevice) {
            await manager.query(
              `INSERT INTO trusted_devices
                (user_id,client_device_id,public_key_jwk,key_algorithm,status,device_label,user_agent,first_ip,last_ip,last_seen_at)
               VALUES ($1,$2,$3::jsonb,'ECDSA_P256_SHA256','ACTIVE',$4,$5,$6,$6,CURRENT_TIMESTAMP)`,
              [user.id,trustedDevice.clientDeviceId,JSON.stringify(trustedDevice.publicKeyJwk),trustedDevice.deviceLabel,trustedDevice.userAgent,trustedDevice.ipAddress],
            );
          }
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
    const safe = this.safeUser(user);
    if (user.role === UserRole.STUDENT) {
      const student = await this.studentsRepository.findOne({ where: { userId } });
      if (student) {
        return {
          ...safe,
          studentNumber: student.studentNumber,
          currentSemester: student.currentSemester,
          current_semester: student.currentSemester,
        };
      }
    }
    return safe;
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

  async saveSession(
    id: string,
    userId: string,
    refreshTokenHash: string,
    expiresAt: Date,
    ipAddress?: string | null,
    userAgent?: string | null,
    trustedDeviceId?: string | null,
  ) {
    await this.sessionsRepository.save(this.sessionsRepository.create({
      id,
      userId,
      refreshTokenHash,
      expiresAt,
      revokedAt: null,
      lastUsedAt: null,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      trustedDeviceId: trustedDeviceId ?? null,
    }));
  }
  findSession(id:string){return this.sessionsRepository.findOne({where:{id}});}

  async revokeExpiredSessions(userId: string): Promise<number> {
    const result = await this.sessionsRepository.createQueryBuilder()
      .update(AuthSession)
      .set({ revokedAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('revoked_at IS NULL')
      .andWhere('expires_at <= CURRENT_TIMESTAMP')
      .execute();
    return result.affected ?? 0;
  }

  async hasActiveSession(userId: string): Promise<boolean> {
    const count = await this.sessionsRepository.createQueryBuilder('session')
      .where('session.user_id = :userId', { userId })
      .andWhere('session.revoked_at IS NULL')
      .andWhere('session.expires_at > CURRENT_TIMESTAMP')
      .getCount();
    return count > 0;
  }

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
        ip_address:session.ipAddress,
        user_agent:session.userAgent,
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
    const raceGraceMs=Math.min(
      30_000,
      Math.max(1_000,Number(process.env.AUTH_REFRESH_RACE_GRACE_MS??10_000)),
    );
    const outcome=await this.dataSource.transaction<'rotated'|'invalid'|'race'|'reuse'>(async manager=>{
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

      // A second browser request can arrive with the just-rotated cookie while the
      // first response is still being applied. Treat that short window as a retry,
      // not token theft, so a harmless refresh race never revokes the whole session.
      const session=await manager.findOne(AuthSession,{
        where:{id,userId},
        lock:{mode:'pessimistic_write'},
      });
      if(!session||session.revokedAt)return 'invalid';
      if(session.expiresAt<=new Date()) {
        session.revokedAt=new Date();
        await manager.save(AuthSession,session);
        return 'invalid';
      }
      if(session.lastUsedAt&&Date.now()-session.lastUsedAt.getTime()<=raceGraceMs) {
        return 'race';
      }

      session.revokedAt=new Date();
      await manager.save(AuthSession,session);
      return 'reuse';
    });
    if(outcome==='race') {
      throw new ConflictException('Refresh already completed by another request; retry');
    }
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


  async authorizeStudentDevice(user:User,proof:StudentDeviceProofInput|undefined,ipAddress?:string|null,userAgent?:string|null):Promise<string|null> {
    if(user.role!==UserRole.STUDENT||user.email.toLowerCase()==='student@mydoctorprofessor.com') return null;
    const clientDeviceId=proof?.clientDeviceId?.trim();
    const publicKeyJwk=proof?.publicKeyJwk;
    if(!clientDeviceId||!publicKeyJwk) {
      throw new HttpException({statusCode:HttpStatus.PRECONDITION_REQUIRED,error:'DEVICE_CONTEXT_REQUIRED',message:'This student account requires a trusted browser device.'},HttpStatus.PRECONDITION_REQUIRED);
    }
    const normalizedKey=this.normalizePublicKeyJwk(publicKeyJwk);
    const normalizedIp=this.normalizeIp(ipAddress);
    const deviceLabel=this.normalizeDeviceLabel(proof?.deviceLabel);
    const ua=userAgent?.slice(0,1000)||null;
    const activeRows=await this.dataSource.query(
      `SELECT id,client_device_id,public_key_jwk FROM trusted_devices WHERE user_id=$1 AND status='ACTIVE' LIMIT 1`,
      [user.id],
    ) as Array<{id:string;client_device_id:string;public_key_jwk:Record<string,unknown>}>;
    if(!activeRows.length) {
      return this.dataSource.transaction(async manager=>{
        await manager.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);
        const existing=await manager.query(`SELECT id FROM trusted_devices WHERE user_id=$1 AND status='ACTIVE' LIMIT 1`,[user.id]) as Array<{id:string}>;
        if(existing[0]) return existing[0].id;
        const rows=await manager.query(
          `INSERT INTO trusted_devices (user_id,client_device_id,public_key_jwk,key_algorithm,status,device_label,user_agent,first_ip,last_ip,last_seen_at)
           VALUES ($1,$2,$3::jsonb,'ECDSA_P256_SHA256','ACTIVE',$4,$5,$6,$6,CURRENT_TIMESTAMP) RETURNING id`,
          [user.id,clientDeviceId,JSON.stringify(normalizedKey),deviceLabel,ua,normalizedIp],
        ) as Array<{id:string}>;
        return rows[0].id;
      });
    }
    const active=activeRows[0];
    const sameDevice=active.client_device_id===clientDeviceId;
    const sameKey=this.deviceKeyThumbprint(active.public_key_jwk)===this.deviceKeyThumbprint(normalizedKey);
    if(!sameDevice||!sameKey) {
      const requestId=await this.createOrReplacePendingDeviceRequest(user.id,clientDeviceId,normalizedKey,deviceLabel,ua,normalizedIp);
      throw new ForbiddenException({statusCode:HttpStatus.FORBIDDEN,error:'DEVICE_NOT_AUTHORIZED',message:'This device is not approved for this student account. A device-access request has been sent to the system administrator.',device_request_id:requestId});
    }
    if(!proof?.challengeId||!proof?.signature) {
      await this.dataSource.query(`DELETE FROM device_auth_challenges WHERE user_id=$1 AND (expires_at<=CURRENT_TIMESTAMP OR consumed_at IS NOT NULL)`,[user.id]);
      const challenge=randomBytes(32).toString('base64url');
      const rows=await this.dataSource.query(
        `INSERT INTO device_auth_challenges (user_id,trusted_device_id,challenge,expires_at)
         VALUES ($1,$2,$3,CURRENT_TIMESTAMP+INTERVAL '2 minutes') RETURNING id`,
        [user.id,active.id,challenge],
      ) as Array<{id:string}>;
      throw new HttpException({statusCode:HttpStatus.PRECONDITION_REQUIRED,error:'DEVICE_PROOF_REQUIRED',message:'Trusted device proof is required.',challenge_id:rows[0].id,challenge},HttpStatus.PRECONDITION_REQUIRED);
    }
    const challengeRows=await this.dataSource.query(
      `UPDATE device_auth_challenges SET consumed_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND user_id=$2 AND trusted_device_id=$3 AND consumed_at IS NULL AND expires_at>CURRENT_TIMESTAMP
       RETURNING challenge`,
      [proof.challengeId,user.id,active.id],
    ) as Array<{challenge:string}>;
    if(!challengeRows.length) throw new UnauthorizedException('Device challenge is invalid or expired');
    if(!this.verifyDeviceSignature(active.public_key_jwk,challengeRows[0].challenge,proof.signature)) throw new UnauthorizedException('Trusted device proof failed');
    await this.dataSource.query(
      `UPDATE trusted_devices SET last_seen_at=CURRENT_TIMESTAMP,last_ip=$2,user_agent=COALESCE($3,user_agent) WHERE id=$1 AND status='ACTIVE'`,
      [active.id,normalizedIp,ua],
    );
    return active.id;
  }

  async getActiveTrustedDeviceId(userId:string):Promise<string|null> {
    const rows=await this.dataSource.query(
      `SELECT id FROM trusted_devices WHERE user_id=$1 AND status='ACTIVE' LIMIT 1`,
      [userId],
    ) as Array<{id:string}>;
    return rows[0]?.id??null;
  }

  async assertSessionTrustedDevice(user:User,sessionId:string):Promise<void> {
    if(user.role!==UserRole.STUDENT||user.email.toLowerCase()==='student@mydoctorprofessor.com') return;
    const rows=await this.dataSource.query(
      `SELECT s.id
       FROM auth_sessions s
       JOIN trusted_devices d ON d.id=s.trusted_device_id
       WHERE s.id=$1
         AND s.user_id=$2
         AND s.revoked_at IS NULL
         AND s.expires_at>CURRENT_TIMESTAMP
         AND d.user_id=$2
         AND d.status='ACTIVE'
       LIMIT 1`,
      [sessionId,user.id],
    ) as Array<{id:string}>;
    if(rows.length) return;
    await this.revokeSession(sessionId);
    throw new UnauthorizedException('Refresh session is not bound to the active trusted device');
  }

  async getDeviceAccessOverview(userId:string) {
    const [devices,requests]=await Promise.all([
      this.dataSource.query(`SELECT id,client_device_id,status,device_label,user_agent,first_ip,last_ip,created_at,last_seen_at,revoked_at,approved_by FROM trusted_devices WHERE user_id=$1 ORDER BY (status='ACTIVE') DESC,created_at DESC`,[userId]),
      this.dataSource.query(`SELECT id,client_device_id,device_label,user_agent,ip_address,status,requested_at,reviewed_at,reviewed_by FROM device_access_requests WHERE user_id=$1 ORDER BY requested_at DESC LIMIT 20`,[userId]),
    ]);
    return {devices,requests};
  }

  async approveDeviceAccessRequest(userId:string,requestId:string,actorUserId:string) {
    return this.dataSource.transaction(async manager=>{
      await manager.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);
      const requests=await manager.query(`SELECT * FROM device_access_requests WHERE id=$1 AND user_id=$2 FOR UPDATE`,[requestId,userId]) as Array<{id:string;client_device_id:string;proposed_public_key_jwk:Record<string,unknown>;device_label:string|null;user_agent:string|null;ip_address:string|null;status:string}>;
      const request=requests[0];
      if(!request) throw new NotFoundException('Device access request not found');
      if(request.status!=='PENDING') throw new ConflictException('Device access request has already been reviewed');
      await manager.query(`UPDATE trusted_devices SET status='REVOKED',revoked_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND status='ACTIVE'`,[userId]);
      await manager.query(`UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND revoked_at IS NULL`,[userId]);
      const devices=await manager.query(
        `INSERT INTO trusted_devices (user_id,client_device_id,public_key_jwk,key_algorithm,status,device_label,user_agent,first_ip,last_ip,last_seen_at,approved_by)
         VALUES ($1,$2,$3::jsonb,'ECDSA_P256_SHA256','ACTIVE',$4,$5,$6,$6,CURRENT_TIMESTAMP,$7)
         ON CONFLICT (user_id,client_device_id) DO UPDATE SET public_key_jwk=EXCLUDED.public_key_jwk,key_algorithm=EXCLUDED.key_algorithm,status='ACTIVE',device_label=EXCLUDED.device_label,user_agent=EXCLUDED.user_agent,last_ip=EXCLUDED.last_ip,last_seen_at=CURRENT_TIMESTAMP,revoked_at=NULL,approved_by=EXCLUDED.approved_by
         RETURNING id`,
        [userId,request.client_device_id,JSON.stringify(request.proposed_public_key_jwk),request.device_label,request.user_agent,request.ip_address,actorUserId],
      ) as Array<{id:string}>;
      await manager.query(
        `UPDATE device_access_requests SET status=CASE WHEN id=$1 THEN 'APPROVED' ELSE 'CANCELLED' END,reviewed_at=CURRENT_TIMESTAMP,reviewed_by=$3 WHERE user_id=$2 AND status='PENDING'`,
        [requestId,userId,actorUserId],
      );
      await manager.query(
        `INSERT INTO audit_logs (user_id,action,entity_name,entity_id,description,new_values)
         VALUES ($1,'UPDATE','trusted_devices',$2,'Approved student device replacement',$3::jsonb)`,
        [actorUserId,devices[0].id,JSON.stringify({student_user_id:userId,request_id:requestId})],
      );
      return {message:'Device access approved. Previous trusted device and active sessions were revoked.',device_id:devices[0].id};
    });
  }

  async rejectDeviceAccessRequest(userId:string,requestId:string,actorUserId:string) {
    const rows=await this.dataSource.query(
      `UPDATE device_access_requests SET status='REJECTED',reviewed_at=CURRENT_TIMESTAMP,reviewed_by=$3 WHERE id=$1 AND user_id=$2 AND status='PENDING' RETURNING id`,
      [requestId,userId,actorUserId],
    ) as Array<{id:string}>;
    if(!rows.length) throw new ConflictException('Device access request is missing or has already been reviewed');
    await this.dataSource.query(
      `INSERT INTO audit_logs (user_id,action,entity_name,entity_id,description,new_values)
       VALUES ($1,'UPDATE','device_access_requests',$2,'Rejected student device replacement request',$3::jsonb)`,
      [actorUserId,requestId,JSON.stringify({student_user_id:userId})],
    );
    return {message:'Device access request rejected.'};
  }

  private async createOrReplacePendingDeviceRequest(userId:string,clientDeviceId:string,publicKeyJwk:Record<string,unknown>,deviceLabel:string|null,userAgent:string|null,ipAddress:string|null):Promise<string> {
    return this.dataSource.transaction(async manager=>{
      await manager.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);
      const existing=await manager.query(`SELECT id FROM device_access_requests WHERE user_id=$1 AND status='PENDING' LIMIT 1 FOR UPDATE`,[userId]) as Array<{id:string}>;
      if(existing[0]) {
        await manager.query(
          `UPDATE device_access_requests SET client_device_id=$2,proposed_public_key_jwk=$3::jsonb,device_label=$4,user_agent=$5,ip_address=$6,requested_at=CURRENT_TIMESTAMP WHERE id=$1`,
          [existing[0].id,clientDeviceId,JSON.stringify(publicKeyJwk),deviceLabel,userAgent,ipAddress],
        );
        await manager.query(
          `INSERT INTO audit_logs (user_id,action,entity_name,entity_id,description,new_values,ip_address,user_agent)
           VALUES ($1,'UPDATE','device_access_requests',$2,'Updated pending student device replacement request',$3::jsonb,$4,$5)`,
          [userId,existing[0].id,JSON.stringify({device_label:deviceLabel}),ipAddress,userAgent],
        );
        return existing[0].id;
      }
      const rows=await manager.query(
        `INSERT INTO device_access_requests (user_id,client_device_id,proposed_public_key_jwk,key_algorithm,device_label,user_agent,ip_address,status)
         VALUES ($1,$2,$3::jsonb,'ECDSA_P256_SHA256',$4,$5,$6,'PENDING') RETURNING id`,
        [userId,clientDeviceId,JSON.stringify(publicKeyJwk),deviceLabel,userAgent,ipAddress],
      ) as Array<{id:string}>;
      await manager.query(
        `INSERT INTO audit_logs (user_id,action,entity_name,entity_id,description,new_values,ip_address,user_agent)
         VALUES ($1,'CREATE','device_access_requests',$2,'Requested access from a new student device',$3::jsonb,$4,$5)`,
        [userId,rows[0].id,JSON.stringify({device_label:deviceLabel}),ipAddress,userAgent],
      );
      return rows[0].id;
    });
  }

  private normalizeTrustedDevice(input:TrustedDeviceRegistrationInput):TrustedDeviceRegistrationInput {
    return {clientDeviceId:input.clientDeviceId.trim(),publicKeyJwk:this.normalizePublicKeyJwk(input.publicKeyJwk),deviceLabel:this.normalizeDeviceLabel(input.deviceLabel)??undefined,ipAddress:this.normalizeIp(input.ipAddress),userAgent:input.userAgent?.slice(0,1000)||null};
  }

  private normalizePublicKeyJwk(value:Record<string,unknown>):Record<string,unknown> {
    if(value.kty!=='EC'||value.crv!=='P-256'||typeof value.x!=='string'||typeof value.y!=='string'||'d' in value) throw new BadRequestException('Invalid device public key');
    try { createPublicKey({key:value as never,format:'jwk'}); } catch { throw new BadRequestException('Invalid device public key'); }
    return {kty:'EC',crv:'P-256',x:value.x,y:value.y};
  }

  private deviceKeyThumbprint(value:Record<string,unknown>):string {
    const normalized=this.normalizePublicKeyJwk(value);
    return createHash('sha256').update(JSON.stringify({crv:normalized.crv,kty:normalized.kty,x:normalized.x,y:normalized.y})).digest('hex');
  }

  private verifyDeviceSignature(publicKeyJwk:Record<string,unknown>,challenge:string,signature:string):boolean {
    try {
      const key=createPublicKey({key:this.normalizePublicKeyJwk(publicKeyJwk) as never,format:'jwk'});
      return verifySignature('sha256',Buffer.from(challenge,'base64url'),{key,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url'));
    } catch { return false; }
  }

  private normalizeIp(value?:string|null):string|null {
    if(!value)return null;
    const first=value.split(',')[0].trim().replace(/^::ffff:/,'');
    return isIP(first)?first:null;
  }

  private normalizeDeviceLabel(value?:string|null):string|null {
    const normalized=value?.trim().replace(/\s+/g,' ').slice(0,200);
    return normalized||null;
  }

  async updateProfile(userId:string,input:{
    fullName?:string;phoneNumber?:string;dateOfBirth?:Date;
    gender?:Gender;profilePictureUrl?:string;
    currentSemester?:number;
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

    if (user.role === UserRole.STUDENT && input.currentSemester !== undefined) {
      const semester = Number(input.currentSemester);
      if (!Number.isInteger(semester) || semester < 1 || semester > 6) {
        throw new BadRequestException('Current semester must be an integer between 1 and 6');
      }
      await this.studentsRepository.update({ userId }, { currentSemester: semester });
    }

    await this.usersRepository.save(user);
    return this.getUserProfile(userId);
  }

  async deactivateOwnAccount(userId:string,currentPassword:string) {
    const user=await this.findById(userId);
    if(!user) throw new NotFoundException('User not found');
    if(user.role!==UserRole.STUDENT) throw new BadRequestException('Self-service account deletion is available to students only');
    if(!(await this.validatePassword(currentPassword,user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.dataSource.transaction(async manager=>{
      user.status=UserStatus.DEACTIVATED;
      await manager.save(User,user);
      await manager.createQueryBuilder().update(AuthSession)
        .set({revokedAt:new Date()})
        .where('user_id = :userId AND revoked_at IS NULL',{userId}).execute();
    });
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

  private async generateUniqueForensicCode(manager: EntityManager, maxAttempts = 10): Promise<string> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const code = generateForensicCode();
      const existing = await manager.findOne(User, { where: { forensicCode: code } });
      if (!existing) return code;
    }
    throw new ConflictException('Unable to allocate a unique forensic code');
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
