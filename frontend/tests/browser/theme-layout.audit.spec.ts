import { expect, Page, test } from '@playwright/test';

type Role = 'STUDENT' | 'INSTRUCTOR';

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
  flashcards: { reviewed: 18, mastered: 9, due: 5 },
};

const course = {
  id: 'course-1', courseCode: 'CARD101', courseName: 'Cardiovascular Medicine',
  weeks: [{
    id: 'week-1', weekNumber: 1, title: 'Cardiac foundations',
    lectures: [{ id: 'lecture-1', lectureNumber: 1, title: 'Cardiac cycle', description: 'Core cardiac physiology.' }],
  }],
};

const testRecord = {
  id: 'test-1', title: 'Cardiac assessment', description: 'A safe authoring preview.',
  testType: 'COURSE', courseId: 'course-1', durationMinutes: 45,
  totalMarks: '10', passingMarks: '6', isPublished: false,
  createdAt: '2026-08-06T10:00:00.000Z', updatedAt: '2026-08-06T10:00:00.000Z', course,
};

function endpointOf(url: string) {
  const pathname = new URL(url).pathname;
  const marker = '/api/v1';
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) || '/' : pathname;
}

async function installApi(page: Page, role: Role, theme: 'light' | 'dark') {
  await page.addInitScript(({ selectedTheme }) => {
    localStorage.setItem('mdp_access_token', 'browser-audit-token');
    localStorage.setItem('mdp-theme', selectedTheme);
  }, { selectedTheme: theme });

  await page.route('**/*', async (route) => {
    const request = route.request();
    const type = request.resourceType();
    if (type !== 'fetch' && type !== 'xhr') return route.fallback();

    const endpoint = endpointOf(request.url());
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const respond = (body: unknown, status = 200) => route.fulfill({
      status, headers, contentType: 'application/json', body: JSON.stringify(body),
    });

    if (endpoint === '/auth/me') return respond({
      id: role === 'STUDENT' ? 'student-1' : 'instructor-1',
      email: `${role.toLowerCase()}@example.test`,
      full_name: role === 'STUDENT' ? 'Eyad Student' : 'Doctor Instructor',
      role, status: 'ACTIVE', emailVerified: true,
    });
    if (endpoint === '/notifications/unread/count') return respond({ count: 0 });
    if (endpoint.startsWith('/notifications')) return respond({ data: [] });
    if (endpoint === '/dashboard/student') return respond(studentDashboard);
    if (endpoint === '/dashboard/instructor') return respond({
      questions: 10, tests: 1, decks: 2, attempts: 1, students: 12,
      average_score: '75', pending_essay_answers: 0,
    });
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
      uploadStatus: 'READY', fileUrl: '/brand/medical-logo.svg',
      description: 'A previewable cardiac diagram.', mimeType: 'image/svg+xml',
    }]);
    if (endpoint === '/progress/lectures/lecture-1') return respond({
      studentId: 'student-1', lectureId: 'lecture-1', isCompleted: false,
      completionPercentage: '50', timeSpentMinutes: 20, lastAccessedAt: null, completedAt: null,
    });

    if (endpoint.startsWith('/tests?')) return respond({ data: [testRecord], total: 1, page: 1, limit: 100, total_pages: 1 });
    if (endpoint.startsWith('/academic/courses?')) return respond({ data: [course], total: 1, page: 1, limit: 100, total_pages: 1 });
    if (endpoint.startsWith('/questions?')) return respond({ data: [], total: 0, page: 1, limit: 100, total_pages: 0 });
    if (endpoint === '/tests/test-1/questions') return respond([]);
    if (endpoint === '/tests/test-1/attempts') return respond([]);
    if (endpoint === '/tests/test-1/authoring-state') return respond({
      validation: {
        publishable: false,
        issues: [{ code: 'NO_QUESTIONS', severity: 'ERROR', message: 'Attach at least one active question before publishing.' }],
        question_count: 0, total_marks: 0,
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
  const colors = await page.evaluate(() => ({
    body: getComputedStyle(document.body).backgroundColor,
    surface: getComputedStyle(document.querySelector('.pp-panel, .dash-card, .guide-content') || document.body).backgroundColor,
  }));
  expect(colors.body).not.toBe('rgba(0, 0, 0, 0)');
  expect(colors.surface).not.toBe('rgba(0, 0, 0, 0)');
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
