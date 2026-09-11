import { expect, Page, test } from '@playwright/test';

type Role = 'STUDENT' | 'INSTRUCTOR' | 'SYSTEM_ADMIN';

const studentDashboard = {
  courses: [{
    id: 'progress-1', completionPercentage: '50', lecturesCompleted: 3,
    totalLectures: 6, averageScore: '75',
    course: { id: 'course-1', courseName: 'Cardiovascular Medicine', courseCode: 'CARD101' },
  }],
  recent_attempts: [{
    id: 'attempt-1', status: 'SUBMITTED', score: '15', submitted_at: '2026-08-06T10:00:00.000Z',
    test_id: 'test-1', title: 'Week 1 Cardiovascular Review', total_marks: '20', passing_marks: '10',
  }],
  questions: { attempts: 8, correct_attempts: 6, accuracy: '75', bookmarked: 1 },
  essay_cases: { solved: 2 },
  flashcards: { reviewed: 18, mastered: 9, due: 5 },
  clinical_momentum: { study_streak: 4, study_minutes: 210, completed_sessions: 12, xp: 640, level: 3, level_progress: 48 },
  weekly_activity: [{ date: '2026-08-06', questions: 8, essay_cases: 1, flashcards: 18, lectures: 1, plan_sessions: 2, total: 30 }],
  topic_mastery: [{ id: 'topic-1', course_name: 'Cardiovascular Medicine', mastery: 68, questions_attempted: 8 }],
};

const course = {
  id: 'course-1', courseCode: 'CARD101', courseName: 'Cardiovascular Medicine',
  weeks: [{
    id: 'week-1', weekNumber: 1, title: 'Cardiac foundations',
    lectures: [{ id: 'lecture-1', lectureNumber: 1, title: 'Cardiac cycle', description: 'Core cardiac physiology.', isPublished: true }],
  }],
};

const testRecord = {
  id: 'test-1', title: 'Cardiac assessment', description: 'A safe authoring preview.',
  testType: 'COURSE', courseId: 'course-1', durationMinutes: 45,
  totalMarks: '10', passingMarks: '6', isPublished: false,
  createdAt: '2026-08-06T10:00:00.000Z', updatedAt: '2026-08-06T10:00:00.000Z', course,
};

const attachedQuestions = Array.from({ length: 3 }, (_, index) => ({
  id: `test-question-${index + 1}`,
  questionId: `question-${index + 1}`,
  displayOrder: index + 1,
  marks: '1.00',
  timeLimitSeconds: null,
  question: {
    id: `question-${index + 1}`,
    questionType: 'MCQ',
    title: 'Diabetic and Hypertensive Kidney Disease',
    questionText: 'Which finding best supports the diagnosis?',
    explanation: null,
    difficulty: index === 2 ? 'HARD' : 'MEDIUM',
    marks: '1.00',
    isActive: true,
    options: [],
  },
}));

function endpointOf(url: string) {
  const pathname = new URL(url).pathname;
  const marker = '/api/v1';
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) || '/' : pathname;
}

