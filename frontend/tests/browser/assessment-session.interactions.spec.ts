import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';
const attemptId = '11111111-1111-4111-8111-111111111111';
const testId = '22222222-2222-4222-8222-222222222222';
const q1 = '33333333-3333-4333-8333-333333333331';
const q2 = '33333333-3333-4333-8333-333333333332';
const optionA = '44444444-4444-4444-8444-444444444441';
const optionB = '44444444-4444-4444-8444-444444444442';
const optionC = '44444444-4444-4444-8444-444444444443';

const student = {
  id: 'student-1',
  email: 'student@example.test',
  full_name: 'Assessment Test Student',
  role: 'STUDENT',
  status: 'ACTIVE',
  emailVerified: true,
};

const questions = [
  {
    questionId: q1,
    displayOrder: 1,
    marks: '1.00',
    question: {
      id: q1,
      questionText: 'A patient with exertional chest pressure that resolves with rest most likely has which diagnosis?',
      questionType: 'MCQ',
      options: [
        { id: optionA, optionText: 'Stable angina', displayOrder: 1 },
        { id: optionB, optionText: 'Acute pericarditis', displayOrder: 2 },
        { id: optionC, optionText: 'Aortic dissection', displayOrder: 3 },
      ],
    },
  },
  {
    questionId: q2,
    displayOrder: 2,
    marks: '1.00',
    question: {
      id: q2,
      questionText: 'Which intervention best reduces long-term cardiovascular risk?',
      questionType: 'MCQ',
      options: [
        { id: '55555555-5555-4555-8555-555555555551', optionText: 'Risk-factor modification', displayOrder: 1 },
        { id: '55555555-5555-4555-8555-555555555552', optionText: 'Bed rest', displayOrder: 2 },
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

async function installAssessmentMock(page: Page, mode: 'TUTOR' | 'TIMED', deadline: string | null = null) {
  const savedAnswers = new Map<string, string>();
  let submitted = false;
  let savedNote = '';
  const flags = new Set<string>();

  await page.addInitScript(() => {
    localStorage.setItem('mdp_access_token', 'assessment-browser-token');
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
    const respond = (body: unknown, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });

    if (endpoint === '/auth/me') return respond(student);
    if (endpoint === '/notifications/unread/count') return respond({ count: 0 });
    if (endpoint.startsWith('/notifications?')) return respond({ data: [] });
    if (endpoint === `/tests/attempts/${attemptId}/workspace-state`) {
      return respond({
        attempt: {
          id: attemptId,
          testId,
          testMode: mode,
          status: submitted ? 'SUBMITTED' : 'IN_PROGRESS',
          deadline,
          startedAt: new Date(Date.now() - 30_000).toISOString(),
          test: { title: mode === 'TUTOR' ? 'Tutor Practice' : 'Timed Mock Exam', durationMinutes: mode === 'TIMED' ? 90 : null, testType: 'COURSE' },
        },
        answers: [...savedAnswers.entries()].map(([questionId, selectedOptionId]) => ({ questionId, selectedOptionId })),
        flagged_question_ids: [...flags],
        notes: savedNote ? [{ question_id: q1, note: savedNote }] : [],
      });
    }
    if (endpoint === `/tests/${testId}/questions`) return respond(questions);
    if (endpoint === `/tests/attempts/${attemptId}/answers/${q1}` && request.method() === 'PUT') {
      const body = request.postDataJSON() as { selected_option_id: string };
      savedAnswers.set(q1, body.selected_option_id);
      if (mode === 'TUTOR') {
        const correct = body.selected_option_id === optionA;
        return respond({ questionId: q1, selectedOptionId: body.selected_option_id, isCorrect: correct, explanation: 'Exertional pressure relieved by rest is the classic presentation of stable angina.' });
      }
      return respond({ questionId: q1, selectedOptionId: body.selected_option_id });
    }
    if (endpoint === `/tests/attempts/${attemptId}/answers/${q2}` && request.method() === 'PUT') {
      const body = request.postDataJSON() as { selected_option_id: string };
      savedAnswers.set(q2, body.selected_option_id);
      return respond({ questionId: q2, selectedOptionId: body.selected_option_id, isCorrect: true, explanation: 'Risk-factor modification reduces long-term cardiovascular risk.' });
    }
    if (endpoint === `/tests/attempts/${attemptId}/flags/${q1}`) {
      if (request.method() === 'DELETE') flags.delete(q1);
      else flags.add(q1);
      return respond({});
    }
    if (endpoint === `/tests/attempts/${attemptId}/notes/${q1}`) {
      if (request.method() === 'DELETE') savedNote = '';
      else savedNote = String((request.postDataJSON() as { note?: string }).note || '');
      return respond({});
    }
    if (endpoint === `/tests/attempts/${attemptId}/submit` && request.method() === 'POST') {
      submitted = true;
      return respond({ id: attemptId, status: 'SUBMITTED' });
    }
    if (endpoint === `/tests/attempts/${attemptId}/review`) {
      const selectedOptionId = savedAnswers.get(q1) || null;
      return respond({
        attempt: { id: attemptId, testId, testMode: mode, status: 'SUBMITTED', deadline, test: { title: mode === 'TUTOR' ? 'Tutor Practice' : 'Timed Mock Exam' } },
        questions: [{
          ...questions[0],
          question: {
            ...questions[0].question,
            explanation: 'Exertional pressure relieved by rest is the classic presentation of stable angina.',
            options: questions[0].question.options.map((option) => ({ ...option, isCorrect: option.id === optionA })),
          },
          answer: selectedOptionId ? { selectedOptionId, isCorrect: selectedOptionId === optionA } : null,
        }],
      });
    }

    return respond({});
  });

  return {
    getSavedNote: () => savedNote,
    isFlagged: () => flags.has(q1),
  };
}

async function highlightFirstWords(page: Page) {
  const stem = page.locator('.exam-question-stem-text');
  await stem.evaluate((element) => {
    const textNode = element.firstChild;
    if (!textNode) throw new Error('Question stem has no text node');
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, Math.min(14, textNode.textContent?.length || 0));
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
}

test('Tutor mode supports highlighter, strike-out, flags, notes, labs, and immediate explanations', async ({ page }) => {
  const state = await installAssessmentMock(page, 'TUTOR');
  await page.goto(`/mock-exam/session?attempt=${attemptId}&test=${testId}&source=rounds`);

  await expect(page.getByText('Tutor Practice')).toBeVisible();
  await expect(page.getByText('Tutor explanations appear after the server confirms each saved answer.')).toBeVisible();

  const highlighter = page.getByRole('button', { name: /Highlighter/i });
  await highlighter.click();
  await expect(highlighter).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.exam-tool-hint')).toContainText('Highlighter active');
  await highlightFirstWords(page);
  await expect(page.locator('.exam-question-stem-text mark')).toHaveCount(1);

  await highlighter.click();
  await expect(highlighter).toHaveAttribute('aria-pressed', 'false');
  const strikeOut = page.getByRole('button', { name: /Strike out$/i }).first();
  await strikeOut.click();
  await expect(strikeOut).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('radio').nth(2).click();
  await expect(page.locator('.exam-answer-row').nth(2)).toHaveClass(/struck/);
  await expect(page.locator('.exam-number-grid button').first()).not.toHaveClass(/(^|\s)answered(\s|$)/);
  await strikeOut.click();
  await expect(strikeOut).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: /^Flag$/ }).click();
  await expect.poll(state.isFlagged).toBe(true);

  await page.getByRole('button', { name: /Notes/i }).click();
  const note = page.getByPlaceholder('Save a private note for this question…');
  await note.fill('Review coronary perfusion physiology.');
  await page.getByRole('button', { name: /Save note/i }).click();
  await expect.poll(state.getSavedNote).toBe('Review coronary perfusion physiology.');

  await page.getByRole('button', { name: /Lab values/i }).first().click();
  await expect(page.getByRole('dialog', { name: 'Lab values' })).toBeVisible();
  await page.getByRole('button', { name: /Close lab values/i }).click();

  await page.getByRole('radio').nth(1).click();
  await expect(page.locator('.exam-answer-row').nth(1)).toHaveClass(/answer-incorrect/);
  const explanation = page.locator('.tutor-explanation');
  await expect(explanation).toContainText('Incorrect');
  await expect(explanation).toContainText('classic presentation of stable angina');
  await expect(page.getByRole('radio').nth(0)).toBeDisabled();

  await page.getByRole('button', { name: 'More question actions' }).click();
  await expect(page.getByRole('menuitem', { name: 'Clear highlights' })).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Clear highlights' }).click();
  await expect(page.locator('.exam-question-stem-text mark')).toHaveCount(0);
});

test('Timed mode hides live explanations, uses the countdown controls, and reveals explanations after submission', async ({ page }) => {
  const deadline = new Date(Date.now() + 5 * 60_000).toISOString();
  await installAssessmentMock(page, 'TIMED', deadline);
  await page.goto(`/mock-exam/session?attempt=${attemptId}&test=${testId}&source=past-exams`);

  await expect(page.getByText('Timed Mock Exam')).toBeVisible();
  await expect(page.getByText(/Explanations are hidden during the exam/i)).toBeVisible();
  await expect(page.locator('.exam-time-cell b')).not.toContainText('Untimed');

  await page.getByRole('button', { name: /^Hide$/ }).click();
  await expect(page.locator('.overview-time strong')).toHaveText('••:••:••');
  await page.getByRole('button', { name: /^Show$/ }).click();
  await expect(page.locator('.overview-time strong')).not.toHaveText('••:••:••');

  await page.getByRole('radio').nth(1).click();
  await expect(page.locator('.exam-answer-row').nth(1)).toHaveClass(/selected/);
  await expect(page.locator('.tutor-explanation')).toHaveCount(0);

  page.once('dialog', async (dialog) => dialog.accept());
  const submit = page.getByRole('button', { name: 'Submit exam' });
  if (await submit.isVisible()) await submit.click();
  else await page.locator('.exam-session-footer .end').evaluate((element: HTMLButtonElement) => element.click());

  await expect(page.getByRole('heading', { name: 'Timed Mock Exam' })).toBeVisible();
  await expect(page.locator('.review-answer')).toContainText('Incorrect');
  await expect(page.locator('.review-answer')).toContainText('Your answer: Acute pericarditis');
  await expect(page.locator('.review-answer')).toContainText('Correct answer: Stable angina');
  await expect(page.locator('.review-explanation')).toContainText('classic presentation of stable angina');
});

test('Timed mode auto-submits an expired attempt and opens review', async ({ page }) => {
  await installAssessmentMock(page, 'TIMED', new Date(Date.now() - 1_000).toISOString());
  await page.goto(`/mock-exam/session?attempt=${attemptId}&test=${testId}&source=past-exams`);
  await expect(page.getByRole('heading', { name: 'Timed Mock Exam' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Detailed explanations are shown below/i)).toBeVisible();
});