import { expect, test } from '@playwright/test';

test('essay importer reviews mixed cases and lectures without requiring course before inspection', async ({ page }) => {
  const user = { id: '11111111-1111-4111-8111-111111111111',
    email: 'teacher@example.test', full_name: 'Test Instructor', role: 'INSTRUCTOR',
    status: 'ACTIVE', emailVerified: true };
  await page.addInitScript(() => {
    localStorage.removeItem('mdp_access_token');
    sessionStorage.removeItem('mdp_access_token');
    localStorage.removeItem('mdp_logged_out_at');
    localStorage.setItem('mdp-theme', 'dark');
    localStorage.setItem('mdp-locale', 'en');
  });
  let publishPayload: unknown = null;
  const candidates = Array.from({ length: 45 }, (_, index) => {
    const isCase = index < 6;
    return {
      candidate_id: `candidate-${index}`,
      section: isCase ? 'Essay collection' : 'Lecture 901: Protein chemistry',
      block_type: isCase ? 'CASE' : 'LECTURE',
      case_number: isCase ? 1 : 901,
      case_label: isCase ? 'Case 1' : 'Protein chemistry',
      case_stem: isCase ? 'A patient presents with fever.' : 'Protein chemistry',
      question_number: isCase ? index + 1 : index - 5,
      question_text: `Question ${index + 1}: Mention three findings.`,
      model_answer: '• First item\\n• Second item',
      answer_origin: 'SOURCE',
      source_page: 3, answer_page: 4,
      extraction_confidence: 1, status: 'VALID', issues: [],
    };
  });
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (!url.pathname.includes('/api/v1') && url.port !== '3000') return route.fallback();
    const path = url.pathname.split('/api/v1')[1] || url.pathname;
    const headers = { 'access-control-allow-origin': request.headers().origin || 'http://127.0.0.1:3001',
      'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    let body: unknown = {};
    if (path === '/auth/refresh') body = { access_token: 'essay-v2-test-token', user };
    if (path === '/auth/me') body = user;
    if (path === '/notifications/unread/count') body = { count: 0 };
    if (path === '/notifications') body = { data: [] };
    if (path.startsWith('/academic/courses')) body = { data: [] };
    const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const inspection = {
      original_filename: 'mixed.pdf', file_sha256: 'a'.repeat(64), file_size: 100,
      page_count: 5, status: 'REVIEW_REQUIRED', issues: [],
      summary: { cases: 1, lectures: 1, extracted: 45, valid: 45, needs_review: 0, invalid: 0 },
    };
    if (path === '/questions/imports/essay/sessions') body = [];
    if (path === '/questions/imports/essay/sessions/inspect') body = {
      session_id:sessionId,total:45,summary:inspection.summary,
    };
    if (path === `/questions/imports/essay/sessions/${sessionId}`) body = {
      ...inspection, session_id:sessionId,total:45,revision:0,review:{},
    };
    if (path === `/questions/imports/essay/sessions/${sessionId}/candidates`) {
      const offset = Number(url.searchParams.get('offset') || 0);
      const limit = Number(url.searchParams.get('limit') || 100);
      body = { total: 45, offset, limit, candidates:candidates.slice(offset,offset+limit) };
    }
    if (path === `/questions/imports/essay/sessions/${sessionId}/review`) body = { revision:1 };
    if (path === '/questions/imports/essay/publish') {
      publishPayload = request.postDataJSON();
      body = { created: 45, reused: 0, skipped: 0 };
    }
    await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
  });
  page.on('dialog', dialog => void dialog.accept());
  await page.goto('/instructor/questions/import-essay');
  await expect(page.getByRole('heading', { name: 'Import Essay Questions' })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'mixed.pdf', mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\\n%%EOF'),
  });
  await page.getByText(/I confirm I have permission/).click();
  await page.getByRole('button', { name: /Inspect essay file/i }).click();
  await expect(page.getByText(/45 questions available/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Scroll through essay questions' })).toHaveCount(2);
  await expect(page.locator('.essay-import-question').count()).resolves.toBeLessThan(45);
  await expect(page.getByRole('option', { name: /Protein chemistry/ })).toHaveCount(1);
  const firstQuestion = page.getByRole('textbox', { name: 'Essay question Q1' }).first();
  await firstQuestion.fill('Edited essay prompt for Q1.');
  await expect(firstQuestion).toHaveValue('Edited essay prompt for Q1.');
  await page.getByRole('button', { name: 'Undo review edit' }).click();
  await expect(firstQuestion).toHaveValue('Question 1: Mention three findings.');
  await page.getByRole('button', { name: 'Redo review edit' }).click();
  await expect(firstQuestion).toHaveValue('Edited essay prompt for Q1.');
  await page.getByRole('button', { name: /Collapse all/ }).click();
  await expect(page.locator('.essay-import-question')).toHaveCount(0);
  await page.getByRole('button', { name: /Expand all/ }).click();
  await page.getByLabel('Jump to a case or lecture').selectOption({ label: 'Lecture 901: Protein chemistry' });
  await expect(page.locator('.essay-import-groups')).toContainText('Protein chemistry');
  const lectureViewport = page.getByRole('region', { name: 'Scroll through essay questions' });
  await lectureViewport.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(page.getByRole('textbox', { name: 'Essay question Q39' })).toBeVisible();
  await expect(page.locator('.essay-import-question').count()).resolves.toBeLessThan(39);

  await page.getByRole('button', { name: /Continue to organize/ }).click();
  await page.getByRole('button', { name: /Review publication summary/ }).click();
  await page.getByRole('button', { name: /Case Studio · Clinical cases/ }).click();
  await expect(page.getByText(/Assign a Case Studio week/)).toBeVisible();
  await page.getByRole('button', { name: /Question Bank · Essays/ }).click();
  await expect(page.getByText(/Assign a Question Bank topic/)).toBeVisible();
  expect(publishPayload).toBeNull();
});


