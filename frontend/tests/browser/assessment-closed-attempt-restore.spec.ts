import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';
const attemptId = 'c0111111-1111-4111-8111-111111111111';
const testId = 'c0222222-2222-4222-8222-222222222222';
const questionId = 'c0333333-3333-4333-8333-333333333333';
const student = { id: 'student-closed', email: 'student@example.test', full_name: 'Closed Student', role: 'STUDENT', status: 'ACTIVE', emailVerified: true };

function endpoint(url: string) {
  const pathname = new URL(url).pathname;
  const marker = '/api/v1';
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) || '/' : pathname;
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

function corsHeaders() {
  return {
    'access-control-allow-origin': frontendOrigin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  };
}

for (const status of ['SUBMITTED', 'EXPIRED'] as const) {
  test(`${status.toLowerCase()} assessment restores review directly after refresh`, async ({ page }) => {
    await primeAuth(page);
    let activeQuestionFetches = 0;

    const options = Array.from({ length: 5 }, (_, index) => ({
      id: `c${index + 1}444444-4444-4444-8444-${String(index + 1).padStart(12, '0')}`,
      optionText: `Option ${index + 1}`,
      displayOrder: index + 1,
      isCorrect: index === 0,
      explanation: `Option ${index + 1} rationale.`,
    }));

    await page.route('**/*', async (route) => {
      const request = route.request();
      const target = endpoint(request.url());
      const isData = request.resourceType() === 'fetch' || request.resourceType() === 'xhr';
      if (!isData || (!request.url().includes('/api/v1') && new URL(request.url()).port !== '3000')) return route.fallback();
      const headers = corsHeaders();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const respond = (body: unknown, responseStatus = 200) => route.fulfill({ status: responseStatus, headers, contentType: 'application/json', body: JSON.stringify(body) });

      if (target === '/auth/refresh') return respond({ access_token: 'closed-attempt-token', user: student });
      if (target === '/auth/me') return respond(student);
      if (target === '/notifications/unread/count') return respond({ count: 0 });
      if (target.startsWith('/notifications?')) return respond({ data: [] });
      if (target === `/tests/attempts/${attemptId}/workspace-state`) return respond({
        attempt: { id: attemptId, testId, testMode: 'TIMED', status, deadline: null, test: { title: `${status} Review` } },
        answers: [], flagged_question_ids: [], hard_question_ids: [], notes: [],
      });
      if (target === `/tests/${testId}/questions`) {
        activeQuestionFetches += 1;
        return respond({ message: 'Start an active attempt before accessing its questions' }, 403);
      }
      if (target === `/tests/attempts/${attemptId}/review`) return respond({
        attempt: { id: attemptId, testId, testMode: 'TIMED', status, deadline: null, test: { title: `${status} Review` } },
        grading_pending: false,
        questions: [{
          questionId,
          displayOrder: 1,
          question: {
            id: questionId,
            questionText: 'Closed attempt review question',
            questionType: 'MCQ',
            explanation: 'Question takeaway.',
            options,
          },
          answer: { selectedOptionId: options[1].id, isCorrect: false },
        }],
      });
      return respond({});
    });

    await page.goto(`/mock-exam/session?attempt=${attemptId}&test=${testId}&source=rounds`);
    await expect(page.getByText('Assessment submitted')).toBeVisible();
    await expect(page.getByText('Closed attempt review question')).toBeVisible();
    await expect(page.getByText('Review all 5 options')).toBeVisible();
    expect(activeQuestionFetches).toBe(0);

    await page.reload();
    await expect(page.getByText('Assessment submitted')).toBeVisible();
    await expect(page.getByText('Closed attempt review question')).toBeVisible();
    expect(activeQuestionFetches).toBe(0);
  });
}
