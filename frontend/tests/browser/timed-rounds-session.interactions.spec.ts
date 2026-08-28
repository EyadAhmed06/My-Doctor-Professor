import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';
const testId = '11111111-1111-4111-8111-111111111111';
const attemptId = '22222222-2222-4222-8222-222222222222';
const questionId = '33333333-3333-4333-8333-333333333333';
const optionIds = [
  '44444444-4444-4444-8444-444444444441',
  '44444444-4444-4444-8444-444444444442',
  '44444444-4444-4444-8444-444444444443',
  '44444444-4444-4444-8444-444444444444',
  '44444444-4444-4444-8444-444444444445',
];

function apiEndpoint(requestUrl: string) {
  const pathname = new URL(requestUrl).pathname;
  const marker = '/api/v1';
  const markerIndex = pathname.indexOf(marker);
  return markerIndex >= 0 ? pathname.slice(markerIndex + marker.length) || '/' : pathname;
}

async function mockStudentApi(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('mdp_access_token', 'timed-rounds-browser-token');
    localStorage.removeItem('mdp_logged_out_at');
    localStorage.setItem('mdp-theme', 'light');
    localStorage.setItem('mdp-locale', 'en');
  });

  await page.route('**/*', async (route) => {
    const request = route.request();
    const resourceType = request.resourceType();
    const isDataRequest = resourceType === 'fetch' || resourceType === 'xhr';
    if (!isDataRequest || (!request.url().includes('/api/v1') && new URL(request.url()).port !== '3000')) {
      return route.fallback();
    }

    const endpoint = apiEndpoint(request.url());
    const headers = {
      'access-control-allow-origin': frontendOrigin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const respond = (body: unknown, status = 200) => route.fulfill({
      status,
      headers,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

    if (endpoint === '/auth/me') {
      return respond({
        id: 'student-1',
        email: 'student@example.test',
        full_name: 'Timed Rounds Student',
        role: 'STUDENT',
        status: 'ACTIVE',
        emailVerified: true,
      });
    }
    if (endpoint === '/notifications/unread/count') return respond({ count: 0 });
    if (endpoint === `/tests/attempts/${attemptId}/workspace-state`) {
      return respond({
        attempt: {
          id: attemptId,
          testId,
          testMode: 'TIMED',
          status: 'IN_PROGRESS',
          deadline: '2099-08-28T15:00:00.000Z',
          startedAt: '2026-08-28T12:00:00.000Z',
          test: {
            id: testId,
            title: '40-MCQ Timed practice',
            durationMinutes: 40,
            testType: 'CUSTOM',
          },
        },
        answers: [],
        flagged_question_ids: [],
        hard_question_ids: [],
        notes: [],
      });
    }
    if (endpoint === `/tests/${testId}/questions`) {
      return respond([{
        questionId,
        displayOrder: 1,
        marks: '1.00',
        question: {
          id: questionId,
          questionText: 'Which option verifies that a Timed round stays in Timed mode?',
          questionType: 'MCQ',
          options: optionIds.map((id, index) => ({
            id,
            optionText: `Choice ${String.fromCharCode(65 + index)}`,
            displayOrder: index + 1,
          })),
        },
      }]);
    }
    if (endpoint === `/tests/attempts/${attemptId}/answers/${questionId}` && request.method() === 'PUT') {
      const body = request.postDataJSON() as { selected_option_id: string; confidence_level: string };
      return respond({
        questionId,
        selectedOptionId: body.selected_option_id,
        confidenceLevel: body.confidence_level,
      });
    }
    return respond({});
  });
}

test('a timed quiz launched from Rounds stays timed after saving an answer', async ({ page }) => {
  await mockStudentApi(page);

  await page.goto(`/mock-exam/session?attempt=${attemptId}&test=${testId}&source=rounds&mode=TIMED`);

  await expect(page.locator('.exam-session-page')).toHaveClass(/is-timed/);
  await expect(page.getByText('Explanations are hidden during the exam. You will see detailed explanations after submission.')).toBeVisible();
  await expect(page.locator('.tutor-explanation')).toHaveCount(0);

  const answers = page.getByRole('radio');
  await answers.nth(0).click();
  await page.getByRole('button', { name: 'Medium' }).click();

  await expect(answers.nth(0)).toHaveAttribute('aria-checked', 'true');
  await expect(answers.nth(1)).toBeEnabled();
  await expect(page.locator('.tutor-explanation')).toHaveCount(0);
});
