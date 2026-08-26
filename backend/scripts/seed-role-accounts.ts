import "dotenv/config";
import * as argon2 from "argon2";
import { AppDataSource } from "../src/database/data-source";

async function main() {
  if (process.env.ALLOW_ROLE_SEED !== "true") {
    throw new Error("Refusing to seed role accounts without ALLOW_ROLE_SEED=true");
  }
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error("SEED_PASSWORD is required and must contain at least 12 characters");
  }
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  await AppDataSource.initialize();
  await AppDataSource.transaction(async (manager) => {
    const upsertUser = async (fullName: string, email: string, phone: string, role: string) => {
      const [user] = await manager.query(
        `INSERT INTO users(full_name,email,password_hash,phone_number,role,status,email_verified,failed_login_attempts)
         VALUES($1,$2,$3,$4,$5,'ACTIVE',TRUE,0)
         ON CONFLICT(email) DO UPDATE SET full_name=EXCLUDED.full_name,password_hash=EXCLUDED.password_hash,
           role=EXCLUDED.role,status='ACTIVE',email_verified=TRUE,updated_at=CURRENT_TIMESTAMP
         RETURNING id`,
        [fullName, email, passwordHash, phone, role],
      );
      return user.id as string;
    };

    const adminId = await upsertUser("My Doctor Administrator", process.env.SEED_ADMIN_EMAIL ?? "admin@mydoctorprofessor.com", "+201000000101", "SYSTEM_ADMIN");
    const instructorId = await upsertUser("Dr. Ahmed Hassan", process.env.SEED_INSTRUCTOR_EMAIL ?? "instructor@mydoctorprofessor.com", "+201000000102", "INSTRUCTOR");
    const studentId = await upsertUser("Demo Student", process.env.SEED_STUDENT_EMAIL ?? "student@mydoctorprofessor.com", "+201000000103", "STUDENT");

    await manager.query(
      `INSERT INTO system_admins(user_id,employee_number,is_super_admin)
       VALUES($1,'MDP-ADMIN-001',TRUE)
       ON CONFLICT(user_id) DO UPDATE SET is_super_admin=TRUE`,
      [adminId],
    );
    await manager.query(
      `INSERT INTO instructors(user_id,specialization,office_location,biography)
       VALUES($1,'Medical Education','Online','Seeded instructor account.')
       ON CONFLICT(user_id) DO UPDATE SET specialization=EXCLUDED.specialization`,
      [instructorId],
    );
    await manager.query(
      `INSERT INTO students(user_id,student_number,current_semester)
       VALUES($1,'MDP-STUDENT-001',1)
       ON CONFLICT(user_id) DO UPDATE SET current_semester=GREATEST(1,LEAST(6,students.current_semester))`,
      [studentId],
    );
  });
  await AppDataSource.destroy();
  console.log("Seeded one active account for each role.");
}

main().catch(async (error) => {
  console.error(error);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exitCode = 1;
});
