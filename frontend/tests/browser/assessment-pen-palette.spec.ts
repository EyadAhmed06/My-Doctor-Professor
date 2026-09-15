import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';
const attemptId = 'c0111111-1111-4111-8111-111111111111';
const testId = 'c0222222-2222-4222-8222-222222222222';
const questionId = 'c0333333-3333-4333-8333-333333333333';
const student = { id: 'student-pen', email: 'student@example.test', full_name: 'Pen Student', role: 'STUDENT', status: 'ACTIVE', emailVerified: true };

function endpoint(url: string) {
  const pathname = new URL(url).pathname;
  const marker = '/api/v1';
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) || '/' : pathname;
}

function corsHeaders() {
  return {
    'access-control-allow-origin': frontendOrigin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  };
}

async function primeAuth(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem('mdp_access_token');
    sessionStorage.removeItem('mdp_access_token');
    localStorage.removeItem('mdp_logged_out_at');
    localStorage.setItem('mdp-theme', 'light');
    localStorage.setItem('mdp-locale', 'en');
  });
}

test('assessment pen palette renders all four colours and allows colour selection', async ({ page }) => {
  await primeAuth(page);

  const question = {
    questionId,
    displayOrder: 1,
    marks: '1.00',
    question: {
      id: questionId,
      questionText: 'Which option is correct?',
      questionType: 'MCQ',
      options: Array.from({ length: 5 }, (_, index) => ({
        id: `c0444444-4444-4444-8444-44444444444${index}`,
        optionText: `Option ${index + 1}`,
        displayOrder: index + 1,
      })),
    },
  };

  await page.route('**/*', async (route) => {
    const request = route.request();
    const target = endpoint(request.url());
    const isData = request.resourceType() === 'fetch' || request.resourceType() === 'xhr';
    if (!isData || (!request.url().includes('/api/v1') && new URL(request.url()).port !== '3000')) {
      return route.fallback();
    }

    const headers = corsHeaders();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const respond = (body: unknown, status = 200) => route.fulfill({
      status,
      headers,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

    if (target === '/auth/refresh') return respond({ access_token: 'pen-test-token', user: student });
    if (target === '/auth/me') return respond(student);
    if (target === '/notifications/unread/count') return respond({ count: 0 });
    if (target.startsWith('/notifications?')) return respond({ data: [] });
    if (target === `/tests/attempts/${attemptId}/workspace-state`) {
      return respond({
        attempt: {
          id: attemptId,
          testId,
          testMode: 'TIMED',
          status: 'IN_PROGRESS',
          deadline: new Date(Date.now() + 40 * 60_000).toISOString(),
          startedAt: new Date().toISOString(),
          test: { title: 'Pen Palette Proof', durationMinutes: 40, testType: 'CUSTOM' },
        },
        answers: [],
        flagged_question_ids: [],
        hard_question_ids: [],
        notes: [],
      });
    }
    if (target === `/tests/${testId}/questions`) return respond([question]);
    return respond({});
  });

  await page.goto(`/mock-exam/session?attempt=${attemptId}&test=${testId}&source=assessments`);
  await expect(page.getByText('Which option is correct?')).toBeVisible();

  await page.getByRole('button', { name: 'Pen' }).click();
  await expect(page.getByLabel('Pen colour')).toBeVisible();
  await expect(page.getByRole('button', { name: 'red pen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'blue pen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'green pen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'black pen' })).toBeVisible();

  await page.getByRole('button', { name: 'blue pen' }).click();
  await expect(page.getByRole('button', { name: 'blue pen' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'red pen' })).toHaveAttribute('aria-pressed', 'false');
});
