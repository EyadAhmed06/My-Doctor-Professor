import 'dotenv/config';
import type { DataSource } from 'typeorm';

// Production images ship compiled application code in dist/ and intentionally
// omit src/. Local runs continue to load the TypeScript data source.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AppDataSource } = require(
  process.env.NODE_ENV === 'production'
    ? '../dist/database/data-source'
    : '../src/database/data-source',
) as { AppDataSource: DataSource };

type CourseRow = {
  semester_number: number;
  course_code: string;
  course_name: string;
  lecture_count: number;
  mcq_count: number;
  eligible_mcq_count: number;
  bundle_count: number;
};

type LectureRow = {
  course_code: string;
  lecture_title: string;
  mcq_count: number;
  eligible_mcq_count: number;
};

type SemesterRow = {
  semester_number: number;
  course_count: number;
  eligible_mcq_count: number;
};

const EXPECTED_COURSES = 14;
const EXPECTED_MCQS_PER_COURSE = 40;
const EXPECTED_MCQS_PER_LECTURE = 10;
const FINAL_SEMESTERS = new Set([5, 6]);

async function main() {
  await AppDataSource.initialize();
  try {
    const courses = await AppDataSource.query<CourseRow[]>(`
      SELECT
        semester.semester_number,
        course.course_code,
        course.course_name,
        COUNT(DISTINCT lecture.id)::int AS lecture_count,
        COUNT(DISTINCT question.id) FILTER (
          WHERE question.question_type = 'MCQ'
            AND question.reference = 'MDP medical content seed v1'
        )::int AS mcq_count,
        COUNT(DISTINCT question.id) FILTER (
          WHERE question.question_type = 'MCQ'
            AND question.reference = 'MDP medical content seed v1'
            AND question.is_active = TRUE
            AND question.is_question_bank = TRUE
            AND (SELECT COUNT(*) FROM mcq_options o WHERE o.question_id = question.id) = 5
            AND (SELECT COUNT(*) FROM mcq_options o WHERE o.question_id = question.id AND o.is_correct = TRUE) = 1
        )::int AS eligible_mcq_count,
        COUNT(DISTINCT bundle_course.bundle_id)::int AS bundle_count
      FROM courses course
      JOIN semesters semester ON semester.id = course.semester_id
      LEFT JOIN weeks week ON week.course_id = course.id
      LEFT JOIN lectures lecture ON lecture.week_id = week.id AND lecture.is_published = TRUE
      LEFT JOIN topics topic ON topic.lecture_id = lecture.id
      LEFT JOIN questions question ON question.topic_id = topic.id
      LEFT JOIN bundle_courses bundle_course ON bundle_course.course_id = course.id
      WHERE course.course_code IN (
        'ANAT-S3','HIST-S3','PATH-S3','ANAT-S4',
        'CARD-S5','HEMA-S5','CHEST-S5','GAST-S5','NEPH-S5',
        'CARD-S6','HEMA-S6','CHEST-S6','GAST-S6','NEPH-S6'
      )
      GROUP BY semester.semester_number, course.course_code, course.course_name
      ORDER BY semester.semester_number, course.course_code
    `);

    const lectures = await AppDataSource.query<LectureRow[]>(`
      SELECT
        course.course_code,
        lecture.title AS lecture_title,
        COUNT(DISTINCT question.id) FILTER (
          WHERE question.question_type = 'MCQ'
            AND question.reference = 'MDP medical content seed v1'
        )::int AS mcq_count,
        COUNT(DISTINCT question.id) FILTER (
          WHERE question.question_type = 'MCQ'
            AND question.reference = 'MDP medical content seed v1'
            AND question.is_active = TRUE
            AND question.is_question_bank = TRUE
            AND (SELECT COUNT(*) FROM mcq_options o WHERE o.question_id = question.id) = 5
            AND (SELECT COUNT(*) FROM mcq_options o WHERE o.question_id = question.id AND o.is_correct = TRUE) = 1
        )::int AS eligible_mcq_count
      FROM courses course
      JOIN weeks week ON week.course_id = course.id
      JOIN lectures lecture ON lecture.week_id = week.id
      LEFT JOIN topics topic ON topic.lecture_id = lecture.id
      LEFT JOIN questions question ON question.topic_id = topic.id
      WHERE course.course_code IN (
        'ANAT-S3','HIST-S3','PATH-S3','ANAT-S4',
        'CARD-S5','HEMA-S5','CHEST-S5','GAST-S5','NEPH-S5',
        'CARD-S6','HEMA-S6','CHEST-S6','GAST-S6','NEPH-S6'
      )
      GROUP BY course.course_code, lecture.id, lecture.title
      ORDER BY course.course_code, lecture.title
    `);

    const semesters = await AppDataSource.query<SemesterRow[]>(`
      SELECT
        semester.semester_number,
        COUNT(DISTINCT course.id)::int AS course_count,
        COUNT(DISTINCT question.id) FILTER (
          WHERE question.question_type = 'MCQ'
            AND question.reference = 'MDP medical content seed v1'
            AND question.is_active = TRUE
            AND question.is_question_bank = TRUE
            AND (SELECT COUNT(*) FROM mcq_options o WHERE o.question_id = question.id) = 5
            AND (SELECT COUNT(*) FROM mcq_options o WHERE o.question_id = question.id AND o.is_correct = TRUE) = 1
        )::int AS eligible_mcq_count
      FROM semesters semester
      JOIN courses course ON course.semester_id = semester.id
      JOIN weeks week ON week.course_id = course.id
      JOIN lectures lecture ON lecture.week_id = week.id
      JOIN topics topic ON topic.lecture_id = lecture.id
      JOIN questions question ON question.topic_id = topic.id
      WHERE semester.semester_number IN (5, 6)
      GROUP BY semester.semester_number
      ORDER BY semester.semester_number
    `);

    const failures: string[] = [];

    if (courses.length !== EXPECTED_COURSES) {
      failures.push(`Expected ${EXPECTED_COURSES} seeded courses, found ${courses.length}`);
    }

    for (const course of courses) {
      if (course.lecture_count !== 4) {
        failures.push(`${course.course_code}: expected 4 published lectures, found ${course.lecture_count}`);
      }
      if (course.mcq_count !== EXPECTED_MCQS_PER_COURSE) {
        failures.push(`${course.course_code}: expected 40 seeded MCQs, found ${course.mcq_count}`);
      }
      if (course.eligible_mcq_count !== EXPECTED_MCQS_PER_COURSE) {
        failures.push(`${course.course_code}: expected 40 eligible five-option MCQs, found ${course.eligible_mcq_count}`);
      }
      if (course.bundle_count < 1) {
        failures.push(`${course.course_code}: course is not linked to a bundle`);
      }
    }

    for (const lecture of lectures) {
      if (lecture.mcq_count !== EXPECTED_MCQS_PER_LECTURE) {
        failures.push(`${lecture.course_code}/${lecture.lecture_title}: expected 10 seeded MCQs, found ${lecture.mcq_count}`);
      }
      if (lecture.eligible_mcq_count !== EXPECTED_MCQS_PER_LECTURE) {
        failures.push(`${lecture.course_code}/${lecture.lecture_title}: expected 10 eligible MCQs, found ${lecture.eligible_mcq_count}`);
      }
    }

    for (const semester of semesters) {
      if (!FINAL_SEMESTERS.has(semester.semester_number)) continue;
      if (semester.course_count !== 5) {
        failures.push(`Semester ${semester.semester_number}: expected 5 courses for the 200-MCQ final, found ${semester.course_count}`);
      }
      if (semester.eligible_mcq_count !== 200) {
        failures.push(`Semester ${semester.semester_number}: expected 200 eligible MCQs, found ${semester.eligible_mcq_count}`);
      }
    }

    console.log(JSON.stringify({ courses, lectures, semesters, failures }, null, 2));

    if (failures.length) {
      throw new Error(`MCQ deployment verification failed: ${failures.join('; ')}`);
    }
  } finally {
    await AppDataSource.destroy();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
