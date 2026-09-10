export const ALLOWED_ENROLLMENT_ALIASES = new Set(['enrollment', 'e'] as const);
export const ALLOWED_BUNDLE_ALIASES = new Set(['bundle', 'b'] as const);
export const ALLOWED_COURSE_ALIASES = new Set(['course', 'c', 'bundle_course', 'bc'] as const);
export const ALLOWED_WEEK_ALIASES = new Set(['week', 'w'] as const);

export type EnrollmentAlias = 'enrollment' | 'e';
export type BundleAlias = 'bundle' | 'b';
export type CourseAlias = 'course' | 'c' | 'bundle_course' | 'bc';
export type WeekAlias = 'week' | 'w';

export function buildActiveEnrollmentSql(
  enrollmentAlias: EnrollmentAlias = 'enrollment',
  bundleAlias: BundleAlias = 'bundle',
): string {
  if (!ALLOWED_ENROLLMENT_ALIASES.has(enrollmentAlias)) throw new Error(`Disallowed enrollment alias: ${enrollmentAlias}`);
  if (!ALLOWED_BUNDLE_ALIASES.has(bundleAlias)) throw new Error(`Disallowed bundle alias: ${bundleAlias}`);
  return `${enrollmentAlias}.status = 'ACTIVE'`
    + ` AND (${enrollmentAlias}.starts_at IS NULL OR ${enrollmentAlias}.starts_at <= CURRENT_TIMESTAMP)`
    + ` AND (${enrollmentAlias}.expires_at IS NULL OR ${enrollmentAlias}.expires_at > CURRENT_TIMESTAMP)`
    + ` AND ${enrollmentAlias}.payment_status IN ('NOT_REQUIRED', 'PAID')`
    + ` AND ${bundleAlias}.status = 'PUBLISHED'`
    + ` AND (${bundleAlias}.available_from IS NULL OR ${bundleAlias}.available_from <= CURRENT_TIMESTAMP)`
    + ` AND (${bundleAlias}.available_until IS NULL OR ${bundleAlias}.available_until > CURRENT_TIMESTAMP)`;
}

export function buildBundleWeekFallbackSql(
  bundleAlias: BundleAlias = 'bundle',
  weekIdRef: string = 'week.id',
  courseIdRef: string = 'course.id',
): string {
  if (!ALLOWED_BUNDLE_ALIASES.has(bundleAlias)) throw new Error(`Disallowed bundle alias: ${bundleAlias}`);
  return `(`
    + `EXISTS ( SELECT 1 FROM bundle_weeks selected WHERE selected.bundle_id = ${bundleAlias}.id AND selected.week_id = ${weekIdRef})`
    + ` OR NOT EXISTS (`
    + ` SELECT 1 FROM bundle_weeks selected`
    + ` JOIN weeks selected_week ON selected_week.id = selected.week_id`
    + ` WHERE selected.bundle_id = ${bundleAlias}.id AND selected_week.course_id = ${courseIdRef}`
    + `)`
    + `)`;
}

export function buildFullCourseBundleSql(
  bundleAlias: BundleAlias = 'bundle',
  courseIdRef: string = 'course.id',
): string {
  if (!ALLOWED_BUNDLE_ALIASES.has(bundleAlias)) throw new Error(`Disallowed bundle alias: ${bundleAlias}`);
  return `NOT EXISTS (`
    + ` SELECT 1 FROM bundle_weeks selected`
    + ` JOIN weeks selected_week ON selected_week.id = selected.week_id`
    + ` WHERE selected.bundle_id = ${bundleAlias}.id AND selected_week.course_id = ${courseIdRef}`
    + `)`;
}

export function buildDeckDistributionSql(
  deckAlias: string = 'deck',
  bundleAlias: BundleAlias = 'bundle',
): string {
  if (!ALLOWED_BUNDLE_ALIASES.has(bundleAlias)) throw new Error(`Disallowed bundle alias: ${bundleAlias}`);
  return `(`
    + `${deckAlias}.bundle_access_mode = 'INHERIT'`
    + ` OR (`
    + ` ${deckAlias}.bundle_access_mode = 'RESTRICTED'`
    + ` AND EXISTS (`
    + `   SELECT 1 FROM flashcard_deck_bundle_restrictions restriction`
    + `   WHERE restriction.deck_id = ${deckAlias}.id AND restriction.bundle_id = ${bundleAlias}.id`
    + ` )`
    + `)`
    + `)`;
}

