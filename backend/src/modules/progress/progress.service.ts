import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Course } from '../../common/entities/course.entity';
import { Lecture } from '../../common/entities/lecture.entity';
import { Question } from '../../common/entities/question.entity';
import { StudentCourseProgress } from '../../common/entities/student-course-progress.entity';
import { StudentLectureProgress } from '../../common/entities/student-lecture-progress.entity';
import { StudentQuestionProgress } from '../../common/entities/student-question-progress.entity';
import { StudentTopicProgress } from '../../common/entities/student-topic-progress.entity';
import { Topic } from '../../common/entities/topic.entity';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { Student } from '../users/entities/student.entity';
import { UserRole } from '../users/entities/user.entity';
import {
  AnalyticsQueryDto,
  BookmarkQuestionDto,
  DashboardQueryDto,
  UpdateLectureProgressDto,
} from './dtos/progress.dto';

@Injectable()
export class ProgressService {
  constructor(
    @InjectRepository(StudentCourseProgress) private readonly courseProgress:Repository<StudentCourseProgress>,
    @InjectRepository(StudentLectureProgress) private readonly lectureProgress:Repository<StudentLectureProgress>,
    @InjectRepository(StudentTopicProgress) private readonly topicProgress:Repository<StudentTopicProgress>,
    @InjectRepository(StudentQuestionProgress) private readonly questionProgress:Repository<StudentQuestionProgress>,
    @InjectRepository(Course) private readonly courses:Repository<Course>,
    @InjectRepository(Lecture) private readonly lectures:Repository<Lecture>,
    @InjectRepository(Topic) private readonly topics:Repository<Topic>,
    @InjectRepository(Question) private readonly questions:Repository<Question>,
    @InjectRepository(Student) private readonly students:Repository<Student>,
    private readonly dataSource:DataSource,
  ) {}

  async listCourseProgress(studentId:string) {
    await this.requireStudent(studentId);
    await this.synchronizeStudent(studentId);
    return this.courseProgress.find({
      where:{studentId},
      relations:{course:{semester:true}},
      order:{course:{semester:{semesterNumber:'ASC'},displayOrder:'ASC'}},
    });
  }

  async getCourseProgress(courseId:string,studentId:string) {
    await this.requireStudent(studentId);
    await this.requireActiveCourse(courseId);
    await this.synchronizeStudent(studentId);
    const progress=await this.courseProgress.findOne({
      where:{studentId,courseId},
      relations:{course:true},
    });
    if(!progress) throw new NotFoundException('Course progress not found');
    const lectures=await this.lectureProgress.createQueryBuilder('progress')
      .innerJoinAndSelect('progress.lecture','lecture')
      .innerJoin('lecture.week','week')
      .where('progress.student_id = :studentId',{studentId})
      .andWhere('week.course_id = :courseId',{courseId})
      .orderBy('lecture.display_order','ASC').getMany();
    return {...progress,lectures};
  }

  async getLectureProgress(lectureId:string,studentId:string) {
    await this.requireStudent(studentId);
    await this.requireVisibleLecture(lectureId);
    return (await this.lectureProgress.findOne({
      where:{studentId,lectureId},relations:{lecture:{week:{course:true}}},
    }))??this.emptyLectureProgress(studentId,lectureId);
  }

