import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';

function recentDate(daysAgo: number) {
  const value = new Date();
  value.setHours(12, 0, 0, 0);
  value.setDate(value.getDate() - daysAgo);
  return value.toISOString().slice(0, 10);
}

const student = {
  id: 'student-1',
  email: 'student@example.test',
  full_name: 'Browser Test Student',
  role: 'STUDENT',
  status: 'ACTIVE',
  emailVerified: true,
};

const bundle = {
  id: 'bundle-1',
  title: 'Clinical Foundations',
  slug: 'clinical-foundations',
  description: 'A deterministic browser-test bundle.',
  academicYear: 1,
  status: 'PUBLISHED',
  isFree: true,
};

const bundleContent = {
  bundle,
  courses: [
    {
      id: 'course-1',
      courseCode: 'MED101',
      courseName: 'Medicine I',
      weeks: [
        {
          id: 'week-1',
          weekNumber: 1,
          title: 'Cardiovascular foundations',
          lectures: [
            { id: 'lecture-1', title: 'Cardiac cycle', lectureNumber: 1, question_count: 12, flashcard_deck_count: 2, resource_count: 1 },
          ],
        },
        {
          id: 'week-2',
          weekNumber: 2,
          title: 'Respiratory foundations',
          lectures: [
            { id: 'lecture-2', title: 'Gas exchange', lectureNumber: 2, question_count: 8, flashcard_deck_count: 1, resource_count: 2 },
          ],
        },
      ],
    },
  ],
  past_exams: [],
  totals: { courses: 1, weeks: 2, lectures: 2, questions: 20, flashcard_decks: 3, resources: 3, past_exams: 0 },
};

const analytics = {
  summary: { questions_answered: 120, accuracy: 68, bookmarked: 4, calibrated_confidence: 61, flashcards_mastered: 33, flashcards_due: 7 },
  accuracy_over_time: [
    { date: recentDate(1), answered: 20, accuracy: 60 },
    { date: recentDate(0), answered: 30, accuracy: 72 },
  ],
  topic_mastery: [{ id: 'topic-1', name: 'Cardiac physiology', course: 'Medicine I', mastery: 54, confidence: 59, questions_attempted: 18 }],
  study_activity: [
    { date: recentDate(1), completed: 2, skipped: 1, planned: 3 },
    { date: recentDate(0), completed: 3, skipped: 0, planned: 3 },
  ],
  readiness: { score: 63, band: 'ON_TRACK', components: { accuracy: 68, curriculum: 55, flashcards: 70, consistency: 61 } },
};

function apiEndpoint(requestUrl: string) {
  const pathname = new URL(requestUrl).pathname;
  const marker = '/api/v1';
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex >= 0) return pathname.slice(markerIndex + marker.length) || '/';
  return pathname;
}

function isMockedEndpoint(endpoint: string) {
  return endpoint === '/auth/refresh'
    || endpoint === '/auth/me'
    || endpoint === '/auth/security'
    || endpoint === '/dashboard/student'
    || endpoint.startsWith('/notifications')
    || endpoint.startsWith('/users/')
    || endpoint.startsWith('/bundles')
    || endpoint === '/catalog/bundles'
    || endpoint === '/analytics/student';
}

