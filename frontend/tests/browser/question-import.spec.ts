import { expect, Page, test } from '@playwright/test';

function endpoint(url: string) {
  const path = new URL(url).pathname;
  const marker = '/api/v1';
  const index = path.indexOf(marker);
  return index >= 0 ? path.slice(index + marker.length) || '/' : path;
}

async function authenticatedInstructor(page: Page) {
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'instructor@example.test',
    full_name: 'Dr Test Instructor',
    role: 'INSTRUCTOR',
    status: 'ACTIVE',
    emailVerified: true,
  };
  await page.addInitScript(() => {
    localStorage.removeItem('mdp_access_token');
    sessionStorage.removeItem('mdp_access_token');
    localStorage.removeItem('mdp_logged_out_at');
    localStorage.setItem('mdp-theme', 'dark');
    localStorage.setItem('mdp-locale', 'en');
  });
  return user;
}

async function routeApi(
  page: Page,
  handler: (
    path: string,
    method: string,
  ) => Promise<{ status?: number; body?: unknown } | null> | { status?: number; body?: unknown } | null,
) {
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const isApi = url.pathname.includes('/api/v1') || url.port === '3000';
    if (!isApi) return route.fallback();
    const headers = {
      'access-control-allow-origin': request.headers().origin || 'http://127.0.0.1:3001',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'cache-control': 'no-store',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const result = await handler(endpoint(request.url()), request.method());
    return route.fulfill({
      status: result?.status ?? 200,
      headers,
      contentType: 'application/json',
      body: JSON.stringify(result?.body ?? {}),
    });
  });
}

const course = {
  id: '20000000-0000-4000-8000-000000000001',
  courseCode: 'CVS-301',
  courseName: 'Cardiovascular Medicine',
  weeks: [{
    id: '40000000-0000-4000-8000-000000000001',
    weekNumber: 1,
    title: 'Cardiovascular Foundations',
    lectures: [{
      id: '50000000-0000-4000-8000-000000000001',
      lectureNumber: 1,
      title: 'Cardiac anatomy and circulation',
      topics: [{ id: '60000000-0000-4000-8000-000000000001', topicName: 'Cardiac anatomy and circulation' }],
    }],
  }],
};

function inspectionBody() {
  return {
    original_filename: 'cardiac-questions.pdf',
    file_sha256: 'a'.repeat(64),
    file_size: 2048,
    page_count: 2,
    extraction_method: 'TEXT_LAYER',
    extraction_confidence: 0.96,
    status: 'REVIEW_REQUIRED',
    inspector_contract_version: 7,
    enrichment_contract: 'QUESTION_AND_OPTION_EXPLANATIONS_V1',
    previously_published_from_same_file: 0,
    topic: { id: '60000000-0000-4000-8000-000000000001', name: 'Cardiac anatomy and circulation' },
    summary: { extracted: 1, valid: 1, needs_review: 0, invalid: 0, duplicates: 0 },
    issues: [],
    candidates: [{
      candidate_id: 'candidate-1',
      question_number: 1,
      source_page: 1,
      question_text: 'Which chamber receives oxygenated blood directly from the pulmonary veins?',
      options: [
        { label: 'A', option_text: 'Right atrium', is_correct: false, explanation: 'The right atrium receives systemic venous blood.' },
        { label: 'B', option_text: 'Left atrium', is_correct: true, explanation: 'Pulmonary veins drain oxygenated blood into the left atrium.' },
        { label: 'C', option_text: 'Right ventricle', is_correct: false, explanation: 'The right ventricle receives blood from the right atrium.' },
        { label: 'D', option_text: 'Left ventricle', is_correct: false, explanation: 'The left ventricle receives blood from the left atrium.' },
        { label: 'E', option_text: 'Aorta', is_correct: false, explanation: 'The aorta carries blood away from the left ventricle.' },
      ],
      explanation: 'Pulmonary veins return oxygenated blood to the left atrium.',
      difficulty: 'MEDIUM',
      marks: 1,
      extraction_confidence: 0.96,
      topic_confidence: 0.42,
      status: 'VALID',
      issues: [],
      duplicate: null,
      ai_enrichment: { status: 'GENERATED', model: 'Muse Spark 1.3', confidence: 0.93 },
    }],
  };
}