async function installApi(page: Page, role: Role, theme: 'light' | 'dark', testQuestions = attachedQuestions.slice(0, 0)) {
  await page.addInitScript(({ selectedTheme }) => {
    localStorage.removeItem('mdp_logged_out_at');
    localStorage.removeItem('mdp_access_token');
    localStorage.setItem('mdp-theme', selectedTheme);
  }, { selectedTheme: theme });

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isApi = url.pathname.includes('/api/v1') || url.port === '3000';
    if (!isApi) return route.fallback();

    const endpoint = endpointOf(request.url());
    const headers = {
      'access-control-allow-origin': request.headers()['origin'] || 'http://127.0.0.1:3001',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const respond = (body: unknown, status = 200) => route.fulfill({
      status, headers, contentType: 'application/json', body: JSON.stringify(body),
    });

    const authenticatedUser = {
      id: role === 'STUDENT' ? 'student-1' : role === 'INSTRUCTOR' ? 'instructor-1' : 'admin-1',
      email: `${role.toLowerCase()}@example.test`,
      full_name: role === 'STUDENT' ? 'Eyad Student' : role === 'INSTRUCTOR' ? 'Doctor Instructor' : 'System Administrator',
      role, status: 'ACTIVE', emailVerified: true,
    };
    if (endpoint === '/auth/refresh') return respond({ access_token: 'browser-audit-token', user: authenticatedUser });
    if (endpoint === '/auth/me') return respond(authenticatedUser);
    if (endpoint === '/notifications/unread/count') return respond({ count: 0 });
    if (endpoint.startsWith('/notifications')) return respond({ data: [] });
    if (endpoint === '/dashboard/student') return respond(studentDashboard);
    if (endpoint === '/dashboard/instructor') return respond({
      questions: 10, tests: 1, decks: 2, attempts: 1, students: 12,
      average_score: '75', pending_essay_answers: 0,
    });
    if (endpoint === '/dashboard/admin') return respond({ users: 30, active_users: 28, audit_events: 120 });
    if (endpoint.startsWith('/notebook/notes')) return respond({ data: [] });
    if (endpoint === '/study-plan/calendar') return respond({
      from: '2026-08-07', to: '2026-08-13',
      data: [{
        id: 'plan-1', scheduledDate: '2026-08-07', itemType: 'FLASHCARDS',
        status: 'PLANNED', targetCount: 20, durationMinutes: 20,
        metadata: { title: 'Cardiac review' }, lecture: null,
      }],
    });

    if (endpoint === '/bundles/mine' || endpoint === '/bundles/managed') return respond([{
      id: 'bundle-1', title: 'Clinical Foundations', status: 'PUBLISHED', read_only: false,
    }]);
    if (endpoint === '/bundles/bundle-1/content') return respond({ courses: [course] });
    if (endpoint === '/academic/lectures/lecture-1/resources') return respond([{
      id: 'resource-1', resourceName: 'Cardiac cycle diagram', resourceType: 'IMAGE',
      uploadStatus: 'READY', fileUrl: 'https://example.test/cardiac-cycle.png',
      description: 'A previewable cardiac diagram.', mimeType: 'image/png',
    }]);
    if (endpoint === '/progress/lectures/lecture-1') return respond({
      studentId: 'student-1', lectureId: 'lecture-1', isCompleted: false,
      completionPercentage: '50', timeSpentMinutes: 20, lastAccessedAt: null, completedAt: null,
    });

    if (endpoint === '/tests') return respond({ data: [testRecord], total: 1, page: 1, limit: 100, total_pages: 1 });
    if (endpoint === '/academic/semesters') return respond([{ id: 'semester-1', semesterNumber: 1 }]);
    if (endpoint === '/academic/courses') return respond({ data: [course], total: 1, page: 1, limit: 100, total_pages: 1 });
    if (endpoint === '/academic/courses/course-1') return respond(course);
    if (endpoint === '/questions') return respond({ data: [], total: 0, page: 1, limit: 100, total_pages: 0 });
    if (endpoint === '/tests/test-1/questions') return respond(testQuestions);
    if (endpoint === '/tests/test-1/attempts') return respond([]);
    if (endpoint === '/tests/test-1/authoring-state') return respond({
      validation: testQuestions.length ? {
        publishable: true,
        issues: [],
        question_count: testQuestions.length,
        total_marks: testQuestions.length,
      } : {
        publishable: false,
        issues: [{ code: 'NO_QUESTIONS', severity: 'ERROR', message: 'Attach at least one active question before publishing.' }],
        question_count: 0,
        total_marks: 0,
      },
      permissions: { mutable: true, can_unpublish: false, can_delete: true, can_duplicate: true },
      activity: [{ type: 'CREATED', at: '2026-08-06T10:00:00.000Z', label: 'Assessment created' }],
    });

    return respond({});
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

async function expectTheme(page: Page, theme: 'light' | 'dark') {
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  const themeState = await page.evaluate(() => ({
    body: getComputedStyle(document.body).backgroundColor,
    bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    text: getComputedStyle(document.documentElement).getPropertyValue('--text').trim(),
  }));
  expect(themeState.body).not.toBe('rgba(0, 0, 0, 0)');
  expect(themeState.bg).not.toBe('');
  expect(themeState.text).not.toBe('');
}

for (const theme of ['light', 'dark'] as const) {
  test(`dashboard fills the workspace without card overlap in ${theme} mode`, async ({ page }) => {
    await installApi(page, 'STUDENT', theme);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible();
    await expectTheme(page, theme);
    await expectNoHorizontalOverflow(page);

    const content = await page.locator('.dashboard-embedded-content').boundingBox();
    const viewport = page.viewportSize();
    expect(content).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (content && viewport) expect(content.width).toBeGreaterThan(viewport.width * .78);

    const cards = await page.locator('.main-grid > .column-main > .two-col:first-child > .dash-card').all();
    for (const card of cards) {
      const box = await card.boundingBox();
      expect(box?.width || 0).toBeGreaterThan(220);
    }
  });

  test(`study guide resource preview is usable in ${theme} mode`, async ({ page }) => {
    await installApi(page, 'STUDENT', theme);
    await page.goto('/guidelines?course=course-1&lecture=lecture-1');
    await expect(page.getByRole('heading', { name: 'Study Guides' })).toBeVisible();
    await page.getByRole('button', { name: /Preview/i }).click();
    const drawer = page.getByRole('dialog', { name: /Preview Cardiac cycle diagram/i });
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('img')).toBeVisible();
    await expectTheme(page, theme);
    await expectNoHorizontalOverflow(page);
  });

  test(`assessment validation and student preview are usable in ${theme} mode`, async ({ page }) => {
    await installApi(page, 'INSTRUCTOR', theme);
    await page.goto('/instructor/assessments');
    await expect(page.getByRole('heading', { name: 'Assessment builder' })).toBeVisible();
    await expect(page.getByText('Publishing is blocked')).toBeVisible();
    await expect(page.getByText('Attach at least one active question before publishing.')).toBeVisible();
    await page.getByRole('button', { name: /Preview as student/i }).click();
    const preview = page.getByRole('dialog', { name: 'Student preview' });
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('NON-SUBMITTING PREVIEW');
    await expectTheme(page, theme);
    await expectNoHorizontalOverflow(page);
  });
}

test('assessment question cards keep their number, copy, and controls separated on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await installApi(page, 'INSTRUCTOR', 'dark', attachedQuestions);
  await page.goto('/instructor/assessments');

  const cards = page.locator('.assessment-question-stack .draggable-question');
  await expect(cards).toHaveCount(attachedQuestions.length);
  await expect(cards.first().getByText('Diabetic and Hypertensive Kidney Disease')).toBeVisible();

  for (const width of [360, 412]) {
    await page.setViewportSize({ width, height: 915 });
    for (let index = 0; index < attachedQuestions.length; index += 1) {
      const card = cards.nth(index);
      await card.scrollIntoViewIfNeeded();
      await expect(card).toBeVisible();
      const layout = await card.evaluate((element) => {
        const number = element.querySelector<HTMLElement>('.assessment-question-select')!;
        const copy = element.querySelector<HTMLElement>('.assessment-question-copy')!;
        const actions = element.querySelector<HTMLElement>('.question-order-actions')!;
        const cardBox = element.getBoundingClientRect();
        const numberBox = number.getBoundingClientRect();
        const copyBox = copy.getBoundingClientRect();
        const actionsBox = actions.getBoundingClientRect();
        return {
          numberRight: numberBox.right,
          copyLeft: copyBox.left,
          copyBottom: copyBox.bottom,
          actionsTop: actionsBox.top,
          actionsRight: actionsBox.right,
          cardRight: cardBox.right,
          actionsBottom: actionsBox.bottom,
          cardBottom: cardBox.bottom,
          fitsWidth: element.scrollWidth <= element.clientWidth + 1,
        };
      });
      expect(layout.copyLeft).toBeGreaterThanOrEqual(layout.numberRight + 8);
      expect(layout.actionsTop).toBeGreaterThanOrEqual(layout.copyBottom + 7);
      expect(layout.actionsRight).toBeLessThanOrEqual(layout.cardRight - 10);
      expect(layout.actionsBottom).toBeLessThanOrEqual(layout.cardBottom - 10);
      expect(layout.fitsWidth).toBe(true);
    }
    await expectNoHorizontalOverflow(page);
  }
});

