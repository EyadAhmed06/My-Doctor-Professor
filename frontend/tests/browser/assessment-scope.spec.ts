import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';
const courseId = '11111111-1111-4111-8111-111111111111';
const weekId = '22222222-2222-4222-8222-222222222222';
const lectureId = '33333333-3333-4333-8333-333333333333';
const createdId = '44444444-4444-4444-8444-444444444444';
const instructor = { id: 'instructor-1', email: 'instructor@example.test', full_name: 'Scope Instructor', role: 'INSTRUCTOR', status: 'ACTIVE', emailVerified: true };

function apiEndpoint(requestUrl: string) {
  const pathname = new URL(requestUrl).pathname;
  const marker = '/api/v1';
  const markerIndex = pathname.indexOf(marker);
  return markerIndex >= 0 ? pathname.slice(markerIndex + marker.length) || '/' : pathname;
}

async function baseMock(page: Page, handler: (endpoint: string, request: import('@playwright/test').Request, respond: (body: unknown, status?: number) => Promise<void>) => Promise<boolean> | boolean) {
  await page.addInitScript(() => {
    localStorage.setItem('mdp_access_token', 'assessment-scope-browser-token');
    localStorage.removeItem('mdp_logged_out_at');
    localStorage.setItem('mdp-theme', 'light');
    localStorage.setItem('mdp-locale', 'en');
  });
  await page.route('**/*', async (route) => {
    const request = route.request();
    const endpoint = apiEndpoint(request.url());
    const resourceType = request.resourceType();
    const isDataRequest = resourceType === 'fetch' || resourceType === 'xhr';
    if (!isDataRequest || (!request.url().includes('/api/v1') && new URL(request.url()).port !== '3000')) return route.fallback();
    const headers = {
      'access-control-allow-origin': frontendOrigin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const respond = async (body: unknown, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
    if (endpoint === '/auth/me') return respond(instructor);
    if (endpoint === '/notifications/unread/count') return respond({ count: 0 });
    if (await handler(endpoint, request, respond)) return;
    return respond({});
  });
}

test('lecture assessment draft requires and sends course, week, and lecture scope', async ({ page }) => {
  let createBody: Record<string, unknown> | null = null;
  await baseMock(page, async (endpoint, request, respond) => {
    if (endpoint === '/tests' && request.method() === 'GET') {
      await respond({ data: [] });
      return true;
    }
    if (endpoint === '/academic/courses') {
      await respond({ data: [{ id: courseId, courseCode: 'CVS-301', courseName: 'Cardiovascular Medicine' }] });
      return true;
    }
    if (endpoint === '/questions') {
      await respond({ data: [] });
      return true;
    }
    if (endpoint === `/academic/courses/${courseId}`) {
      await respond({
        id: courseId,
        courseCode: 'CVS-301',
        courseName: 'Cardiovascular Medicine',
        weeks: [{
          id: weekId,
          weekNumber: 2,
          title: 'Cardiac anatomy',
          lectures: [{ id: lectureId, lectureNumber: 3, title: 'Heart chambers and circulation' }],
        }],
      });
      return true;
    }
    if (endpoint === '/tests' && request.method() === 'POST') {
      createBody = request.postDataJSON() as Record<string, unknown>;
      await respond({
        id: createdId,
        title: 'Lecture scope test',
        description: null,
        testType: 'LECTURE',
        courseId,
        weekId,
        lectureId,
        durationMinutes: 60,
        totalMarks: null,
        passingMarks: '50.00',
        isPublished: false,
        createdAt: new Date().toISOString(),
      });
      return true;
    }
    return false;
  });

  await page.goto('/instructor/assessments');
  await expect(page.getByRole('heading', { name: 'Assessment builder' })).toBeVisible();
  await expect(page.getByText('No assessments yet')).toBeVisible();
  await page.getByRole('button', { name: /New assessment/i }).click();
  const dialog = page.getByRole('dialog', { name: 'Create assessment draft' });
  await expect(dialog).toBeVisible();
  const field = (label: RegExp) => dialog.locator('label').filter({ hasText: label }).locator('select');
  const typeSelect = field(/^Type/);
  const courseSelect = field(/^Course/);
  const weekSelect = field(/^Week/);
  const lectureSelect = field(/^Lecture/);
  await dialog.getByLabel('Title').fill('Lecture scope test');
  await typeSelect.selectOption('LECTURE');
  await courseSelect.selectOption(courseId);
  await expect(weekSelect).toBeEnabled();
  await weekSelect.selectOption(weekId);
  await expect(lectureSelect).toBeEnabled();
  await lectureSelect.selectOption(lectureId);
  await dialog.getByRole('button', { name: /Create draft/i }).click();

  await expect.poll(() => createBody).not.toBeNull();
  expect(createBody).toMatchObject({
    title: 'Lecture scope test',
    test_type: 'LECTURE',
    course_id: courseId,
    week_id: weekId,
    lecture_id: lectureId,
  });
});
