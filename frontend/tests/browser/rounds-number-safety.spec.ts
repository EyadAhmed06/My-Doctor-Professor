import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';
const bundleId = '30000000-0000-4000-8000-000000000001';
const courseId = '20000000-0000-4000-8000-000000000001';
const weekId = '40000000-0000-4000-8000-000000000001';
const lectureId = '50000000-0000-4000-8000-000000000006';

function endpoint(url: string) {
  const path = new URL(url).pathname;
  const marker = '/api/v1';
  const index = path.indexOf(marker);
  return index >= 0 ? path.slice(index + marker.length) || '/' : path;
}

async function mockRounds(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('mdp_access_token', 'rounds-number-safety-token');
    localStorage.setItem('mdp-theme', 'dark');
    localStorage.setItem('mdp-locale', 'en');
  });

  await page.route('**/*', async route => {
    const request = route.request();
    const resourceType = request.resourceType();
    if ((resourceType !== 'fetch' && resourceType !== 'xhr') || (!request.url().includes('/api/v1') && new URL(request.url()).port !== '3000')) {
      return route.fallback();
    }

    const headers = {
      'access-control-allow-origin': frontendOrigin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const respond = (body: unknown) => route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
    const path = endpoint(request.url());

    if (path === '/auth/me') return respond({
      id: 'student-rounds-number-safety',
      email: 'rounds@example.test',
      full_name: 'Rounds Safety Student',
      role: 'STUDENT',
      status: 'ACTIVE',
      emailVerified: true,
    });
    if (path === '/notifications/unread/count') return respond({ count: 0 });
    if (path.startsWith('/notifications?')) return respond({ data: [] });
    if (path === '/bundles/mine') return respond([{ id: bundleId, title: 'Demo Bundle', read_only: false }]);
    if (path === `/bundles/${bundleId}/content`) return respond({
      bundle: { id: bundleId, title: 'Demo Bundle', read_only: false },
      courses: [{
        id: courseId,
        courseName: 'Cardiovascular System',
        courseCode: 'CARD-101',
        description: null,
        weeks: [{
          id: weekId,
          weekNumber: 1,
          title: 'Heart foundations',
          description: null,
          lectures: [{
            id: lectureId,
            title: 'Cardiac chambers',
            description: null,
            lectureNumber: 6,
            question_count: 'not-a-number',
            mcq_count: null,
            flashcard_deck_count: undefined,
            resource_count: Number.NaN,
          }],
        }],
      }],
    });
    return respond({});
  });
}

test('Rounds renders invalid or missing counters as zero instead of leaking NaN into React children', async ({ page }) => {
  const nanWarnings: string[] = [];
  page.on('console', message => {
    if (/NaN|Received NaN/i.test(message.text())) nanWarnings.push(message.text());
  });
  await mockRounds(page);
  await page.goto(`/rounds?bundle=${bundleId}&course=${courseId}&lecture=${lectureId}`);

  await expect(page.getByRole('heading', { name: 'Cardiovascular System' })).toBeVisible();
  await expect(page.getByText('0 eligible MCQs').first()).toBeVisible();
  await expect(page.getByText('Need 40 more eligible MCQs')).toBeVisible();
  expect(nanWarnings).toEqual([]);
});
