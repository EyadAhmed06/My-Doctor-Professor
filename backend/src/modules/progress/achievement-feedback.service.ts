import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

type AchievementRule = {
  id: string;
  category: 'QUESTIONS' | 'LECTURES' | 'FLASHCARDS' | 'ESSAYS' | 'ASSESSMENTS' | 'STREAK' | 'LEVEL';
  title: string;
  description: string;
  metric: keyof AchievementMetrics;
  threshold: number;
};

type AchievementMetrics = {
  answeredQuestions: number;
  correctAnswers: number;
  completedLectures: number;
  masteredCards: number;
  essayCases: number;
  submittedAssessments: number;
  studyStreak: number;
  level: number;
};

type StoredAchievement = {
  achievement_code: string;
  unlocked_at: Date | string;
};

const RULES: AchievementRule[] = [
  { id:'questions-first', category:'QUESTIONS', title:'First answer', description:'You answered your first assessment question.', metric:'answeredQuestions', threshold:1 },
  { id:'questions-100', category:'QUESTIONS', title:'Century of questions', description:'You answered 100 assessment questions.', metric:'answeredQuestions', threshold:100 },
  { id:'questions-500', category:'QUESTIONS', title:'Question endurance', description:'You answered 500 assessment questions.', metric:'answeredQuestions', threshold:500 },
  { id:'lectures-first', category:'LECTURES', title:'First lecture complete', description:'You completed your first lecture.', metric:'completedLectures', threshold:1 },
  { id:'lectures-10', category:'LECTURES', title:'Ten lectures down', description:'You completed 10 lectures.', metric:'completedLectures', threshold:10 },
  { id:'lectures-25', category:'LECTURES', title:'Curriculum momentum', description:'You completed 25 lectures.', metric:'completedLectures', threshold:25 },
  { id:'flashcards-10', category:'FLASHCARDS', title:'Memory forming', description:'You mastered 10 flashcards.', metric:'masteredCards', threshold:10 },
  { id:'flashcards-50', category:'FLASHCARDS', title:'Memory bank', description:'You mastered 50 flashcards.', metric:'masteredCards', threshold:50 },
  { id:'flashcards-100', category:'FLASHCARDS', title:'Recall engine', description:'You mastered 100 flashcards.', metric:'masteredCards', threshold:100 },
  { id:'essays-first', category:'ESSAYS', title:'First case solved', description:'You submitted your first essay case.', metric:'essayCases', threshold:1 },
  { id:'essays-10', category:'ESSAYS', title:'Case reasoning', description:'You solved 10 distinct essay cases.', metric:'essayCases', threshold:10 },
  { id:'assessments-first', category:'ASSESSMENTS', title:'First assessment complete', description:'You submitted your first assessment.', metric:'submittedAssessments', threshold:1 },
  { id:'assessments-10', category:'ASSESSMENTS', title:'Assessment rhythm', description:'You completed 10 assessments.', metric:'submittedAssessments', threshold:10 },
  { id:'streak-3', category:'STREAK', title:'Three-day rhythm', description:'You studied on three consecutive days.', metric:'studyStreak', threshold:3 },
  { id:'streak-7', category:'STREAK', title:'One-week streak', description:'You kept learning activity going for seven consecutive days.', metric:'studyStreak', threshold:7 },
  { id:'streak-30', category:'STREAK', title:'Thirty-day consistency', description:'You maintained a 30-day learning streak.', metric:'studyStreak', threshold:30 },
  { id:'level-5', category:'LEVEL', title:'Level 5', description:'Your verified learning activity reached Level 5.', metric:'level', threshold:5 },
  { id:'level-10', category:'LEVEL', title:'Level 10', description:'Your verified learning activity reached Level 10.', metric:'level', threshold:10 },
];

@Injectable()
export class AchievementFeedbackService {
  constructor(private readonly dataSource: DataSource) {}

