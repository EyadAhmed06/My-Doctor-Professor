import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';

function endpoint(url: string) {
  const path = new URL(url).pathname;
  const marker = '/api/v1';
  const index = path.indexOf(marker);
  return index >= 0 ? path.slice(index + marker.length) || '/' : path;
}

async function mockStudent(page: Page) {
  const user = {
    id: 'student-flashcard-sync',
    email: 'flashcard@example.test',
    full_name: 'Flashcard Test Student',
    role: 'STUDENT',
    status: 'ACTIVE',
    emailVerified: true,
  };
  await page.addInitScript(() => {
    localStorage.setItem('mdp_access_token', 'flashcard-sync-token');
    localStorage.setItem('mdp-theme', 'light');
    localStorage.setItem('mdp-locale', 'en');
    localStorage.removeItem('mdp-flashcard-session:student-flashcard-sync');
  });

  let reviewRequests = 0;
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
    if (path === '/flashcards/cards/due') return respond({
      data: [{
        id: 'card-1',
        title: 'Cardiac cycle card',
        frontContent: 'Which valve closes at the start of systole?',
        backContent: 'The mitral and tricuspid valves close.',
        explanation: 'AV valve closure produces S1.',
        deck: {
          id: 'deck-1',
          title: 'Cardiac Physiology',
          course: { courseName: 'Cardiovascular Medicine' },
          lecture: { id: 'lecture-1', title: 'Cardiac cycle', week: { title: 'Week 1', weekNumber: 1 } },
        },
      }],
      page: 1,
      limit: 50,
      total: 1,
      total_pages: 1,
    });
    if (path === '/flashcards/cards/card-1/review' && request.method() === 'POST') {
      reviewRequests += 1;
      if (reviewRequests > 1) return respond({ statusCode: 409, message: 'This flashcard is not due for review yet', error: 'Conflict' }, 409);
      await new Promise(resolve => setTimeout(resolve, 700));
      return respond({ id: 'progress-1', cardId: 'card-1', reviewCount: 1, nextReviewAt: '2026-08-12T10:00:00.000Z' });
    }
    return respond({});
  });

  return { reviewRequests: () => reviewRequests };
}

test('one rating produces one backend review and does not resurrect the card', async ({ page }) => {
  const state = await mockStudent(page);
  await page.goto('/flashcards');
  await expect(page.getByText('Which valve closes at the start of systole?')).toBeVisible();

  await page.getByRole('button', { name: /Which valve closes at the start of systole/i }).click();
  const card = page.locator('.study-card');
  await expect(card).toBeVisible();
  await card.click();
  await page.getByRole('button', { name: /3 · Good/i }).click();

  await expect(page.getByText(/1 review waiting to sync/i)).toBeVisible();
  await expect.poll(state.reviewRequests, { timeout: 7500 }).toBe(1);
  await expect(page.getByText(/Review restored/i)).toHaveCount(0);
  await expect(page.getByText(/1 review waiting to sync/i)).toHaveCount(0, { timeout: 3000 });
  await expect(page.getByText('Which valve closes at the start of systole?')).toHaveCount(0);
});
