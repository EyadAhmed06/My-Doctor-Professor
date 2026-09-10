import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';

function endpointOf(url: string) {
  const pathname = new URL(url).pathname;
  const marker = '/api/v1';
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) || '/' : pathname;
}

async function installAdminApi(page: Page) {
  const admin = {
    id: 'admin-1', email: 'admin@example.test', full_name: 'Test Administrator',
    role: 'SYSTEM_ADMIN', status: 'ACTIVE', emailVerified: true,
  };
  const target = {
    id: 'student-1', full_name: 'Delete Me', email: 'delete@example.test',
    phone_number: '+201000000099', role: 'STUDENT', status: 'ACTIVE',
    email_verified: true, last_login_at: null, created_at: '2026-09-01T00:00:00.000Z',
    student_number: 'DELETE-001', current_semester: 4,
  };
  let deleted = false;
  let deleteRequests = 0;

  await page.addInitScript(() => {
    localStorage.removeItem('mdp_logged_out_at');
    localStorage.setItem('mdp-theme', 'dark');
    localStorage.setItem('mdp-locale', 'en');
  });
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.includes('/api/v1') && url.port !== '3000') return route.fallback();
    const endpoint = endpointOf(request.url());
    const headers = {
      'access-control-allow-origin': request.headers().origin || frontendOrigin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'cache-control': 'no-store',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const respond = (body: unknown, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: status === 204 ? '' : JSON.stringify(body) });
    if (endpoint === '/auth/refresh') return respond({ access_token: 'admin-delete-token', user: admin });
    if (endpoint === '/auth/me') return respond(admin);
    if (endpoint === '/notifications/unread/count') return respond({ count: 0 });
    if (endpoint.startsWith('/notifications')) return respond({ data: [] });
    if (endpoint === '/admin/users' && request.method() === 'GET') {
      const data = deleted ? [admin] : [admin, target];
      return respond({ data, page: 1, limit: 20, total: data.length, total_pages: 1 });
    }
    if (endpoint === '/admin/users/student-1' && request.method() === 'DELETE') {
      deleted = true;
      deleteRequests += 1;
      return respond(null, 204);
    }
    return respond({});
  });
  return { getDeleteRequests: () => deleteRequests };
}

test('admin bin permanently deletes an account and removes its row', async ({ page }) => {
  const api = await installAdminApi(page);
  await page.goto('/admin/users');

  const targetRow = page.getByRole('row').filter({ hasText: 'Delete Me' });
  await expect(targetRow).toBeVisible();
  await targetRow.getByRole('button', { name: 'Delete user' }).click();

  const confirmation = page.getByRole('alertdialog', { name: 'Permanently delete account?' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Delete permanently' }).click();

  await expect(targetRow).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '1 accounts' })).toBeVisible();
  expect(api.getDeleteRequests()).toBe(1);
});