async function openInspection(page: Page, inspection = inspectionBody()) {
  const user = await authenticatedInstructor(page);
  await routeApi(page, async (path, method) => {
    if (path === '/auth/refresh') return { body: { access_token: 'question-import-test-access', user } };
    if (path === '/auth/me') return { body: user };
    if (path === '/notifications/unread/count') return { body: { count: 0 } };
    if (path === '/notifications') return { body: { data: [] } };
    if (path === '/academic/courses') return { body: { data: [{ id: course.id, courseCode: course.courseCode, courseName: course.courseName }] } };
    if (path === `/academic/courses/${course.id}`) return { body: course };
    if (path === '/questions/imports/inspect' && method === 'POST') return { body: inspection };
    return null;
  });

  await page.goto('/instructor/questions/import');
  await expect(page.getByRole('heading', { name: 'PDF Question Inspector' })).toBeVisible();
  await page.getByLabel('Course').selectOption(course.id);
  await page.getByLabel('Destination topic').selectOption('60000000-0000-4000-8000-000000000001');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'cardiac-questions.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n%%EOF'),
  });
  await page.getByText(/I confirm I have permission/i).click();
  await page.getByRole('button', { name: /Inspect PDF/i }).click();
  await expect(page.getByText('Question 1').first()).toBeVisible();
}

test('instructor inspects a five-option PDF candidate and publishes an approved question', async ({ page }) => {
  let publishBody: Record<string, unknown> | null = null;
  await openInspection(page);

  await page.route('**/api/v1/questions/imports/publish', async route => {
    publishBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      headers: {
        'access-control-allow-origin': route.request().headers().origin || 'http://127.0.0.1:3001',
        'access-control-allow-credentials': 'true',
      },
      contentType: 'application/json',
      body: JSON.stringify({ created: 1, reused: 0, skipped: 0 }),
    });
  });

  await expect(page.getByText('96%').first()).toBeVisible();
  await expect(page.locator('input[value="Left atrium"]')).toBeVisible();
  await expect(page.locator('input[value="Aorta"]')).toBeVisible();
  const explanationEditors = page.locator('.question-import-option-explanation');
  await expect(explanationEditors).toHaveCount(5);
  const explanationWidthRatios = await explanationEditors.evaluateAll((editors) => editors.map((editor) => {
    const textarea = editor.querySelector('textarea');
    return textarea ? textarea.clientWidth / editor.clientWidth : 0;
  }));
  expect(explanationWidthRatios.every((ratio) => ratio >= 0.9)).toBe(true);

  await expect(page.locator('.question-import-review-heading')).toContainText('0');

  await page.getByRole('button', { name: /Approve all ready/i }).first().click();
  await expect(page.locator('.question-import-review-heading')).toContainText('1');
  await page.getByRole('button', { name: /Publish approved/i }).click();

  await expect.poll(() => publishBody).not.toBeNull();
  const body = publishBody as { topic_id?: string; candidates?: Array<{ approved?: boolean; options?: Array<{ is_correct?: boolean }> }> };
  expect(body.topic_id).toBe('60000000-0000-4000-8000-000000000001');
  expect(body.candidates?.[0]?.approved).toBe(true);
  expect(body.candidates?.[0]?.options).toHaveLength(5);
  expect(body.candidates?.[0]?.options?.filter(option => option.is_correct)).toHaveLength(1);
});

