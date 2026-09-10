import { DataSource, Repository } from 'typeorm';
import { Course } from '../../common/entities/course.entity';
import { Lecture } from '../../common/entities/lecture.entity';
import { Question } from '../../common/entities/question.entity';
import { StudentCourseProgress } from '../../common/entities/student-course-progress.entity';
import { StudentLectureProgress } from '../../common/entities/student-lecture-progress.entity';
import { StudentQuestionProgress } from '../../common/entities/student-question-progress.entity';
import { StudentTopicProgress } from '../../common/entities/student-topic-progress.entity';
import { Topic } from '../../common/entities/topic.entity';
import { Student } from '../users/entities/student.entity';
import { ProgressService } from './progress.service';

describe('ProgressService student analytics SQL contract', () => {
  const studentId = '11111111-1111-4111-8111-111111111111';

  function repository<T>(): Repository<T> {
    return {} as Repository<T>;
  }

  function setup() {
    const managerQuery = jest.fn().mockResolvedValue([]);
    const dataSourceQuery = jest.fn(async (sql: string) => {
      if (sql.includes('SELECT DISTINCT bundle_course.course_id')) return [];
      if (sql.includes('AS questions_answered')) {
        return [{
          questions_answered: 0,
          accuracy: 0,
          bookmarked: 0,
          calibrated_confidence: 0,
          confidence_samples: 0,
          essay_cases_solved: 0,
          flashcards_mastered: 0,
          flashcards_due: 0,
        }];
      }
      if (sql.includes('answer.answered_at::date AS date')) return [];
      if (sql.includes('progress.mastery_percentage::float AS mastery')) return [];
      if (sql.includes('FROM study_plan_items WHERE student_id=$1')) return [];
      if (sql.includes('AVG(progress.completion_percentage)')) return [{ curriculum: 0 }];
      if (sql.includes('COUNT(*)::int AS reviewed')) return [{ reviewed: 0 }];
      return [];
    });
    const dataSource = {
      query: dataSourceQuery,
      manager: { query: managerQuery },
      transaction: jest.fn(async (callback: (manager: { query: typeof managerQuery }) => Promise<unknown>) =>
        callback({ query: managerQuery })),
    } as unknown as DataSource;
    const students = {
      exists: jest.fn().mockResolvedValue(true),
    } as unknown as Repository<Student>;

    const service = new ProgressService(
      repository<StudentCourseProgress>(),
      repository<StudentLectureProgress>(),
      repository<StudentTopicProgress>(),
      repository<StudentQuestionProgress>(),
      repository<Course>(),
      repository<Lecture>(),
      repository<Topic>(),
      repository<Question>(),
      students,
      dataSource,
    );

    return { service, dataSourceQuery };
  }

  it('parameterizes study-plan date filters with the same placeholders as answer filters', async () => {
    const { service, dataSourceQuery } = setup();

    await service.studentAnalytics(studentId, {
      date_from: '2026-09-01',
      date_until: '2026-09-10',
    });

    const activityCall = dataSourceQuery.mock.calls.find(([sql]) =>
      String(sql).includes('FROM study_plan_items WHERE student_id=$1'),
    );
    expect(activityCall).toBeDefined();
    const [activitySql, activityParams] = activityCall!;
    expect(activitySql).toContain('scheduled_date >= $2::date');
    expect(activitySql).toContain('scheduled_date <= $3::date');
    expect(activitySql).not.toContain('scheduled_date >= 2::date');
    expect(activitySql).not.toContain('scheduled_date <= 3::date');
    expect(activityParams).toEqual([studentId, '2026-09-01', '2026-09-10']);
  });

  it('keeps confidence calibration in the analytics query contract', async () => {
    const { service, dataSourceQuery } = setup();

    await service.studentAnalytics(studentId, {});

    const summaryCall = dataSourceQuery.mock.calls.find(([sql]) =>
      String(sql).includes('AS questions_answered'),
    );
    expect(summaryCall).toBeDefined();
    expect(String(summaryCall![0])).toContain('answer.confidence_level');
    expect(String(summaryCall![0])).toContain('AS calibrated_confidence');
  });
});
