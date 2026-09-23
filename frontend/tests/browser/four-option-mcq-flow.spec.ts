import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';

function endpoint(url: string) {
  const pathname = new URL(url).pathname;
  const marker = '/api/v1';
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) || '/' : pathname;
}

function cors(origin = frontendOrigin) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'cache-control': 'no-store',
  };
}

async function primeSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem('mdp_access_token');
    sessionStorage.removeItem('mdp_access_token');
    localStorage.removeItem('mdp_refresh_token');
    sessionStorage.removeItem('mdp_refresh_token');
    localStorage.removeItem('mdp_logged_out_at');
    localStorage.setItem('mdp-theme', 'light');
    localStorage.setItem('mdp-locale', 'en');
  });
}

type StoredOption = {
  id: string;
  optionText: string;
  explanation: string | null;
  isCorrect: boolean;
  displayOrder: number;
};

type StoredQuestion = {
  id: string;
  topicId: string;
  questionType: 'MCQ';
  title: string | null;
  questionText: string;
  explanation: string | null;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  marks: string;
  isActive: boolean;
  topic: { id: string; topicName: string };
  creator: { fullName: string };
  options: StoredOption[];
};

async function installQuestionBankMock(page: Page) {
  const instructor = {
    id: 'instructor-four-five',
    email: 'instructor@example.test',
    full_name: 'Four Five Instructor',
    role: 'INSTRUCTOR',
    status: 'ACTIVE',
    emailVerified: true,
  };

  const questions: StoredQuestion[] = [];
  const activationTransitions: boolean[] = [];
  let questionSequence = 0;
  let optionSequence = 0;

  await primeSession(page);
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const target = endpoint(request.url());
    const isData = request.resourceType() === 'fetch' || request.resourceType() === 'xhr';

    if (!isData || (!url.pathname.includes('/api/v1') && url.port !== '3000')) {
      await route.fallback();
      return;
    }

    const headers = cors(request.headers().origin || frontendOrigin);
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const respond = (body: unknown, status = 200) => route.fulfill({
      status,
      headers,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

    if (target === '/auth/refresh') return respond({ access_token: 'four-five-instructor-token', user: instructor });
    if (target === '/auth/me') return respond(instructor);
    if (target === '/notifications/unread/count') return respond({ count: 0 });
    if (target.startsWith('/notifications')) return respond({ data: [] });

    if (target === '/academic/courses' && request.method() === 'GET') {
      return respond({ data: [{ id: 'course-1', courseCode: 'MED401', courseName: 'Medicine IV' }] });
    }

    if (target === '/academic/courses/course-1' && request.method() === 'GET') {
      return respond({
        id: 'course-1',
        courseCode: 'MED401',
        courseName: 'Medicine IV',
        weeks: [{
          id: 'week-1',
          weekNumber: 1,
          title: 'Cardiology',
          lectures: [{
            id: 'lecture-1',
            lectureNumber: 1,
            title: 'Cardiac physiology',
            topics: [{ id: 'topic-1', topicName: 'Chambers and flow' }],
          }],
        }],
      });
    }

    if (target === '/questions' && request.method() === 'GET') {
      return respond({ data: questions, total: questions.length, page: 1, limit: 100, total_pages: 1 });
    }

    if (target === '/questions' && request.method() === 'POST') {
      questionSequence += 1;
      const body = request.postDataJSON() as Record<string, unknown>;
      const created: StoredQuestion = {
        id: `question-${questionSequence}`,
        topicId: String(body.topic_id),
        questionType: 'MCQ',
        title: body.title ? String(body.title) : null,
        questionText: String(body.question_text),
        explanation: body.explanation ? String(body.explanation) : null,
        difficulty: String(body.difficulty || 'MEDIUM') as StoredQuestion['difficulty'],
        marks: String(body.marks ?? 1),
        isActive: false,
        topic: { id: 'topic-1', topicName: 'Chambers and flow' },
        creator: { fullName: instructor.full_name },
        options: [],
      };
      questions.push(created);
      return respond(created, 201);
    }

    const addOption = target.match(/^\/questions\/([^/]+)\/options$/);
    if (addOption && request.method() === 'POST') {
      const question = questions.find((item) => item.id === addOption[1]);
      if (!question) return respond({ message: 'Question not found' }, 404);
      optionSequence += 1;
      const body = request.postDataJSON() as Record<string, unknown>;
      const option: StoredOption = {
        id: `option-${optionSequence}`,
        optionText: String(body.option_text),
        explanation: body.explanation ? String(body.explanation) : '',
        isCorrect: Boolean(body.is_correct),
        displayOrder: Number(body.display_order),
      };
      question.options.push(option);
      question.options.sort((a, b) => a.displayOrder - b.displayOrder);
      return respond(option, 201);
    }

    const optionMutation = target.match(/^\/questions\/options\/([^/]+)$/);
    if (optionMutation) {
      const owner = questions.find((question) => question.options.some((option) => option.id === optionMutation[1]));
      const option = owner?.options.find((candidate) => candidate.id === optionMutation[1]);
      if (!owner || !option) return respond({ message: 'Option not found' }, 404);

      if (request.method() === 'DELETE') {
        owner.options = owner.options
          .filter((candidate) => candidate.id !== option.id)
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((candidate, index) => ({ ...candidate, displayOrder: index + 1 }));
        return route.fulfill({ status: 204, headers });
      }

      if (request.method() === 'PUT') {
        const body = request.postDataJSON() as Record<string, unknown>;
        option.optionText = String(body.option_text);
        option.explanation = body.explanation == null ? null : String(body.explanation);
        option.isCorrect = Boolean(body.is_correct);
        option.displayOrder = Number(body.display_order);
        owner.options.sort((a, b) => a.displayOrder - b.displayOrder);
        return respond(option);
      }
    }

    const questionDetail = target.match(/^\/questions\/([^/]+)$/);
    if (questionDetail) {
      const question = questions.find((item) => item.id === questionDetail[1]);
      if (!question) return respond({ message: 'Question not found' }, 404);

      if (request.method() === 'GET') return respond(question);

      if (request.method() === 'PUT') {
        const body = request.postDataJSON() as Record<string, unknown>;
        if (Object.prototype.hasOwnProperty.call(body, 'is_active')) {
          question.isActive = Boolean(body.is_active);
          activationTransitions.push(question.isActive);
        }
        if (Object.prototype.hasOwnProperty.call(body, 'title')) question.title = body.title ? String(body.title) : null;
        if (Object.prototype.hasOwnProperty.call(body, 'question_text')) question.questionText = String(body.question_text);
        if (Object.prototype.hasOwnProperty.call(body, 'explanation')) question.explanation = body.explanation ? String(body.explanation) : null;
        if (Object.prototype.hasOwnProperty.call(body, 'difficulty')) question.difficulty = String(body.difficulty) as StoredQuestion['difficulty'];
        if (Object.prototype.hasOwnProperty.call(body, 'marks')) question.marks = String(body.marks);
        return respond(question);
      }
    }

    return respond({});
  });

  return {
    questions,
    activationTransitions,
  };
}