  async getStudentAchievements(studentId: string) {
    const metrics = await this.metrics(studentId);
    const xp = metrics.correctAnswers + metrics.masteredCards + 10 * metrics.completedLectures;
    metrics.level = Math.floor(xp / 100) + 1;

    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`achievement-feedback:${studentId}`],
      );
      const before = await manager.query<StoredAchievement[]>(`
        SELECT achievement_code, unlocked_at
        FROM student_achievements
        WHERE student_id=$1
        ORDER BY unlocked_at DESC, achievement_code
      `, [studentId]);
      const beforeIds = new Set(before.map((item) => item.achievement_code));
      const earned = RULES.filter((rule) => Number(metrics[rule.metric]) >= rule.threshold);
      for (const rule of earned) {
        if (beforeIds.has(rule.id)) continue;
        await manager.query(`
          INSERT INTO student_achievements(student_id,achievement_code)
          VALUES($1,$2)
          ON CONFLICT(student_id,achievement_code) DO NOTHING
        `, [studentId, rule.id]);
      }
      const stored = await manager.query<StoredAchievement[]>(`
        SELECT achievement_code, unlocked_at
        FROM student_achievements
        WHERE student_id=$1
        ORDER BY unlocked_at DESC, achievement_code
      `, [studentId]);
      const storedByCode = new Map(stored.map((item) => [item.achievement_code, item]));
      const unlocked = RULES
        .filter((rule) => storedByCode.has(rule.id))
        .map((rule) => ({
          id: rule.id,
          category: rule.category,
          title: rule.title,
          description: rule.description,
          current: Number(metrics[rule.metric]),
          threshold: rule.threshold,
          unlocked_at: storedByCode.get(rule.id)!.unlocked_at,
        }))
        .sort((left, right) => new Date(String(right.unlocked_at)).getTime() - new Date(String(left.unlocked_at)).getTime());
      const newlyUnlocked = unlocked.filter((item) => !beforeIds.has(item.id));
      const nextByCategory = new Map<string, ReturnType<typeof this.nextMilestone>>();
      for (const category of [...new Set(RULES.map((rule) => rule.category))]) {
        const next = this.nextMilestone(category, metrics);
        if (next) nextByCategory.set(category, next);
      }
      return {
        xp,
        level: metrics.level,
        level_progress: xp % 100,
        metrics,
        unlocked,
        newly_unlocked: newlyUnlocked,
        next_milestones: [...nextByCategory.values()],
      };
    });
  }

  private nextMilestone(category: AchievementRule['category'], metrics: AchievementMetrics) {
    const rule = RULES
      .filter((item) => item.category === category && Number(metrics[item.metric]) < item.threshold)
      .sort((left, right) => left.threshold - right.threshold)[0];
    if (!rule) return null;
    const current = Number(metrics[rule.metric]);
    return {
      id: rule.id,
      category: rule.category,
      title: rule.title,
      description: rule.description,
      current,
      threshold: rule.threshold,
      progress: Math.max(0, Math.min(100, Math.round(current * 100 / rule.threshold))),
    };
  }

  private async metrics(studentId: string): Promise<AchievementMetrics> {
    const rows = await this.dataSource.query<Array<Record<string, number | string>>>(`
      WITH activity_days AS (
        SELECT DISTINCT activity_date FROM (
          SELECT submitted_at::date AS activity_date FROM test_attempts
            WHERE student_id=$1 AND submitted_at IS NOT NULL
          UNION SELECT last_reviewed_at::date FROM student_flashcard_progress
            WHERE student_id=$1 AND last_reviewed_at IS NOT NULL
          UNION SELECT last_accessed_at::date FROM student_lecture_progress
            WHERE student_id=$1 AND last_accessed_at IS NOT NULL
          UNION SELECT completed_at::date FROM study_plan_items
            WHERE student_id=$1 AND status='COMPLETED' AND completed_at IS NOT NULL
        ) source WHERE activity_date IS NOT NULL
      ), ordered AS (
        SELECT activity_date,activity_date-(ROW_NUMBER() OVER(ORDER BY activity_date))::int AS group_key
        FROM activity_days
      ), latest_group AS (
        SELECT group_key,MAX(activity_date) AS last_date FROM ordered GROUP BY group_key
        ORDER BY last_date DESC LIMIT 1
      ), current_streak AS (
        SELECT CASE WHEN latest_group.last_date<CURRENT_DATE-1 THEN 0 ELSE COUNT(ordered.*) END::int AS days
        FROM latest_group JOIN ordered USING(group_key) GROUP BY latest_group.last_date
      )
      SELECT
        COALESCE((SELECT COUNT(*) FROM student_answers answer
          JOIN test_attempts attempt ON attempt.id=answer.attempt_id
          WHERE attempt.student_id=$1 AND (answer.selected_option_id IS NOT NULL OR NULLIF(BTRIM(answer.essay_answer),'') IS NOT NULL)),0)::int AS answered_questions,
        COALESCE((SELECT COUNT(*) FROM student_answers answer
          JOIN test_attempts attempt ON attempt.id=answer.attempt_id
          WHERE attempt.student_id=$1 AND attempt.status IN ('SUBMITTED','EXPIRED') AND answer.is_correct=TRUE),0)::int AS correct_answers,
        COALESCE((SELECT COUNT(*) FROM student_lecture_progress WHERE student_id=$1 AND is_completed=TRUE),0)::int AS completed_lectures,
        COALESCE((SELECT COUNT(*) FROM student_flashcard_progress WHERE student_id=$1 AND is_mastered=TRUE),0)::int AS mastered_cards,
        COALESCE((SELECT COUNT(DISTINCT case_id) FROM essay_case_attempts WHERE student_id=$1 AND status IN ('SUBMITTED','REVEALED')),0)::int AS essay_cases,
        COALESCE((SELECT COUNT(*) FROM test_attempts WHERE student_id=$1 AND status IN ('SUBMITTED','EXPIRED')),0)::int AS submitted_assessments,
        COALESCE((SELECT days FROM current_streak),0)::int AS study_streak
    `, [studentId]);
    const row = rows[0] ?? {};
    return {
      answeredQuestions: Number(row.answered_questions ?? 0),
      correctAnswers: Number(row.correct_answers ?? 0),
      completedLectures: Number(row.completed_lectures ?? 0),
      masteredCards: Number(row.mastered_cards ?? 0),
      essayCases: Number(row.essay_cases ?? 0),
      submittedAssessments: Number(row.submitted_assessments ?? 0),
      studyStreak: Number(row.study_streak ?? 0),
      level: 1,
    };
  }
}
