import { expect, Page, test } from '@playwright/test';

const attemptId = '90111111-1111-4111-8111-111111111111';
const testId = '90222222-2222-4222-8222-222222222222';
const q1 = '90333333-3333-4333-8333-333333333331';
const q2 = '90333333-3333-4333-8333-333333333332';
const q1Options = Array.from({ length: 5 }, (_, index) => `90444444-4444-4444-8444-44444444444${index + 1}`);
const q2Options = Array.from({ length: 5 }, (_, index) => `90555555-5555-4555-8555-55555555555${index + 1}`);
const q1Correct = q1Options[0];
const q2Correct = q2Options[0];
const student = { id: 'student-feedback', email: 'student@example.test', full_name: 'Tutor Student', role: 'STUDENT', status: 'ACTIVE', emailVerified: true };

function endpoint(url: string) {
  const pathname = new URL(url).pathname;
  const marker = '/api/v1';
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) || '/' : pathname;
}

function optionRows(ids: string[], prefix: string) {
  return ids.map((id, index) => ({ id, optionText: `${prefix} option ${String.fromCharCode(65 + index)}`, displayOrder: index + 1 }));
}

function structuredFeedback(ids: string[], selected: string, correct: string, prefix: string) {
  return {
    is_correct: selected === correct,
    question_explanation: `${prefix} question takeaway.`,
    selected_option: { id: selected, explanation: `${prefix} selected rationale.` },
    correct_option: { id: correct, explanation: `${prefix} correct rationale.` },
    options: ids.map((id, index) => ({ id, explanation: `${prefix} rationale ${String.fromCharCode(65 + index)}.` })),
  };
}

async function mockTutor(page: Page) {
  const answers = new Map<string, string>();
  await page.addInitScript(() => {
    localStorage.removeItem('mdp_access_token');
    sessionStorage.removeItem('mdp_access_token');
    localStorage.removeItem('mdp_logged_out_at');
    localStorage.setItem('mdp-theme', 'light');
    localStorage.setItem('mdp-locale', 'en');
  });

  await page.route('**/*', async (route) => {
    const request = route.request();
    const target = endpoint(request.url());
    const isData = request.resourceType() === 'fetch' || request.resourceType() === 'xhr';
    if (!isData || (!request.url().includes('/api/v1') && new URL(request.url()).port !== '3000')) return route.fallback();
    const headers = {
      'access-control-allow-origin': request.headers().origin || 'http://127.0.0.1:3001',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const respond = (body: unknown, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });

    if (target === '/auth/refresh') return respond({ access_token: 'tutor-feedback-token', user: student });
    if (target === '/auth/me') return respond(student);
    if (target === '/notifications/unread/count') return respond({ count: 0 });
    if (target.startsWith('/notifications?')) return respond({ data: [] });
    if (target === `/tests/attempts/${attemptId}/workspace-state`) return respond({
      attempt: { id: attemptId, testId, testMode: 'TUTOR', status: 'IN_PROGRESS', deadline: null, startedAt: new Date().toISOString(), test: { title: 'Tutor Feedback Proof', durationMinutes: null, testType: 'CUSTOM' } },
      answers: [...answers.entries()].map(([questionId, selectedOptionId]) => ({ questionId, selectedOptionId })),
      flagged_question_ids: [],
      hard_question_ids: [],
      notes: [],
    });
    if (target === `/tests/${testId}/questions`) return respond([
      { questionId: q1, displayOrder: 1, marks: '1.00', question: { id: q1, questionText: 'Question one asks for the correct diagnosis.', questionType: 'MCQ', options: optionRows(q1Options, 'Diagnosis') } },
      { questionId: q2, displayOrder: 2, marks: '1.00', question: { id: q2, questionText: 'Question two asks for the correct management.', questionType: 'MCQ', options: optionRows(q2Options, 'Management') } },
    ]);
    if (target === `/tests/attempts/${attemptId}/answers/${q1}` && request.method() === 'PUT') {
      const selected = String((request.postDataJSON() as { selected_option_id: string }).selected_option_id);
      answers.set(q1, selected);
      const correct = selected === q1Correct;
      return respond({
        questionId: q1,
        selectedOptionId: selected,
        isCorrect: correct,
        explanation: correct ? 'Correct-answer explanation is visible immediately.' : 'Your choice: Wrong-answer explanation.\nCorrect answer: Correct-answer explanation.',
        tutor_feedback: structuredFeedback(q1Options, selected, q1Correct, 'Diagnosis'),
      });
    }
    if (target === `/tests/attempts/${attemptId}/answers/${q2}` && request.method() === 'PUT') {
      const selected = String((request.postDataJSON() as { selected_option_id: string }).selected_option_id);
      answers.set(q2, selected);
      const correct = selected === q2Correct;
      return respond({
        questionId: q2,
        selectedOptionId: selected,
        isCorrect: correct,
        explanation: correct ? 'Correct-answer explanation is visible immediately.' : 'Wrong-answer explanation is visible immediately.',
        tutor_feedback: structuredFeedback(q2Options, selected, q2Correct, 'Management'),
      });
    }
    return respond({});
  });
}

test('Tutor mode reveals concise feedback and all five option explanations only after an answer is saved', async ({ page }) => {
  await mockTutor(page);
  await page.goto(`/mock-exam/session?attempt=${attemptId}&test=${testId}&source=rounds`);

  await expect(page.getByText('Review all 5 options')).toHaveCount(0);
  await expect(page.getByRole('radio')).toHaveCount(5);

  await page.getByRole('radio').nth(1).click();
  await page.getByRole('button', { name: 'High', exact: true }).click();
  await expect(page.locator('.tutor-explanation')).toContainText('Incorrect');
  await expect(page.locator('.tutor-explanation')).toContainText('Your choice: Wrong-answer explanation.');
  await expect(page.locator('.tutor-explanation')).toContainText('Correct answer: Correct-answer explanation.');

  await page.getByText('Review all 5 options').click();
  await expect(page.locator('.tutor-option-review-row')).toHaveCount(5);
  await expect(page.locator('.tutor-option-review-row.is-selected')).toContainText('Your choice');
  await expect(page.locator('.tutor-option-review-row.is-correct')).toContainText('Correct answer');
  await expect(page.locator('.tutor-option-takeaway')).toContainText('Diagnosis question takeaway.');
  await expect(page.locator('.tutor-option-review-list')).toContainText('Diagnosis rationale E.');

  await page.getByRole('button', { name: /Next question/i }).click();
  await expect(page.getByRole('radio')).toHaveCount(5);
  await page.getByRole('radio').first().click();
  await page.getByRole('button', { name: 'High', exact: true }).click();
  await expect(page.locator('.tutor-explanation')).toContainText('Correct');
  await expect(page.locator('.tutor-explanation')).toContainText('Correct-answer explanation is visible immediately.');
  await page.getByText('Review all 5 options').click();
  await expect(page.locator('.tutor-option-review-row')).toHaveCount(5);
  await expect(page.locator('.tutor-option-review-row.is-selected.is-correct')).toContainText('Your choice');
  await expect(page.locator('.tutor-option-review-row.is-selected.is-correct')).toContainText('Correct answer');
});