function optionPanel(dialog: ReturnType<Page['getByRole']>, label: string) {
  return dialog.locator('.pp-panel').filter({ hasText: new RegExp(`^Option ${label}\\b`) }).first();
}

test('question bank creates A-D, edits A-D to A-E, edits back to A-D, and preserves activation + one correct answer', async ({ page }) => {
  const state = await installQuestionBankMock(page);
  await page.goto('/instructor/questions');

  await expect(page.getByRole('heading', { name: 'Question bank' })).toBeVisible();
  await page.getByRole('button', { name: /New question/i }).first().click();

  const create = page.getByRole('dialog', { name: 'Create question' });
  await create.getByLabel('Course').selectOption('course-1');
  await create.getByLabel('Topic').selectOption('topic-1');
  await create.getByLabel('Question text').fill('Which chamber receives oxygenated blood directly from the pulmonary veins?');
  await create.getByLabel('Explanation').fill('Pulmonary veins drain into the left atrium.');
  await create.getByLabel('Answer choices').selectOption('4');

  const fourChoices = [
    ['A', 'Right atrium', 'Receives systemic venous blood.'],
    ['B', 'Right ventricle', 'Pumps blood to the lungs.'],
    ['C', 'Left atrium', 'Receives oxygenated pulmonary venous blood.'],
    ['D', 'Left ventricle', 'Pumps oxygenated blood into the aorta.'],
  ] as const;

  for (const [label, textValue, explanation] of fourChoices) {
    const field = create.locator('label').filter({ hasText: new RegExp(`^Option ${label}`) }).first();
    await field.locator('input').fill(textValue);
    await field.locator('textarea').fill(explanation);
  }

  await expect(create.locator('label').filter({ hasText: /^Option E/ })).toHaveCount(0);
  await create.getByLabel('Correct option').selectOption('2');
  await create.getByRole('button', { name: 'Create question' }).click();

  await expect.poll(() => state.questions.length).toBe(1);
  await expect.poll(() => state.questions[0]?.options.length).toBe(4);
  expect(state.questions[0].options.filter((option) => option.isCorrect)).toHaveLength(1);
  expect(state.questions[0].options.find((option) => option.isCorrect)?.optionText).toBe('Left atrium');

  const card = page.locator('.role-content-card').filter({ hasText: /Which chamber receives oxygenated blood/ }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /Activate/i }).click();
  await expect.poll(() => state.questions[0].isActive).toBe(true);

  await card.getByRole('button', { name: /Edit/i }).click();
  let edit = page.getByRole('dialog', { name: 'Edit MCQ' });
  await expect(edit.getByText(/4 choices · four or five supported/i)).toBeVisible();
  await expect(edit.getByRole('button', { name: /Remove choice/i }).first()).toBeDisabled();

  await edit.getByRole('button', { name: /Add choice/i }).click();
  await expect(edit.getByText(/5 choices · four or five supported/i)).toBeVisible();
  const ePanel = optionPanel(edit, 'E');
  await ePanel.getByLabel('Choice text').fill('Aorta');
  await ePanel.getByLabel('Choice explanation').fill('Receives blood from the left ventricle, not the pulmonary veins.');
  await edit.getByRole('button', { name: /Save all changes/i }).click();

  await expect.poll(() => state.questions[0].options.length).toBe(5);
  await expect.poll(() => state.questions[0].isActive).toBe(true);
  expect(state.questions[0].options.filter((option) => option.isCorrect)).toHaveLength(1);
  expect(state.questions[0].options.find((option) => option.isCorrect)?.optionText).toBe('Left atrium');
  expect(state.activationTransitions.slice(-2)).toEqual([false, true]);

  await card.getByRole('button', { name: /Edit/i }).click();
  edit = page.getByRole('dialog', { name: 'Edit MCQ' });
  await expect(edit.getByText(/5 choices · four or five supported/i)).toBeVisible();
  await optionPanel(edit, 'E').getByRole('button', { name: /Remove choice/i }).click();
  await expect(edit.getByText(/4 choices · four or five supported/i)).toBeVisible();
  await edit.getByRole('button', { name: /Save all changes/i }).click();

  await expect.poll(() => state.questions[0].options.length).toBe(4);
  await expect.poll(() => state.questions[0].isActive).toBe(true);
  expect(state.questions[0].options.map((option) => option.displayOrder)).toEqual([1, 2, 3, 4]);
  expect(state.questions[0].options.filter((option) => option.isCorrect)).toHaveLength(1);
  expect(state.activationTransitions.slice(-2)).toEqual([false, true]);
});