async function mockApi(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem('mdp_logged_out_at');
    localStorage.removeItem('mdp_access_token');
    localStorage.removeItem('mdp_refresh_token');
    localStorage.setItem('mdp-theme', 'light');
    localStorage.setItem('mdp-locale', 'en');
  });

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = apiEndpoint(request.url());
    const resourceType = request.resourceType();
    const isDataRequest = resourceType === 'fetch' || resourceType === 'xhr';
    const apiLikeRequest = isDataRequest && (isMockedEndpoint(endpoint) || url.pathname.includes('/api/v1') || url.port === '3000');

    if (!apiLikeRequest) {
      await route.fallback();
      return;
    }

    const headers = {
      'access-control-allow-origin': frontendOrigin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    };

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }

    const respond = async (body: unknown, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });

    if (endpoint === '/auth/refresh') return respond({ access_token: 'browser-test-token', user: student });
    if (endpoint === '/auth/me') return respond(student);
    if (endpoint === '/auth/security') {
      return respond({
        sessions: [{ id: 'session-current', current: true, created_at: '2026-08-07T08:00:00.000Z', last_used_at: null, expires_at: '2026-08-14T08:00:00.000Z' }],
        providers: [],
      });
    }
    if (endpoint === '/notifications/unread/count') return respond({ count: 2 });
    if (endpoint === '/notifications') {
      return respond({ data: [{ id: 'notification-1', title: 'Upcoming review', message: 'Seven flashcards are due.', target_url: '/flashcards', notification_type: 'STUDY', status: 'UNREAD', created_at: '2026-08-06T16:00:00.000Z' }] });
    }
    if (endpoint === '/users/student-1') {
      return respond({ ...student, fullName: 'Browser Test Student', phoneNumber: '+201000000000', profilePictureUrl: null, dateOfBirth: null, gender: null, createdAt: '2026-01-01T00:00:00.000Z' });
    }
    if (endpoint === '/bundles/mine') return respond([bundle]);
    if (endpoint === '/catalog/bundles') return respond([]);
    if (endpoint === '/bundles/bundle-1/content') return respond(bundleContent);
    if (endpoint === '/analytics/student') return respond(analytics);

    return respond({});
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(async () => {
    try {
      return await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    } catch {
      return false;
    }
  }).toBe(true);
}

for (const pathname of ['/', '/login', '/register']) {
  test(`public page ${pathname} renders without horizontal overflow`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(pathname);
    await expect(page.locator('body')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(pageErrors).toEqual([]);
  });
}

test('authenticated shell menus, theme, and command palette are keyboard usable', async ({ page }) => {
  await mockApi(page);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  await page.locator('.profile-menu-trigger').click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.getByRole('button', { name: /Switch to dark theme/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name: 'Workspace command palette' });
  await expect(palette).toBeVisible();
  await palette.getByPlaceholder('Search pages and actions…').fill('bundles');
  await expect(palette.getByRole('option', { name: /Open bundles/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();

  await page.getByRole('button', { name: /unread notifications/i }).click();
  await expect(page.getByRole('dialog', { name: 'Notification preview' })).toContainText('Upcoming review');
  await expectNoHorizontalOverflow(page);
});

test('Bundle curriculum preserves hierarchy and canonical deep links', async ({ page }) => {
  await mockApi(page);
  await page.goto('/bundles?id=bundle-1&tab=curriculum');
  await expect(page.getByRole('heading', { name: 'Clinical Foundations' })).toBeVisible();
  await expect(page).toHaveURL(/bundle=clinical-foundations/);
  await expect(page).not.toHaveURL(/id=bundle-1/);

  const weeks = page.locator('.advanced-bundle-week');
  await expect(weeks).toHaveCount(2);
  await expect(weeks.nth(0)).toHaveClass(/open/);
  await expect(weeks.nth(1)).not.toHaveClass(/open/);

  await weeks.nth(1).locator('button').first().click();
  await expect(weeks.nth(1)).toHaveClass(/open/);
  await expect(weeks.nth(1).getByRole('link', { name: /Gas exchange/i })).toHaveAttribute('href', '/guidelines?course=med101&lecture=2-gas-exchange');
  await expectNoHorizontalOverflow(page);
});

test('Analytics counters and study-consistency chart expose real values to keyboard users', async ({ page }) => {
  await mockApi(page);
  await page.goto('/analytics');
  await expect(page.getByRole('heading', { name: 'Analytics Dashboard' })).toBeVisible();

  const questionsMetric = page.locator('.analytics-metric').filter({ hasText: 'Validated answers · overall' });
  await expect(questionsMetric.locator('b')).toHaveText('120');

  const chartPoint = page.locator('.chart-bar-point').first();
  await chartPoint.focus();
  await expect(chartPoint).toBeFocused();
  await expect(chartPoint).toHaveAttribute('data-tooltip', /2 completed, 1 skipped, 3 planned/);
  await expectNoHorizontalOverflow(page);
});

test('reduced motion resolves animated values immediately', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockApi(page);
  await page.goto('/analytics');

  const questionsMetric = page.locator('.analytics-metric').filter({ hasText: 'Validated answers · overall' });
  await expect(questionsMetric.locator('b')).toHaveText('120');
  await expect.poll(() => questionsMetric.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
});
