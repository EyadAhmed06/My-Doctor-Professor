import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';
const attemptId = 'd0111111-1111-4111-8111-111111111111';
const testId = 'd0222222-2222-4222-8222-222222222222';
const questionId = 'd0333333-3333-4333-8333-333333333333';
const optionIds = Array.from({ length: 5 }, (_, index) => `d0${index + 4}44444-4444-4444-8444-${String(index + 1).padStart(12, '0')}`);
const student = { id: 'student-retry', email: 'student@example.test', full_name: 'Retry Student', role: 'STUDENT', status: 'ACTIVE', emailVerified: true };

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

test('retries only the idempotent answer/save and submit mutations after transient 503 responses', async ({ page }) => {
  await primeAuth(page);
  let answerCalls = 0;
  let submitCalls = 0;
  let saved = false;

  const options = optionIds.map((id, index) => ({
    id,
    optionText: `Retry option ${index + 1}`,
    displayOrder: index + 1,
  }));
  const assignment = {
    questionId,
    displayOrder: 1,
    marks: '1.00',
    question: {
      id: questionId,
      questionText: 'Transient retry question',
      questionType: 'MCQ',
      options,
    },
  };

  await page.route('**/*', async (route) => {
    const request = route.request();
    const target = endpoint(request.url());
    const isData = request.resourceType() === 'fetch' || request.resourceType() === 'xhr';
    if (!isData || (!request.url().includes('/api/v1') && new URL(request.url()).port !== '3000')) return route.fallback();
    const headers = corsHeaders();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const respond = (body: unknown, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });

    if (target === '/auth/refresh') return respond({ access_token: 'retry-token', user: student });
    if (target === '/auth/me') return respond(student);
    if (target === '/notifications/unread/count') return respond({ count: 0 });
    if (target.startsWith('/notifications?')) return respond({ data: [] });
    if (target === `/tests/attempts/${attemptId}/workspace-state`) return respond({
      attempt: {
        id: attemptId,
        testId,
        testMode: 'TIMED',
        status: 'IN_PROGRESS',
        deadline: new Date(Date.now() + 40 * 60_000).toISOString(),
        startedAt: new Date().toISOString(),
        test: { title: 'Transient Retry Proof', durationMinutes: 40, testType: 'CUSTOM' },
      },
      answers: saved ? [{ questionId, selectedOptionId: optionIds[0], confidenceLevel: 'HIGH' }] : [],
      flagged_question_ids: [], hard_question_ids: [], notes: [],
    });
    if (target === `/tests/${testId}/questions`) return respond([assignment]);
    if (target === `/tests/attempts/${attemptId}/answers/${questionId}` && request.method() === 'PUT') {
      answerCalls += 1;
      if (answerCalls === 1) return respond({ message: 'temporary upstream failure' }, 503);
      saved = true;
      return respond({ questionId, selectedOptionId: optionIds[0], confidenceLevel: 'HIGH' });
    }
    if (target === `/tests/attempts/${attemptId}/submit` && request.method() === 'POST') {
      submitCalls += 1;
      if (submitCalls === 1) return respond({ message: 'temporary upstream failure' }, 503);
      return respond({ id: attemptId, status: 'SUBMITTED' });
    }
    if (target === `/tests/attempts/${attemptId}/review`) return respond({
      attempt: { id: attemptId, testId, testMode: 'TIMED', status: 'SUBMITTED', deadline: null, test: { title: 'Transient Retry Proof' } },
      grading_pending: false,
      questions: [{
        ...assignment,
        question: {
          ...assignment.question,
          explanation: 'Retry proof takeaway.',
          options: options.map((option, index) => ({ ...option, isCorrect: index === 0, explanation: `Retry option ${index + 1} rationale.` })),
        },
        answer: { selectedOptionId: optionIds[0], isCorrect: true },
      }],
    });
    return respond({});
  });

  await page.goto(`/mock-exam/session?attempt=${attemptId}&test=${testId}&source=rounds`);
  await expect(page.getByText('Transient retry question')).toBeVisible();

  await page.getByRole('radio').first().click();
  await page.getByRole('button', { name: 'High' }).click();
  await expect.poll(() => answerCalls).toBe(2);
  await expect(page.getByRole('radio').first()).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: 'High' })).toHaveAttribute('aria-pressed', 'true');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /Submit exam/i }).click();
  await expect.poll(() => submitCalls).toBe(2);
  await expect(page.getByText('Assessment submitted')).toBeVisible();
  await expect(page.getByText('Retry proof takeaway.')).toBeVisible();
});
