import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';
const bundleId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const testId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const attemptId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function apiEndpoint(requestUrl: string) {
  const pathname = new URL(requestUrl).pathname;
  const marker = '/api/v1';
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) || '/' : pathname;
}

async function mockApi(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('mdp_access_token', 'resume-test-token');
    localStorage.removeItem('mdp_logged_out_at');
    localStorage.setItem('mdp-theme', 'light');
    localStorage.setItem('mdp-locale', 'en');
  });

  await page.route('**/*', async (route) => {
    const request = route.request();
    const resourceType = request.resourceType();
    if (resourceType !== 'fetch' && resourceType !== 'xhr') return route.fallback();
    const endpoint = apiEndpoint(request.url());
    const headers = {
      'access-control-allow-origin': frontendOrigin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const respond = (body: unknown, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });

    if (endpoint === '/auth/me') return respond({ id: 'student-1', email: 'student@example.test', full_name: 'Resume Student', role: 'STUDENT', status: 'ACTIVE', emailVerified: true });
    if (endpoint === '/notifications/unread/count') return respond({ count: 0 });
    if (endpoint === '/bundles/mine') return respond([{ id: bundleId, title: 'Clinical Foundations', slug: 'clinical-foundations', status: 'PUBLISHED', isFree: true }]);
    if (endpoint === `/bundles/${bundleId}/content`) return respond({
      bundle: { id: bundleId, title: 'Clinical Foundations', read_only: false },
      past_exams: [{ id: testId, title: 'Custom practice · 2026-08-10', description: 'Legacy generated practice', testType: 'CUSTOM', durationMinutes: null, totalMarks: '1.00', passingMarks: null }],
    });
    if (endpoint === `/test-launch/${testId}`) return respond({
      test: { id: testId, title: 'Custom practice · 2026-08-10', description: 'Legacy generated practice', testType: 'CUSTOM', durationMinutes: null, totalMarks: '1.00', passingMarks: null },
      question_count: 1,
      mcq_count: 1,
      is_final: false,
      required_question_count: 40,
      timed_available: false,
      launch_ready: true,
      active_attempt: { id: attemptId, test_mode: 'TUTOR', started_at: '2026-08-10T17:00:00.000Z' },
      issues: ['Curriculum practice now requires exactly 40 MCQs. This is a legacy 1-question practice with an unfinished attempt that can still be resumed.'],
    });
    if (endpoint === `/tests/${testId}/attempts` && request.method() === 'POST') return respond({ message: 'A new attempt should not be created while resuming.' }, 500);
    return respond({});
  });
}

test('legacy one-question custom practice resumes its active attempt instead of dead-ending on duplicate start', async ({ page }) => {
  await mockApi(page);
  await page.goto(`/past-exams?bundle=${bundleId}&test=${testId}`);

  await expect(page.getByRole('heading', { name: 'Custom practice · 2026-08-10' })).toBeVisible();
  await expect(page.getByText('Continue where you stopped')).toBeVisible();
  await expect(page.getByText(/legacy 1-question practice/i)).toBeVisible();
  await expect(page.getByText(/Tutor.*existing attempt/i)).toBeVisible();
  const resume = page.getByRole('button', { name: 'Resume practice' });
  await expect(resume).toBeEnabled();
  await resume.click();
  await expect(page).toHaveURL(new RegExp(`/mock-exam/session\\?attempt=${attemptId}`));
});
