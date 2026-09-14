import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';

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
    localStorage.setItem('mdp_access_token', 'question-import-test-access');
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
      'access-control-allow-origin': frontendOrigin,
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
    inspector_contract_version: 5,
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

async function openInspection(page: Page) {
  const user = await authenticatedInstructor(page);
  await routeApi(page, async (path, method) => {
    if (path === '/auth/me') return { body: user };
    if (path === '/notifications/unread/count') return { body: { count: 0 } };
    if (path === '/notifications') return { body: { data: [] } };
    if (path === '/academic/courses') return { body: { data: [{ id: course.id, courseCode: course.courseCode, courseName: course.courseName }] } };
    if (path === `/academic/courses/${course.id}`) return { body: course };
    if (path === '/questions/imports/inspect' && method === 'POST') return { body: inspectionBody() };
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
        'access-control-allow-origin': frontendOrigin,
        'access-control-allow-credentials': 'true',
      },
      contentType: 'application/json',
      body: JSON.stringify({ created: 1, reused: 0, skipped: 0 }),
    });
  });

  await expect(page.getByText('96%').first()).toBeVisible();
  await expect(page.locator('input[value="Left atrium"]')).toBeVisible();
  await expect(page.locator('input[value="Aorta"]')).toBeVisible();
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
