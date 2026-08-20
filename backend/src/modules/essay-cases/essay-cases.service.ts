import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { CreateEssayCaseDto, SubmitEssayCaseDto, UpdateEssayCaseDto } from './essay-cases.dto';
import pdfCases from './summer-uro-nephrology-essay.json';

type Row = Record<string, any>;
@Injectable()
export class EssayCasesService {
  constructor(private readonly db: DataSource) {}

  async listCourses(actor: AuthenticatedUser) {
    if (actor.role === UserRole.STUDENT) return this.db.query(`SELECT DISTINCT c.id,c.course_code AS "courseCode",c.course_name AS "courseName" FROM courses c JOIN bundle_courses bc ON bc.course_id=c.id JOIN bundles b ON b.id=bc.bundle_id JOIN bundle_enrollments e ON e.bundle_id=b.id WHERE e.student_id=$1 AND e.status<>'REVOKED' AND b.status IN ('PUBLISHED','ARCHIVED') AND (b.available_until IS NULL OR b.available_until>now()) ORDER BY c.course_name`, [actor.userId]);
    if (actor.role === UserRole.INSTRUCTOR) return this.db.query(`SELECT c.id,c.course_code AS "courseCode",c.course_name AS "courseName" FROM courses c JOIN course_instructors ci ON ci.course_id=c.id WHERE ci.instructor_id=$1 ORDER BY c.course_name`, [actor.userId]);
    return this.db.query(`SELECT id,course_code AS "courseCode",course_name AS "courseName" FROM courses ORDER BY course_name`);
  }

  async listCurriculum(courseId: string, actor: AuthenticatedUser) {
    await this.assertCourseAccess(courseId, actor, false);
    const rows: Row[] = await this.db.query(`SELECT w.id AS week_id,w.week_number,w.title AS week_title,c.id,c.title,c.stem,c.section,c.source_case_number,c.is_published,c.display_order,
      COALESCE(json_agg(json_build_object('id',q.id,'prompt',q.prompt,'display_order',q.display_order) ORDER BY q.display_order) FILTER (WHERE q.id IS NOT NULL),'[]') AS questions
      FROM weeks w LEFT JOIN essay_cases c ON c.week_id=w.id ${actor.role === UserRole.STUDENT ? 'AND c.is_published=TRUE' : ''}
      LEFT JOIN essay_case_questions q ON q.case_id=c.id WHERE w.course_id=$1
      GROUP BY w.id,w.week_number,w.title,c.id ORDER BY w.week_number,c.display_order,c.created_at`, [courseId]);
    const weeks = new Map<string, any>();
    for (const row of rows) {
      if (!weeks.has(row.week_id)) weeks.set(row.week_id, { id: row.week_id, weekNumber: row.week_number, title: row.week_title, cases: [] });
      if (row.id) weeks.get(row.week_id).cases.push({ id: row.id, title: row.title, stem: row.stem, section: row.section, sourceCaseNumber: row.source_case_number, isPublished: row.is_published, questions: row.questions });
    }
    return { course_id: courseId, weeks: [...weeks.values()] };
  }

  async getCase(id: string, actor: AuthenticatedUser) {
    const rows: Row[] = await this.db.query(`SELECT c.*,w.course_id,w.week_number FROM essay_cases c JOIN weeks w ON w.id=c.week_id WHERE c.id=$1`, [id]);
    const item = rows[0]; if (!item) throw new NotFoundException('Essay case not found');
    await this.assertCourseAccess(item.course_id, actor, false);
    if (actor.role === UserRole.STUDENT && !item.is_published) throw new NotFoundException('Essay case not found');
    const questions: Row[] = await this.db.query(`SELECT id,prompt,model_answer,display_order FROM essay_case_questions WHERE case_id=$1 ORDER BY display_order`, [id]);
    let attempt: Row | undefined;
    if (actor.role === UserRole.STUDENT) attempt = (await this.db.query(`SELECT id,status,submitted_at,revealed_at FROM essay_case_attempts WHERE case_id=$1 AND student_id=$2`, [id, actor.userId]))[0];
    const answerRows: Row[] = attempt ? await this.db.query(`SELECT question_id,answer_text FROM essay_case_answers WHERE attempt_id=$1`, [attempt.id]) : [];
    const answers = new Map(answerRows.map((row) => [row.question_id, row.answer_text]));
    const mayReveal = actor.role !== UserRole.STUDENT || attempt?.status === 'REVEALED';
    return { id: item.id, weekId: item.week_id, weekNumber: item.week_number, title: item.title, stem: item.stem, section: item.section, sourceCaseNumber: item.source_case_number, isPublished: item.is_published, attempt: attempt || null,
      questions: questions.map((q) => ({ id: q.id, prompt: q.prompt, displayOrder: q.display_order, studentAnswer: answers.get(q.id) || null, ...(mayReveal ? { modelAnswer: q.model_answer } : {}) })) };
  }

