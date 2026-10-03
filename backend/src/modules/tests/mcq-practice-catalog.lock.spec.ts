import { McqPracticeCatalogService } from './mcq-practice-catalog.service';
import { UserRole } from '../users/entities/user.entity';
describe('Locked MCQ catalog previews', () => {
  function fixture(allowed: string[], enrolled = true) {
    const query = jest.fn().mockResolvedValueOnce(enrolled ? [{}] : []).mockResolvedValueOnce([
      { lecture_id: 'open', topic_id: 'topic', topic_name: 'Topic', question_count: 12 },
    ]);
    const weeks = [{ id: 'week', weekNumber: 3, title: 'Week three', isLocked: true, description: 'Hidden material',
      lectures: [{ id: 'locked', title: 'Locked lecture', lectureNumber: 1, isPublished: true, description: 'Secret content' }] }];
    const service = new McqPracticeCatalogService(
      { findOne: jest.fn().mockResolvedValue({ id: 'course' }) } as any,
      { find: jest.fn().mockResolvedValue(weeks) } as any, { query } as any,
      { getAccessibleLectureIdsInBundle: jest.fn().mockResolvedValue(allowed) } as any,
    );
    return { service, query };
  }
  const actor = { userId: 'student', role: UserRole.STUDENT } as any;
  it('shows a fully locked enrolled week without exposing content or selectable questions', async () => {
    const { service } = fixture([]);
    const result = await service.catalog('bundle', 'course', actor);
    expect(result.weeks[0]).toMatchObject({ title: 'Week three', isLocked: true });
    expect(result.weeks[0]).not.toHaveProperty('description');
    expect(result.weeks[0].lectures[0]).toMatchObject({ title: 'Locked lecture', isLocked: true, question_count: 0, topics: [] });
    expect(result.weeks[0].lectures[0]).not.toHaveProperty('description');
  });
  it('denies preview when the student lacks active enrollment in the requested bundle', async () => {
    await expect(fixture([], false).service.catalog('bundle', 'course', actor)).rejects.toThrow('does not grant access');
  });
  it('counts only unlocked topics and passes accessible lecture IDs to the query', async () => {
    const { service, query } = fixture(['open']);
    await service.catalog('bundle', 'course', actor);
    expect(query.mock.calls[1][0]).toContain('topic.is_locked = FALSE');
    expect(query.mock.calls[1][1]).toEqual([['open']]);
  });
});
