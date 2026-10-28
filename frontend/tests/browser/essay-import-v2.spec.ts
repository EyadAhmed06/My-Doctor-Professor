import { expect, test } from '@playwright/test';

test('essay importer reviews mixed cases and lectures without requiring course before inspection', async ({ page }) => {
  const user = { id: '11111111-1111-4111-8111-111111111111',
    email: 'teacher@example.test', full_name: 'Test Instructor', role: 'INSTRUCTOR',
    status: 'ACTIVE', emailVerified: true };
  await page.addInitScript(() => {
    localStorage.removeItem('mdp_access_token');
    sessionStorage.removeItem('mdp_access_token');
    localStorage.removeItem('mdp_logged_out_at');
    localStorage.setItem('mdp-theme', 'dark');
    localStorage.setItem('mdp-locale', 'en');
  });
  let publishPayload: unknown = null;
  const candidates = Array.from({ length: 45 }, (_, index) => {
    const isCase = index < 6;
    return {
      candidate_id: `candidate-${index}`,
      section: isCase ? 'Essay collection' : 'Lecture 901: Protein chemistry',
      block_type: isCase ? 'CASE' : 'LECTURE',
      case_number: isCase ? 1 : 901,
      case_label: isCase ? 'Case 1' : 'Protein chemistry',
      case_stem: isCase ? 'A patient presents with fever.' : 'Protein chemistry',
      question_number: isCase ? index + 1 : index - 5,
      question_text: `Question ${index + 1}: Mention three findings.`,
      model_answer: '• First item\\n• Second item',
      answer_origin: 'SOURCE',
      source_page: 3, answer_page: 4,
      extraction_confidence: 1, status: 'VALID', issues: [],
    };
  });
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (!url.pathname.includes('/api/v1') && url.port !== '3000') return route.fallback();
    const path = url.pathname.split('/api/v1')[1] || url.pathname;
    const headers = { 'access-control-allow-origin': request.headers().origin || 'http://127.0.0.1:3001',
      'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    let body: unknown = {};
    if (path === '/auth/refresh') body = { access_token: 'essay-v2-test-token', user };
    if (path === '/auth/me') body = user;
    if (path === '/notifications/unread/count') body = { count: 0 };
    if (path === '/notifications') body = { data: [] };
    if (path.startsWith('/academic/courses')) body = { data: [] };
    if (path === '/questions/imports/essay/inspect') body = {
      original_filename: 'mixed.pdf', file_sha256: 'a'.repeat(64), file_size: 100,
      page_count: 5, status: 'REVIEW_REQUIRED', issues: [],
      summary: { cases: 1, lectures: 1, extracted: 45, valid: 45, needs_review: 0, invalid: 0 },
      candidates,
    };
    if (path === '/questions/imports/essay/publish') {
      publishPayload = request.postDataJSON();
      body = { created: 45, reused: 0, skipped: 0 };
    }
    await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
  });
  page.on('dialog', dialog => void dialog.accept());
  await page.goto('/instructor/questions/import-essay');
  await expect(page.getByRole('heading', { name: 'Import Essay Questions' })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'mixed.pdf', mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\\n%%EOF'),
  });
  await page.getByText(/I confirm I have permission/).click();
  await page.getByRole('button', { name: /Inspect essay file/i }).click();
  await expect(page.getByText(/45 questions available/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Scroll through essay questions' })).toHaveCount(2);
  await expect(page.locator('.essay-import-question').count()).resolves.toBeLessThan(45);
  await expect(page.getByRole('option', { name: /Protein chemistry/ })).toHaveCount(1);
  const firstQuestion = page.getByRole('textbox', { name: 'Essay question Q1' });
  await firstQuestion.fill('Edited essay prompt for Q1.');
  await expect(firstQuestion).toHaveValue('Edited essay prompt for Q1.');
  await page.getByRole('button', { name: 'Undo review edit' }).click();
  await expect(firstQuestion).toHaveValue('Question 1: Mention three findings.');
  await page.getByRole('button', { name: 'Redo review edit' }).click();
  await expect(firstQuestion).toHaveValue('Edited essay prompt for Q1.');
  await page.getByRole('button', { name: /Collapse all/ }).click();
  await expect(page.locator('.essay-import-question')).toHaveCount(0);
  await page.getByRole('button', { name: /Expand all/ }).click();
  await page.getByLabel('Jump to a case or lecture').selectOption({ label: 'Lecture 901: Protein chemistry' });
  await expect(page.locator('.essay-import-groups')).toContainText('Protein chemistry');
  const lectureViewport = page.getByRole('region', { name: 'Scroll through essay questions' });
  await lectureViewport.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(page.getByRole('textbox', { name: 'Essay question Q39' })).toBeVisible();
  await expect(page.locator('.essay-import-question').count()).resolves.toBeLessThan(39);

  await page.getByRole('button', { name: /Continue to organize/ }).click();
  await page.getByRole('button', { name: /Review publication summary/ }).click();
  await page.getByRole('button', { name: /Case Studio · Clinical cases/ }).click();
  await expect(page.getByText(/Assign a Case Studio week/)).toBeVisible();
  await page.getByRole('button', { name: /Question Bank · Essays/ }).click();
  await expect(page.getByText(/Assign a Question Bank topic/)).toBeVisible();
  expect(publishPayload).toBeNull();
});
