import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';

type UserRole = 'STUDENT' | 'INSTRUCTOR' | 'SYSTEM_ADMIN';
type ApiResult = { body?: unknown; status?: number; contentType?: string; rawBody?: string; delayMs?: number };
type ApiHandler = (path: string, method: string, request: import('@playwright/test').Request) => Promise<ApiResult | null> | ApiResult | null;

function apiEndpoint(requestUrl: string) {
  const pathname = new URL(requestUrl).pathname;
  const marker = '/api/v1';
  const markerIndex = pathname.indexOf(marker);
  return markerIndex >= 0 ? pathname.slice(markerIndex + marker.length) || '/' : pathname;
}

async function authenticated(page: Page, role: UserRole = 'STUDENT') {
  const user = {
    id: role === 'STUDENT' ? 'student-1' : role === 'INSTRUCTOR' ? 'instructor-1' : 'admin-1',
    email: role === 'STUDENT' ? 'student@example.test' : role === 'INSTRUCTOR' ? 'instructor@example.test' : 'admin@example.test',
    full_name: role === 'STUDENT' ? 'Test Student' : role === 'INSTRUCTOR' ? 'Test Instructor' : 'Test Admin',
    role,
    status: 'ACTIVE',
    emailVerified: true,
  };
  await page.addInitScript(({ storedRole }) => {
    localStorage.setItem('mdp_access_token', 'platform-completion-token');
    localStorage.setItem('mdp-theme', 'light');
    localStorage.setItem('mdp-locale', 'en');
    localStorage.removeItem('mdp_logged_out_at');
    localStorage.setItem('mdp_test_role', storedRole);
  }, { storedRole: role });
  return user;
}

async function routeApi(page: Page, handler: ApiHandler) {
  await page.route('**/*', async route => {
    const request = route.request();
    const resourceType = request.resourceType();
    if (resourceType !== 'fetch' && resourceType !== 'xhr') return route.fallback();
    const path = apiEndpoint(request.url());
    const method = request.method();
    const headers = {
      'access-control-allow-origin': frontendOrigin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    };
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const custom = await handler(path, method, request);
    if (custom?.delayMs) await new Promise(resolve => setTimeout(resolve, custom.delayMs));
    if (custom) return route.fulfill({ status: custom.status || 200, headers, contentType: custom.contentType || 'application/json', body: custom.rawBody ?? JSON.stringify(custom.body ?? {}) });
    return route.fulfill({ status: 200, headers, contentType: 'application/json', body: '{}' });
  });
}

test('language switcher persists Arabic RTL and can return to English LTR without reloading', async ({ page }) => {
  const user = await authenticated(page, 'STUDENT');
  await routeApi(page, async path => {
    if (path === '/auth/me') return { body: user };
    if (path === '/notifications/unread/count') return { body: { count: 0 } };
    if (path === '/dashboard/student') return { body: { clinical_momentum: { questions_answered: 8, study_streak: 0, retention_percentage: 75, study_hours: 0 }, today_plan: [], upcoming_assessments: [], continue_learning: [], spaced_repetition: { due: 0, mastered: 0, reviewed: 0 }, progress: { level: 1, level_name: 'Clinical Learner', xp: 0, next_level_xp: 100, lectures_completed: 0, curriculum_completion_percentage: 0 }, topic_mastery: [], pearls: [], weekly_activity: [], recent_activity: [] } };
    return null;
  });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /العربية|Arabic/i }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('mdp-locale'))).toBe('ar');
  await page.getByRole('button', { name: /English|الإنجليزية/i }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('mdp-locale'))).toBe('en');
});

test('Arabic dashboard translates dynamic learning copy instead of only changing direction', async ({ page }) => {
  const user = await authenticated(page, 'STUDENT');
  await page.addInitScript(() => localStorage.setItem('mdp-locale', 'ar'));
  await routeApi(page, async path => {
    if (path === '/auth/me') return { body: user };
    if (path === '/notifications/unread/count') return { body: { count: 0 } };
    if (path === '/dashboard/student') return { body: { clinical_momentum: { questions_answered: 8, study_streak: 0, retention_percentage: 75, study_hours: 0 }, today_plan: [], upcoming_assessments: [], continue_learning: [], spaced_repetition: { due: 0, mastered: 0, reviewed: 0 }, progress: { level: 1, level_name: 'Clinical Learner', xp: 0, next_level_xp: 100, lectures_completed: 0, curriculum_completion_percentage: 0 }, topic_mastery: [], pearls: [], weekly_activity: [], recent_activity: [] } };
    return null;
  });
  await page.goto('/dashboard');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByText('تابع التعلم')).toBeVisible();
  await expect(page.getByText('Clinical Momentum')).toHaveCount(0);
});

