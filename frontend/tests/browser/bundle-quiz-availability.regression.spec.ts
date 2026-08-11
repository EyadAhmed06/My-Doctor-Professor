import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';
const bundleId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const courseId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const lectureId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function apiEndpoint(requestUrl: string) {
  const pathname = new URL(requestUrl).pathname;
  const marker = '/api/v1';
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) || '/' : pathname;
}

async function mockBundle(page: Page, mcqCount: number) {
  await page.addInitScript(() => {
    localStorage.setItem('mdp_access_token', 'bundle-quiz-test-token');
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

    if (endpoint === '/auth/me') return respond({ id: 'student-1', email: 'student@example.test', full_name: 'Quiz Availability Student', role: 'STUDENT', status: 'ACTIVE', emailVerified: true });
    if (endpoint === '/notifications/unread/count') return respond({ count: 0 });
    if (endpoint === '/catalog/bundles') return respond([]);
    if (endpoint === '/bundles/mine') return respond([{
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
            flashcard_deck_count: 0,
            resource_count: 1,
          }],
        }],
      }],
      past_exams: [],
      totals: { courses: 1, weeks: 1, lectures: 1, questions: mcqCount, flashcard_decks: 0, resources: 1, past_exams: 0 },
    });
    return respond({});
  });
}

test('curriculum hides the 40-MCQ quiz entry when no single course has forty eligible MCQs', async ({ page }) => {
  await mockBundle(page, 39);
  await page.goto('/bundles?bundle=clinical-foundations&tab=curriculum');
  await expect(page.getByRole('heading', { name: 'Clinical Foundations' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Select lectures for 40-MCQ quiz' })).toHaveCount(0);
});

test('curriculum exposes the 40-MCQ quiz entry only after the server reports a forty-MCQ course pool', async ({ page }) => {
  await mockBundle(page, 40);
  await page.goto('/bundles?bundle=clinical-foundations&tab=curriculum');
  const link = page.getByRole('link', { name: 'Select lectures for 40-MCQ quiz' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', `/rounds?bundle=${bundleId}`);
});