  async create(dto: CreateEssayCaseDto, actor: AuthenticatedUser) {
    const courseId = await this.courseForWeek(dto.week_id); await this.assertCourseAccess(courseId, actor, true);
    const id = await this.db.transaction(async (m) => this.insertCase(m, dto, actor.userId)); return this.getCase(id, actor);
  }

  async update(id: string, dto: UpdateEssayCaseDto, actor: AuthenticatedUser) {
    const item = await this.requireCase(id); await this.assertCourseAccess(item.course_id, actor, true);
    await this.db.transaction(async (m) => {
      await m.query(`UPDATE essay_cases SET title=COALESCE($2,title),stem=COALESCE($3,stem),section=CASE WHEN $4::boolean THEN $5 ELSE section END,is_published=COALESCE($6,is_published),updated_at=now() WHERE id=$1`, [id,dto.title?.trim()||null,dto.stem?.trim()||null,dto.section!==undefined,dto.section?.trim()||null,dto.is_published ?? null]);
      if (dto.questions) { await m.query(`DELETE FROM essay_case_questions WHERE case_id=$1`, [id]); for (let i=0;i<dto.questions.length;i++) await m.query(`INSERT INTO essay_case_questions(case_id,prompt,model_answer,display_order) VALUES($1,$2,$3,$4)`, [id,dto.questions[i].prompt.trim(),dto.questions[i].model_answer.trim(),i+1]); }
    }); return this.getCase(id, actor);
  }
  async remove(id: string, actor: AuthenticatedUser) { const item=await this.requireCase(id); await this.assertCourseAccess(item.course_id,actor,true); await this.db.query(`DELETE FROM essay_cases WHERE id=$1`,[id]); }

  async submit(id: string, dto: SubmitEssayCaseDto, actor: AuthenticatedUser) {
    const item=await this.requireCase(id); await this.assertCourseAccess(item.course_id,actor,false); if(!item.is_published) throw new NotFoundException('Essay case not found');
    const questions:Row[]=await this.db.query(`SELECT id FROM essay_case_questions WHERE case_id=$1`,[id]);
    const expected=new Set(questions.map(q=>q.id)); const received=new Set(dto.answers.map(a=>a.question_id));
    if(expected.size!==received.size || [...expected].some(q=>!received.has(q))) throw new ConflictException('Every case question must have exactly one non-empty answer');
    await this.db.transaction(async m=>{ const old=(await m.query(`SELECT id,status FROM essay_case_attempts WHERE case_id=$1 AND student_id=$2 FOR UPDATE`,[id,actor.userId]))[0]; if(old?.status==='REVEALED') throw new ConflictException('A revealed case attempt cannot be resubmitted'); const attempt=(await m.query(`INSERT INTO essay_case_attempts(case_id,student_id,status,submitted_at) VALUES($1,$2,'SUBMITTED',now()) ON CONFLICT(case_id,student_id) DO UPDATE SET status='SUBMITTED',submitted_at=now(),revealed_at=NULL RETURNING id`,[id,actor.userId]))[0]; await m.query(`DELETE FROM essay_case_answers WHERE attempt_id=$1`,[attempt.id]); for(const answer of dto.answers) await m.query(`INSERT INTO essay_case_answers(attempt_id,question_id,answer_text) VALUES($1,$2,$3)`,[attempt.id,answer.question_id,answer.answer.trim()]); });
    return this.getCase(id,actor);
  }
  async reveal(id:string,actor:AuthenticatedUser){ const item=await this.requireCase(id); await this.assertCourseAccess(item.course_id,actor,false); const result=await this.db.query(`UPDATE essay_case_attempts SET status='REVEALED',revealed_at=now() WHERE case_id=$1 AND student_id=$2 AND status='SUBMITTED' RETURNING id`,[id,actor.userId]); if(!result.length) throw new ConflictException('Submit every answer before revealing model answers'); return this.getCase(id,actor); }

