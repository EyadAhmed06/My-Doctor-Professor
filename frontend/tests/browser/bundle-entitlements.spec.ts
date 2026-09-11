import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';
const bundleId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const courseId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const week1 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const week2 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
const instructorId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const otherInstructorId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const studentId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const otherStudentId = '11111111-1111-4111-8111-111111111111';

function apiEndpoint(requestUrl: string) {
  const pathname = new URL(requestUrl).pathname;
  const marker = '/api/v1';
  const markerIndex = pathname.indexOf(marker);
  return markerIndex >= 0 ? pathname.slice(markerIndex + marker.length) || '/' : pathname;
}

async function baseMock(page: Page, user: Record<string, unknown>, handler: (endpoint: string, request: import('@playwright/test').Request, respond: (body: unknown, status?: number) => Promise<void>) => Promise<boolean> | boolean) {
  await page.addInitScript(() => {
    localStorage.setItem('mdp_access_token', 'bundle-entitlement-browser-token');
    localStorage.removeItem('mdp_logged_out_at');
    localStorage.setItem('mdp-theme', 'light');
    localStorage.setItem('mdp-locale', 'en');
  });
  await page.route('**/*', async (route) => {
    const request = route.request();
    const endpoint = apiEndpoint(request.url());
    const resourceType = request.resourceType();
    const isDataRequest = resourceType === 'fetch' || resourceType === 'xhr';
    if (!isDataRequest || (!request.url().includes('/api/v1') && new URL(request.url()).port !== '3000')) return route.fallback();
    const headers = {
      'access-control-allow-origin': frontendOrigin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const respond = async (body: unknown, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
    if (endpoint === '/auth/me') return respond(user);
    if (endpoint === '/notifications/unread/count') return respond({ count: 0 });
    if (await handler(endpoint, request, respond)) return;
    return respond({});
  });
}

const paidPendingBundle = {
  id: bundleId,
  title: 'Paid Cardiology Bundle',
  slug: 'paid-cardiology-bundle',
  description: 'Paid protected curriculum',
  academicYear: 3,
  status: 'PUBLISHED',
  isFree: false,
  priceAmount: '750.00',
  priceCurrency: 'EGP',
  accessible: false,
  payment_required: true,
  access_status: 'PENDING_PAYMENT',
  paymentStatus: 'PENDING',
};

test('student assigned to a paid bundle cannot load content before payment', async ({ page }) => {
  let contentRequests = 0;
  await baseMock(page, { id: studentId, email: 'student@example.test', full_name: 'Pending Student', role: 'STUDENT', status: 'ACTIVE', emailVerified: true }, async (endpoint, _request, respond) => {
    if (endpoint === '/bundles/mine') {
      await respond([paidPendingBundle]);
      return true;
    }
    if (endpoint === '/catalog/bundles') {
      await respond([]);
      return true;
    }
    if (endpoint === `/bundles/${bundleId}/content`) {
      contentRequests += 1;
      await respond({}, 403);
      return true;
    }
    return false;
  });

  await page.goto(`/bundles?bundle=${paidPendingBundle.slug}`);
  await expect(page.getByRole('heading', { name: 'Payment required' })).toBeVisible();
  await expect(page.getByText(/EGP 750\.00/).first()).toBeVisible();
  await expect(page.getByText(/content is locked/i)).toBeVisible();
  expect(contentRequests).toBe(0);
});

test('bundle manager composes weeks, excludes assigned instructors, and confirms paid entitlement', async ({ page }) => {
  let paymentPaid = false;
  let weekAttached = false;
  let confirmPaymentBody: Record<string, unknown> | null = null;
  const managerUser = { id: instructorId, email: 'owner@example.test', full_name: 'Assigned Owner', role: 'INSTRUCTOR', status: 'ACTIVE', emailVerified: true };
  const bundle = { ...paidPendingBundle, accessible: true, payment_required: false, access_status: 'ACTIVE' };

  await baseMock(page, managerUser, async (endpoint, request, respond) => {
    if (endpoint === '/bundles/managed') {
      await respond([bundle]);
      return true;
    }
    if (endpoint === `/bundles/${bundleId}/content`) {
      await respond({
        bundle,
        courses: [],
        past_exams: [],
        totals: { courses: 0, weeks: 0, lectures: 0, questions: 0, flashcard_decks: 0, resources: 0, past_exams: 0 },
      });
      return true;
    }
    if (endpoint === `/bundles/${bundleId}/management`) {
      await respond({
        bundle,
        courses: [{
          id: courseId,
          courseCode: 'CVS-301',
          courseName: 'Cardiovascular Medicine',
          linked: true,
          weeks: [
            { id: week1, weekNumber: 1, title: 'Foundations', linked: true },
            { id: week2, weekNumber: 2, title: 'Clinical cardiology', linked: weekAttached },
          ],
        }],
        tests: [],
        instructors: {
          assigned: [{ id: instructorId, fullName: 'Assigned Owner', email: 'owner@example.test' }],
          available: [{ id: otherInstructorId, fullName: 'Unassigned Instructor', email: 'other@example.test' }],
        },
        students: {
          enrollments: [{
            id: 'enrollment-1',
            student: { id: studentId, fullName: 'Pending Student', email: 'student@example.test' },
            status: paymentPaid ? 'ACTIVE' : 'REVOKED',
            paymentStatus: paymentPaid ? 'PAID' : 'PENDING',
            paidAt: paymentPaid ? new Date().toISOString() : null,
            paymentReference: null,
            accessible: paymentPaid,
            payment_required: !paymentPaid,
            access_status: paymentPaid ? 'ACTIVE' : 'PENDING_PAYMENT',
          }],
          available: [{ id: otherStudentId, fullName: 'Available Student', email: 'available@example.test' }],
        },
      });
      return true;
    }
    if (endpoint === `/bundles/${bundleId}/weeks` && request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual({ resource_id: week2 });
      weekAttached = true;
      await respond({ bundleId, weekId: week2 });
      return true;
    }
    if (endpoint === `/bundles/${bundleId}/enrollments/${studentId}/confirm-payment` && request.method() === 'POST') {
      confirmPaymentBody = request.postDataJSON() as Record<string, unknown>;
      paymentPaid = true;
      await respond({ id: 'enrollment-1', paymentStatus: 'PAID', status: 'ACTIVE' });
      return true;
    }
    return false;
  });

  await page.goto(`/bundles?bundle=${paidPendingBundle.slug}`);
  await expect(page.getByText('Curriculum composition')).toBeVisible();

  const instructorPicker = page.getByLabel('Instructor to assign');
  await expect(instructorPicker.getByRole('option', { name: 'Unassigned Instructor · other@example.test' })).toBeAttached();
  await expect(instructorPicker.getByRole('option', { name: /Assigned Owner/ })).toHaveCount(0);

  await page.getByRole('button', { name: /Week 2 · Clinical cardiology/i }).click();
  await expect.poll(() => weekAttached).toBe(true);

  const entitlementBadges = page.locator('.bundle-entitlement-badges');
  await expect(entitlementBadges).toContainText('PENDING PAYMENT');
  await page.getByRole('button', { name: 'Confirm payment' }).click();
  await expect.poll(() => confirmPaymentBody).not.toBeNull();
  await expect(entitlementBadges).toContainText('PAID');
  await expect(entitlementBadges).toContainText('ACTIVE');
});
