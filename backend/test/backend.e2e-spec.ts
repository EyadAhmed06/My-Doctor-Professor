import { generateKeyPairSync, randomUUID, sign } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

const expectStatuses = (
  responses: Array<{ status: number; body: unknown }>,
  expected: number[],
): void => {
  const actual = responses.map((response) => response.status).sort((a, b) => a - b);
  const sortedExpected = [...expected].sort((a, b) => a - b);
  if (actual.join(',') !== sortedExpected.join(',')) {
    throw new Error(
      `Unexpected HTTP results: ${JSON.stringify(
        responses.map((response) => ({ status: response.status, body: response.body })),
      )}`,
    );
  }
};

function signedTestDevice() {
  const {privateKey, publicKey} = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({format:'jwk'}) as {kty:string;crv:string;x:string;y:string};
  const deviceId = randomUUID();
  const message = Buffer.from(['MDP_DEVICE_BINDING_V1',deviceId,jwk.kty,jwk.crv,jwk.x,jwk.y].join('\n'));
  const signature = sign('sha256', message, {key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
  return { fields: {device_id:deviceId,device_public_key_jwk:jwk,device_registration_signature:signature}, signChallenge: (challenge:string) => sign('sha256',Buffer.from(challenge,'base64url'),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url') };
}

describe('Backend integration', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let bootstrappedInstructorEmail: string;

  beforeAll(async () => {
    process.env.ALLOW_ACCOUNT_BOOTSTRAP = 'true';
    process.env.ACCOUNT_BOOTSTRAP_TOKEN = 'integration-bootstrap-token-32-characters';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }));
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('published MCQ integrity accepts both four and five choices at the database layer', async () => {
    const rows = await dataSource.query(
      "SELECT pg_get_functiondef('assert_published_test_mcq_shape(uuid)'::regprocedure) AS definition",
    ) as Array<{ definition: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].definition).toMatch(/NOT IN\\s*\\(4,\\s*5\\)/i);
    expect(rows[0].definition).toMatch(/is_correct\\s*=\\s*true/i);
  });

  it('reports liveness and database readiness', async () => {
    await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
    const readiness = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200);
    expect(readiness.body).toMatchObject({ status: 'ready', database: 'up' });
  });

  it('atomically bootstraps one verified account per role and permanently closes', async () => {
    const suffix = Date.now().toString();
    const body = {
      admin: {
        full_name: 'Bootstrap Admin', email: `admin-${suffix}@example.test`,
        password: 'StrongPassword123', phone_number: `+2010${suffix.slice(-8)}`,
        employee_number: `ADMIN-${suffix}`,
      },
      instructor: {
        full_name: 'Bootstrap Instructor', email: `instructor-${suffix}@example.test`,
        password: 'StrongPassword123', phone_number: `+2011${suffix.slice(-8)}`,
        specialization: 'Medicine',
      },
      student: {
        full_name: 'Bootstrap Student', email: `student-${suffix}@example.test`,
        password: 'StrongPassword123', phone_number: `+2012${suffix.slice(-8)}`,
        student_number: `BOOT-${suffix}`, current_semester: 1,
      },
    };
    bootstrappedInstructorEmail = body.instructor.email;
    const responses = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/admin/bootstrap/accounts')
        .set('X-Bootstrap-Token', process.env.ACCOUNT_BOOTSTRAP_TOKEN!).send(body),
      request(app.getHttpServer()).post('/api/v1/admin/bootstrap/accounts')
        .set('X-Bootstrap-Token', process.env.ACCOUNT_BOOTSTRAP_TOKEN!).send(body),
    ]);
    expectStatuses(responses, [201, 409]);
    const created = responses.find((response) => response.status === 201)!;
    expect(created.body.accounts).toHaveLength(3);
    expect(created.body.accounts.every((account: { status:string;email_verified:boolean }) =>
      account.status === 'ACTIVE' && account.email_verified === true,
    )).toBe(true);
    await request(app.getHttpServer()).post('/api/v1/admin/bootstrap/accounts')
      .set('X-Bootstrap-Token', process.env.ACCOUNT_BOOTSTRAP_TOKEN!).send(body).expect(409);
  });

  it('instructor creates, lists, and deletes an unused draft bundle over real HTTP and PostgreSQL', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: bootstrappedInstructorEmail, password: 'StrongPassword123' })
      .expect(200);
    const authorization = `Bearer ${login.body.access_token as string}`;
    const suffix = Date.now().toString();
    const created = await request(app.getHttpServer())
      .post('/api/v1/bundles')
      .set('Authorization', authorization)
      .send({ title: 'Integration Test Bundle', slug: `e2e-bundle-${suffix}`, semester: 1, is_free: true })
      .expect(201);
    expect(created.body.title).toBe('Integration Test Bundle');
    const bundleId = created.body.id as string;
    const managed = await request(app.getHttpServer()).get('/api/v1/bundles/managed')
      .set('Authorization', authorization).expect(200);
    expect((managed.body as Array<{id:string}>).some(row => row.id === bundleId)).toBe(true);
    // An instructor must not gain access to student-only personal enrollments.
    await request(app.getHttpServer()).get('/api/v1/bundles/mine')
      .set('Authorization', authorization).expect(403);
    await request(app.getHttpServer()).delete(`/api/v1/bundles/${bundleId}`)
      .set('Authorization', authorization).expect(204);
    const deleted = await dataSource.query('SELECT id FROM bundles WHERE id=$1', [bundleId]) as unknown[];
    expect(deleted).toHaveLength(0);
  });

  it('serializes duplicate student signup', async () => {
    const suffix = Date.now().toString();
    const body = {
      full_name: 'Concurrency Student',
      email: `concurrency-${suffix}@example.test`,
      password: 'StrongPassword123',
      phone_number: `+2010${suffix.slice(-8)}`,
      role: 'STUDENT',
      current_semester: 1,
      ...signedTestDevice().fields,
    };
    const responses = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/auth/signup').send(body),
      request(app.getHttpServer()).post('/api/v1/auth/signup').send(body),
    ]);
    expectStatuses(responses, [201, 201]);
    const rows = await dataSource.query('SELECT count(*)::int AS count FROM users WHERE email=$1', [body.email]) as Array<{count:number}>;
    expect(rows[0].count).toBe(1);
  });

  it('rotates a refresh token once and rejects concurrent reuse', async () => {
    const suffix = (Date.now() + 1).toString();
    const email = `refresh-${suffix}@example.test`;
    const password = 'StrongPassword123';
    const device = signedTestDevice();
    await request(app.getHttpServer()).post('/api/v1/auth/signup').send({
      full_name: 'Refresh Student',
      email,
      password,
      phone_number: `+2015${suffix.slice(-8)}`,
      role: 'STUDENT',
      current_semester: 1,
      ...device.fields,
    }).expect(201);

    await dataSource.query(
      "UPDATE users SET email_verified=TRUE,status='ACTIVE' WHERE email=$1",
      [email],
    );
    const challengeStart = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password, ...device.fields })
      .expect(428);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password, ...device.fields,
        device_challenge_id: challengeStart.body.challenge_id,
        device_signature: device.signChallenge(challengeStart.body.challenge as string),
      })
      .expect(200);

    const token = login.body.refresh_token as string;
    const responses = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refresh_token: token }),
      request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refresh_token: token }),
    ]);
    expectStatuses(responses, [200, 409]);
    const rotatedToken = responses.find((response) => response.status === 200)!
      .body.refresh_token as string;
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: rotatedToken })
      .expect(200);
  });
});
