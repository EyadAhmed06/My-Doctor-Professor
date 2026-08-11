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

async function routeApi(page: Page, handler: (path: string, method: string) => Promise<{ status?: number; body?: unknown } | null> | { status?: number; body?: unknown } | null) {
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

test('instructor inspects a real PDF candidate queue, reviews it, and publishes approved questions', async ({ page }) => {
  const user = await authenticatedInstructor(page);
  let publishBody: Record<string, unknown> | null = null;
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

  await routeApi(page, async (path, method) => {
    if (path === '/auth/me') return { body: user };
    if (path === '/notifications/unread/count') return { body: { count: 0 } };
    if (path === '/notifications') return { body: { data: [] } };
    if (path === '/academic/courses') return { body: { data: [{ id: course.id, courseCode: course.courseCode, courseName: course.courseName }] } };
    if (path === `/academic/courses/${course.id}`) return { body: course };
    if (path === '/questions/imports/inspect' && method === 'POST') return { body: {
      original_filename: 'cardiac-questions.pdf',
      file_sha256: 'a'.repeat(64),
      file_size: 2048,
      page_count: 2,
      extraction_method: 'TEXT_LAYER',
      extraction_confidence: 0.96,
      status: 'REVIEW_REQUIRED',
      previously_published_from_same_file: 0,
      topic: { id: '60000000-0000-4000-8000-000000000001', name: 'Cardiac anatomy and circulation' },
      summary: { extracted: 1, valid: 1, needs_review: 0, invalid: 0, duplicates: 0 },
      issues: [],
      candidates: [{
        candidate_id: 'candidate-1',
        source_page: 1,
        question_text: 'Which chamber receives oxygenated blood directly from the pulmonary veins?',
        options: [
          { label: 'A', option_text: 'Right atrium', is_correct: false },
          { label: 'B', option_text: 'Left atrium', is_correct: true },
          { label: 'C', option_text: 'Right ventricle', is_correct: false },
          { label: 'D', option_text: 'Left ventricle', is_correct: false },
        ],
        explanation: 'Pulmonary veins return oxygenated blood to the left atrium.',
        difficulty: 'MEDIUM',
        marks: 1,
        extraction_confidence: 0.96,
        topic_confidence: 0.42,
        status: 'VALID',
        issues: [],
        duplicate: null,
      }],
    } };
    return null;
  });

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

  await expect(page.getByText('Candidate 1').first()).toBeVisible();
  await expect(page.getByText('96%').first()).toBeVisible();
  await expect(page.getByDisplayValue('Left atrium')).toBeVisible();
  await expect(page.locator('.question-import-review-heading')).toContainText('1');
  await expect(page.locator('.question-import-review-heading')).toContainText('approved');

  await page.getByRole('button', { name: /Publish approved/i }).click();
  await expect.poll(() => publishBody).not.toBeNull();
  const body = publishBody as { topic_id?: string; candidates?: Array<{ approved?: boolean; options?: Array<{ is_correct?: boolean }> }> };
  expect(body.topic_id).toBe('60000000-0000-4000-8000-000000000001');
  expect(body.candidates?.[0]?.approved).toBe(true);
  expect(body.candidates?.[0]?.options?.filter(option => option.is_correct)).toHaveLength(1);
});
