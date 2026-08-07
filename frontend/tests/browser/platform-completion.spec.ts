import { expect, Page, test } from '@playwright/test';

function endpoint(url: string) {
  const path = new URL(url).pathname;
  const marker = '/api/v1';
  const index = path.indexOf(marker);
  return index >= 0 ? path.slice(index + marker.length) || '/' : path;
}

async function authenticated(page: Page, role: 'STUDENT' | 'INSTRUCTOR' | 'SYSTEM_ADMIN' = 'STUDENT') {
  const user = {
    id: role === 'STUDENT' ? 'student-1' : role === 'INSTRUCTOR' ? 'instructor-1' : 'admin-1',
    email: `${role.toLowerCase()}@example.test`,
    full_name: role === 'STUDENT' ? 'Test Student' : role === 'INSTRUCTOR' ? 'Test Instructor' : 'Test Admin',
    role,
    status: 'ACTIVE',
    emailVerified: true,
  };
  await page.addInitScript(() => {
    localStorage.setItem('mdp_access_token', 'platform-test-access');
    localStorage.setItem('mdp_refresh_token', 'platform-test-refresh');
    localStorage.setItem('mdp-theme', 'light');
    localStorage.setItem('mdp-locale', 'en');
  });
  return user;
}

async function routeApi(page: Page, handler: (requestEndpoint: string, method: string) => Promise<{ status?: number; body?: unknown; contentType?: string; raw?: Buffer } | null> | { status?: number; body?: unknown; contentType?: string; raw?: Buffer } | null) {
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const isApi = (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') && (url.pathname.includes('/api/v1') || url.port === '3000');
    if (!isApi) return route.fallback();
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'cache-control': 'no-store',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const result = await handler(endpoint(request.url()), request.method());
    if (!result) return route.fulfill({ status: 200, headers, contentType: 'application/json', body: '{}' });
    if (result.raw) return route.fulfill({ status: result.status ?? 200, headers, contentType: result.contentType, body: result.raw });
    return route.fulfill({ status: result.status ?? 200, headers, contentType: result.contentType ?? 'application/json', body: result.body === undefined ? '' : JSON.stringify(result.body) });
  });
}

