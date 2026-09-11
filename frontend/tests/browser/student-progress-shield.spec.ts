import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';

function endpoint(url: string) {
  const path = new URL(url).pathname;
  const marker = '/api/v1';
  const index = path.indexOf(marker);
  return index >= 0 ? path.slice(index + marker.length) || '/' : path;
}

async function mockStudentWorkspace(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('mdp_access_token', 'student-progress-shield-token');
    localStorage.setItem('mdp-theme', 'dark');
    localStorage.setItem('mdp-locale', 'en');
  });

  await page.route('**/*', async route => {
    const request = route.request();
    const resourceType = request.resourceType();
    if ((resourceType !== 'fetch' && resourceType !== 'xhr') || (!request.url().includes('/api/v1') && new URL(request.url()).port !== '3000')) {
      return route.fallback();
    }

    const headers = {
      'access-control-allow-origin': frontendOrigin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const respond = (body: unknown) => route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
    const path = endpoint(request.url());

    if (path === '/auth/me') return respond({
      id: 'student-progress-shield',
      email: 'progress@example.test',
      full_name: 'Progress Student',
      role: 'STUDENT',
      status: 'ACTIVE',
      emailVerified: true,
    });
    if (path === '/notifications/unread/count') return respond({ count: 0 });
    if (path.startsWith('/notifications?')) return respond({ data: [] });
    if (path === '/dashboard/student') return respond({
      courses: [{
        id: 'course-1',
        completionPercentage: '50',
        lecturesCompleted: 3,
        totalLectures: 6,
        averageScore: null,
        course: { id: 'course-1', courseName: 'Cardiovascular Medicine', courseCode: 'CVS-301' },
      }],
      recent_attempts: [],
      questions: { attempts: 8, correct_attempts: 20, accuracy: '75', bookmarked: 3 },
      flashcards: { reviewed: 8, mastered: 5, due: 2 },
    });
    if (path.startsWith('/notebook/notes')) return respond({ data: [], page: 1, limit: 1, total: 0, total_pages: 0 });
    if (path.startsWith('/study-plan/calendar')) return respond({ from: '2026-08-11', to: '2026-09-10', data: [] });

    return respond({});
  });
}

test('student progress shield sits beside the user and reveals the live progress summary', async ({ page }) => {
  await mockStudentWorkspace(page);
  await page.goto('/dashboard');

  const shield = page.getByRole('button', { name: /Open your progress/i });
  await expect(shield).toBeVisible();
  await expect(page.locator('.student-progress-anchor')).toHaveCount(1);
  expect(await page.locator('.student-progress-anchor').evaluate(element => element.nextElementSibling?.classList.contains('profile-menu-anchor'))).toBe(true);

  await shield.click();
  const dialog = page.getByRole('dialog', { name: 'Your Progress' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Level 1')).toBeVisible();
  await expect(dialog.getByText('25 / 100 XP')).toBeVisible();
  await expect(dialog.getByText('3 of 6 lectures')).toBeVisible();
  await expect(dialog.getByText('75%')).toBeVisible();
  await expect(dialog.getByText('5', { exact: true })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