test('inspector lets an instructor repair missing or extra answer choices before publication', async ({ page }) => {
  const source = inspectionBody();
  source.candidates[0].options = source.candidates[0].options.slice(0, 2);
  source.candidates[0].status = 'INVALID';
  source.summary = { extracted: 1, valid: 0, needs_review: 0, invalid: 1, duplicates: 0 };

  await openInspection(page, source);

  await expect(page.locator('.question-import-option-row')).toHaveCount(2);
  await expect(page.getByText(/currently 2/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add choice' })).toBeEnabled();

  await page.getByRole('button', { name: 'Add choice' }).click();
  await page.getByRole('button', { name: 'Add choice' }).click();
  await page.getByRole('button', { name: 'Add choice' }).click();

  await expect(page.locator('.question-import-option-row')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Add choice' })).toBeDisabled();

  await page.getByRole('button', { name: 'Remove choice E' }).click();
  await expect(page.locator('.question-import-option-row')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Add choice' })).toBeEnabled();
});

test('bulk confirmation approves the intent of every four-choice MCQ at once', async ({ page }) => {
  const source = inspectionBody();
  const template = source.candidates[0];
  source.candidates = Array.from({ length: 3 }, (_, index) => ({
    ...template,
    candidate_id: `candidate-four-${index + 1}`,
    question_number: index + 1,
    question_text: `Four-choice cardiac question ${index + 1} with sufficient stem text?`,
    options: template.options.slice(0, 4).map((option) => ({ ...option })),
    status: 'NEEDS_REVIEW' as const,
    issues: [{
      code: 'FOUR_OPTION_MCQ',
      severity: 'WARNING' as const,
      message: 'This MCQ contains four answer choices (A-D).',
    }],
    ai_enrichment: { ...template.ai_enrichment },
  }));
  source.summary = { extracted: 3, valid: 0, needs_review: 3, invalid: 0, duplicates: 0 };

  let publishBody: {
    candidates?: Array<{
      approved?: boolean;
      allow_four_options?: boolean;
      options?: Array<{ is_correct?: boolean }>;
    }>;
  } | null = null;

  await openInspection(page, source);
  await page.route('**/api/v1/questions/imports/publish', async route => {
    publishBody = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      headers: {
        'access-control-allow-origin': route.request().headers().origin || 'http://127.0.0.1:3001',
        'access-control-allow-credentials': 'true',
      },
      contentType: 'application/json',
      body: JSON.stringify({ created: 3, reused: 0, skipped: 0 }),
    });
  });

  const confirmations = page.locator('.question-import-confirm').filter({
    hasText: 'intentionally has four answer choices',
  }).locator('input[type="checkbox"]');
  await expect(confirmations).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    await expect(confirmations.nth(index)).not.toBeChecked();
  }

  const confirmAll = page.getByRole('button', { name: /Confirm all 4-choice MCQs \(3\)/i });
  await expect(confirmAll).toBeEnabled();
  await confirmAll.click();

  for (let index = 0; index < 3; index += 1) {
    await expect(confirmations.nth(index)).toBeChecked();
  }
  await expect(page.getByRole('button', { name: /All 4-choice MCQs confirmed \(3\)/i })).toBeDisabled();

  await page.getByRole('button', { name: /Approve all ready/i }).first().click();
  await page.getByRole('button', { name: /Publish approved \(3\)/i }).click();

  await expect.poll(() => publishBody).not.toBeNull();
  expect(publishBody?.candidates).toHaveLength(3);
  expect(publishBody?.candidates?.every((candidate) =>
    candidate.approved
    && candidate.allow_four_options
    && candidate.options?.length === 4
    && candidate.options.filter((option) => option.is_correct).length === 1
  )).toBe(true);
});

test('incomplete structural extraction is visible and blocks bulk approval', async ({ page }) => {
  const source = inspectionBody();
  source.extraction_method = 'HYBRID_OCR';
  Object.assign(source.summary, {
    expected: 3,
    missing: 2,
    structurally_complete: false,
  });
  Object.assign(source, {
    extraction_breakdown: { text_layer_pages: 1, ocr_pages: 1, empty_pages: 0 },
    pages: [{
      page: 1,
      source: 'OCR',
      confidence: 0.88,
      text_length: 420,
      ocr_attempted: true,
      layout_reflowed: true,
    }],
    sections: [{
      title: 'Cardiac anatomy',
      questions: 1,
      expected_questions: 3,
      missing_question_numbers: [2, 3],
      unexpected_question_numbers: [],
      duplicate_question_numbers: [],
      answer_key_conflicts: [],
      completeness: 1 / 3,
    }],
    issues: [{
      code: 'SECTION_QUESTIONS_MISSING',
      severity: 'ERROR',
      message: 'Cardiac anatomy: answer key expects 3 question(s), but 1 was parsed.',
    }],
  });

  await openInspection(page, source);

  await expect(page.getByText('HYBRID OCR')).toBeVisible();
  await expect(page.getByText('1 / 3').first()).toBeVisible();
  await expect(page.getByText(/Missing: 2, 3/)).toBeVisible();
  await expect(page.getByText(/Page 1 · OCR · 88%/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Approve all ready/i }).first()).toBeDisabled();
  await expect(page.getByRole('button', { name: /Generate missing explanations/i })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Regenerate explanation/i })).toBeDisabled();
});

test('manual explanation UI enforces 220 characters and blocks more than two sentences', async ({ page }) => {
  await openInspection(page);

  const takeaway = page.getByLabel(/Question-level takeaway/i);
  await expect(takeaway).toHaveAttribute('maxlength', '220');
  await expect(page.getByText(/\/220$/).last()).toBeVisible();

  await takeaway.fill('First sentence. Second sentence. Third sentence.');

  await expect(page.getByText('Question explanation must be at most 2 sentences and 220 characters.')).toBeVisible();
  await expect(page.getByText('INVALID', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Approve for publication')).toBeDisabled();
});


test('AI generation explains a stale backend 404 instead of showing a generic 404', async ({ page }) => {
  await openInspection(page);

  await page.route('**/api/v1/questions/imports/enrich', async route => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        statusCode: 404,
        message: 'Cannot POST /api/v1/questions/imports/enrich',
        error: 'Not Found',
      }),
    });
  });

  await page.getByRole('button', { name: 'Regenerate explanation' }).click();

  await expect(page.getByText(/frontend and backend are on different builds/i)).toBeVisible();
  await expect(page.getByText(/deploy\/restart the backend from the same branch/i)).toBeVisible();
});

