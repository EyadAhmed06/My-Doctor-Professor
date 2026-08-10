import { expect, Page, test } from '@playwright/test';

const frontendOrigin = 'http://127.0.0.1:3001';
const bundleId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const courseId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const lecture1 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const lecture2 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
const examId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const attemptId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const generatedTestId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const student = { id: 'student-1', email: 'student@example.test', full_name: 'Launch Test Student', role: 'STUDENT', status: 'ACTIVE', emailVerified: true };
const bundle = { id: bundleId, title: 'Clinical Year', slug: 'clinical-year', description: null, academicYear: 4, status: 'PUBLISHED', isFree: true };

function apiEndpoint(requestUrl: string) {
  const pathname = new URL(requestUrl).pathname;
  const marker = '/api/v1';
  const markerIndex = pathname.indexOf(marker);
  return markerIndex >= 0 ? pathname.slice(markerIndex + marker.length) || '/' : pathname;
}

async function baseMock(page: Page, handler: (endpoint: string, request: import('@playwright/test').Request, respond: (body: unknown, status?: number) => Promise<void>) => Promise<boolean> | boolean) {
  await page.addInitScript(() => {
    localStorage.setItem('mdp_access_token', 'launch-browser-token');
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
    if (endpoint === '/auth/me') return respond(student);
    if (endpoint === '/notifications/unread/count') return respond({ count: 0 });
    if (await handler(endpoint, request, respond)) return;
    return respond({});
  });
}

test('lecture quiz builder requires a 40-MCQ pool and launches exactly 40 questions in Tutor mode', async ({ page }) => {
  let generatedBody: Record<string, unknown> | null = null;
  await baseMock(page, async (endpoint, request, respond) => {
    if (endpoint === '/bundles/mine') {
      await respond([bundle]);
      return true;
    }
    if (endpoint === `/bundles/${bundleId}/content`) {
      await respond({
        bundle,
        courses: [{
          id: courseId,
          courseName: 'Internal Medicine',
          courseCode: 'MED401',
          description: null,
          weeks: [{
            id: 'week-1', weekNumber: 1, title: 'Cardiology', description: null,
            lectures: [
              { id: lecture1, title: 'Stable ischemic disease', description: null, lectureNumber: 1, question_count: 25, flashcard_deck_count: 1, resource_count: 1 },
              { id: lecture2, title: 'Acute coronary syndromes', description: null, lectureNumber: 2, question_count: 25, flashcard_deck_count: 1, resource_count: 1 },
            ],
          }],
        }],
      });
      return true;
    }
    if (endpoint === '/tests/practice/generate' && request.method() === 'POST') {
      generatedBody = request.postDataJSON() as Record<string, unknown>;
      await respond({ test: { id: generatedTestId }, attempt: { id: attemptId }, question_count: 40 });
      return true;
    }
    return false;
  });

  await page.goto(`/rounds?bundle=${bundleId}&course=${courseId}`);
  await expect(page.getByRole('heading', { name: 'Internal Medicine' })).toBeVisible();
  const launch = page.getByRole('button', { name: /Start 40 questions/i });
  await expect(launch).toBeDisabled();
  await expect(page.getByText(/Need 15 more eligible MCQs/i)).toBeVisible();

  await page.getByRole('button', { name: /Acute coronary syndromes/i }).click();
  await expect(launch).toBeEnabled();
  await expect(page.getByText('Start a 40-MCQ Tutor quiz')).toBeVisible();
  await launch.click();

  await expect.poll(() => generatedBody).not.toBeNull();
  expect(generatedBody).toMatchObject({
    bundle_id: bundleId,
    lecture_ids: [lecture1, lecture2],
    question_count: 40,
    test_mode: 'TUTOR',
  });
  await expect(page).toHaveURL(new RegExp(`/mock-exam/session\\?attempt=${attemptId}`));
});

for (const mode of ['TUTOR', 'TIMED'] as const) {
  test(`configured final explicitly launches ${mode.toLowerCase()} mode with instructor timing rules`, async ({ page }) => {
    let launchedMode: string | null = null;
    await baseMock(page, async (endpoint, request, respond) => {
      if (endpoint === '/bundles/mine') {
        await respond([bundle]);
        return true;
      }
      if (endpoint === `/bundles/${bundleId}/content`) {
        await respond({
          bundle,
          past_exams: [{ id: examId, title: 'Final Exam', description: 'Instructor configured final.', testType: 'COURSE', durationMinutes: 180, totalMarks: '200.00', passingMarks: '120.00' }],
        });
        return true;
      }
      if (endpoint === `/test-launch/${examId}`) {
        await respond({
          test: { id: examId, title: 'Final Exam', description: 'Instructor configured final.', testType: 'COURSE', durationMinutes: 180, totalMarks: '200.00', passingMarks: '120.00' },
          question_count: 200,
          mcq_count: 200,
          is_final: true,
          required_question_count: 200,
          timed_available: true,
          launch_ready: true,
          issues: [],
        });
        return true;
      }
      if (endpoint === `/tests/${examId}/attempts` && request.method() === 'POST') {
        launchedMode = String((request.postDataJSON() as { test_mode?: string }).test_mode || '');
        await respond({ id: attemptId, testId: examId, testMode: launchedMode });
        return true;
      }
      return false;
    });

    await page.goto(`/past-exams?bundle=${bundleId}&test=${examId}`);
    await expect(page.getByRole('heading', { name: 'Final Exam' })).toBeVisible();
    await expect(page.getByText('200 MCQs required')).toBeVisible();
    await expect(page.getByText('180m')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose a mode' })).toBeDisabled();

    await page.getByRole('button', { name: new RegExp(`^${mode === 'TUTOR' ? 'Tutor mode' : 'Timed mode'}`, 'i') }).click();
    const launch = page.getByRole('button', { name: 'Start 200-MCQ Final' });
    await expect(launch).toBeEnabled();
    await launch.click();
    await expect.poll(() => launchedMode).toBe(mode);
  });
}