test('question bank keeps five choices as the default manual-authoring path', async ({ page }) => {
  const state = await installQuestionBankMock(page);
  await page.goto('/instructor/questions');
  await page.getByRole('button', { name: /New question/i }).first().click();

  const create = page.getByRole('dialog', { name: 'Create question' });
  await create.getByLabel('Course').selectOption('course-1');
  await create.getByLabel('Topic').selectOption('topic-1');
  await create.getByLabel('Question text').fill('Which structure normally contains the sinoatrial node?');
  await expect(create.getByLabel('Answer choices')).toHaveValue('5');

  const choices = [
    ['A', 'Right atrium', 'The SA node is normally located here.'],
    ['B', 'Left atrium', 'This is not the normal SA node location.'],
    ['C', 'Right ventricle', 'The SA node is not ventricular.'],
    ['D', 'Left ventricle', 'The SA node is not ventricular.'],
    ['E', 'Aorta', 'The SA node is not located in the aorta.'],
  ] as const;

  for (const [label, textValue, explanation] of choices) {
    const field = create.locator('label').filter({ hasText: new RegExp(`^Option ${label}`) }).first();
    await field.locator('input').fill(textValue);
    await field.locator('textarea').fill(explanation);
  }

  await create.getByLabel('Correct option').selectOption('0');
  await create.getByRole('button', { name: 'Create question' }).click();

  // POST /questions completes before the five parallel POST /options requests.
  // The product intentionally waits for all option requests before closing the
  // create dialog, so synchronize on that real UI completion boundary instead
  // of observing the mock's intermediate "question exists, options pending"
  // state.
  await expect(create).toBeHidden();
  await expect.poll(
    () => state.questions[0]?.options.length ?? 0,
    { message: 'all five manually authored options are persisted before creation completes' },
  ).toBe(5);

  expect(state.questions).toHaveLength(1);
  expect(state.questions[0].options.map((option) => option.displayOrder)).toEqual([1, 2, 3, 4, 5]);
  expect(state.questions[0].options.map((option) => option.optionText)).toEqual([
    'Right atrium',
    'Left atrium',
    'Right ventricle',
    'Left ventricle',
    'Aorta',
  ]);
  expect(state.questions[0].options.filter((option) => option.isCorrect)).toHaveLength(1);
  expect(state.questions[0].options.find((option) => option.isCorrect)?.optionText).toBe('Right atrium');
});

