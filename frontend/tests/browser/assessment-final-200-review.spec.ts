import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';
const attemptId = 'a0111111-1111-4111-8111-111111111111';
const testId = 'a0222222-2222-4222-8222-222222222222';

function endpoint(url: string) {
  const pathname = new URL(url).pathname;
  const marker = '/api/v1';
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) || '/' : pathname;
}

function questionId(index: number) {
  const head = `a1${index.toString(16).padStart(6, '0')}`;
  return `${head}-3333-4333-8333-${index.toString(16).padStart(12, '0')}`;
}

function optionId(index: number, option: number) {
  const value = index * 10 + option;
  const head = `b1${value.toString(16).padStart(6, '0')}`;
  return `${head}-4444-4444-8444-${value.toString(16).padStart(12, '0')}`;
}

function assignment(index: number) {
  const qid = questionId(index);
  return {
    questionId: qid,
    displayOrder: index,
    marks: '1.00',
    question: {
      id: qid,
      questionText: `Final question ${index}`,
      questionType: 'MCQ',
      options: Array.from({ length: 5 }, (_, offset) => ({
        id: optionId(index, offset + 1),
        optionText: `Q${index} option ${offset + 1}`,
        displayOrder: offset + 1,
      })),
    },
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

function corsHeaders() {
  return {
    'access-control-allow-origin': frontendOrigin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  };
}

const finalStudent = { id: 'student-final', email: 'student@example.test', full_name: 'Final Student', role: 'STUDENT', status: 'ACTIVE', emailVerified: true };
const reviewStudent = { id: 'student-review', email: 'student@example.test', full_name: 'Review Student', role: 'STUDENT', status: 'ACTIVE', emailVerified: true };

test('200-question timed final uses five 40-question blocks and restores server state after refresh', async ({ page }) => {
  await primeAuth(page);
  const answers = new Map<string, { selectedOptionId: string; confidenceLevel: string }>();
  const normalFlags = new Set<string>();
  const hardFlags = new Set<string>();
  const questions = Array.from({ length: 200 }, (_, index) => assignment(index + 1));

  await page.route('**/*', async (route) => {
    const request = route.request();
    const target = endpoint(request.url());
    const isData = request.resourceType() === 'fetch' || request.resourceType() === 'xhr';
    if (!isData || (!request.url().includes('/api/v1') && new URL(request.url()).port !== '3000')) return route.fallback();
    const headers = corsHeaders();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const respond = (body: unknown, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });

    if (target === '/auth/refresh') return respond({ access_token: 'timed-final-token', user: finalStudent });
    if (target === '/auth/me') return respond(finalStudent);
    if (target === '/notifications/unread/count') return respond({ count: 0 });
    if (target.startsWith('/notifications?')) return respond({ data: [] });
    if (target === `/tests/attempts/${attemptId}/workspace-state`) return respond({
      attempt: {
        id: attemptId,
        testId,
        testMode: 'TIMED',
        status: 'IN_PROGRESS',
        deadline: new Date(Date.now() + 200 * 60_000).toISOString(),
        startedAt: new Date().toISOString(),
        test: { title: '200 Question Final', durationMinutes: 200, testType: 'FINAL' },
      },
      answers: [...answers.entries()].map(([qid, answer]) => ({ questionId: qid, ...answer })),
      flagged_question_ids: [...normalFlags],
      hard_question_ids: [...hardFlags],
      notes: [],
    });
    if (target === `/tests/${testId}/questions`) return respond(questions);

    const answerMatch = target.match(new RegExp(`^/tests/attempts/${attemptId}/answers/(.+)$`));
    if (answerMatch && request.method() === 'PUT') {
      const body = request.postDataJSON() as { selected_option_id: string; confidence_level: string };
      answers.set(answerMatch[1], { selectedOptionId: body.selected_option_id, confidenceLevel: body.confidence_level });
      return respond({ questionId: answerMatch[1], selectedOptionId: body.selected_option_id, confidenceLevel: body.confidence_level });
    }

    const hardMatch = target.match(new RegExp(`^/tests/attempts/${attemptId}/hard-flags/(.+)$`));
    if (hardMatch) {
      if (request.method() === 'POST') {
        hardFlags.add(hardMatch[1]);
        return respond({});
      }
      if (request.method() === 'DELETE') {
        hardFlags.delete(hardMatch[1]);
        return route.fulfill({ status: 204, headers });
      }
    }
    const flagMatch = target.match(new RegExp(`^/tests/attempts/${attemptId}/flags/(.+)$`));
    if (flagMatch) {
      if (request.method() === 'POST') {
        normalFlags.add(flagMatch[1]);
        return respond({});
      }
      if (request.method() === 'DELETE') {
        normalFlags.delete(flagMatch[1]);
        return route.fulfill({ status: 204, headers });
      }
    }

    return respond({});
  });

  await page.goto(`/mock-exam/session?attempt=${attemptId}&test=${testId}&source=rounds`);

  await expect(page.getByText('Block 1 of 5')).toBeVisible();
  await expect(page.getByRole('button', { name: '1–40' })).toBeVisible();
  await expect(page.getByRole('button', { name: '161–200' })).toBeVisible();
  await expect(page.getByText('Review all 5 options')).toHaveCount(0);

  await page.getByRole('button', { name: '161–200' }).click();
  await expect(page.getByText('Final question 161')).toBeVisible();
  await expect(page.getByText('Block 5 of 5')).toBeVisible();

  await page.getByRole('radio').first().click();
  await page.getByRole('button', { name: 'High' }).click();
  await expect(page.locator('.tutor-explanation')).toHaveCount(0);
  await expect(page.getByText('Review all 5 options')).toHaveCount(0);

  await page.getByRole('button', { name: /^Flag$/ }).click();
  await page.getByRole('button', { name: /Hard question/i }).click();

  await page.reload();
  await page.getByRole('button', { name: '161–200' }).click();
  await expect(page.getByText('Final question 161')).toBeVisible();
  await expect(page.getByRole('radio').first()).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: 'High' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /^Flag$/ })).toHaveClass(/active/);
  await expect(page.getByRole('button', { name: /Hard question/i })).toHaveClass(/active/);
});

