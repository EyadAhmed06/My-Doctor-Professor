import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';
const attemptId = '90111111-1111-4111-8111-111111111111';
const testId = '90222222-2222-4222-8222-222222222222';
const q1 = '90333333-3333-4333-8333-333333333331';
const q2 = '90333333-3333-4333-8333-333333333332';
const q1Correct = '90444444-4444-4444-8444-444444444441';
const q1Wrong = '90444444-4444-4444-8444-444444444442';
const q2Correct = '90555555-5555-4555-8555-555555555551';
const q2Wrong = '90555555-5555-4555-8555-555555555552';

function endpoint(url: string) {
  const pathname = new URL(url).pathname;
  const marker = '/api/v1';
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) || '/' : pathname;
}

async function mockTutor(page: Page) {
  const answers = new Map<string, string>();
  await page.addInitScript(() => {
    localStorage.setItem('mdp_access_token', 'tutor-feedback-token');
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
      'access-control-allow-origin': frontendOrigin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const respond = (body: unknown, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });

    if (target === '/auth/me') return respond({ id: 'student-feedback', email: 'student@example.test', full_name: 'Tutor Student', role: 'STUDENT', status: 'ACTIVE', emailVerified: true });
    if (target === '/notifications/unread/count') return respond({ count: 0 });
    if (target.startsWith('/notifications?')) return respond({ data: [] });
    if (target === `/tests/attempts/${attemptId}/workspace-state`) return respond({
      attempt: { id: attemptId, testId, testMode: 'TUTOR', status: 'IN_PROGRESS', deadline: null, startedAt: new Date().toISOString(), test: { title: 'Tutor Feedback Proof', durationMinutes: null, testType: 'CUSTOM' } },
      answers: [...answers.entries()].map(([questionId, selectedOptionId]) => ({ questionId, selectedOptionId })),
      flagged_question_ids: [],
      notes: [],
    });
    if (target === `/tests/${testId}/questions`) return respond([
      { questionId: q1, displayOrder: 1, marks: '1.00', question: { id: q1, questionText: 'Question one asks for the correct diagnosis.', questionType: 'MCQ', options: [{ id: q1Correct, optionText: 'Correct diagnosis', displayOrder: 1 }, { id: q1Wrong, optionText: 'Wrong diagnosis', displayOrder: 2 }] } },
      { questionId: q2, displayOrder: 2, marks: '1.00', question: { id: q2, questionText: 'Question two asks for the correct management.', questionType: 'MCQ', options: [{ id: q2Correct, optionText: 'Correct management', displayOrder: 1 }, { id: q2Wrong, optionText: 'Wrong management', displayOrder: 2 }] } },
    ]);
    if (target === `/tests/attempts/${attemptId}/answers/${q1}` && request.method() === 'PUT') {
      const selected = String((request.postDataJSON() as { selected_option_id: string }).selected_option_id);
      answers.set(q1, selected);
      const correct = selected === q1Correct;
      return respond({ questionId: q1, selectedOptionId: selected, isCorrect: correct, explanation: correct ? 'Correct-answer explanation is visible immediately.' : 'Wrong-answer explanation is visible immediately.' });
    }
    if (target === `/tests/attempts/${attemptId}/answers/${q2}` && request.method() === 'PUT') {
      const selected = String((request.postDataJSON() as { selected_option_id: string }).selected_option_id);
      answers.set(q2, selected);
      const correct = selected === q2Correct;
      return respond({ questionId: q2, selectedOptionId: selected, isCorrect: correct, explanation: correct ? 'Correct-answer explanation is visible immediately.' : 'Wrong-answer explanation is visible immediately.' });
    }
    return respond({});
  });
}

test('Tutor mode explains both wrong and correct answers immediately', async ({ page }) => {
  await mockTutor(page);
  await page.goto(`/mock-exam/session?attempt=${attemptId}&test=${testId}&source=rounds`);

  await page.getByRole('radio').nth(1).click();
  await expect(page.locator('.tutor-explanation')).toContainText('Incorrect');
  await expect(page.locator('.tutor-explanation')).toContainText('Wrong-answer explanation is visible immediately.');

  await page.getByRole('button', { name: /Next question/i }).click();
  await page.getByRole('radio').first().click();
  await expect(page.locator('.tutor-explanation')).toContainText('Correct');
  await expect(page.locator('.tutor-explanation')).toContainText('Correct-answer explanation is visible immediately.');
});
