import {
  buildDeckAccessExistsSql,
  buildDeckDistributionSql,
  buildFullCourseBundleSql,
} from './bundle-access.predicates';

describe('Flashcard academic scope and bundle distribution', () => {
  it('requires full-course entitlement for course-scoped decks', () => {
    const sql=buildDeckAccessExistsSql('$1','$2');
    expect(sql).toContain('(deck.week_id IS NULL AND deck.lecture_id IS NULL)');
    expect(sql).toContain('NOT EXISTS ( SELECT 1 FROM bundle_weeks selected');
    expect(sql).toContain('selected_week.course_id = course.id');
  });

  it('uses week fallback for week and lecture scoped decks', () => {
    const sql=buildDeckAccessExistsSql('$1','$2');
    expect(sql).toContain('(deck.week_id IS NOT NULL OR deck.lecture_id IS NOT NULL)');
    expect(sql).toContain('COALESCE(deck.week_id, lecture.week_id)');
    expect(sql).toContain('selected.week_id = COALESCE(deck.week_id, lecture.week_id)');
  });

  it('inherits access by default but allows explicit bundle restriction', () => {
    const sql=buildDeckDistributionSql('deck','bundle');
    expect(sql).toContain("deck.bundle_access_mode = 'INHERIT'");
    expect(sql).toContain("deck.bundle_access_mode = 'RESTRICTED'");
    expect(sql).toContain('flashcard_deck_bundle_restrictions restriction');
    expect(sql).toContain('restriction.bundle_id = bundle.id');
  });

  it('defines full-course access as no selected weeks for that course', () => {
    const sql=buildFullCourseBundleSql('bundle','course.id');
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('selected.bundle_id = bundle.id');
    expect(sql).toContain('selected_week.course_id = course.id');
  });
});