test('AI candidate failures are reported as failures instead of a false success', async ({ page }) => {
  await openInspection(page);

  await page.route('**/api/v1/questions/imports/enrich', async route => {
    const failed = inspectionBody().candidates[0];
    await route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': route.request().headers().origin || 'http://127.0.0.1:3001',
        'access-control-allow-credentials': 'true',
      },
      contentType: 'application/json',
      body: JSON.stringify({
        enrichment_contract: 'QUESTION_AND_OPTION_EXPLANATIONS_V1',
        issues: [{ code: 'AI_ENRICHMENT_PARTIAL', severity: 'WARNING', message: '0 generated · 1 failed.' }],
        candidates: [{
          ...failed,
          explanation: null,
          options: failed.options.map(option => ({ ...option, explanation: null })),
          ai_enrichment: { ...failed.ai_enrichment, status: 'FAILED' },
          issues: [{
            code: 'AI_ENRICHMENT_FAILED',
            severity: 'WARNING',
            message: 'OpenRouter request failed (401).',
          }],
        }],
      }),
    });
  });

  await page.getByRole('button', { name: 'Regenerate explanation' }).click();

  await expect(page.getByText('Explanation generation failed')).toBeVisible();
  await expect(page.getByText(/0 generated · 1 question\(s\) failed/)).toBeVisible();
  await expect(page.getByText('Explanations ready for review')).toHaveCount(0);
});

test('billing exhaustion stops later enrichment batches and reports deferred questions', async ({ page }) => {
  const source = inspectionBody();
  const template = source.candidates[0];
  source.candidates = Array.from({ length: 12 }, (_, index) => ({
    ...template,
    candidate_id: `candidate-${index + 1}`,
    question_number: index + 1,
    question_text: `Which chamber receives oxygenated blood in scenario ${index + 1}?`,
    explanation: null,
    options: template.options.map((option) => ({ ...option, explanation: null })),
    ai_enrichment: null,
  }));
  source.summary = { extracted: 12, valid: 12, needs_review: 0, invalid: 0, duplicates: 0 };
  await openInspection(page, source);

  let enrichCalls = 0;
  await page.route('**/api/v1/questions/imports/enrich', async route => {
    enrichCalls += 1;
    const request = route.request().postDataJSON() as { candidates: typeof source.candidates };
    const candidates = request.candidates.map((candidate, index) => index === 0 ? {
      ...candidate,
      explanation: 'Pulmonary veins return oxygenated blood to the left atrium.',
      options: candidate.options.map((option) => ({ ...option, explanation: `${option.label} rationale.` })),
      status: 'VALID',
      issues: [],
      ai_enrichment: { status: 'GENERATED', model: 'meta/muse-spark-1.3' },
    } : {
      ...candidate,
      status: 'NEEDS_REVIEW',
      issues: [{
        code: 'AI_ENRICHMENT_DEFERRED_BILLING',
        severity: 'WARNING',
        message: 'OpenRouter has insufficient usable credit; add credits before retrying.',
      }],
      ai_enrichment: { status: 'DEFERRED_BILLING' },
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        enrichment_contract: 'QUESTION_AND_OPTION_EXPLANATIONS_V1',
        candidates,
        issues: [{ code: 'AI_ENRICHMENT_BILLING_DEFERRED', severity: 'WARNING', message: '1 generated · 9 deferred.' }],
        enrichment_summary: { generated: 1, cached: 0, failed: 0, billing_deferred: 9 },
      }),
    });
  });

  await page.getByRole('button', { name: /Generate missing explanations/i }).click();

  await expect.poll(() => enrichCalls).toBe(1);
  await expect(page.getByText(/1 generated · 0 reused · 11 deferred/)).toBeVisible();
  await expect(page.getByText('AI DEFERRED BILLING')).toHaveCount(11);
});


test('mobile review mounts only one full MCQ editor for a large inspected PDF', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const source = inspectionBody();
  const template = source.candidates[0];
  source.candidates = Array.from({ length: 80 }, (_, index) => ({
    ...template,
    candidate_id: `candidate-mobile-${index + 1}`,
    question_number: index + 1,
    question_text: `Which chamber receives oxygenated blood in mobile scenario ${index + 1}?`,
    options: template.options.map((option) => ({ ...option })),
  }));
  source.summary = { extracted: 80, valid: 80, needs_review: 0, invalid: 0, duplicates: 0 };

  await openInspection(page, source);

  await expect(page.locator('.question-import-mobile-list > button')).toHaveCount(80);
  await expect(page.locator('.question-import-candidate')).toHaveCount(1);
  await expect(page.locator('.question-import-option-row')).toHaveCount(5);
  await expect(page.locator('.question-import-candidate')).toContainText('Question 1');

  await page.locator('.question-import-mobile-list > button').nth(39).click();

  await expect(page.locator('.question-import-candidate')).toHaveCount(1);
  await expect(page.locator('.question-import-candidate')).toContainText('Question 40');
  await expect(page.locator('.question-import-option-row')).toHaveCount(5);
  await expect(page.locator('.question-import-mobile-nav')).toContainText('40 / 80');
});
