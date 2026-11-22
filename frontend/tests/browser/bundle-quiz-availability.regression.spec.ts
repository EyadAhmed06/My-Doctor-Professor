import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';
const bundleId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const courseId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const lectureId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const openTopicId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const lockedTopicId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const lockedLectureId = '11111111-1111-4111-8111-111111111111';
const pendingBundleId = '22222222-2222-4222-8222-222222222222';
const student = { id: 'student-1', email: 'student@example.test', full_name: 'Quiz Availability Student', role: 'STUDENT', status: 'ACTIVE', emailVerified: true };

function apiEndpoint(requestUrl: string) {
  const pathname = new URL(requestUrl).pathname;
  const marker = '/api/v1';
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) || '/' : pathname;
}

async function mockBundle(page: Page, mcqCount: number, mixedAccess = false) {
  await page.addInitScript(() => {
    localStorage.removeItem('mdp_access_token');
    sessionStorage.removeItem('mdp_access_token');
    localStorage.removeItem('mdp_logged_out_at');
    localStorage.setItem('mdp-theme', 'light');
    localStorage.setItem('mdp-locale', 'en');
  });

  await page.route('**/*', async (route) => {
    const request = route.request();
    const resourceType = request.resourceType();
    if (resourceType !== 'fetch' && resourceType !== 'xhr') return route.fallback();
    const endpoint = apiEndpoint(request.url());
    const headers = {
      'access-control-allow-origin': frontendOrigin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const respond = (body: unknown, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });

    if (endpoint === '/auth/refresh') return respond({ access_token: 'bundle-quiz-test-token', user: student });
    if (endpoint === '/auth/me') return respond(student);
    if (endpoint === '/notifications/unread/count') return respond({ count: 0 });
    if (endpoint === '/catalog/bundles') return respond([]);
    if (endpoint === '/bundles/mine') return respond([
      ...(mixedAccess ? [{ id: pendingBundleId, title: 'Pending bundle', accessible: false }] : []),
      {
      id: bundleId,
      title: 'Clinical Foundations',
      slug: 'clinical-foundations',
      description: 'Test bundle',
      academicYear: 3,
      status: 'PUBLISHED',
      isFree: true,
      priceAmount: null,
      priceCurrency: 'EGP',
      accessible: true,
      read_only: false,
    }]);
    if (endpoint === `/bundles/${bundleId}/content`) return respond({
      bundle: {
        id: bundleId,
        title: 'Clinical Foundations',
        slug: 'clinical-foundations',
        description: 'Test bundle',
        academicYear: 3,
        status: 'PUBLISHED',
        isFree: true,
        priceAmount: null,
        priceCurrency: 'EGP',
        accessible: true,
        read_only: false,
      },
      courses: [{
        id: courseId,
        courseCode: 'CVS-301',
        courseName: 'Cardiovascular Medicine',
        weeks: [{
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          weekNumber: 1,
          title: 'Foundations',
          lectures: [{
            id: lectureId,
            title: 'Cardiac anatomy',
            lectureNumber: 1,
            question_count: mcqCount,
            mcq_count: mcqCount,
            topics: mixedAccess ? [
              { id: openTopicId, topicName: 'Open section', mcq_count: mcqCount },
              { id: lockedTopicId, topicName: 'Locked section', mcq_count: 0, isLocked: true },
            ] : undefined,
            flashcard_deck_count: 0,
            resource_count: 1,
          }, ...(mixedAccess ? [{
            id: lockedLectureId,
            title: 'Locked lecture',
            lectureNumber: 2,
            isLocked: true,
            question_count: 0,
            mcq_count: 0,
          }] : [])],
        }],
        locked_weeks: mixedAccess ? [{ week_number: 2 }] : [],
      }],
      past_exams: [],
      totals: { courses: 1, weeks: 1, lectures: 1, questions: mcqCount, flashcard_decks: 0, resources: 1, past_exams: 0 },
    });
    if (endpoint === '/tests/practice/generate') {
      return respond({ test: { id: 'test-1' }, attempt: { id: 'attempt-1' }, question_count: mcqCount });
    }
    if (mixedAccess && endpoint === '/mcq-practice/catalog') {
      return respond({ course: { id: courseId }, weeks: [{
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        weekNumber: 1,
        title: 'Foundations',
        isLocked: true,
        lectures: [],
      }] });
    }
    return respond({});
  });
}

test('curriculum allows a quiz with fewer than 40 eligible MCQs', async ({ page }) => {
  await mockBundle(page, 39);
  await page.goto('/bundles?bundle=clinical-foundations&tab=curriculum');
  await expect(page.getByRole('heading', { name: 'Clinical Foundations' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Select lectures for quiz' })).toBeVisible();
});

test('curriculum exposes quiz selection when the course has forty eligible MCQs', async ({ page }) => {
  await mockBundle(page, 40);
  await page.goto('/bundles?bundle=clinical-foundations&tab=curriculum');
  const link = page.getByRole('link', { name: 'Select lectures for quiz' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', `/rounds?bundle=${bundleId}&course=${courseId}`);
});

test('question-bank lecture entry remains available for a small eligible MCQ pool', async ({ page }) => {
  await mockBundle(page, 1);
  await page.goto('/bundles?bundle=clinical-foundations&tab=questions');
  await expect(page.getByRole('heading', { name: 'Bundle Question Bank' })).toBeVisible();
  await expect(page.locator(`a[href*="lecture=${lectureId}"]`)).toBeVisible();
});

test('Questions uses the same bundle access as the bundle Question Bank', async ({ page }) => {
  await mockBundle(page, 3, true);
  await page.goto('/bundles?bundle=clinical-foundations&tab=questions');
  await expect(page.getByRole('heading', { name: 'Bundle Question Bank' })).toBeVisible();
  await expect(page.locator(`a[href*="lecture=${lectureId}"]`)).toBeVisible();
  await expect(page.locator(`a[href*="lecture=${lockedLectureId}"]`)).toHaveCount(0);

  await page.getByRole('link', { name: 'Questions', exact: true }).first().click();
  await expect(page.getByRole('combobox', { name: 'Bundle' })).toHaveValue(bundleId);
  const openWeek = page.locator('details').filter({ hasText: 'Foundations' });
  await openWeek.locator('summary').click();
  await expect(openWeek.getByRole('checkbox', { name: /Cardiac anatomy/ })).toBeEnabled();
  await expect(openWeek.getByRole('checkbox', { name: /Locked lecture/ })).toBeDisabled();
  await expect(openWeek.getByRole('checkbox', { name: /Locked section/ })).toBeDisabled();
  await openWeek.getByRole('checkbox', { name: 'Select all in this week' }).check();

  const lockedWeek = page.locator('details').filter({ hasText: 'Week 2' });
  await expect(lockedWeek.locator('summary')).toContainText('Locked');
  await lockedWeek.locator('summary').click();
  await expect(lockedWeek.getByRole('checkbox', { name: 'Select all in this week' })).toBeDisabled();

  const submitted = page.waitForRequest(request =>
    apiEndpoint(request.url()) === '/tests/practice/generate' && request.method() === 'POST',
  );
  await page.getByRole('button', { name: 'Generate practice quiz' }).click();
  expect((await submitted).postDataJSON()).toMatchObject({
    bundle_id: bundleId,
    lecture_ids: [lectureId],
    topic_ids: [openTopicId],
    question_count: 3,
  });
  await expect(page).toHaveURL(/mock-exam\/session\?attempt=attempt-1&test=test-1/);
});
