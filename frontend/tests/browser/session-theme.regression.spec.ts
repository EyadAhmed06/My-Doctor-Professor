import { expect, test } from '@playwright/test';

function endpointOf(url: string) {
  const pathname = new URL(url).pathname;
  const marker = '/api/v1';
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) || '/' : pathname;
}

test('existing dark palette remains unchanged on public auth pages', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mdp-theme', 'dark'));
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(6, 9, 25)');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--teal').trim())).toBe('#48d2c7');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--violet').trim())).toBe('#8655ff');
});

test('returning authenticated user sees continue actions on Home without logging in again', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('mdp-theme', 'light');
    localStorage.setItem('mdp_access_token', 'returning-user-token');
    localStorage.setItem('mdp_refresh_token', 'returning-user-refresh');
  });

  await page.route('**/*', async (route) => {
    const request = route.request();
    if (!['fetch', 'xhr'].includes(request.resourceType())) return route.fallback();
    const endpoint = endpointOf(request.url());
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (endpoint === '/auth/me') {
      return route.fulfill({
        status: 200,
        headers,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'student-returning',
          email: 'eyad@example.test',
          full_name: 'Eyad Student',
          role: 'STUDENT',
          status: 'ACTIVE',
          emailVerified: true,
        }),
      });
    }
    return route.fulfill({ status: 200, headers, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/');
  await expect(page.getByRole('link', { name: /Open dashboard/i }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Continue learning/i })).toBeVisible();
  await expect(page.getByText(/Signed in as Eyad/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /^Log in$/i })).toHaveCount(0);
});
