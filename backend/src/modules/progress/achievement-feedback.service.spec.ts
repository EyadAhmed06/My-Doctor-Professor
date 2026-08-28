import { AchievementFeedbackService } from './achievement-feedback.service';

const studentId = '11111111-1111-4111-8111-111111111111';

function buildService(metrics: Record<string, number>, before: Array<{ achievement_code:string; unlocked_at:string }> = []) {
  const inserted: string[] = [];
  const unlockedAt = '2026-08-28T14:00:00.000Z';
  const manager = {
    query: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('SELECT achievement_code, unlocked_at')) {
        if (manager.query.mock.calls.filter((call: unknown[]) => String(call[0]).includes('SELECT achievement_code, unlocked_at')).length === 1) {
          return before;
        }
        return [
          ...before,
          ...inserted
            .filter((code) => !before.some((item) => item.achievement_code === code))
            .map((achievement_code) => ({ achievement_code, unlocked_at: unlockedAt })),
        ];
      }
      if (sql.includes('INSERT INTO student_achievements')) {
        inserted.push(String(params?.[1]));
        return [];
      }
      throw new Error(`Unexpected manager SQL: ${sql}`);
    }),
  };
  const dataSource = {
    query: jest.fn().mockResolvedValue([{
      answered_questions: metrics.answeredQuestions ?? 0,
      correct_answers: metrics.correctAnswers ?? 0,
      completed_lectures: metrics.completedLectures ?? 0,
      mastered_cards: metrics.masteredCards ?? 0,
      essay_cases: metrics.essayCases ?? 0,
      submitted_assessments: metrics.submittedAssessments ?? 0,
      study_streak: metrics.studyStreak ?? 0,
    }]),
    transaction: jest.fn().mockImplementation(async (callback) => callback(manager)),
  };
  return { service: new AchievementFeedbackService(dataSource as never), manager, dataSource, inserted };
}

describe('AchievementFeedbackService', () => {
  it('persists a newly earned milestone once and reports it as newly unlocked', async () => {
    const { service, inserted } = buildService({ answeredQuestions: 1 });

    const result = await service.getStudentAchievements(studentId);

    expect(inserted).toEqual(['questions-first']);
    expect(result.unlocked.map((item) => item.id)).toContain('questions-first');
    expect(result.newly_unlocked.map((item) => item.id)).toEqual(['questions-first']);
    expect(result.next_milestones).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'QUESTIONS', id: 'questions-100', current: 1, threshold: 100 }),
    ]));
  });

  it('does not re-insert or re-celebrate a milestone already stored for the student', async () => {
    const { service, inserted } = buildService(
      { answeredQuestions: 1 },
      [{ achievement_code: 'questions-first', unlocked_at: '2026-08-27T10:00:00.000Z' }],
    );

    const result = await service.getStudentAchievements(studentId);

    expect(inserted).toEqual([]);
    expect(result.newly_unlocked).toEqual([]);
    expect(result.unlocked).toHaveLength(1);
  });

  it('uses the same verified XP formula as the student dashboard', async () => {
    const { service } = buildService({
      answeredQuestions: 80,
      correctAnswers: 50,
      completedLectures: 3,
      masteredCards: 25,
    });

    const result = await service.getStudentAchievements(studentId);

    expect(result.xp).toBe(105);
    expect(result.level).toBe(2);
    expect(result.level_progress).toBe(5);
    expect(result.metrics.completedLectures).toBe(3);
  });
});