test('instructor lecture card fills its row without clipping its status', async ({ page }) => {
  await installApi(page, 'INSTRUCTOR', 'dark');
  await page.goto('/instructor/courses');

  const card = page.locator('.role-lecture-card');
  const list = page.locator('.role-lecture-list');
  const status = card.locator('.role-status');
  await expect(card).toHaveCount(1);
  await expect(status).toHaveText('PUBLISHED');
  await expect.poll(() => status.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

  const boxes = await Promise.all([list.boundingBox(), card.boundingBox(), status.boundingBox()]);
  const [listBox, cardBox, statusBox] = boxes;
  expect(listBox).not.toBeNull();
  expect(cardBox).not.toBeNull();
  expect(statusBox).not.toBeNull();
  if (listBox && cardBox && statusBox) {
    expect(cardBox.width).toBeGreaterThan(listBox.width - 40);
    expect(statusBox.x + statusBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width - 12);
  }
  await expectNoHorizontalOverflow(page);
});

test('resource upload keeps product controls styled on a direct load', async ({ page }) => {
  await installApi(page, 'INSTRUCTOR', 'dark');
  await page.goto('/resources/upload');
  await expect(page.getByRole('heading', { name: 'Resource upload' })).toBeVisible();

  const styles = await page.locator('.resource-upload-layout > .pp-panel').first().evaluate(element => {
    const panel = getComputedStyle(element);
    const input = getComputedStyle(document.querySelector('.resource-upload-fields input')!);
    const button = getComputedStyle(document.querySelector('.resource-upload-form .pp-button')!);
    return {
      panelBackground: panel.backgroundColor,
      panelBorder: panel.borderTopWidth,
      inputBorder: input.borderTopWidth,
      buttonDisplay: button.display,
    };
  });
  expect(styles.panelBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(styles.panelBorder).not.toBe('0px');
  expect(styles.inputBorder).not.toBe('0px');
  expect(styles.buttonDisplay).toBe('inline-flex');
  await expectNoHorizontalOverflow(page);
});

test('mobile workspace menu keeps essential tools reachable', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 1280) > 820, 'Mobile navigation contract');
  await installApi(page, 'STUDENT', 'light');
  await page.goto('/guidelines?course=course-1&lecture=lecture-1');
  await expect(page.getByRole('heading', { name: 'Study Guides' })).toBeVisible();
  await page.getByRole('button', { name: 'Open menu' }).click();
  const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole('link', { name: /Notifications/ })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Help' })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Achievements' })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Progress' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('administrator navigation is limited to operational tools', async ({ page }) => {
  await installApi(page, 'SYSTEM_ADMIN', 'light');
  await page.goto('/admin');
  const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
  for (const label of ['Overview', 'Users', 'Audit', 'Notifications', 'Settings']) {
    await expect(navigation.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
  for (const label of ['Academics', 'Resources', 'Questions', 'Assessments', 'Flashcards', 'Bundles']) {
    await expect(navigation.getByRole('link', { name: label, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole('link', { name: 'User administration' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Audit trail' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Academic structure' })).toHaveCount(0);

  for (const restrictedPath of [
    '/admin/academics',
    '/admin/questions',
    '/admin/assessments',
    '/admin/flashcards',
    '/bundles',
    '/resources/upload',
  ]) {
    await page.goto(restrictedPath);
    await expect(page).toHaveURL(/\/admin$/);
  }
});