  async updateLectureProgress(
    lectureId:string,dto:UpdateLectureProgressDto,studentId:string,
  ) {
    await this.requireStudent(studentId);
    const lecture=await this.requireVisibleLecture(lectureId);
    if(!Object.keys(dto).length) throw new BadRequestException('At least one progress field must be provided');
    if(dto.is_completed===false) {
      throw new BadRequestException('Lecture completion is monotonic and cannot be reversed');
    }
    return this.dataSource.transaction(async(manager)=>{
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`${studentId}:${lectureId}:lecture-progress`],
      );
      const repository=manager.getRepository(StudentLectureProgress);
      let progress=await repository.findOne({where:{studentId,lectureId}});
      progress??=repository.create({
        studentId,lectureId,isCompleted:false,completionPercentage:'0.00',
        timeSpentMinutes:0,lastAccessedAt:null,completedAt:null,
      });
      if(dto.completion_percentage!==undefined) {
        progress.completionPercentage=Math.max(
          Number(progress.completionPercentage),dto.completion_percentage,
        ).toFixed(2);
      }
      if(dto.time_spent_minutes_delta!==undefined) {
        progress.timeSpentMinutes+=dto.time_spent_minutes_delta;
      }
      if(dto.is_completed===true||Number(progress.completionPercentage)===100) {
        progress.isCompleted=true;
        progress.completionPercentage='100.00';
        progress.completedAt??=new Date();
      }
      progress.lastAccessedAt=new Date();
      const saved=await repository.save(progress);
      await this.synchronizeCourse(studentId,lecture.week.courseId,manager);
      return saved;
    });
  }

  async getTopicProgress(topicId:string,studentId:string) {
    await this.requireStudent(studentId);
    await this.requireVisibleTopic(topicId);
    await this.synchronizeQuestionAndTopicProgress(studentId);
    return (await this.topicProgress.findOne({
      where:{studentId,topicId},
      relations:{topic:{lecture:{week:{course:true}}}},
    }))??{
      studentId,topicId,questionsAttempted:0,questionsCorrect:0,
      questionsIncorrect:0,confidenceLevel:'0.00',averageScore:null,
      masteryPercentage:'0.00',lastPracticedAt:null,
    };
  }

  async getQuestionProgress(questionId:string,studentId:string) {
    await this.requireStudent(studentId);
    const question=await this.questions.findOne({
      where:{id:questionId,isActive:true},
      relations:{topic:{lecture:{week:{course:true}}}},
    });
    if(!question||!question.topic.lecture.isPublished||
      !question.topic.lecture.week.course.isActive) {
      throw new NotFoundException('Question not found');
    }
    await this.synchronizeQuestionAndTopicProgress(studentId);
    return (await this.questionProgress.findOne({
      where:{studentId,questionId},relations:{question:true},
    }))??{
      studentId,questionId,attempts:0,correctAttempts:0,
      incorrectAttempts:0,lastAnswerCorrect:null,bookmarked:false,lastAttemptedAt:null,
    };
  }

  async bookmarkQuestion(questionId:string,dto:BookmarkQuestionDto,studentId:string) {
    await this.getQuestionProgress(questionId,studentId);
    let progress=await this.questionProgress.findOne({where:{studentId,questionId}});
    progress??=this.questionProgress.create({
      studentId,questionId,attempts:0,correctAttempts:0,incorrectAttempts:0,
      lastAnswerCorrect:null,bookmarked:false,lastAttemptedAt:null,
    });
    progress.bookmarked=dto.bookmarked;
    return this.questionProgress.save(progress);
  }

  async studentDashboard(studentId:string) {
    await this.requireStudent(studentId);
    await this.synchronizeStudent(studentId);
    const [courses,attempts,questionSummary,flashcards]=await Promise.all([
      this.courseProgress.find({
        where:{studentId},relations:{course:true},
        order:{lastAccessedAt:'DESC'},take:6,
      }),
      this.dataSource.query(`
        SELECT attempt.id,attempt.status,attempt.score,attempt.submitted_at,
          test.id AS test_id,test.title,test.total_marks,test.passing_marks
        FROM test_attempts attempt JOIN tests test ON test.id=attempt.test_id
        WHERE attempt.student_id=$1
        ORDER BY COALESCE(attempt.submitted_at,attempt.created_at) DESC LIMIT 6
      `,[studentId]),
      this.dataSource.query(`
        SELECT COALESCE(SUM(attempts),0)::int AS attempts,
          COALESCE(SUM(correct_attempts),0)::int AS correct_attempts,
          COALESCE(ROUND(100.0*SUM(correct_attempts)/NULLIF(SUM(attempts),0),2),0) AS accuracy,
          COUNT(*) FILTER (WHERE bookmarked=TRUE)::int AS bookmarked
        FROM student_question_progress WHERE student_id=$1
      `,[studentId]),
      this.dataSource.query(`
        SELECT COUNT(*)::int AS reviewed,
          COUNT(*) FILTER (WHERE is_mastered=TRUE)::int AS mastered,
          COUNT(*) FILTER (WHERE next_review_at IS NULL OR next_review_at<=CURRENT_TIMESTAMP)::int AS due
        FROM student_flashcard_progress WHERE student_id=$1
      `,[studentId]),
    ]);
    return {courses,recent_attempts:attempts,questions:questionSummary[0],flashcards:flashcards[0]};
  }

  async instructorDashboard(actor:AuthenticatedUser,query:DashboardQueryDto) {
    const courseClause=query.course_id?' AND test.course_id=$2':'';
    const params=query.course_id?[actor.userId,query.course_id]:[actor.userId];
    const [content,assessments,pending]=await Promise.all([
      this.dataSource.query(`
        SELECT
          (SELECT COUNT(*) FROM questions WHERE created_by=$1)::int AS questions,
          (SELECT COUNT(*) FROM tests WHERE created_by=$1)::int AS tests,
          (SELECT COUNT(*) FROM flashcard_decks WHERE created_by=$1)::int AS decks
      `,[actor.userId]),
      this.dataSource.query(`
        SELECT COUNT(attempt.id)::int AS attempts,
          COUNT(DISTINCT attempt.student_id)::int AS students,
          COALESCE(ROUND(AVG(100.0*attempt.score/NULLIF(test.total_marks,0)),2),0) AS average_score
        FROM tests test LEFT JOIN test_attempts attempt ON attempt.test_id=test.id
          AND attempt.status IN ('SUBMITTED','EXPIRED')
        WHERE test.created_by=$1${courseClause}
      `,params),
      this.dataSource.query(`
        SELECT COUNT(*)::int AS pending_essay_answers
        FROM student_answers answer
        JOIN test_attempts attempt ON attempt.id=answer.attempt_id
        JOIN tests test ON test.id=attempt.test_id
        WHERE test.created_by=$1 AND attempt.status IN ('SUBMITTED','EXPIRED')
          AND answer.essay_answer IS NOT NULL AND answer.awarded_marks IS NULL
          ${query.course_id?'AND test.course_id=$2':''}
      `,params),
    ]);
    return {...content[0],...assessments[0],...pending[0]};
  }

  async adminDashboard() {
    const rows=await this.dataSource.query(`
      SELECT
        (SELECT COUNT(*) FROM users)::int AS users,
        (SELECT COUNT(*) FROM users WHERE status='ACTIVE')::int AS active_users,
        (SELECT COUNT(*) FROM students)::int AS students,
        (SELECT COUNT(*) FROM instructors)::int AS instructors,
        (SELECT COUNT(*) FROM courses)::int AS courses,
        (SELECT COUNT(*) FROM questions)::int AS questions,
        (SELECT COUNT(*) FROM tests)::int AS tests,
        (SELECT COUNT(*) FROM test_attempts)::int AS attempts,
        (SELECT COUNT(*) FROM flashcard_decks)::int AS flashcard_decks
    `);
    return rows[0];
  }

  async questionAnalytics(actor:AuthenticatedUser,query:AnalyticsQueryDto) {
    const {clauses,params}=this.analyticsFilters(actor,query,'test','question');
    const rows=await this.dataSource.query(`
      SELECT question.id,question.title,question.question_type,question.difficulty,
        COUNT(attempt.id)::int AS answers,
        COUNT(attempt.id) FILTER (WHERE answer.is_correct=TRUE)::int AS correct,
        COUNT(attempt.id) FILTER (WHERE answer.is_correct=FALSE)::int AS incorrect,
        COALESCE(ROUND(100.0*COUNT(attempt.id) FILTER (WHERE answer.is_correct=TRUE)
          /NULLIF(COUNT(attempt.id) FILTER (WHERE answer.is_correct IS NOT NULL),0),2),0) AS accuracy
      FROM questions question
      LEFT JOIN student_answers answer ON answer.question_id=question.id
      LEFT JOIN test_attempts attempt ON attempt.id=answer.attempt_id
        AND attempt.status IN ('SUBMITTED','EXPIRED')
      LEFT JOIN tests test ON test.id=attempt.test_id
      WHERE ${clauses.join(' AND ')}
      GROUP BY question.id
      ORDER BY answers DESC,question.created_at DESC
      LIMIT $${params.length+1} OFFSET $${params.length+2}
    `,[...params,query.limit??50,((query.page??1)-1)*(query.limit??50)]);
    return {data:rows,page:query.page??1,limit:query.limit??50};
  }

  async testAnalytics(actor:AuthenticatedUser,query:AnalyticsQueryDto) {
    const params:any[]=[];
    const clauses=['1=1'];
    if(actor.role===UserRole.INSTRUCTOR){params.push(actor.userId);clauses.push(`test.created_by=$${params.length}`);}
    if(query.course_id){params.push(query.course_id);clauses.push(`test.course_id=$${params.length}`);}
    if(query.test_id){params.push(query.test_id);clauses.push(`test.id=$${params.length}`);}
    this.addDateFilters(query,params,clauses,'attempt.submitted_at');
    const rows=await this.dataSource.query(`
      SELECT test.id,test.title,test.total_marks,test.passing_marks,
        COUNT(attempt.id)::int AS attempts,COUNT(DISTINCT attempt.student_id)::int AS students,
        COALESCE(ROUND(AVG(100.0*attempt.score/NULLIF(test.total_marks,0)),2),0) AS average_score,
        COALESCE(ROUND(100.0*COUNT(attempt.id) FILTER (WHERE attempt.score>=test.passing_marks)
          /NULLIF(COUNT(attempt.id),0),2),0) AS pass_rate
      FROM tests test LEFT JOIN test_attempts attempt ON attempt.test_id=test.id
        AND attempt.status IN ('SUBMITTED','EXPIRED')
      WHERE ${clauses.join(' AND ')}
      GROUP BY test.id ORDER BY attempts DESC,test.created_at DESC
      LIMIT $${params.length+1} OFFSET $${params.length+2}
    `,[...params,query.limit??50,((query.page??1)-1)*(query.limit??50)]);
    return {data:rows,page:query.page??1,limit:query.limit??50};
  }

  async performanceAnalytics(actor:AuthenticatedUser,query:AnalyticsQueryDto) {
    const params:any[]=[];
    const clauses=["attempt.status IN ('SUBMITTED','EXPIRED')"];
    if(actor.role===UserRole.INSTRUCTOR){params.push(actor.userId);clauses.push(`test.created_by=$${params.length}`);}
    if(query.course_id){params.push(query.course_id);clauses.push(`test.course_id=$${params.length}`);}
    if(query.student_id){params.push(query.student_id);clauses.push(`attempt.student_id=$${params.length}`);}
    this.addDateFilters(query,params,clauses,'attempt.submitted_at');
    const rows=await this.dataSource.query(`
      SELECT attempt.student_id,user_account.full_name,
        COUNT(attempt.id)::int AS attempts,
        COALESCE(ROUND(AVG(100.0*attempt.score/NULLIF(test.total_marks,0)),2),0) AS average_score,
        COALESCE(ROUND(100.0*COUNT(attempt.id) FILTER (WHERE attempt.score>=test.passing_marks)
          /NULLIF(COUNT(attempt.id),0),2),0) AS pass_rate,
        MAX(attempt.submitted_at) AS last_attempt_at
      FROM test_attempts attempt JOIN tests test ON test.id=attempt.test_id
      JOIN users user_account ON user_account.id=attempt.student_id
      WHERE ${clauses.join(' AND ')}
      GROUP BY attempt.student_id,user_account.full_name
      ORDER BY average_score DESC
      LIMIT $${params.length+1} OFFSET $${params.length+2}
    `,[...params,query.limit??50,((query.page??1)-1)*(query.limit??50)]);
    return {data:rows,page:query.page??1,limit:query.limit??50};
  }

  private async synchronizeStudent(studentId:string) {
    await this.synchronizeQuestionAndTopicProgress(studentId);
    const courses=await this.courses.find({where:{isActive:true},select:{id:true}});
    for(const course of courses) await this.synchronizeCourse(studentId,course.id,this.dataSource.manager);
  }

  private async synchronizeQuestionAndTopicProgress(studentId:string) {
    await this.dataSource.transaction(async manager=>{
      await manager.query(`
        INSERT INTO student_question_progress(
          id,student_id,question_id,attempts,correct_attempts,incorrect_attempts,
          last_answer_correct,bookmarked,last_attempted_at,created_at,updated_at
        )
        SELECT gen_random_uuid(),$1,answer.question_id,COUNT(*)::int,
          COUNT(*) FILTER(WHERE answer.is_correct=TRUE)::int,
          COUNT(*) FILTER(WHERE answer.is_correct=FALSE)::int,
          (ARRAY_AGG(answer.is_correct ORDER BY answer.answered_at DESC)
            FILTER(WHERE answer.is_correct IS NOT NULL))[1],
          FALSE,MAX(answer.answered_at),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
        FROM student_answers answer JOIN test_attempts attempt ON attempt.id=answer.attempt_id
        WHERE attempt.student_id=$1 AND attempt.status IN ('SUBMITTED','EXPIRED')
          AND answer.is_correct IS NOT NULL
        GROUP BY answer.question_id
        ON CONFLICT(student_id,question_id) DO UPDATE SET
          attempts=EXCLUDED.attempts,correct_attempts=EXCLUDED.correct_attempts,
          incorrect_attempts=EXCLUDED.incorrect_attempts,
          last_answer_correct=EXCLUDED.last_answer_correct,
          last_attempted_at=EXCLUDED.last_attempted_at,updated_at=CURRENT_TIMESTAMP
      `,[studentId]);
      await manager.query(`
        INSERT INTO student_topic_progress(
          id,student_id,topic_id,questions_attempted,questions_correct,questions_incorrect,
          confidence_level,average_score,mastery_percentage,last_practiced_at,created_at,updated_at
        )
        SELECT gen_random_uuid(),$1,aggregated.topic_id,
          aggregated.attempts,aggregated.correct,aggregated.incorrect,
          LEAST(100,ROUND(SQRT(aggregated.attempts)*20,2)),
          ROUND(100.0*aggregated.correct/NULLIF(aggregated.attempts,0),2),
          ROUND(
            0.7*(100.0*aggregated.correct/NULLIF(aggregated.attempts,0))
            +0.3*(100.0*aggregated.questions_seen/NULLIF(totals.total_questions,0)),2
          ),aggregated.last_practiced,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
        FROM (
          SELECT question.topic_id,SUM(progress.attempts)::int AS attempts,
            SUM(progress.correct_attempts)::int AS correct,
            SUM(progress.incorrect_attempts)::int AS incorrect,
            COUNT(DISTINCT progress.question_id)::int AS questions_seen,
            MAX(progress.last_attempted_at) AS last_practiced
          FROM student_question_progress progress
          JOIN questions question ON question.id=progress.question_id
          WHERE progress.student_id=$1 AND progress.attempts>0
          GROUP BY question.topic_id
        ) aggregated
        JOIN (
          SELECT topic_id,COUNT(*)::int AS total_questions
          FROM questions WHERE is_active=TRUE GROUP BY topic_id
        ) totals ON totals.topic_id=aggregated.topic_id
        ON CONFLICT(student_id,topic_id) DO UPDATE SET
          questions_attempted=EXCLUDED.questions_attempted,
          questions_correct=EXCLUDED.questions_correct,
          questions_incorrect=EXCLUDED.questions_incorrect,
          confidence_level=EXCLUDED.confidence_level,average_score=EXCLUDED.average_score,
          mastery_percentage=EXCLUDED.mastery_percentage,
          last_practiced_at=EXCLUDED.last_practiced_at,updated_at=CURRENT_TIMESTAMP
      `,[studentId]);
    });
  }

  private async synchronizeCourse(studentId:string,courseId:string,manager:any) {
    await manager.query(`
      WITH lecture_stats AS (
        SELECT COUNT(lecture.id)::int AS total,
          COUNT(lecture.id) FILTER(WHERE progress.is_completed=TRUE)::int AS completed,
          MAX(progress.last_accessed_at) AS last_accessed,
          MAX(progress.completed_at) AS last_completion
        FROM weeks week JOIN lectures lecture ON lecture.week_id=week.id
        LEFT JOIN student_lecture_progress progress
          ON progress.lecture_id=lecture.id AND progress.student_id=$1
        WHERE week.course_id=$2 AND lecture.is_published=TRUE
      ),score_stats AS (
        SELECT ROUND(AVG(100.0*attempt.score/NULLIF(test.total_marks,0)),2) AS average_score
        FROM test_attempts attempt JOIN tests test ON test.id=attempt.test_id
        WHERE attempt.student_id=$1 AND test.course_id=$2
          AND attempt.status IN ('SUBMITTED','EXPIRED')
      )
      INSERT INTO student_course_progress(
        id,student_id,course_id,completion_percentage,lectures_completed,total_lectures,
        average_score,last_accessed_at,completed_at,created_at,updated_at
      )
      SELECT gen_random_uuid(),$1,$2,
        CASE WHEN lecture_stats.total=0 THEN 0
          ELSE ROUND(100.0*lecture_stats.completed/lecture_stats.total,2) END,
        lecture_stats.completed,lecture_stats.total,score_stats.average_score,
        lecture_stats.last_accessed,
        CASE WHEN lecture_stats.total>0 AND lecture_stats.completed=lecture_stats.total
          THEN lecture_stats.last_completion ELSE NULL END,
        CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      FROM lecture_stats CROSS JOIN score_stats
      ON CONFLICT(student_id,course_id) DO UPDATE SET
        completion_percentage=EXCLUDED.completion_percentage,
        lectures_completed=EXCLUDED.lectures_completed,total_lectures=EXCLUDED.total_lectures,
        average_score=EXCLUDED.average_score,last_accessed_at=EXCLUDED.last_accessed_at,
        completed_at=EXCLUDED.completed_at,updated_at=CURRENT_TIMESTAMP
    `,[studentId,courseId]);
  }

  private analyticsFilters(actor:AuthenticatedUser,query:AnalyticsQueryDto,testAlias:string,questionAlias:string) {
    const params:any[]=[];const clauses=['1=1'];
    if(actor.role===UserRole.INSTRUCTOR){
      params.push(actor.userId);
      clauses.push(`(${questionAlias}.created_by=$${params.length} OR ${testAlias}.created_by=$${params.length})`);
    }
    if(query.course_id){params.push(query.course_id);clauses.push(`${testAlias}.course_id=$${params.length}`);}
    if(query.topic_id){params.push(query.topic_id);clauses.push(`${questionAlias}.topic_id=$${params.length}`);}
    if(query.question_id){params.push(query.question_id);clauses.push(`${questionAlias}.id=$${params.length}`);}
    this.addDateFilters(query,params,clauses,'attempt.submitted_at');
    return {clauses,params};
  }

  private addDateFilters(query:AnalyticsQueryDto,params:any[],clauses:string[],column:string) {
    if(query.date_from&&query.date_until&&new Date(query.date_until)<new Date(query.date_from)) {
      throw new BadRequestException('date_until must not be earlier than date_from');
    }
    if(query.date_from){params.push(query.date_from);clauses.push(`${column}>=$${params.length}::timestamp`);}
    if(query.date_until){params.push(query.date_until);clauses.push(`${column}<=$${params.length}::timestamp`);}
  }

  private async requireStudent(id:string) {
    if(!(await this.students.exists({where:{userId:id}}))) throw new ForbiddenException('Student profile is required');
  }
  private async requireActiveCourse(id:string) {
    const course=await this.courses.findOne({where:{id,isActive:true}});
    if(!course) throw new NotFoundException('Course not found');return course;
  }
  private async requireVisibleLecture(id:string) {
    const lecture=await this.lectures.findOne({where:{id,isPublished:true},relations:{week:{course:true}}});
    if(!lecture||!lecture.week.course.isActive) throw new NotFoundException('Lecture not found');return lecture;
  }
  private async requireVisibleTopic(id:string) {
    const topic=await this.topics.findOne({where:{id},relations:{lecture:{week:{course:true}}}});
    if(!topic||!topic.lecture.isPublished||!topic.lecture.week.course.isActive) {
      throw new NotFoundException('Topic not found');
    }
    return topic;
  }
  private emptyLectureProgress(studentId:string,lectureId:string) {
    return {studentId,lectureId,isCompleted:false,completionPercentage:'0.00',
      timeSpentMinutes:0,lastAccessedAt:null,completedAt:null};
  }
}