const attemptId = 'four-five-attempt';
const testId = 'four-five-test';
const q4 = 'four-option-question';
const q5 = 'five-option-question';

async function installMixedStudentAssessmentMock(page: Page) {
  const student = {
    id: 'student-four-five',
    email: 'student@example.test',
    full_name: 'Mixed Option Student',
    role: 'STUDENT',
    status: 'ACTIVE',
    emailVerified: true,
  };

  const q4Options = Array.from({ length: 4 }, (_, index) => ({
    id: `q4-option-${index + 1}`,
    optionText: ['Left atrium', 'Right atrium', 'Left ventricle', 'Right ventricle'][index],
    displayOrder: index + 1,
    isCorrect: index === 0,
    explanation: `A-D rationale ${String.fromCharCode(65 + index)}.`,
  }));
  const q5Options = Array.from({ length: 5 }, (_, index) => ({
    id: `q5-option-${index + 1}`,
    optionText: ['Right atrium', 'Left atrium', 'Right ventricle', 'Left ventricle', 'Aorta'][index],
    displayOrder: index + 1,
    isCorrect: index === 0,
    explanation: `A-E rationale ${String.fromCharCode(65 + index)}.`,
  }));

  const selected = new Map<string, string>();
  let submitted = false;

  const assignments = [
    {
      questionId: q4,
      displayOrder: 1,
      marks: '1.00',
      question: {
        id: q4,
        questionText: 'Which chamber receives oxygenated blood from the pulmonary veins?',
        questionType: 'MCQ',
        explanation: 'Pulmonary venous blood returns to the left atrium.',
        options: q4Options.map(({ isCorrect, explanation, ...option }) => option),
      },
    },
    {
      questionId: q5,
      displayOrder: 2,
      marks: '1.00',
      question: {
        id: q5,
        questionText: 'Which chamber receives systemic venous blood?',
        questionType: 'MCQ',
        explanation: 'The venae cavae drain into the right atrium.',
        options: q5Options.map(({ isCorrect, explanation, ...option }) => option),
      },
    },
  ];

  const review = () => ({
    attempt: {
      id: attemptId,
      status: submitted ? 'SUBMITTED' : 'IN_PROGRESS',
      testMode: 'TIMED',
      test: { title: 'Mixed Four/Five Assessment' },
    },
    questions: [
      {
        questionId: q4,
        question: {
          id: q4,
          questionText: assignments[0].question.questionText,
          questionType: 'MCQ',
          explanation: assignments[0].question.explanation,
          options: q4Options,
        },
        answer: selected.has(q4) ? {
          selectedOptionId: selected.get(q4),
          isCorrect: selected.get(q4) === q4Options.find((option) => option.isCorrect)?.id,
        } : null,
      },
      {
        questionId: q5,
        question: {
          id: q5,
          questionText: assignments[1].question.questionText,
          questionType: 'MCQ',
          explanation: assignments[1].question.explanation,
          options: q5Options,
        },
        answer: selected.has(q5) ? {
          selectedOptionId: selected.get(q5),
          isCorrect: selected.get(q5) === q5Options.find((option) => option.isCorrect)?.id,
        } : null,
      },
    ],
  });

  await primeSession(page);
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const target = endpoint(request.url());
    const isData = request.resourceType() === 'fetch' || request.resourceType() === 'xhr';

    if (!isData || (!url.pathname.includes('/api/v1') && url.port !== '3000')) {
      await route.fallback();
      return;
    }

    const headers = cors(request.headers().origin || frontendOrigin);
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const respond = (body: unknown, status = 200) => route.fulfill({
      status,
      headers,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

    if (target === '/auth/refresh') return respond({ access_token: 'mixed-option-student-token', user: student });
    if (target === '/auth/me') return respond(student);
    if (target === '/notifications/unread/count') return respond({ count: 0 });
    if (target.startsWith('/notifications')) return respond({ data: [] });

    if (target === `/tests/attempts/${attemptId}/workspace-state`) {
      return respond({
        attempt: {
          id: attemptId,
          testId,
          testMode: 'TIMED',
          status: submitted ? 'SUBMITTED' : 'IN_PROGRESS',
          deadline: new Date(Date.now() + 20 * 60_000).toISOString(),
          startedAt: new Date(Date.now() - 60_000).toISOString(),
          test: { title: 'Mixed Four/Five Assessment', durationMinutes: 20, testType: 'CUSTOM' },
        },
        answers: [...selected.entries()].map(([questionId, selectedOptionId]) => ({
          questionId,
          selectedOptionId,
          confidenceLevel: 'HIGH',
        })),
        flagged_question_ids: [],
        hard_question_ids: [],
        notes: [],
      });
    }

    if (target === `/tests/${testId}/questions`) return respond(assignments);

    const answerMatch = target.match(new RegExp(`^/tests/attempts/${attemptId}/answers/(.+)$`));
    if (answerMatch && request.method() === 'PUT') {
      const body = request.postDataJSON() as { selected_option_id: string; confidence_level: string };
      selected.set(answerMatch[1], body.selected_option_id);
      return respond({
        questionId: answerMatch[1],
        selectedOptionId: body.selected_option_id,
        confidenceLevel: body.confidence_level,
      });
    }

    if (target === `/tests/attempts/${attemptId}/submit` && request.method() === 'POST') {
      submitted = true;
      return respond({ id: attemptId, status: 'SUBMITTED' });
    }

    if (target === `/tests/attempts/${attemptId}/review`) return respond(review());

    return respond({});
  });

  return { q4Options, q5Options, selected, isSubmitted: () => submitted };
}

