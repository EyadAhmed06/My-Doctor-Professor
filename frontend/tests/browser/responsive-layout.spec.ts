import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';

const requiredViewports = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 568, height: 320 },
  { width: 667, height: 375 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

function endpoint(url: string) {
  const path = new URL(url).pathname;
  const marker = '/api/v1';
  const index = path.indexOf(marker);
  return index >= 0 ? path.slice(index + marker.length) || '/' : path;
}

async function authenticated(page: Page, role: 'STUDENT' | 'INSTRUCTOR' | 'SYSTEM_ADMIN') {
  const user = {
    id: role === 'STUDENT' ? 'student-1' : role === 'INSTRUCTOR' ? 'instructor-1' : 'admin-1',
    email: `${role.toLowerCase()}@example.test`,
    full_name: role === 'STUDENT' ? 'Test Student' : role === 'INSTRUCTOR' ? 'Test Instructor' : 'Test Admin',
    role,
    status: 'ACTIVE',
    emailVerified: true,
  };
  await page.addInitScript(() => {
    localStorage.setItem('mdp_access_token', 'responsive-test-access');
    localStorage.removeItem('mdp_refresh_token');
    sessionStorage.removeItem('mdp_refresh_token');
    localStorage.setItem('mdp-theme', 'light');
    localStorage.setItem('mdp-locale', 'en');
  });
  return user;
}

async function routeApi(
  page: Page,
  handler: (requestEndpoint: string, method: string) => Promise<{ status?: number; body?: unknown } | null> | { status?: number; body?: unknown } | null,
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

async function expectNoDocumentOverflow(page: Page, label: string) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect.soft(dimensions.document, `${label}: document overflow`).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect.soft(dimensions.body, `${label}: body overflow`).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function expectCriticalControlsInsideViewport(page: Page) {
  const escaped = await page.locator('button:visible, a:visible, input:visible, select:visible, textarea:visible').evaluateAll(elements =>
    elements.filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (rect.right > window.innerWidth + 2 || rect.left < -2);
    }).map(element => ({ tag: element.tagName, text: element.textContent?.trim().slice(0, 80) || '' })),
  );
  expect(escaped).toEqual([]);
}

test('required viewport matrix keeps public and authentication routes within the document', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Exact matrix is exercised once; touch behavior is covered by mobile projects.');

  for (const viewport of requiredViewports) {
    await page.setViewportSize(viewport);
    for (const route of ['/', '/login', '/register']) {
      await page.goto(route);
      await expect(page.locator('body')).toBeVisible();
      await expectNoDocumentOverflow(page, `${route} @ ${viewport.width}x${viewport.height}`);
      await expectCriticalControlsInsideViewport(page);
    }
  }
});

test('authenticated student shell reflows in phone portrait, phone landscape, tablet and desktop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Representative dimensions are exercised once.');
  const user = await authenticated(page, 'STUDENT');
  await routeApi(page, path => {
    if (path === '/auth/me') return { body: user };
    if (path === '/users/student-1') return { body: { ...user, fullName: 'Test Student', phoneNumber: '+201000000000', profilePictureUrl: null } };
    if (path === '/auth/security') return { body: { sessions: [], providers: [] } };
    if (path === '/notifications/unread/count') return { body: { count: 0 } };
    if (path === '/notifications') return { body: { data: [] } };
    return null;
  });

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 568, height: 320 },
    { width: 768, height: 1024 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expectNoDocumentOverflow(page, `/settings @ ${viewport.width}x${viewport.height}`);
    await expectCriticalControlsInsideViewport(page);

    const menuButton = page.getByRole('button', { name: /Open menu/i });
    if (viewport.width <= 1180) {
      await expect(menuButton).toBeVisible();
      await menuButton.click();
      const navigation = page.getByRole('navigation', { name: /Primary navigation/i });
      await expect(navigation).toBeVisible();
      await expect(navigation.getByRole('link', { name: 'Settings' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(menuButton).toBeFocused();
    }
  }
});

test('admin registered-device management stays usable on narrow and short screens', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Device-management geometry is exercised once.');
  const user = await authenticated(page, 'SYSTEM_ADMIN');
  const student = {
    id: 'student-1',
    full_name: 'Student With An Extremely Long Responsive Testing Name',
    email: 'student-with-a-long-email-address@example.test',
    phone_number: '+201000000000',
    role: 'STUDENT',
    status: 'ACTIVE',
    email_verified: true,
    last_login_at: '2026-09-12T12:00:00.000Z',
    created_at: '2026-09-01T12:00:00.000Z',
    student_number: 'STU-RESPONSIVE-001',
    current_semester: 2,
  };
  await routeApi(page, path => {
    if (path === '/auth/me') return { body: user };
    if (path === '/notifications/unread/count') return { body: { count: 0 } };
    if (path === '/notifications') return { body: { data: [] } };
    if (path.startsWith('/admin/users?')) return { body: { data: [student], page: 1, limit: 20, total: 1, total_pages: 1 } };
    if (path === '/admin/users/student-1/sessions') return { body: {
      device_binding: {
        id: 'binding-1',
        ip_address: '203.0.113.100',
        user_agent: 'Mozilla/5.0 Responsive Test Browser With A Deliberately Long Device Description',
        bound_at: '2026-09-10T10:00:00.000Z',
        last_seen_at: '2026-09-12T12:00:00.000Z',
      },
      sessions: [],
    } };
    return null;
  });

  for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'User administration' })).toBeVisible();
    await expectNoDocumentOverflow(page, `/admin/users @ ${viewport.width}x${viewport.height}`);

    await page.getByTitle('Manage registered device').click();
    const dialog = page.getByRole('dialog', { name: /Device access/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Responsive Test Browser/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Release registered device/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible();

    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox!.x).toBeGreaterThanOrEqual(-1);
    expect(dialogBox!.y).toBeGreaterThanOrEqual(-1);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(viewport.height + 1);
    await dialog.getByRole('button', { name: 'Close' }).click();
  }
});

test('touch projects keep primary interactive targets at least 44px where the responsive shell applies', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile') && !testInfo.project.name.includes('iphone'), 'Touch target assertion only applies to touch projects.');
  await page.goto('/login');
  const primary = page.locator('button:visible').first();
  await expect(primary).toBeVisible();
  const box = await primary.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});
