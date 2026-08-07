import { expect, test } from '@playwright/test';

function endpointOf(url: string) {
  const pathname = new URL(url).pathname;
  const marker = '/api/v1';
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) || '/' : pathname;
}

const returningUser = {
  id: 'student-returning',
  email: 'eyad@example.test',
  full_name: 'Eyad Student',
  role: 'STUDENT',
  status: 'ACTIVE',
  emailVerified: true,
};

const corsHeaders = {
  'access-control-allow-origin': 'http://127.0.0.1:3001',
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
};

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
    localStorage.setItem('mdp_refresh_token', 'legacy-refresh-that-must-be-removed');
  });

  await page.route('**/*', async (route) => {
    const request = route.request();
    if (!['fetch', 'xhr'].includes(request.resourceType())) return route.fallback();
    const endpoint = endpointOf(request.url());
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders });
    if (endpoint === '/auth/me') {
      return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(returningUser) });
    }
    return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/');
  await expect(page.getByRole('link', { name: /Open dashboard/i }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Continue learning/i })).toBeVisible();
  await expect(page.getByText(/Signed in as Eyad/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /^Log in$/i })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('mdp_refresh_token'))).toBeNull();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('mdp_refresh_token'))).toBeNull();
});

test('returning browser restores access through refresh endpoint without a JS refresh credential', async ({ page }) => {
  let refreshCalls = 0;
  await page.addInitScript(() => {
    localStorage.setItem('mdp-theme', 'light');
    localStorage.removeItem('mdp_access_token');
    localStorage.removeItem('mdp_refresh_token');
    sessionStorage.removeItem('mdp_access_token');
    sessionStorage.removeItem('mdp_refresh_token');
  });

  await page.route('**/*', async (route) => {
    const request = route.request();
    if (!['fetch', 'xhr'].includes(request.resourceType())) return route.fallback();
    const endpoint = endpointOf(request.url());
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders });
    if (endpoint === '/auth/refresh') {
      refreshCalls += 1;
      expect(request.postDataJSON()).toEqual({});
      return route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: 'rotated-access-token', refresh_token: 'body-fallback-not-stored', user: returningUser }),
      });
    }
    if (endpoint === '/auth/me') {
      return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(returningUser) });
    }
    return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/');
  await expect(page.getByText(/Signed in as Eyad/i)).toBeVisible();
  expect(refreshCalls).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('mdp_access_token'))).toBe('rotated-access-token');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('mdp_refresh_token'))).toBeNull();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('mdp_refresh_token'))).toBeNull();
});
