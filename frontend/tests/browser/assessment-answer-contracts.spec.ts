import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';
const attemptId = '71111111-1111-4111-8111-111111111111';
const testId = '72222222-2222-4222-8222-222222222222';
const questionId = '73333333-3333-4333-8333-333333333333';
// These mirror persisted PostgreSQL UUID text from the demo question bank. The
// variant nibble is not RFC-v4-conformant, but PostgreSQL's uuid type accepts the
// canonical text and the backend answer DTO intentionally accepts it as well.
const correctOptionId = '71000000-0000-4000-0001-000000000004';
const wrongOptionId = '71000000-0000-4000-0001-000000000005';

const student = {
  id: 'student-answer-contracts',
  email: 'student@example.test',
  full_name: 'Assessment Contract Student',
  role: 'STUDENT',
  status: 'ACTIVE',
  emailVerified: true,
};

const questions = [
  {
    questionId,
    displayOrder: 1,
    marks: '1.00',
    question: {
      id: questionId,
      questionText: 'Which chamber receives oxygenated blood directly from the pulmonary veins?',
      questionType: 'MCQ',
      options: [
        { id: correctOptionId, optionText: 'Left atrium', displayOrder: 1 },
        { id: wrongOptionId, optionText: 'Right atrium', displayOrder: 2 },
      ],
    },
  },
];

function apiEndpoint(requestUrl: string) {
  const pathname = new URL(requestUrl).pathname;
  const marker = '/api/v1';
  const markerIndex = pathname.indexOf(marker);
  return markerIndex >= 0 ? pathname.slice(markerIndex + marker.length) || '/' : pathname;
}

async function installAssessmentMock(page: Page, mode: 'TUTOR' | 'TIMED') {
  let selectedOptionId = '';
  let answerWrites = 0;

  await page.addInitScript(() => {
    localStorage.setItem('mdp_access_token', 'assessment-contract-token');
    localStorage.removeItem('mdp_logged_out_at');
    localStorage.setItem('mdp-theme', 'light');
    localStorage.setItem('mdp-locale', 'en');
  });

  await page.route('**/*', async (route) => {
    const request = route.request();
    const endpoint = apiEndpoint(request.url());
    const resourceType = request.resourceType();
    const isDataRequest = resourceType === 'fetch' || resourceType === 'xhr';

    if (!isDataRequest || (!request.url().includes('/api/v1') && new URL(request.url()).port !== '3000')) {
      await route.fallback();
      return;
    }

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

    if (endpoint === '/auth/me') return respond(student);
    if (endpoint === '/notifications/unread/count') return respond({ count: 0 });
    if (endpoint.startsWith('/notifications?')) return respond({ data: [] });

    if (endpoint === `/tests/attempts/${attemptId}/workspace-state`) {
      return respond({
        attempt: {
          id: attemptId,
          testId,
          testMode: mode,
          status: 'IN_PROGRESS',
          deadline: mode === 'TIMED' ? new Date(Date.now() + 20 * 60_000).toISOString() : null,
          startedAt: new Date(Date.now() - 30_000).toISOString(),
          test: {
            title: mode === 'TUTOR' ? 'Tutor Answer Contract' : 'Timed Answer Contract',
            durationMinutes: mode === 'TIMED' ? 20 : null,
            testType: 'COURSE',
          },
        },
        answers: selectedOptionId ? [{ questionId, selectedOptionId }] : [],
        flagged_question_ids: [],
        notes: [],
      });
    }

    if (endpoint === `/tests/${testId}/questions`) return respond(questions);

    if (endpoint === `/tests/attempts/${attemptId}/answers/${questionId}` && request.method() === 'PUT') {
      const body = request.postDataJSON() as { selected_option_id: string };
      selectedOptionId = body.selected_option_id;
      answerWrites += 1;

      if (mode === 'TUTOR') {
        const isCorrect = selectedOptionId === correctOptionId;
        return respond({
          questionId,
          selectedOptionId,
          isCorrect,
          explanation: 'Pulmonary veins return oxygenated blood to the left atrium.',
        });
      }

      return respond({ questionId, selectedOptionId });
    }

    return respond({});
  });

  return {
    getSelectedOptionId: () => selectedOptionId,
    getAnswerWrites: () => answerWrites,
  };
}

test('Timed mode lets a student change a persisted demo-ID answer before submission without leaking feedback', async ({ page }) => {
  const state = await installAssessmentMock(page, 'TIMED');
  await page.goto(`/mock-exam/session?attempt=${attemptId}&test=${testId}&source=past-exams`);

  await expect(page.getByText('Timed Answer Contract')).toBeVisible();
  const choices = page.getByRole('radio');

  await choices.nth(0).click();
  await expect(page.locator('.exam-answer-row').nth(0)).toHaveClass(/selected/);
  await expect.poll(state.getSelectedOptionId).toBe(correctOptionId);

  await choices.nth(1).click();
  await expect(page.locator('.exam-answer-row').nth(1)).toHaveClass(/selected/);
  await expect(page.locator('.exam-answer-row').nth(0)).not.toHaveClass(/selected/);
  await expect.poll(state.getSelectedOptionId).toBe(wrongOptionId);
  await expect.poll(state.getAnswerWrites).toBe(2);

  await expect(page.locator('.tutor-explanation')).toHaveCount(0);
  await expect(page.locator('.answer-correct')).toHaveCount(0);
  await expect(page.locator('.answer-incorrect')).toHaveCount(0);
});

test('Tutor mode locks the persisted demo-ID answer after grading and always exposes the explanation', async ({ page }) => {
  const state = await installAssessmentMock(page, 'TUTOR');
  await page.goto(`/mock-exam/session?attempt=${attemptId}&test=${testId}&source=rounds`);

  await expect(page.getByText('Tutor Answer Contract')).toBeVisible();
  const choices = page.getByRole('radio');

  await choices.nth(1).click();
  await expect.poll(state.getSelectedOptionId).toBe(wrongOptionId);
  await expect(page.locator('.exam-answer-row').nth(1)).toHaveClass(/answer-incorrect/);
  await expect(page.locator('.tutor-explanation')).toContainText('Incorrect');
  await expect(page.locator('.tutor-explanation')).toContainText('Pulmonary veins return oxygenated blood to the left atrium.');

  await expect(choices.nth(0)).toBeDisabled();
  await expect(choices.nth(1)).toBeDisabled();
  await expect.poll(state.getAnswerWrites).toBe(1);
});