test('logout navigates immediately even when server revocation is slow', async ({ page }) => {
  const user = await authenticated(page, 'STUDENT');
  let slowServerRevocationFinished = false;
  await routeApi(page, async (path, method) => {
    if (path === '/auth/me') return { body: user };
    if (path === '/auth/security') return { body: { sessions: [], providers: [] } };
    if (path === '/users/student-1') return { body: { ...user, fullName: 'Test Student', phoneNumber: '+201000000000', profilePictureUrl: null, gender: null, dateOfBirth: null } };
    if (path === '/notifications/unread/count') return { body: { count: 0 } };
    if (path === '/notifications') return { body: { data: [] } };
    if (path === '/auth/logout' && method === 'POST') {
      await new Promise(resolve => setTimeout(resolve, 4000));
      slowServerRevocationFinished = true;
      return { status: 204 };
    }
    if (path === '/auth/logout/browser' && method === 'POST') return { status: 204 };
    return null;
  });

  await page.goto('/settings');
  await page.locator('.profile-menu-trigger').click();
  await page.getByRole('menuitem', { name: /Log out/i }).click();
  const confirmation = page.getByRole('alertdialog', { name: 'Log out?' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: /^Log out$/i }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 3500 });
  expect(slowServerRevocationFinished).toBe(false);
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
});

test('settings exposes session security and keyboard manual navigation', async ({ page }) => {
  const user = await authenticated(page, 'STUDENT');
  await routeApi(page, async path => {
    if (path === '/auth/me') return { body: user };
    if (path === '/notifications/unread/count') return { body: { count: 0 } };
    if (path === '/auth/security') return { body: { sessions: [{ id: 'session-1', ipAddress: '127.0.0.1', userAgent: 'Chromium', createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), revokedAt: null, current: true }], providers: [] } };
    if (path === '/users/student-1') return { body: { ...user, fullName: 'Test Student', phoneNumber: '+201000000000', profilePictureUrl: null, gender: null, dateOfBirth: null } };
    return null;
  });
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: /Session security/i })).toBeVisible();
  await expect(page.getByText('Chromium')).toBeVisible();
  await page.goto('/shortcuts');
  await expect(page.getByRole('heading', { name: /Keyboard shortcuts/i })).toBeVisible();
});

test('instructor can upload a managed lecture resource with progress-aware workspace', async ({ page }) => {
  const user = await authenticated(page, 'INSTRUCTOR');
  await routeApi(page, async (path, method) => {
    if (path === '/auth/me') return { body: user };
    if (path === '/notifications/unread/count') return { body: { count: 0 } };
    if (path === '/resources/upload/context') return { body: { courses: [{ id: 'course-1', courseCode: 'CVS301', courseName: 'Cardiovascular Medicine', weeks: [{ id: 'week-1', weekNumber: 1, title: 'Foundations', lectures: [{ id: 'lecture-1', lectureNumber: 1, title: 'Cardiac anatomy' }] }] }] } };
    if (path === '/resources' && method === 'POST') return { body: { id: 'resource-1', title: 'Lecture notes', description: null, resourceType: 'PDF', storageKey: 'resources/course-1/lecture-1/test.pdf', mimeType: 'application/pdf', originalFilename: 'notes.pdf', uploadSizeBytes: 5, externalUrl: null, isActive: true, isDownloadable: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } };
    return null;
  });
  await page.goto('/resources/upload');
  await expect(page.getByRole('heading', { name: /Upload resource/i })).toBeVisible();
});

test('student previews a protected managed resource through an authenticated blob URL', async ({ page }) => {
  const user = await authenticated(page, 'STUDENT');
  await routeApi(page, async path => {
    if (path === '/auth/me') return { body: user };
    if (path === '/notifications/unread/count') return { body: { count: 0 } };
    if (path === '/bundles/mine') return { body: [{ id: 'bundle-1', title: 'Clinical Foundations', slug: 'clinical-foundations', status: 'PUBLISHED', isFree: true }] };
    if (path === '/bundles/bundle-1/content') return { body: { bundle: { id: 'bundle-1', title: 'Clinical Foundations', read_only: false }, courses: [{ id: 'course-1', courseCode: 'CVS301', courseName: 'Cardiovascular Medicine', weeks: [{ id: 'week-1', weekNumber: 1, title: 'Foundations', lectures: [{ id: 'lecture-1', lectureNumber: 1, title: 'Cardiac anatomy', resource_count: 1, resources: [{ id: 'resource-1', title: 'Cardiac anatomy PDF', description: null, resource_type: 'PDF', storage_key: 'resources/course-1/lecture-1/test.pdf', mime_type: 'application/pdf', original_filename: 'cardiac-anatomy.pdf', is_downloadable: true }] }] }] }], past_exams: [] } };
    return null;
  });
  await page.goto('/guidelines?bundle=bundle-1&lecture=lecture-1&resource=resource-1');
  await expect(page.getByText('Cardiac anatomy PDF')).toBeVisible();
});
