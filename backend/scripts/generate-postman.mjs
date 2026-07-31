import fs from 'fs';
import path from 'path';

const root = process.cwd();
const modules = path.join(root, 'src', 'modules');
const outDir = path.join(root, 'postman');
fs.mkdirSync(outDir, { recursive: true });

const controllerFiles = [];
for (const entry of fs.readdirSync(modules, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const directory = path.join(modules, entry.name);
  for (const file of fs.readdirSync(directory)) {
    if (file.endsWith('.controller.ts')) controllerFiles.push(path.join(directory, file));
  }
}
controllerFiles.push(path.join(root, 'src', 'app.controller.ts'));

const folderNames = {
  app: '00 - Root', health: '01 - Health', auth: '02 - Authentication',
  'admin-bootstrap': '02 - Account bootstrap',
  admin: '03 - Administration bootstrap', academic: '04 - Academic structure',
  questions: '05 - Question bank', tests: '06 - Assessments',
  flashcards: '07 - Flashcards', progress: '08 - Progress and dashboards',
  notifications: '09 - Notifications', users: '10 - User profiles', audit: '11 - Audit logs',
};

const authFor = (module, method, route) => {
  if (module === 'app' || module === 'health') return null;
  if (module === 'admin-bootstrap') return null;
  if (module === 'auth') return ['me', 'logout'].includes(route) ? 'adminAccessToken' : null;
  if (module === 'admin' || module === 'audit') return 'adminAccessToken';
  if (module === 'users') return 'studentAccessToken';
  if (module === 'questions') return ['GET'].includes(method) ? 'instructorAccessToken' : 'instructorAccessToken';
  if (module === 'tests') return route.includes('attempts/') || route.endsWith('/attempts') && method === 'POST'
    ? (route.endsWith('/grade') ? 'instructorAccessToken' : 'studentAccessToken')
    : 'instructorAccessToken';
  if (module === 'flashcards') return route.includes('/review') || route.includes('/progress') || route === 'cards/due'
    ? 'studentAccessToken' : 'instructorAccessToken';
  if (module === 'progress') {
    if (route.includes('dashboard/admin')) return 'adminAccessToken';
    if (route.includes('dashboard/instructor') || route.startsWith('analytics/')) return 'instructorAccessToken';
    return 'studentAccessToken';
  }
  if (module === 'notifications') return method === 'POST' ? 'adminAccessToken' : 'studentAccessToken';
  if (module === 'academic') {
    if (route === 'semesters' && method !== 'GET') return 'adminAccessToken';
    if (route === 'semesters/:semesterId/courses' && method === 'POST') return 'adminAccessToken';
    if (route.includes('/instructors')) return 'adminAccessToken';
    return method === 'GET' ? 'studentAccessToken' : 'instructorAccessToken';
  }
  return 'adminAccessToken';
};

const routeVar = (name) => ({
  semesterId: 'semesterId', courseId: 'courseId', instructorId: 'instructorId', weekId: 'weekId',
  lectureId: 'lectureId', topicId: 'topicId', resourceId: 'resourceId', questionId: 'questionId',
  optionId: 'optionId', tagId: 'tagId', testId: 'testId', attemptId: 'attemptId', answerId: 'answerId',
  deckId: 'deckId', cardId: 'cardId', notificationId: 'notificationId', userId: 'studentUserId', auditId: 'auditId',
}[name] ?? name);

const bodyMap = {
  'POST auth/login': { email: '{{adminEmail}}', password: '{{adminPassword}}' },
  'POST auth/signup': { full_name: 'Postman Student', email: '{{$randomEmail}}', password: 'PostmanPass123', phone_number: '+201000000001', role: 'STUDENT', student_number: 'PM-{{$timestamp}}', current_semester: 1 },
  'POST auth/email-verification/request': { email: '{{adminEmail}}' },
  'POST auth/email-verification/confirm': { token: '{{verificationToken}}' },
  'POST auth/password/forgot': { email: '{{adminEmail}}' },
  'POST auth/password/reset': { token: '{{passwordResetToken}}', new_password: '{{studentNewPassword}}', confirm_password: '{{studentNewPassword}}' },
  'POST auth/refresh': { refresh_token: '{{adminRefreshToken}}' },
  'POST admin/bootstrap/accounts': { admin: { full_name: 'Postman Super Admin', email: '{{adminEmail}}', password: '{{adminPassword}}', phone_number: '+201000000010', employee_number: 'PM-ADMIN-001' }, instructor: { full_name: 'Postman Instructor', email: '{{instructorEmail}}', password: '{{instructorPassword}}', phone_number: '+201000000011', specialization: 'Medicine', office_location: 'Postman Lab' }, student: { full_name: 'Postman Student', email: '{{studentEmail}}', password: '{{studentPassword}}', phone_number: '+201000000012', student_number: 'PM-STUDENT-001', current_semester: 1 } },
  'POST admin/users': { full_name: 'Postman Auxiliary Instructor', email: 'postman.aux.instructor+{{$timestamp}}@example.com', password: 'PostmanPass123', phone_number: '+201000000002', role: 'INSTRUCTOR', specialization: 'Medicine' },
  'POST admin/users/import': { users: [{ full_name: 'Postman Imported Student', email: 'postman.imported+{{$timestamp}}@example.com', password: 'PostmanPass123', phone_number: '+201000000003', role: 'STUDENT', student_number: 'PM-IMP-{{$timestamp}}', current_semester: 1 }] },
  'PUT admin/users/:userId': { full_name: 'Postman Updated User' },
  'PATCH admin/users/:userId/status': { status: 'ACTIVE' },
  'POST academic/semesters': { semester_number: 1, title: 'Postman Semester', description: 'Created by the full API collection' },
  'PUT academic/semesters/:semesterId': { title: 'Postman Semester Updated' },
  'POST academic/semesters/:semesterId/courses': { course_code: 'PM101', course_name: 'Postman Medicine', slug: 'postman-medicine', credit_hours: 3, display_order: 1 },
  'PUT academic/courses/:courseId': { course_name: 'Postman Medicine Updated', is_active: true },
  'POST academic/courses/:courseId/weeks': { week_number: 1, title: 'Postman Week', display_order: 1 },
  'PUT academic/weeks/:weekId': { title: 'Postman Week Updated' },
  'POST academic/weeks/:weekId/lectures': { lecture_number: 1, title: 'Postman Lecture', estimated_duration_minutes: 30, display_order: 1 },
  'PUT academic/lectures/:lectureId': { title: 'Postman Lecture Updated', is_published: true },
  'POST academic/lectures/:lectureId/topics': { topic_name: 'Postman Topic', display_order: 1 },
  'PUT academic/topics/:topicId': { topic_name: 'Postman Topic Updated' },
  'POST academic/lectures/:lectureId/resources': { resource_name: 'Postman Reference', resource_type: 'LINK', file_url: 'https://example.com/reference', description: 'Postman link resource' },
  'POST questions': { topic_id: '{{topicId}}', question_type: 'MCQ', title: 'Postman MCQ', question_text: 'Which option is correct?', explanation: 'Option A is correct.', difficulty: 'EASY', estimated_time_seconds: 30, marks: 1 },
  'PUT questions/:questionId': { title: 'Postman MCQ Updated', difficulty: 'MEDIUM', is_active: true },
  'POST questions/:questionId/options': { option_text: 'Correct option', is_correct: true, display_order: 1 },
  'PUT questions/options/:optionId': { option_text: 'Correct option updated', is_correct: true, display_order: 1 },
  'POST questions/tags': { tag_name: 'postman-{{$timestamp}}' },
  'POST questions/:questionId/essay-configuration': { minimum_word_count: 10, maximum_word_count: 500, model_answer: 'Postman model answer', grading_rubric: 'Award marks for correctness.' },
  'POST tests': { title: 'Postman Assessment', description: 'Full collection test', test_type: 'COURSE', course_id: '{{courseId}}', duration_minutes: 30, passing_marks: 1 },
  'PUT tests/:testId': { title: 'Postman Assessment Updated', is_published: true },
  'POST tests/:testId/questions': { question_id: '{{questionId}}', display_order: 1, marks: 1, time_limit_seconds: 60 },
  'POST tests/:testId/attempts': { test_mode: 'TUTOR' },
  'PUT tests/attempts/:attemptId/answers/:questionId': { selected_option_id: '{{optionId}}' },
  'POST tests/attempts/:attemptId/notes/:questionId': { note: 'Postman note' },
  'PUT tests/attempts/:attemptId/notes/:questionId': { note: 'Postman note updated' },
  'PUT tests/attempts/:attemptId/answers/:answerId/grade': { awarded_marks: 1, feedback: 'Postman grading feedback' },
  'POST flashcards/decks': { course_id: '{{courseId}}', title: 'Postman Deck', description: 'Full collection deck', display_order: 1 },
  'PUT flashcards/decks/:deckId': { title: 'Postman Deck Updated', is_published: true },
  'POST flashcards/decks/:deckId/cards': { title: 'Postman Card', front_content: 'Question', back_content: 'Answer', difficulty: 'EASY', estimated_review_seconds: 30, display_order: 1 },
  'PUT flashcards/cards/:cardId': { title: 'Postman Card Updated', difficulty: 'MEDIUM', is_active: true },
  'POST flashcards/cards/:cardId/review': { rating: 'GOOD' },
  'PUT progress/lectures/:lectureId': { completion_percentage: 100, time_spent_minutes_delta: 10, is_completed: true },
  'PUT progress/questions/:questionId/bookmark': { bookmarked: true },
  'POST notifications': { title: 'Postman Notification', message: 'Full collection notification', target_url: '/tests/{{testId}}', notification_type: 'TEST', user_ids: ['{{studentUserId}}'] },
  'PUT users/:userId': { full_name: 'Postman Student Updated', phone_number: '+201000000004' },
  'POST users/:userId/change-password': { current_password: '{{studentPassword}}', new_password: '{{studentNewPassword}}' },
};

const queryMap = {
  'GET academic/courses': [['page','1'],['limit','20'],['semester_id','{{semesterId}}']],
  'GET questions': [['page','1'],['limit','20'],['topic_id','{{topicId}}']],
  'GET questions/search': [['q','Postman'],['limit','20']],
  'GET tests': [['page','1'],['limit','20'],['course_id','{{courseId}}']],
  'GET flashcards/decks': [['page','1'],['limit','20'],['course_id','{{courseId}}']],
  'GET flashcards/decks/:deckId/cards': [['page','1'],['limit','20']],
  'GET flashcards/cards/due': [['page','1'],['limit','20']],
  'GET notifications': [['page','1'],['limit','20']],
  'GET admin/users': [['page','1'],['limit','20']],
  'GET audit-logs': [['page','1'],['limit','20']],
  'GET dashboard/instructor': [['course_id','{{courseId}}']],
  'GET analytics/questions': [['page','1'],['limit','20'],['course_id','{{courseId}}']],
  'GET analytics/tests': [['page','1'],['limit','20'],['test_id','{{testId}}']],
  'GET analytics/performance': [['page','1'],['limit','20'],['course_id','{{courseId}}']],
};

const captureFor = (method, route) => {
  const map = {
    'POST academic/semesters': 'semesterId', 'POST academic/semesters/:semesterId/courses': 'courseId',
    'POST academic/courses/:courseId/weeks': 'weekId', 'POST academic/weeks/:weekId/lectures': 'lectureId',
    'POST academic/lectures/:lectureId/topics': 'topicId', 'POST academic/lectures/:lectureId/resources': 'resourceId',
    'POST academic/lectures/:lectureId/resources/upload': 'uploadedResourceId', 'POST questions': 'questionId',
    'POST questions/:questionId/options': 'optionId', 'POST questions/tags': 'tagId',
    'POST tests': 'testId', 'POST tests/:testId/attempts': 'attemptId',
    'PUT tests/attempts/:attemptId/answers/:questionId': 'answerId', 'POST flashcards/decks': 'deckId',
    'POST flashcards/decks/:deckId/cards': 'cardId', 'POST notifications': 'notificationId',
    'POST admin/users': 'managedUserId',
  };
  return map[`${method} ${route}`];
};

const flowPriority = new Map([
  ['POST admin/users',10],['POST admin/users/import',60],['GET admin/users',70],['GET admin/users/:userId',80],
  ['PUT admin/users/:userId',90],['PATCH admin/users/:userId/status',100],['POST admin/users/:userId/reset-password',110],['GET admin/statistics',120],
  ['POST questions',10],['POST questions/tags',20],['POST questions/:questionId/options',30],['GET questions/:questionId/options',40],
  ['PUT questions/options/:optionId',50],['GET questions',60],['GET questions/search',70],['GET questions/tags/all',80],
  ['GET questions/:questionId',90],['PUT questions/:questionId',100],['POST questions/:questionId/duplicate',110],
  ['POST questions/:questionId/essay-configuration',120],['GET questions/:questionId/essay-configuration',130],
  ['POST questions/:questionId/tags/:tagId',140],
  ['POST tests',10],['POST tests/:testId/questions',20],['GET tests/:testId/questions',30],['PUT tests/:testId',40],
  ['GET tests',50],['GET tests/:testId',60],['POST tests/:testId/attempts',70],['GET tests/attempts/:attemptId',80],
  ['POST tests/attempts/:attemptId/flags/:questionId',90],['POST tests/attempts/:attemptId/notes/:questionId',100],
  ['PUT tests/attempts/:attemptId/notes/:questionId',110],['PUT tests/attempts/:attemptId/answers/:questionId',120],
  ['GET tests/attempts/:attemptId/answers',130],['POST tests/attempts/:attemptId/submit',140],
  ['PUT tests/attempts/:attemptId/answers/:answerId/grade',150],['GET tests/attempts/:attemptId/review',160],['GET tests/:testId/attempts',170],
  ['POST flashcards/decks',10],['POST flashcards/decks/:deckId/cards',20],['PUT flashcards/decks/:deckId',30],
  ['GET flashcards/decks',40],['GET flashcards/decks/:deckId',50],['GET flashcards/decks/:deckId/cards',60],
  ['PUT flashcards/cards/:cardId',70],['GET flashcards/cards/due',80],['GET flashcards/cards/:cardId/progress',90],['POST flashcards/cards/:cardId/review',100],
  ['POST notifications',10],['GET notifications',20],['GET notifications/unread/count',30],['PUT notifications/:notificationId',40],['PUT notifications/mark-read',50],
  ['POST academic/semesters',10],['GET academic/semesters',20],['GET academic/semesters/:semesterId',30],['PUT academic/semesters/:semesterId',40],
  ['POST academic/semesters/:semesterId/courses',50],['POST academic/courses/:courseId/instructors/:instructorId',60],
  ['GET academic/courses',70],['GET academic/courses/:courseId',80],['GET academic/courses/:courseId/instructors',90],['PUT academic/courses/:courseId',100],
  ['POST academic/courses/:courseId/weeks',110],['GET academic/courses/:courseId/weeks',120],['GET academic/weeks/:weekId',130],['PUT academic/weeks/:weekId',140],
  ['POST academic/weeks/:weekId/lectures',150],['PUT academic/lectures/:lectureId',160],['GET academic/weeks/:weekId/lectures',170],['GET academic/lectures/:lectureId',180],
  ['POST academic/lectures/:lectureId/topics',190],['GET academic/lectures/:lectureId/topics',200],['GET academic/topics/:topicId',210],['PUT academic/topics/:topicId',220],
  ['POST academic/lectures/:lectureId/resources',230],['POST academic/lectures/:lectureId/resources/upload',240],['GET academic/resources/:resourceId/file',250],['GET academic/lectures/:lectureId/resources',260],
]);

function extractRoutes(file) {
  const source = fs.readFileSync(file, 'utf8');
  const module = path.basename(file).replace('.controller.ts', '').replace('.controller', '');
  const prefix = source.match(/@Controller\((?:'([^']*)'|"([^"]*)")?\)/)?.slice(1).find(Boolean) ?? '';
  const routes = [];
  const re = /@(Get|Post|Put|Patch|Delete)\((?:'([^']*)'|"([^"]*)")?\)/g;
  for (const match of source.matchAll(re)) {
    const method = match[1].toUpperCase();
    const child = match[2] ?? match[3] ?? '';
    const route = [prefix, child].filter(Boolean).join('/');
    const after = source.slice(match.index + match[0].length);
    const methodName = after.match(/(?:@[A-Za-z][^\n]*\n\s*)*(?:async\s+)?([A-Za-z0-9_]+)\s*\(/)?.[1] ?? `${method} ${route}`;
    routes.push({ module, method, route, methodName, sourceIndex: match.index });
  }
  return routes;
}

const routes = controllerFiles.flatMap(extractRoutes);
const routeKeys = routes.map(r => `${r.method} ${r.route || '/'}`);
if (new Set(routeKeys).size !== routeKeys.length) throw new Error('Duplicate controller route detected');

const testScript = (capture) => {
  const lines = [
    "pm.test('No unexpected server error', () => pm.expect(pm.response.code).to.be.below(500));",
    "pm.test('Response time under 5 seconds', () => pm.expect(pm.response.responseTime).to.be.below(5000));",
  ];
  if (capture) lines.push(
    "if (pm.response.code >= 200 && pm.response.code < 300 && pm.response.text()) {",
    "  const json = pm.response.json();",
    "  const value = json.id ?? json.data?.id ?? json.result?.id;",
    `  if (value) pm.collectionVariables.set('${capture}', value);`,
    "}",
  );
  return [{ listen: 'test', script: { type: 'text/javascript', exec: lines } }];
};

function makeRequest(r) {
  const key = `${r.method} ${r.route}`;
  const authVariable = authFor(r.module, r.method, r.route);
  let rawPath = r.route.replace(/:([A-Za-z0-9_]+)/g, (_, name) => `{{${routeVar(name)}}}`);
  const query = queryMap[key] ?? [];
  const url = `{{baseUrl}}/${rawPath}` + (query.length ? '?' + query.map(([k,v]) => `${k}=${v}`).join('&') : '');
  const headers = [{ key: 'Accept', value: 'application/json' }];
  const request = { method: r.method, header: headers, url, description: `Controller source: ${path.relative(root, controllerFiles.find(f => path.basename(f).startsWith(r.module)) ?? '')}#${r.methodName}` };
  if (authVariable) request.auth = { type: 'bearer', bearer: [{ key: 'token', value: `{{${authVariable}}}`, type: 'string' }] };
  const body = bodyMap[key];
  if (body) {
    headers.push({ key: 'Content-Type', value: 'application/json' });
    request.body = { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } };
  }
  if (key === 'POST academic/lectures/:lectureId/resources/upload') {
    request.body = { mode: 'formdata', formdata: [
      { key: 'resource_name', value: 'Postman PDF upload', type: 'text' },
      { key: 'resource_type', value: 'PDF', type: 'text' },
      { key: 'description', value: 'Uploaded by Postman', type: 'text' },
      { key: 'file', type: 'file', src: '{{uploadFilePath}}' },
    ] };
  }
  if (key === 'POST admin/bootstrap/accounts') {
    request.header.push({key:'X-Bootstrap-Token',value:'{{bootstrapToken}}'});
  }
  if (key.includes('questions/:questionId/essay-configuration')) request.url=request.url.replace('{{questionId}}','{{essayQuestionId}}');
  if (key === 'PUT tests/attempts/:attemptId/answers/:answerId/grade') request.url=request.url.replace('{{answerId}}','{{essayAnswerId}}');
  if (key === 'GET academic/resources/:resourceId/file') request.url=request.url.replace('{{resourceId}}','{{uploadedResourceId}}');
  if (key === 'POST auth/login') request.description += '\nDuplicate this request as Login Admin/Instructor/Student by changing credential variables; dedicated login requests are prepended.';
  const item={ name: `${r.method} /${r.route || ''}`, request, event: testScript(captureFor(r.method, r.route)) };
  if(key==='POST admin/bootstrap/accounts') item.event=[{listen:'test',script:{type:'text/javascript',exec:[
    "pm.test('Bootstrap is created or already closed', () => pm.expect([201,409,503]).to.include(pm.response.code));",
    "if (pm.response.code === 201) { const accounts=pm.response.json().accounts ?? [];",
    "for (const account of accounts) { if(account.role==='SYSTEM_ADMIN') pm.collectionVariables.set('adminId',account.id); if(account.role==='INSTRUCTOR') pm.collectionVariables.set('instructorId',account.id); if(account.role==='STUDENT') pm.collectionVariables.set('studentUserId',account.id); } }",
  ]}}];
  return item;
}

const folderMap = new Map();
for (const route of routes) {
  const folder = folderNames[route.module] ?? route.module;
  if (!folderMap.has(folder)) folderMap.set(folder, []);
  folderMap.get(folder).push({ route, item: makeRequest(route) });
}

const loginItem = (name, emailVar, passwordVar, tokenPrefix) => ({
  name, request: { method: 'POST', header: [{key:'Content-Type',value:'application/json'},{key:'Accept',value:'application/json'}],
    body: { mode:'raw', raw: JSON.stringify({email:`{{${emailVar}}}`,password:`{{${passwordVar}}}`},null,2), options:{raw:{language:'json'}} },
    url: '{{baseUrl}}/auth/login' },
  event: [{ listen:'test', script:{type:'text/javascript',exec:[
    "pm.test('Login succeeds', () => pm.expect(pm.response.code).to.eql(200));",
    "if (pm.response.code === 200) { const json=pm.response.json();",
    `pm.collectionVariables.set('${tokenPrefix}AccessToken', json.access_token);`,
    `pm.collectionVariables.set('${tokenPrefix}RefreshToken', json.refresh_token);`,
    `if (json.user?.id) pm.collectionVariables.set('${tokenPrefix === 'student' ? 'studentUserId' : tokenPrefix + 'Id'}', json.user.id); }`,
  ]}}],
});

const authFolder = folderMap.get(folderNames.auth);
authFolder.unshift({route:null,item:loginItem('Login Admin and capture token','adminEmail','adminPassword','admin')});

const jsonRequest = (name, method, url, token, body, capture) => ({
  name, request:{method,url:`{{baseUrl}}/${url}`,auth:{type:'bearer',bearer:[{key:'token',value:`{{${token}}}`,type:'string'}]},
    header:[{key:'Content-Type',value:'application/json'},{key:'Accept',value:'application/json'}],
    body:{mode:'raw',raw:JSON.stringify(body,null,2),options:{raw:{language:'json'}}}},event:testScript(capture),
});

const adminEntries=folderMap.get(folderNames.admin);
const adminCreateIndex=adminEntries.findIndex(e=>e.route && `${e.route.method} ${e.route.route}`==='POST admin/users');
adminEntries.splice(adminCreateIndex+1,0,
  {route:null,priority:11,item:jsonRequest('Create managed Student for pipeline','POST','admin/users','adminAccessToken',
    {full_name:'Postman Student',email:'{{studentEmail}}',password:'{{studentPassword}}',phone_number:'+201000000005',role:'STUDENT',student_number:'PM-STUDENT-{{$timestamp}}',current_semester:1},'studentUserId')},
  {route:null,priority:12,item:loginItem('Login Instructor and capture token','instructorEmail','instructorPassword','instructor')},
  {route:null,priority:13,item:loginItem('Login Student and capture token','studentEmail','studentPassword','student')},
);

const questionEntries=folderMap.get(folderNames.questions);
const questionCreateIndex=questionEntries.findIndex(e=>e.route && `${e.route.method} ${e.route.route}`==='POST questions');
questionEntries.splice(questionCreateIndex+1,0,{route:null,priority:11,item:jsonRequest('Create ESSAY question for essay workflow','POST','questions','instructorAccessToken',
  {topic_id:'{{topicId}}',question_type:'ESSAY',title:'Postman Essay',question_text:'Explain the clinical reasoning.',difficulty:'MEDIUM',estimated_time_seconds:300,marks:5},'essayQuestionId')});

const testEntries=folderMap.get(folderNames.tests);
const addTestQuestionIndex=testEntries.findIndex(e=>e.route && `${e.route.method} ${e.route.route}`==='POST tests/:testId/questions');
testEntries.splice(addTestQuestionIndex+1,0,{route:null,priority:21,item:jsonRequest('Add ESSAY question to assessment','POST','tests/{{testId}}/questions','instructorAccessToken',
  {question_id:'{{essayQuestionId}}',display_order:2,marks:5,time_limit_seconds:300})});
const saveAnswerIndex=testEntries.findIndex(e=>e.route && `${e.route.method} ${e.route.route}`==='PUT tests/attempts/:attemptId/answers/:questionId');
testEntries.splice(saveAnswerIndex+1,0,{route:null,priority:121,item:jsonRequest('Save ESSAY answer and capture answer ID','PUT','tests/attempts/{{attemptId}}/answers/{{essayQuestionId}}','studentAccessToken',
  {essay_answer:'Postman essay response with sufficient content for grading.'},'essayAnswerId')});

const folders = [...folderMap.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([name, entries]) => {
  const active = entries.filter(e => !e.route || (e.route.method !== 'DELETE' && `${e.route.method} ${e.route.route}` !== 'POST auth/logout'));
  active.sort((a,b)=>{
    const ak=a.route?`${a.route.method} ${a.route.route}`:'',bk=b.route?`${b.route.method} ${b.route.route}`:'';
    const ap=a.priority??flowPriority.get(ak)??1000+(a.route?.sourceIndex??0);
    const bp=b.priority??flowPriority.get(bk)??1000+(b.route?.sourceIndex??0);
    return ap-bp;
  });
  return { name, item: active.map(e=>e.item) };
});
const deletes = routes.filter(r => r.method === 'DELETE').reverse().map(makeRequest);
const logoutRoute=routes.find(r=>`${r.method} ${r.route}`==='POST auth/logout');
if(logoutRoute) deletes.push(makeRequest(logoutRoute));
folders.push({ name:'99 - Cleanup (destructive; run last)', description:'Delete requests are deliberately isolated so collection prerequisites survive a sequential run.', item:deletes });

const variables = [
  ['baseUrl','http://localhost:3000/api/v1'], ['bootstrapToken','REPLACE_WITH_32_PLUS_CHARACTER_BOOTSTRAP_TOKEN'], ['adminEmail','admin@example.com'], ['adminPassword','ChangeMeAdmin123'],
  ['instructorEmail','instructor@example.com'], ['instructorPassword','ChangeMeInstructor123'],
  ['studentEmail','student@example.com'], ['studentPassword','ChangeMeStudent123'], ['studentNewPassword','ChangeMeStudent456'],
  ['verificationToken','PASTE_FROM_EMAIL'], ['passwordResetToken','PASTE_FROM_EMAIL'], ['uploadFilePath',''],
  ...['adminAccessToken','adminRefreshToken','instructorAccessToken','instructorRefreshToken','studentAccessToken','studentRefreshToken','adminId','studentUserId','instructorId','managedUserId','semesterId','courseId','weekId','lectureId','topicId','resourceId','uploadedResourceId','questionId','essayQuestionId','optionId','tagId','testId','attemptId','answerId','essayAnswerId','deckId','cardId','notificationId','auditId'].map(k=>[k,'']),
].map(([key,value])=>({key,value,type:'string'}));

const collection = {
  info: { _postman_id:'ca9ca204-f27b-4f72-bd94-34f22512fce0', name:'My Doctor Professor - Complete Backend API',
    description:`Generated from NestJS controllers. ${routes.length} unique controller routes are included. Run folders in numeric order; provide seeded role credentials first. Email confirmation/reset tokens and upload file path are manual inputs. Cleanup is destructive and intentionally last.`,
    schema:'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  variable:variables, item:folders,
};

const environment = { id:'cc1db627-7292-4fd5-a56d-e08cacfe102c', name:'My Doctor Professor - Local',
  values:variables.filter(v=>['baseUrl','bootstrapToken','adminEmail','adminPassword','instructorEmail','instructorPassword','studentEmail','studentPassword','studentNewPassword','verificationToken','passwordResetToken','uploadFilePath'].includes(v.key)).map(v=>({...v,enabled:true})),
  _postman_variable_scope:'environment', _postman_exported_using:'My Doctor Professor generator' };

fs.writeFileSync(path.join(outDir,'My-Doctor-Professor.postman_collection.json'),JSON.stringify(collection,null,2)+'\n');
fs.writeFileSync(path.join(outDir,'My-Doctor-Professor.local.postman_environment.json'),JSON.stringify(environment,null,2)+'\n');
fs.writeFileSync(path.join(outDir,'controller-route-inventory.json'),JSON.stringify({count:routes.length,routes:routeKeys.sort()},null,2)+'\n');

const collectionKeys=[];
for(const folder of collection.item) for(const item of folder.item){
  const match=item.name.match(/^(GET|POST|PUT|PATCH|DELETE) \/(.*)$/);
  if(match) collectionKeys.push(`${match[1]} ${match[2] || '/'}`);
}
const normalizedCollection=new Set(collectionKeys);
const missing=routeKeys.filter(k=>!normalizedCollection.has(k));
if(missing.length) throw new Error(`Postman coverage missing: ${missing.join(', ')}`);
console.log(`Generated Postman collection with ${routes.length} unique controller routes; coverage complete.`);