test('student can answer, submit, grade, and review a mixed four/five-option assessment', async ({ page }) => {
  const state = await installMixedStudentAssessmentMock(page);
  page.on('dialog', (dialog) => void dialog.accept());

  await page.goto(`/mock-exam/session?attempt=${attemptId}&test=${testId}&source=assessments`);
  await expect(page.getByText('Mixed Four/Five Assessment')).toBeVisible();

  await expect(page.getByRole('radiogroup', { name: 'Answers for question 1' }).getByRole('radio')).toHaveCount(4);
  await page.getByRole('radiogroup', { name: 'Answers for question 1' }).getByRole('radio').first().click();
  await page.getByRole('button', { name: 'High', exact: true }).click();
  await expect.poll(() => state.selected.get(q4)).toBe(state.q4Options[0].id);

  await page.getByRole('button', { name: /Next question/i }).click();
  await expect(page.getByRole('radiogroup', { name: 'Answers for question 2' }).getByRole('radio')).toHaveCount(5);
  await page.getByRole('radiogroup', { name: 'Answers for question 2' }).getByRole('radio').nth(1).click();
  await page.getByRole('button', { name: 'High', exact: true }).click();
  await expect.poll(() => state.selected.get(q5)).toBe(state.q5Options[1].id);

  await page.getByRole('button', { name: /Submit exam/i }).click();
  await expect.poll(state.isSubmitted).toBe(true);
  await expect(page.getByRole('heading', { name: 'Mixed Four/Five Assessment' })).toBeVisible();

  const reviewItems = page.locator('.review-answer');
  await expect(reviewItems).toHaveCount(2);
  await expect(reviewItems.nth(0)).toContainText('Correct');
  await expect(reviewItems.nth(1)).toContainText('Incorrect');

  const fourReview = reviewItems.nth(0);
  const fiveReview = reviewItems.nth(1);
  await expect(fourReview.getByText('Review all 4 options')).toBeVisible();
  await expect(fiveReview.getByText('Review all 5 options')).toBeVisible();

  await fourReview.getByText('Review all 4 options').click();
  await fiveReview.getByText('Review all 5 options').click();
  await expect(fourReview.locator('.tutor-option-review-row')).toHaveCount(4);
  await expect(fiveReview.locator('.tutor-option-review-row')).toHaveCount(5);
  await expect(fourReview.locator('.tutor-option-review-list')).not.toContainText('A-D rationale E');
  await expect(fiveReview.locator('.tutor-option-review-list')).toContainText('A-E rationale E.');
});
