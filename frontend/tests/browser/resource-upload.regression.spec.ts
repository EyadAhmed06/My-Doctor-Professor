import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';

function endpointOf(url: string) {
  const pathname = new URL(url).pathname;
  const marker = '/api/v1';
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) || '/' : pathname;
}

async function installUploadApi(page: Page) {
  let uploaded = false;
  const mutationOrder: string[] = [];
  const user = {
    id: 'instructor-1',
    email: 'instructor@example.test',
    full_name: 'Test Instructor',
    role: 'INSTRUCTOR',
    status: 'ACTIVE',
    emailVerified: true,
  };
  const lecture = {
    id: 'lecture-1',
    lectureNumber: 1,
    title: 'Cardiac cycle',
    isPublished: true,
  };
  const course = {
    id: 'course-1',
    courseCode: 'MED101',
    courseName: 'Medicine I',
    semester: { semesterNumber: 4, title: 'Semester 4' },
    weeks: [{ id: 'week-1', weekNumber: 1, title: 'Cardiac', lectures: [lecture] }],
  };
  const resource = {
    id: 'resource-1',
    resourceName: 'cardiac',
    resourceType: 'PDF',
    uploadStatus: 'COMPLETED',
    fileSize: '16',
    mimeType: 'application/pdf',
    description: null,
    originalFilename: 'cardiac.pdf',
  };

  await page.addInitScript(() => {
    localStorage.removeItem('mdp_logged_out_at');
    localStorage.removeItem('mdp_access_token');
    localStorage.setItem('mdp-theme', 'dark');
  });

  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const isApi = url.pathname.includes('/api/v1') || url.port === '3000';
    if (!isApi) return route.fallback();

    const endpoint = endpointOf(request.url());
    const method = request.method();
    const headers = {
      'access-control-allow-origin': request.headers().origin || frontendOrigin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'cache-control': 'no-store',
    };
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const respond = (body: unknown, status = 200) => route.fulfill({
      status,
      headers,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

    if (endpoint === '/auth/refresh') return respond({ access_token: 'upload-regression-token', user });
    if (endpoint === '/auth/me') return respond(user);
    if (endpoint === '/notifications/unread/count') return respond({ count: 0 });
    if (endpoint.startsWith('/notifications')) return respond({ data: [] });
    if (endpoint === '/academic/courses') return respond({ data: [course], total: 1, page: 1, limit: 100, total_pages: 1 });
    if (endpoint === '/academic/courses/course-1') return respond(course);
    if (endpoint === '/academic/lectures/lecture-1/resources' && method === 'GET') return respond(uploaded ? [resource] : []);
    if (endpoint === '/academic/lectures/lecture-1' && method === 'PUT') {
      mutationOrder.push('draft');
      expect(request.postDataJSON()).toEqual({ is_published: false });
      lecture.isPublished = false;
      return respond({ ...lecture });
    }
    if (endpoint === '/academic/lectures/lecture-1/resources/upload' && method === 'POST') {
      mutationOrder.push('upload');
      expect(request.headers()['content-type']).toContain('multipart/form-data');
      uploaded = true;
      return respond(resource, 201);
    }
    return respond({});
  });

  return { mutationOrder };
}

test('published lecture upload is styled and drafts before uploading', async ({ page }) => {
  const { mutationOrder } = await installUploadApi(page);
  await page.goto('/resources/upload');

  await expect(page.getByRole('heading', { name: 'Resource upload' })).toBeVisible();
  await expect(page.getByText('Lecture is published')).toBeVisible();
  await expect(page.getByRole('option', { name: 'MED101 · Medicine I · Semester 4' })).toBeAttached();
  await expect(page.getByRole('button', { name: 'Choose a file' })).toBeEnabled();

  const visualContract = await page.locator('.resource-upload-layout > .pp-panel').first().evaluate(panelElement => {
    const panel = getComputedStyle(panelElement);
    const dropzone = getComputedStyle(document.querySelector('.resource-dropzone')!);
    const input = getComputedStyle(document.querySelector('.resource-upload-fields input')!);
    const button = getComputedStyle(document.querySelector('.resource-upload-form .pp-button')!);
    return {
      panelBackground: panel.backgroundColor,
      panelBorderWidth: panel.borderTopWidth,
      panelPadding: panel.paddingTop,
      dropzoneBorderStyle: dropzone.borderTopStyle,
      inputBorderWidth: input.borderTopWidth,
      buttonDisplay: button.display,
    };
  });
  expect(visualContract.panelBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(visualContract.panelBorderWidth).not.toBe('0px');
  expect(visualContract.panelPadding).not.toBe('0px');
  expect(visualContract.dropzoneBorderStyle).toBe('dashed');
  expect(visualContract.inputBorderWidth).not.toBe('0px');
  expect(['flex', 'inline-flex']).toContain(visualContract.buttonDisplay);

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a file' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'cardiac.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%test\n'),
  });
  await expect(page.getByRole('textbox', { name: 'Resource name' })).toHaveValue('cardiac');
  await expect(page.getByRole('button', { name: 'Return to draft & upload' })).toBeEnabled();

  await page.getByRole('button', { name: 'Return to draft & upload' }).click();
  await expect(page.getByText('cardiac', { exact: true })).toBeVisible();
  expect(mutationOrder).toEqual(['draft', 'upload']);

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
});

test('compact navigation opens and follows an instructor destination', async ({ page }) => {
  await page.setViewportSize({ width: 576, height: 743 });
  await installUploadApi(page);
  await page.goto('/resources/upload');

  await page.getByRole('button', { name: 'Open menu' }).click();
  const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
  await expect(navigation).toBeVisible();
  const layers = await navigation.getByRole('link', { name: 'Courses', exact: true }).evaluate(link => {
    const rect = link.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      hitTag: hit?.tagName,
      hitText: hit?.textContent?.trim(),
      navZIndex: getComputedStyle(link.closest('nav')!).zIndex,
      overlayZIndex: getComputedStyle(document.querySelector('.pp-mobile-overlay')!).zIndex,
    };
  });
  expect(layers.hitTag).toBe('A');
  expect(layers.hitText).toBe('Courses');
  expect(Number(layers.navZIndex)).toBeGreaterThan(Number(layers.overlayZIndex));
  await navigation.getByRole('link', { name: 'Courses', exact: true }).click();
  await expect(page).toHaveURL(/\/instructor\/courses$/);
  await expect(navigation).not.toBeVisible();
});