test('language switcher persists Arabic RTL and can return to English LTR', async ({ page }) => {
  await page.goto('/');
  const language = page.locator('.global-language-access');
  await expect(language).toBeVisible();
  await Promise.all([
    page.waitForEvent('load'),
    language.getByRole('button', { name: 'ع' }).click(),
  ]);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  await Promise.all([
    page.waitForEvent('load'),
    page.locator('.global-language-access').getByRole('button', { name: 'EN' }).click(),
  ]);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('settings exposes session security and keyboard manual navigation', async ({ page }) => {
  const user = await authenticated(page, 'STUDENT');
  let revoked = false;
  await routeApi(page, async (path, method) => {
    if (path === '/auth/me') return { body: user };
    if (path === '/users/student-1') return { body: { ...user, fullName: 'Test Student', phoneNumber: '+201000000000', profilePictureUrl: null, gender: null, dateOfBirth: null } };
    if (path === '/auth/security') return { body: { sessions: [
      { id: 'session-current', current: true, created_at: '2026-08-07T10:00:00.000Z', last_used_at: null, expires_at: '2026-08-14T10:00:00.000Z' },
      ...(revoked ? [] : [{ id: 'session-other', current: false, created_at: '2026-08-06T10:00:00.000Z', last_used_at: null, expires_at: '2026-08-13T10:00:00.000Z' }]),
    ], providers: [{ provider: 'GOOGLE', email: user.email, linked_at: '2026-08-01T10:00:00.000Z', last_used_at: null }] } };
    if (path === '/auth/sessions/revoke-others' && method === 'POST') { revoked = true; return { status: 204 }; }
    if (path === '/notifications/unread/count') return { body: { count: 0 } };
    if (path === '/notifications') return { body: { data: [] } };
    return null;
  });

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByText('2 active · 1 other')).toBeVisible();
  await expect(page.getByText(/Linked · student@example.test/)).toBeVisible();
  await page.getByRole('button', { name: /Sign out other sessions/i }).click();
  await expect(page.getByText('1 active · 0 other')).toBeVisible();

  await page.keyboard.press('Control+/');
  await expect(page).toHaveURL(/\/shortcuts$/);
  await expect(page.getByRole('heading', { name: 'Command navigation manual' })).toBeVisible();
});

test('instructor can upload a managed lecture resource with progress-aware workspace', async ({ page }) => {
  const user = await authenticated(page, 'INSTRUCTOR');
  let uploaded = false;
  const resource = { id: 'resource-1', resourceName: 'Cardiac physiology notes', resourceType: 'PDF', uploadStatus: 'COMPLETED', fileSize: '120', mimeType: 'application/pdf', description: 'Lecture handout', originalFilename: 'cardiac.pdf' };
  await routeApi(page, async (path, method) => {
    if (path === '/auth/me') return { body: user };
    if (path === '/notifications/unread/count') return { body: { count: 0 } };
    if (path === '/notifications') return { body: { data: [] } };
    if (path === '/academic/courses') return { body: { data: [{ id: 'course-1', courseCode: 'MED101', courseName: 'Medicine I' }] } };
    if (path === '/academic/courses/course-1') return { body: { id: 'course-1', courseCode: 'MED101', courseName: 'Medicine I', weeks: [{ id: 'week-1', weekNumber: 1, title: 'Cardiac', lectures: [{ id: 'lecture-1', lectureNumber: 1, title: 'Cardiac cycle', isPublished: false }] }] } };
    if (path === '/academic/lectures/lecture-1/resources' && method === 'GET') return { body: uploaded ? [resource] : [] };
    if (path === '/academic/lectures/lecture-1/resources/upload' && method === 'POST') { uploaded = true; return { body: resource }; }
    return null;
  });

  await page.goto('/resources/upload');
  await expect(page.getByRole('heading', { name: 'Resource upload' })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({ name: 'cardiac.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%test\n') });
  await expect(page.getByDisplayValue('cardiac')).toBeVisible();
  await page.getByRole('button', { name: /Upload resource/i }).click();
  await expect(page.getByText('Cardiac physiology notes')).toBeVisible();
});

test('student previews a protected managed resource through an authenticated blob URL', async ({ page }) => {
  const user = await authenticated(page, 'STUDENT');
  const bundle = { id: 'bundle-1', title: 'Clinical Foundations', slug: 'clinical-foundations', status: 'PUBLISHED' };
  const content = { courses: [{ id: 'course-1', courseCode: 'MED101', courseName: 'Medicine I', weeks: [{ id: 'week-1', weekNumber: 1, title: 'Cardiac', lectures: [{ id: 'lecture-1', lectureNumber: 1, title: 'Cardiac cycle', description: 'Core cardiac physiology.' }] }] }] };
  const resource = { id: 'resource-1', resourceName: 'Cardiac diagram', resourceType: 'IMAGE', uploadStatus: 'COMPLETED', fileUrl: '/api/v1/academic/resources/resource-1/file', description: 'Protected diagram', mimeType: 'image/png' };
  const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  await routeApi(page, async path => {
    if (path === '/auth/me') return { body: user };
    if (path === '/notifications/unread/count') return { body: { count: 0 } };
    if (path === '/notifications') return { body: { data: [] } };
    if (path === '/bundles/mine') return { body: [bundle] };
    if (path === '/bundles/bundle-1/content') return { body: content };
    if (path === '/academic/lectures/lecture-1/resources') return { body: [resource] };
    if (path === '/progress/lectures/lecture-1') return { body: { studentId: user.id, lectureId: 'lecture-1', isCompleted: false, completionPercentage: '0', timeSpentMinutes: 0, lastAccessedAt: null, completedAt: null } };
    if (path === '/academic/resources/resource-1/file') return { contentType: 'image/png', raw: onePixelPng };
    return null;
  });

  await page.goto('/guidelines');
  await expect(page.getByText('Cardiac diagram')).toBeVisible();
  await page.getByRole('button', { name: /Preview/i }).click();
  const previewImage = page.locator('.resource-preview-drawer img');
  await expect(previewImage).toBeVisible();
  await expect(previewImage).toHaveAttribute('src', /^blob:/);
});