test('timed assessment reveals A-E rationales only after submission', async ({ page }) => {
  await primeAuth(page);
  const item = assignment(1);
  const qid = item.question.id;
  const selectedId = item.question.options[1].id;
  const correctId = item.question.options[0].id;
  let saved = false;

  await page.route('**/*', async (route) => {
    const request = route.request();
    const target = endpoint(request.url());
    const isData = request.resourceType() === 'fetch' || request.resourceType() === 'xhr';
    if (!isData || (!request.url().includes('/api/v1') && new URL(request.url()).port !== '3000')) return route.fallback();
    const headers = corsHeaders();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const respond = (body: unknown, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });

    if (target === '/auth/refresh') return respond({ access_token: 'timed-review-token', user: reviewStudent });
    if (target === '/auth/me') return respond(reviewStudent);
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
        test: { title: 'Timed Review Proof', durationMinutes: 40, testType: 'CUSTOM' },
      },
      answers: saved ? [{ questionId: qid, selectedOptionId: selectedId, confidenceLevel: 'HIGH' }] : [],
      flagged_question_ids: [],
      hard_question_ids: [],
      notes: [],
    });
    if (target === `/tests/${testId}/questions`) return respond([item]);
    if (target === `/tests/attempts/${attemptId}/answers/${qid}` && request.method() === 'PUT') {
      saved = true;
      return respond({ questionId: qid, selectedOptionId: selectedId, confidenceLevel: 'HIGH' });
    }
    if (target === `/tests/attempts/${attemptId}/submit` && request.method() === 'POST') {
      return respond({ id: attemptId, status: 'SUBMITTED' });
    }
    if (target === `/tests/attempts/${attemptId}/review`) {
      return respond({
        attempt: { id: attemptId, testId, testMode: 'TIMED', status: 'SUBMITTED', deadline: null, test: { title: 'Timed Review Proof' } },
        grading_pending: false,
        questions: [{
          ...item,
          question: {
            ...item.question,
            explanation: 'The key clue directly supports option A.',
            options: item.question.options.map((option, index) => ({
              ...option,
              isCorrect: option.id === correctId,
              explanation: `Option ${index + 1} rationale.`,
            })),
          },
          answer: { selectedOptionId: selectedId, isCorrect: false },
        }],
      });
    }
    return respond({});
  });

  await page.goto(`/mock-exam/session?attempt=${attemptId}&test=${testId}&source=rounds`);
  await expect(page.getByText('Review all 5 options')).toHaveCount(0);

  await page.getByRole('radio').nth(1).click();
  await page.getByRole('button', { name: 'High' }).click();
  await expect(page.locator('.tutor-explanation')).toHaveCount(0);
  await expect(page.getByText('Option 1 rationale.')).toHaveCount(0);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /Submit exam/i }).click();

  await expect(page.getByText('Assessment submitted')).toBeVisible();
  await expect(page.getByText('Review all 5 options')).toBeVisible();
  await page.getByText('Review all 5 options').click();
  await expect(page.locator('.tutor-option-review-row')).toHaveCount(5);
  await expect(page.getByText('Question takeaway')).toBeVisible();
  await expect(page.getByText('Option 5 rationale.')).toBeVisible();
  await expect(page.locator('.tutor-option-badges').filter({ hasText: 'Your choice' })).toHaveCount(1);
  await expect(page.locator('.tutor-option-badges').filter({ hasText: 'Correct answer' })).toHaveCount(1);
});