  async importPdfSeed(courseId:string,actor:AuthenticatedUser){ await this.assertCourseAccess(courseId,actor,true); const weeks:Row[]=await this.db.query(`SELECT id,week_number FROM weeks WHERE course_id=$1 ORDER BY week_number`,[courseId]); if(!weeks.length) throw new ConflictException('Create at least one week in this course before importing cases'); let imported=0,skipped=0; await this.db.transaction(async m=>{ for(let index=0;index<(pdfCases as any[]).length;index++){ const source=(pdfCases as any[])[index]; const targetWeek=weeks[index%weeks.length]; const exists=(await m.query(`SELECT id FROM essay_cases c JOIN weeks w ON w.id=c.week_id WHERE w.course_id=$1 AND c.section=$2 AND c.source_case_number=$3`,[courseId,source.section,source.sourceCaseNumber]))[0]; if(exists){skipped++;continue;} await this.insertCase(m,{week_id:targetWeek.id,title:source.title,stem:source.stem,section:source.section,source_case_number:source.sourceCaseNumber,is_published:true,questions:source.questions.map((q:any)=>({prompt:q.prompt,model_answer:q.answer}))},actor.userId); imported++; }}); return {imported,skipped,total:(pdfCases as any[]).length,weeks:weeks.length}; }

  private async insertCase(m:EntityManager,dto:any,userId:string){ const row=(await m.query(`INSERT INTO essay_cases(week_id,title,stem,section,source_case_number,is_published,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[dto.week_id,dto.title.trim(),dto.stem.trim(),dto.section?.trim()||null,dto.source_case_number||null,dto.is_published??false,userId]))[0]; for(let i=0;i<dto.questions.length;i++) await m.query(`INSERT INTO essay_case_questions(case_id,prompt,model_answer,display_order) VALUES($1,$2,$3,$4)`,[row.id,dto.questions[i].prompt.trim(),dto.questions[i].model_answer.trim(),i+1]); return row.id; }
  private async requireCase(id:string){ const row=(await this.db.query(`SELECT c.*,w.course_id FROM essay_cases c JOIN weeks w ON w.id=c.week_id WHERE c.id=$1`,[id]))[0]; if(!row) throw new NotFoundException('Essay case not found'); return row; }
  private async courseForWeek(id:string){ const row=(await this.db.query(`SELECT course_id FROM weeks WHERE id=$1`,[id]))[0]; if(!row) throw new NotFoundException('Week not found'); return row.course_id; }
  private async assertCourseAccess(courseId:string,actor:AuthenticatedUser,manage:boolean){ if(actor.role===UserRole.SYSTEM_ADMIN)return; if(actor.role===UserRole.INSTRUCTOR){ const ok=(await this.db.query(`SELECT 1 FROM course_instructors WHERE course_id=$1 AND instructor_id=$2`,[courseId,actor.userId]))[0]; if(ok)return; } if(!manage&&actor.role===UserRole.STUDENT){ const ok=(await this.db.query(`SELECT 1 FROM bundle_courses bc JOIN bundles b ON b.id=bc.bundle_id JOIN bundle_enrollments e ON e.bundle_id=b.id WHERE bc.course_id=$1 AND e.student_id=$2 AND e.status<>'REVOKED' AND b.status IN ('PUBLISHED','ARCHIVED') AND (b.available_until IS NULL OR b.available_until>now())`,[courseId,actor.userId]))[0]; if(ok)return; } throw new ForbiddenException(manage?'You are not assigned to manage this course':'This course is not available in an active enrolled bundle'); }
}
