import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, timingSafeEqual } from "crypto";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Not, Repository } from "typeorm";
import { AuthService } from "../auth/auth.service";
import { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import { AuthSession } from "../users/entities/auth-session.entity";
import { Instructor } from "../users/entities/instructor.entity";
import { Student } from "../users/entities/student.entity";
import { SystemAdmin } from "../users/entities/system-admin.entity";
import { User, UserRole, UserStatus } from "../users/entities/user.entity";
import { generateForensicCode } from "../users/forensic-code";
import { UsersService } from "../users/users.service";
import { ProfilePictureStorageService } from "../users/profile-picture-storage.service";
import {
  AdminUserQueryDto,
  BootstrapAccountsDto,
  CreateManagedUserDto,
  ImportUsersDto,
  StatisticsQueryDto,
  UpdateManagedUserDto,
  UpdateUserStatusDto,
} from "./dtos/admin.dto";

@Injectable()
export class AdminService implements OnModuleInit {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Student) private readonly students: Repository<Student>,
    @InjectRepository(Instructor)
    private readonly instructors: Repository<Instructor>,
    @InjectRepository(SystemAdmin)
    private readonly admins: Repository<SystemAdmin>,
    private readonly usersService: UsersService,
    private readonly profilePictures: ProfilePictureStorageService,
    private readonly authService: AuthService,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    try {
      await this.dataSource.query(`
        CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
        RETURNS TRIGGER AS $$
        BEGIN
          IF TG_OP = 'UPDATE' AND OLD.user_id IS NOT NULL AND NEW.user_id IS NULL
             AND NEW.id = OLD.id
             AND NEW.action = OLD.action
             AND NEW.entity_name = OLD.entity_name
             AND NEW.created_at = OLD.created_at THEN
            RETURN NEW;
          END IF;
          RAISE EXCEPTION 'audit_logs are append-only' USING ERRCODE = '55000';
        END;
        $$ LANGUAGE plpgsql;
      `);
    } catch {
      // non-fatal schema initialization
    }
  }

  async bootstrapAccounts(
    dto: BootstrapAccountsDto,
    providedToken: string | undefined,
  ) {
    this.assertBootstrapAuthorized(providedToken);
    this.assertBootstrapPayloadUnique(dto);

    const passwordHashes = await Promise.all([
      this.usersService.hashPassword(dto.admin.password),
      this.usersService.hashPassword(dto.instructor.password),
      this.usersService.hashPassword(dto.student.password),
    ]);

    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtext('account-bootstrap'))",
      );
      if (await manager.exists(SystemAdmin, {})) {
        throw new ConflictException(
          "Account bootstrap is permanently closed because an administrator already exists",
        );
      }

      const emails = [
        dto.admin.email,
        dto.instructor.email,
        dto.student.email,
      ].map((value) => value.trim().toLowerCase());
      const phones = [
        dto.admin.phone_number,
        dto.instructor.phone_number,
        dto.student.phone_number,
      ];
      if (
        await manager.exists(User, {
          where: [{ email: In(emails) }, { phoneNumber: In(phones) }],
        })
      ) {
        throw new ConflictException(
          "A bootstrap email or phone number is already registered",
        );
      }
      if (
        await manager.exists(Student, {
          where: { studentNumber: dto.student.student_number.trim() },
        })
      ) {
        throw new ConflictException(
          "The bootstrap student number is already registered",
        );
      }

      const createUser = async (
        input: {
          fullName: string;
          email: string;
          phone: string;
          role: UserRole;
        },
        passwordHash: string,
      ) => {
        let forensicCode = generateForensicCode();
        while (await manager.findOne(User, { where: { forensicCode } })) {
          forensicCode = generateForensicCode();
        }
        return manager.save(
          User,
          manager.create(User, {
            fullName: input.fullName.trim(),
            email: input.email.trim().toLowerCase(),
            passwordHash,
            phoneNumber: input.phone,
            dateOfBirth: null,
            gender: null,
            role: input.role,
            status: UserStatus.ACTIVE,
            profilePictureUrl: null,
            emailVerified: true,
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: null,
            forensicCode,
          }),
        );
      };

      const admin = await createUser(
        {
          fullName: dto.admin.full_name,
          email: dto.admin.email,
          phone: dto.admin.phone_number,
          role: UserRole.SYSTEM_ADMIN,
        },
        passwordHashes[0],
      );
      await manager.save(
        SystemAdmin,
        manager.create(SystemAdmin, {
          userId: admin.id,
          employeeNumber: dto.admin.employee_number.trim(),
          isSuperAdmin: true,
        }),
      );

      const instructor = await createUser(
        {
          fullName: dto.instructor.full_name,
          email: dto.instructor.email,
          phone: dto.instructor.phone_number,
          role: UserRole.INSTRUCTOR,
        },
        passwordHashes[1],
      );
      await manager.save(
        Instructor,
        manager.create(Instructor, {
          userId: instructor.id,
          specialization: dto.instructor.specialization?.trim() || null,
          officeLocation: dto.instructor.office_location?.trim() || null,
          biography: null,
        }),
      );

      const student = await createUser(
        {
          fullName: dto.student.full_name,
          email: dto.student.email,
          phone: dto.student.phone_number,
          role: UserRole.STUDENT,
        },
        passwordHashes[2],
      );
      await manager.save(
        Student,
        manager.create(Student, {
          userId: student.id,
          studentNumber: dto.student.student_number.trim(),
          currentSemester: dto.student.current_semester,
        }),
      );

      return {
        message:
          "Bootstrap accounts created; the endpoint is now permanently closed",
        accounts: [admin, instructor, student].map((user) => ({
          id: user.id,
          email: user.email,
          full_name: user.fullName,
          role: user.role,
          status: user.status,
          email_verified: user.emailVerified,
        })),
      };
    });
  }

  private assertBootstrapAuthorized(providedToken: string | undefined) {
    if (
      this.config.get<string>("ALLOW_ACCOUNT_BOOTSTRAP", "false") !== "true"
    ) {
      throw new ServiceUnavailableException("Account bootstrap is disabled");
    }
    const expected = this.config.get<string>("ACCOUNT_BOOTSTRAP_TOKEN");
    if (!expected || expected.length < 32 || !providedToken) {
      throw new UnauthorizedException("Invalid bootstrap authorization");
    }
    const left = createHash("sha256").update(providedToken).digest();
    const right = createHash("sha256").update(expected).digest();
    if (!timingSafeEqual(left, right))
      throw new UnauthorizedException("Invalid bootstrap authorization");
  }

  private assertBootstrapPayloadUnique(dto: BootstrapAccountsDto) {
    const emails = [
      dto.admin.email,
      dto.instructor.email,
      dto.student.email,
    ].map((value) => value.trim().toLowerCase());
    const phones = [
      dto.admin.phone_number,
      dto.instructor.phone_number,
      dto.student.phone_number,
    ];
    if (new Set(emails).size !== emails.length)
      throw new BadRequestException("Bootstrap emails must be unique");
    if (new Set(phones).size !== phones.length)
      throw new BadRequestException("Bootstrap phone numbers must be unique");
  }

  async listUsers(query: AdminUserQueryDto) {
    const page = query.page ?? 1,
      limit = query.limit ?? 20;
    const builder = this.users
      .createQueryBuilder("user")
      .leftJoin(Student, "student", "student.user_id=user.id")
      .leftJoin(Instructor, "instructor", "instructor.user_id=user.id")
      .leftJoin(SystemAdmin, "admin", "admin.user_id=user.id")
      .select([
        "user.id AS id",
        "user.full_name AS full_name",
        "user.email AS email",
        "user.phone_number AS phone_number",
        "user.role AS role",
        "user.status AS status",
        "user.email_verified AS email_verified",
        "user.last_login_at AS last_login_at",
        "user.created_at AS created_at",
        "user.forensic_code AS forensic_code",
        "student.student_number AS student_number",
        "student.current_semester AS current_semester",
        "instructor.specialization AS specialization",
        "instructor.office_location AS office_location",
        "admin.employee_number AS employee_number",
        "admin.is_super_admin AS is_super_admin",
      ])
      .orderBy("user.created_at", "DESC")
      .offset((page - 1) * limit)
      .limit(limit);
    if (query.role) builder.andWhere("user.role=:role", { role: query.role });
    if (query.status)
      builder.andWhere("user.status=:status", { status: query.status });
    if (query.search)
      builder.andWhere(
        "(user.full_name ILIKE :search OR user.email ILIKE :search OR user.phone_number ILIKE :search)",
        { search: `%${query.search.trim()}%` },
      );
    const [data, total] = await Promise.all([
      builder.getRawMany(),
      builder.clone().offset(undefined).limit(undefined).orderBy().getCount(),
    ]);
    return { data, page, limit, total, total_pages: Math.ceil(total / limit) };
  }

  async createUser(dto: CreateManagedUserDto, actor: AuthenticatedUser) {
    await this.assertCanCreateRole(actor, dto.role, dto.is_super_admin);
    const user = await this.usersService.createManagedAccount({
      fullName: dto.full_name,
      email: dto.email,
      password: dto.password,
      phoneNumber: dto.phone_number,
      role: dto.role,
      studentNumber: dto.student_number,
      currentSemester: dto.current_semester,
      specialization: dto.specialization,
      officeLocation: dto.office_location,
      employeeNumber: dto.employee_number,
      isSuperAdmin: dto.is_super_admin,
    });
    return this.getUser(user.id);
  }

  async getUser(id: string) {
    const rows = await this.dataSource.query(
      `
      SELECT user_account.id,user_account.full_name,user_account.email,
        user_account.phone_number,user_account.date_of_birth,user_account.gender,
        user_account.role,user_account.status,user_account.profile_picture_url,
        user_account.email_verified,user_account.last_login_at,
        user_account.forensic_code,
        user_account.created_at,user_account.updated_at,
        student.student_number,student.current_semester,
        instructor.specialization,instructor.office_location,instructor.biography,
        admin.employee_number,admin.is_super_admin
      FROM users user_account
      LEFT JOIN students student ON student.user_id=user_account.id
      LEFT JOIN instructors instructor ON instructor.user_id=user_account.id
      LEFT JOIN system_admins admin ON admin.user_id=user_account.id
      WHERE user_account.id=$1
    `,
      [id],
    );
    if (!rows.length) throw new NotFoundException("User not found");
    return rows[0];
  }

  async updateUser(
    id: string,
    dto: UpdateManagedUserDto,
    actor: AuthenticatedUser,
  ) {
    if (!Object.keys(dto).length)
      throw new BadRequestException("At least one user field must be provided");
    const target = await this.requireUser(id);
    await this.assertCanManageTarget(actor, target);
    this.assertFieldsMatchRole(target.role, dto);
    await this.dataSource.transaction(async (manager) => {
      const locked = await manager.findOne(User, {
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      if (!locked) throw new NotFoundException("User not found");
      if (dto.full_name !== undefined) locked.fullName = dto.full_name.trim();
      if (dto.phone_number !== undefined) {
        const duplicate = await manager.findOne(User, {
          where: { phoneNumber: dto.phone_number, id: Not(id) },
        });
        if (duplicate)
          throw new ConflictException("Phone number is already registered");
        locked.phoneNumber = dto.phone_number;
      }
      await manager.save(User, locked);
      if (
        target.role === UserRole.STUDENT &&
        dto.current_semester !== undefined
      ) {
        await manager.update(
          Student,
          { userId: id },
          { currentSemester: dto.current_semester },
        );
      }
      if (target.role === UserRole.INSTRUCTOR) {
        const profile = await manager.findOne(Instructor, {
          where: { userId: id },
        });
        if (!profile)
          throw new ConflictException("Instructor profile is missing");
        if (dto.specialization !== undefined)
          profile.specialization = dto.specialization.trim() || null;
        if (dto.office_location !== undefined)
          profile.officeLocation = dto.office_location.trim() || null;
        await manager.save(Instructor, profile);
      }
      if (target.role === UserRole.SYSTEM_ADMIN) {
        await manager.query(
          "SELECT pg_advisory_xact_lock(hashtext('super-admin-invariant'))",
        );
        const profile = await manager.findOne(SystemAdmin, {
          where: { userId: id },
          lock: { mode: "pessimistic_write" },
        });
        if (!profile)
          throw new ConflictException("Administrator profile is missing");
        if (dto.is_super_admin !== undefined) {
          if (actor.userId === id)
            throw new ForbiddenException(
              "Administrators cannot change their own super-admin status",
            );
          if (profile.isSuperAdmin && dto.is_super_admin === false)
            await this.assertAnotherActiveSuperAdmin(id, manager);
          profile.isSuperAdmin = dto.is_super_admin;
        }
        if (dto.employee_number !== undefined) {
          const duplicate = await manager.findOne(SystemAdmin, {
            where: {
              employeeNumber: dto.employee_number.trim(),
              userId: Not(id),
            },
          });
          if (duplicate)
            throw new ConflictException(
              "Employee number is already registered",
            );
          profile.employeeNumber = dto.employee_number.trim();
        }
        await manager.save(SystemAdmin, profile);
      }
    });
    return this.getUser(id);
  }

  async updateStatus(
    id: string,
    dto: UpdateUserStatusDto,
    actor: AuthenticatedUser,
  ) {
    if (dto.status === UserStatus.PENDING_VERIFICATION) {
      throw new BadRequestException(
        "Administrators cannot return an account to pending verification",
      );
    }
    if (actor.userId === id)
      throw new ForbiddenException(
        "Administrators cannot change their own account status",
      );
    const target = await this.requireUser(id);
    await this.assertCanManageTarget(actor, target);
    await this.dataSource.transaction(async (manager) => {
      const locked = await manager.findOne(User, {
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      if (!locked) throw new NotFoundException("User not found");
      if (
        target.role === UserRole.SYSTEM_ADMIN &&
        locked.status === UserStatus.ACTIVE &&
        dto.status !== UserStatus.ACTIVE
      ) {
        await manager.query(
          "SELECT pg_advisory_xact_lock(hashtext('super-admin-invariant'))",
        );
        const profile = await manager.findOne(SystemAdmin, {
          where: { userId: id },
        });
        if (profile?.isSuperAdmin)
          await this.assertAnotherActiveSuperAdmin(id, manager);
      }
      locked.status = dto.status;
      if (dto.status === UserStatus.ACTIVE) {
        locked.emailVerified = true;
        locked.failedLoginAttempts = 0;
        locked.lockedUntil = null;
      }
      await manager.save(User, locked);
      if (dto.status !== UserStatus.ACTIVE) {
        await manager
          .createQueryBuilder()
          .update(AuthSession)
          .set({ revokedAt: new Date() })
          .where("user_id=:id AND revoked_at IS NULL", { id })
          .execute();
      }
    });
    return this.getUser(id);
  }

  async resetPassword(id: string, actor: AuthenticatedUser, ip: string) {
    const target = await this.requireUser(id);
    await this.assertCanManageTarget(actor, target);
    if (target.status !== UserStatus.ACTIVE || !target.emailVerified) {
      throw new ConflictException(
        "Password reset requires an active verified account",
      );
    }
    await this.authService.requestPasswordReset(target.email, ip);
    await this.usersService.revokeAllSessions(id);
    return {
      message:
        "Password reset instructions were queued and active sessions were revoked.",
    };
  }

  async removeUser(id: string, actor: AuthenticatedUser) {
    if (actor.userId === id) {
      throw new BadRequestException("You cannot delete your own account");
    }
    const target = await this.requireUser(id);
    await this.assertCanManageTarget(actor, target);
    if (target.role === UserRole.SYSTEM_ADMIN) {
      const adminRecord = await this.admins.findOne({ where: { userId: id } });
      if (adminRecord?.isSuperAdmin) {
        await this.assertAnotherActiveSuperAdmin(id, this.dataSource.manager);
      }
    }

    await this.dataSource.transaction(async (manager) => {
      // 1. Reassign authored content to the operating administrator
      // so curriculum, question banks, tests, and flashcards remain preserved
      await manager.query(
        `UPDATE questions SET created_by = $1 WHERE created_by = $2`,
        [actor.userId, id],
      );
      await manager.query(
        `UPDATE tests SET created_by = $1 WHERE created_by = $2`,
        [actor.userId, id],
      );
      await manager.query(
        `UPDATE flashcard_decks SET created_by = $1 WHERE created_by = $2`,
        [actor.userId, id],
      );
      await manager.query(
        `UPDATE bundles SET created_by = $1 WHERE created_by = $2`,
        [actor.userId, id],
      );
      await manager.query(
        `UPDATE essay_cases SET created_by = $1 WHERE created_by = $2`,
        [actor.userId, id],
      );
      await manager.query(
        `UPDATE drug_references SET created_by = $1 WHERE created_by = $2`,
        [actor.userId, id],
      );

      // 2. Remove RESTRICT relationships belonging exclusively to this user
      await manager.query(
        `DELETE FROM bundle_enrollments WHERE student_id = $1`,
        [id],
      );
      await manager.query(
        `DELETE FROM bundle_plan_grants WHERE student_id = $1`,
        [id],
      );
      await manager.query(
        `DELETE FROM bundle_instructors WHERE instructor_id = $1`,
        [id],
      );

      // 3. Hard delete the user record
      // Child tables with CASCADE (students, instructors, system_admins, auth_sessions,
      // test_attempts, answers, etc.) and SET NULL (audit_logs, notifications) cascade cleanly
      await manager.query(`DELETE FROM users WHERE id = $1`, [id]);
    });

    if (target.profilePictureUrl) {
      try {
        await this.profilePictures.deleteByUrl(target.profilePictureUrl);
      } catch {
        // ignore profile picture deletion error
      }
    }
  }

  async getUserSessions(id: string, _actor: AuthenticatedUser) {
    await this.requireUser(id);
    const sessions = await this.dataSource
      .getRepository(AuthSession)
      .createQueryBuilder("session")
      .where("session.user_id = :id", { id })
      .orderBy("session.created_at", "DESC")
      .getMany();
    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        ip_address: session.ipAddress,
        user_agent: session.userAgent,
        created_at: session.createdAt,
        last_used_at: session.lastUsedAt,
        expires_at: session.expiresAt,
        revoked_at: session.revokedAt,
        is_active: !session.revokedAt && session.expiresAt > new Date(),
      })),
    };
  }

  async revokeUserSessions(id: string, actor: AuthenticatedUser) {
    const target = await this.requireUser(id);
    await this.assertCanManageTarget(actor, target);
    const result = await this.dataSource
      .getRepository(AuthSession)
      .createQueryBuilder()
      .update(AuthSession)
      .set({ revokedAt: new Date() })
      .where("user_id = :id AND revoked_at IS NULL", { id })
      .execute();
    return {
      message: "Active sessions for user revoked successfully",
      revoked_count: result.affected ?? 0,
    };
  }

  async revokeUserSession(
    userId: string,
    sessionId: string,
    actor: AuthenticatedUser,
  ) {
    const target = await this.requireUser(userId);
    await this.assertCanManageTarget(actor, target);
    const session = await this.dataSource
      .getRepository(AuthSession)
      .findOne({
        where: { id: sessionId, userId },
      });
    if (!session) throw new NotFoundException("Session not found");
    if (!session.revokedAt) {
      session.revokedAt = new Date();
      await this.dataSource.getRepository(AuthSession).save(session);
    }
    return { message: "Session revoked successfully" };
  }

  async importUsers(dto: ImportUsersDto, actor: AuthenticatedUser) {
    const created: any[] = [];
    const errors: any[] = [];
    for (let index = 0; index < dto.users.length; index++) {
      try {
        created.push(await this.createUser(dto.users[index], actor));
      } catch (error) {
        errors.push({
          index,
          email: dto.users[index].email,
          error:
            error instanceof HttpException
              ? error.message
              : "Unable to create user",
        });
      }
    }
    return {
      created,
      errors,
      created_count: created.length,
      error_count: errors.length,
    };
  }

  async statistics(query: StatisticsQueryDto) {
    const params: any[] = [];
    let roleClause = "";
    if (query.role) {
      params.push(query.role);
      roleClause = " WHERE role=$1";
    }
    const [users, platform] = await Promise.all([
      this.dataSource.query(
        `
        /* security-audit-reviewed: parameterized-or-allowlisted-fragments */
        SELECT role,status,COUNT(*)::int AS count FROM users${roleClause}
        GROUP BY role,status ORDER BY role,status
      `,
        params,
      ),
      this.dataSource.query(`
        SELECT
          (SELECT COUNT(*) FROM courses)::int AS courses,
          (SELECT COUNT(*) FROM lectures)::int AS lectures,
          (SELECT COUNT(*) FROM questions)::int AS questions,
          (SELECT COUNT(*) FROM tests)::int AS tests,
          (SELECT COUNT(*) FROM test_attempts)::int AS attempts,
          (SELECT COUNT(*) FROM test_attempts WHERE status IN ('SUBMITTED','EXPIRED'))::int AS completed_attempts,
          (SELECT COUNT(*) FROM flashcard_decks)::int AS flashcard_decks,
          (SELECT COUNT(*) FROM student_flashcard_progress)::int AS flashcard_reviews,
          (SELECT COUNT(*) FROM notifications)::int AS notifications,
          (SELECT COUNT(*) FROM audit_logs)::int AS audit_events
      `),
    ]);
    return { users, platform: platform[0] };
  }

  private async assertCanCreateRole(
    actor: AuthenticatedUser,
    role: UserRole,
    isSuper?: boolean,
  ) {
    if (role === UserRole.SYSTEM_ADMIN || isSuper)
      await this.requireSuperAdmin(actor.userId);
    if (role !== UserRole.SYSTEM_ADMIN && isSuper) {
      throw new BadRequestException(
        "is_super_admin is valid only for system administrators",
      );
    }
  }
  private async assertCanManageTarget(actor: AuthenticatedUser, target: User) {
    if (target.role === UserRole.SYSTEM_ADMIN)
      await this.requireSuperAdmin(actor.userId);
  }
  private async requireSuperAdmin(userId: string) {
    const profile = await this.admins.findOne({
      where: { userId, isSuperAdmin: true },
    });
    if (!profile)
      throw new ForbiddenException(
        "This operation requires a super administrator",
      );
  }
  private async assertAnotherActiveSuperAdmin(
    excludedId: string,
    manager: any,
  ) {
    const rows = await manager.query(
      `
      SELECT COUNT(*)::int AS count FROM system_admins admin
      JOIN users user_account ON user_account.id=admin.user_id
      WHERE admin.is_super_admin=TRUE AND user_account.status='ACTIVE'
        AND admin.user_id<>$1
    `,
      [excludedId],
    );
    if (Number(rows[0]?.count ?? 0) < 1) {
      throw new ConflictException(
        "The last active super administrator cannot be demoted or deactivated",
      );
    }
  }
  private async requireUser(id: string) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }
  private assertFieldsMatchRole(role: UserRole, dto: UpdateManagedUserDto) {
    if (role !== UserRole.STUDENT && dto.current_semester !== undefined) {
      throw new BadRequestException(
        "current_semester is valid only for students",
      );
    }
    if (
      role !== UserRole.INSTRUCTOR &&
      (dto.specialization !== undefined || dto.office_location !== undefined)
    ) {
      throw new BadRequestException(
        "Instructor fields are valid only for instructors",
      );
    }
    if (
      role !== UserRole.SYSTEM_ADMIN &&
      (dto.employee_number !== undefined || dto.is_super_admin !== undefined)
    ) {
      throw new BadRequestException(
        "Administrator fields are valid only for system administrators",
      );
    }
  }
}
