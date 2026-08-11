import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';
const pearlId = '77777777-7777-4777-8777-777777777777';

function endpoint(url: string) {
  const path = new URL(url).pathname;
  const marker = '/api/v1';
  const index = path.indexOf(marker);
  return index >= 0 ? path.slice(index + marker.length) || '/' : path;
}

async function mockPearls(page: Page) {
  const user = {
    id: 'student-pearl',
    email: 'pearl@example.test',
    full_name: 'Pearl Test Student',
    role: 'STUDENT',
    status: 'ACTIVE',
    emailVerified: true,
  };
  let pearl = {
    id: pearlId,
    title: 'Aortic stenosis clue',
    content: 'A delayed carotid upstroke is a useful bedside clue.',
    noteType: 'PEARL',
    collectionId: null,
    collection: null,
    updatedAt: '2026-08-11T10:00:00.000Z',
  };
  const writes: Array<Record<string, unknown>> = [];

  await page.addInitScript(() => {
    localStorage.setItem('mdp_access_token', 'pearl-browser-token');
    localStorage.setItem('mdp-theme', 'light');
    localStorage.setItem('mdp-locale', 'en');
  });

  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!(url.pathname.includes('/api/v1') || url.port === '3000')) return route.fallback();
    const headers = {
      'access-control-allow-origin': frontendOrigin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const path = endpoint(request.url());
    const respond = (body: unknown, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });

    if (path === '/auth/me') return respond(user);
    if (path === '/notifications/unread/count') return respond({ count: 0 });
    if (path === '/notifications') return respond({ data: [] });
    if (path === '/notebook/collections') return respond([]);
    if (path === `/notebook/notes/${pearlId}` && request.method() === 'GET') return respond(pearl);
    if (path === `/notebook/notes/${pearlId}` && request.method() === 'PUT') {
      const body = request.postDataJSON() as Record<string, unknown>;
      writes.push(body);
      pearl = {
        ...pearl,
        title: String(body.title || pearl.title),
        content: String(body.content || pearl.content),
        noteType: String(body.note_type || pearl.noteType),
        collectionId: body.collection_id ? String(body.collection_id) : null,
        updatedAt: '2026-08-11T11:00:00.000Z',
      };
      return respond(pearl);
    }
    if (path === '/notebook/notes' && request.method() === 'GET') {
      return respond({ data: [pearl], page: 1, limit: 1, total: 1, total_pages: 1 });
    }
    if (path === '/dashboard/student') return respond({
      courses: [],
      recent_attempts: [],
      questions: { attempts: 0, correct_attempts: 0, accuracy: '0', bookmarked: 0 },
      flashcards: { reviewed: 0, mastered: 0, due: 0 },
    });
    if (path === '/study-plan/calendar') return respond({ from: '2026-08-11', to: '2026-09-10', data: [] });
    return respond({});
  });

  return { writes, getPearl: () => pearl };
}

test('Pearl editing preserves PEARL type and the latest Pearl surfaces on the dashboard', async ({ page }) => {
  const state = await mockPearls(page);
  await page.goto(`/notebook/pearl?note=${pearlId}`);

  await expect(page.getByRole('heading', { name: /Edit pearl/i })).toBeVisible();
  await expect(page.getByText(/does not medically verify it/i)).toBeVisible();

  const content = page.getByPlaceholder(/concise insight/i);
  await content.fill('A delayed carotid upstroke plus a narrow pulse pressure supports severe aortic stenosis.');
  await page.getByRole('button', { name: /Save pearl/i }).first().click();

  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0].note_type).toBe('PEARL');
  expect(state.getPearl().noteType).toBe('PEARL');

  await page.goto('/dashboard');
  await expect(page.getByText('Professor\'s Pearls')).toBeVisible();
  await expect(page.getByText(/narrow pulse pressure supports severe aortic stenosis/i)).toBeVisible();
});