export function buildCourseAccessExistsSql(
  courseIdParam: string,
  studentIdParam: string,
  courseTableAlias: string = 'course',
): string {
  return `EXISTS (`
    + ` SELECT 1 FROM bundle_courses bundle_course`
    + ` JOIN bundles bundle ON bundle.id = bundle_course.bundle_id`
    + ` JOIN bundle_enrollments enrollment ON enrollment.bundle_id = bundle.id`
    + ` WHERE bundle_course.course_id = ${courseIdParam}`
    + ` AND enrollment.student_id = ${studentIdParam}`
    + ` AND ${buildActiveEnrollmentSql('enrollment', 'bundle')}`
    + ` AND ${courseTableAlias}.is_active = TRUE`
    + `)`;
}

export function buildWeekAccessExistsSql(
  weekIdParam: string,
  studentIdParam: string,
  courseTableAlias: string = 'course',
  weekTableAlias: string = 'week',
): string {
  return `EXISTS (`
    + ` SELECT 1 FROM weeks ${weekTableAlias}`
    + ` JOIN courses ${courseTableAlias} ON ${courseTableAlias}.id = ${weekTableAlias}.course_id`
    + ` JOIN bundle_courses bundle_course ON bundle_course.course_id = ${courseTableAlias}.id`
    + ` JOIN bundles bundle ON bundle.id = bundle_course.bundle_id`
    + ` JOIN bundle_enrollments enrollment ON enrollment.bundle_id = bundle.id AND enrollment.student_id = ${studentIdParam}`
    + ` WHERE ${weekTableAlias}.id = ${weekIdParam}`
    + ` AND ${buildActiveEnrollmentSql('enrollment', 'bundle')}`
    + ` AND ${courseTableAlias}.is_active = TRUE`
    + ` AND ${buildBundleWeekFallbackSql('bundle', `${weekTableAlias}.id`, `${courseTableAlias}.id`)}`
    + `)`;
}

export function buildLectureAccessExistsSql(
  lectureIdParam: string,
  studentIdParam: string,
): string {
  return `EXISTS (`
    + ` SELECT 1 FROM lectures lecture`
    + ` JOIN weeks week ON week.id = lecture.week_id`
    + ` JOIN courses course ON course.id = week.course_id`
    + ` JOIN bundle_courses bundle_course ON bundle_course.course_id = course.id`
    + ` JOIN bundles bundle ON bundle.id = bundle_course.bundle_id`
    + ` JOIN bundle_enrollments enrollment ON enrollment.bundle_id = bundle.id AND enrollment.student_id = ${studentIdParam}`
    + ` WHERE lecture.id = ${lectureIdParam}`
    + ` AND lecture.is_published = TRUE`
    + ` AND course.is_active = TRUE`
    + ` AND ${buildActiveEnrollmentSql('enrollment', 'bundle')}`
    + ` AND ${buildBundleWeekFallbackSql('bundle', 'week.id', 'course.id')}`
    + `)`;
}

export function buildTestAccessExistsSql(
  testIdParam: string,
  studentIdParam: string,
): string {
  return `EXISTS (`
    + ` SELECT 1 FROM bundle_tests bundle_test`
    + ` JOIN bundles bundle ON bundle.id = bundle_test.bundle_id`
    + ` JOIN bundle_enrollments enrollment ON enrollment.bundle_id = bundle.id AND enrollment.student_id = ${studentIdParam}`
    + ` WHERE bundle_test.test_id = ${testIdParam}`
    + ` AND ${buildActiveEnrollmentSql('enrollment', 'bundle')}`
    + `)`;
}

export function buildDeckAccessExistsSql(
  deckIdParam: string,
  studentIdParam: string,
): string {
  return `EXISTS (`
    + ` SELECT 1 FROM flashcard_decks deck`
    + ` JOIN courses course ON course.id = deck.course_id`
    + ` LEFT JOIN lectures lecture ON lecture.id = deck.lecture_id`
    + ` JOIN bundle_courses bundle_course ON bundle_course.course_id = course.id`
    + ` JOIN bundles bundle ON bundle.id = bundle_course.bundle_id`
    + ` JOIN bundle_enrollments enrollment ON enrollment.bundle_id = bundle.id AND enrollment.student_id = ${studentIdParam}`
    + ` WHERE deck.id = ${deckIdParam}`
    + ` AND deck.is_published = TRUE`
    + ` AND course.is_active = TRUE`
    + ` AND (lecture.id IS NULL OR lecture.is_published = TRUE)`
    + ` AND ${buildActiveEnrollmentSql('enrollment', 'bundle')}`
    + ` AND ${buildDeckDistributionSql('deck','bundle')}`
    + ` AND (`
    + `   ((deck.week_id IS NOT NULL OR deck.lecture_id IS NOT NULL)`
    + `     AND ${buildBundleWeekFallbackSql('bundle', 'COALESCE(deck.week_id, lecture.week_id)', 'course.id')})`
    + `   OR ((deck.week_id IS NULL AND deck.lecture_id IS NULL)`
    + `     AND ${buildFullCourseBundleSql('bundle','course.id')})`
    + ` )`
    + `)`;
}