test('instructor resumes a previously saved import without re-uploading the PDF', async ({ page }) => {
  const owner = {
    id: '11111111-1111-4111-8111-111111111111', email: 'teacher@example.test',
    full_name: 'Test Instructor', role: 'INSTRUCTOR', status: 'ACTIVE', emailVerified: true,
  };
  const sessionId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await page.addInitScript(() => {
    localStorage.removeItem('mdp_access_token');
    sessionStorage.removeItem('mdp_access_token');
    localStorage.removeItem('mdp_logged_out_at');
    localStorage.setItem('mdp-theme','dark');
    localStorage.setItem('mdp-locale','en');
  });
  await page.route('**/*', async route => {
    const request=route.request(),url=new URL(request.url());
    if(!url.pathname.includes('/api/v1')&&url.port!=='3000')return route.fallback();
    const path=url.pathname.split('/api/v1')[1]||url.pathname;
    const headers={
      'access-control-allow-origin':request.headers().origin||'http://127.0.0.1:3001',
      'access-control-allow-credentials':'true','access-control-allow-headers':'authorization,content-type',
      'access-control-allow-methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    };
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
    let body:unknown={};
    if(path==='/auth/refresh')body={access_token:'saved-essay-token',user:owner};
    if(path==='/auth/me')body=owner;
    if(path==='/notifications/unread/count')body={count:0};
    if(path==='/notifications')body={data:[]};
    if(path.startsWith('/academic/courses'))body={data:[]};
    if(path==='/questions/imports/essay/sessions')body=[{
      session_id:sessionId,original_filename:'saved-essay.pdf',total:1,revision:2,
    }];
    if(path===`/questions/imports/essay/sessions/${sessionId}`)body={
      session_id:sessionId,revision:2,total:1,original_filename:'saved-essay.pdf',
      file_sha256:'b'.repeat(64),page_count:2,file_size:128,status:'REVIEW_REQUIRED',
      summary:{cases:0,lectures:1,extracted:1,valid:1,needs_review:0,invalid:0},issues:[],
      review:{candidates:[{candidate_id:'saved-q1',approved:false,question_text:'Reviewed question from another device.'}]},
    };
    if(path===`/questions/imports/essay/sessions/${sessionId}/candidates`)body={
      total:1,offset:0,limit:200,candidates:[{
        candidate_id:'saved-q1',section:'Lecture 1: Cardiology',block_type:'LECTURE',
        case_number:1,case_label:'Lecture 1',case_stem:'Cardiology',
        question_number:1,question_text:'Original question text.',model_answer:'Answer from source.',
        answer_origin:'SOURCE',source_page:1,answer_page:2,extraction_confidence:1,
        status:'VALID',issues:[],
      }],
    };
    if(path===`/questions/imports/essay/sessions/${sessionId}/review`)body={revision:3};
    await route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('/instructor/questions/import-essay');
  await expect(page.getByRole('heading',{name:'Import Essay Questions'})).toBeVisible();
  await page.getByRole('button',{name:/saved-essay.pdf/}).click();
  await expect(page.getByRole('textbox',{name:'Essay question Q1'})).toHaveValue('Reviewed question from another device.');
  await expect(page.getByRole('checkbox',{name:/Q1/}).first()).not.toBeChecked();
  await expect(page.getByText(/Review saved automatically to your account/)).toBeVisible();
});


test('a 501-question saved essay session loads all pages but windows the editors', async ({ page }) => {
  const owner={id:'11111111-1111-4111-8111-111111111111',email:'teacher@example.test',
    full_name:'Test Instructor',role:'INSTRUCTOR',status:'ACTIVE',emailVerified:true};
  const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const candidates=Array.from({length:501},(_,i)=>({
    candidate_id:`large-q-${i+1}`,section:'Lecture 1: Cardiology',block_type:'LECTURE',
    case_number:1,case_label:'Lecture 1',case_stem:'Cardiology',
    question_number:i+1,question_text:`Question ${i+1}: Name the finding.`,
    model_answer:'Source-supported answer.',answer_origin:'SOURCE',
    source_page:1,answer_page:2,extraction_confidence:1,status:'VALID',issues:[],
  }));
  const requestedPages:number[]=[];
  await page.addInitScript(()=>{
    localStorage.removeItem('mdp_access_token');sessionStorage.removeItem('mdp_access_token');
    localStorage.removeItem('mdp_logged_out_at');localStorage.setItem('mdp-theme','dark');
    localStorage.setItem('mdp-locale','en');
  });
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(!url.pathname.includes('/api/v1')&&url.port!=='3000')return route.fallback();
    const path=url.pathname.split('/api/v1')[1]||url.pathname;
    const headers={'access-control-allow-origin':request.headers().origin||'http://127.0.0.1:3001',
      'access-control-allow-credentials':'true','access-control-allow-headers':'authorization,content-type',
      'access-control-allow-methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS'};
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
    let body:unknown={};
    if(path==='/auth/refresh')body={access_token:'large-session-token',user:owner};
    if(path==='/auth/me')body=owner;
    if(path==='/notifications/unread/count')body={count:0};
    if(path==='/notifications')body={data:[]};
    if(path.startsWith('/academic/courses'))body={data:[]};
    if(path==='/questions/imports/essay/sessions')body=[{session_id:id,original_filename:'large.pdf',total:501,revision:0}];
    if(path===`/questions/imports/essay/sessions/${id}`)body={
      session_id:id,revision:0,total:501,original_filename:'large.pdf',
      file_sha256:'b'.repeat(64),page_count:30,file_size:1024,status:'REVIEW_REQUIRED',
      summary:{cases:0,lectures:1,extracted:501,valid:501,needs_review:0,invalid:0},issues:[],review:{}};
    if(path===`/questions/imports/essay/sessions/${id}/candidates`){
      const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||100);
      requestedPages.push(offset);
      body={total:501,offset,limit,candidates:candidates.slice(offset,offset+limit)};
    }
    if(path===`/questions/imports/essay/sessions/${id}/review`)body={revision:1};
    await route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('/instructor/questions/import-essay');
  await page.getByRole('button',{name:/large.pdf/}).click();
  await expect(page.getByText(/501 questions available/)).toBeVisible();
  expect(requestedPages).toEqual([0,200,400]);
  const viewport=page.getByRole('region',{name:'Scroll through essay questions'});
  await expect(page.locator('.essay-import-question').count()).resolves.toBeLessThan(501);
  await viewport.evaluate(node=>{node.scrollTop=node.scrollHeight;});
  await expect(page.getByRole('textbox',{name:'Essay question Q501'})).toBeVisible();
  await expect(page.locator('.essay-import-question').count()).resolves.toBeLessThan(501);
});
