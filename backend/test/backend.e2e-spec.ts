import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Backend integration', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
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

  it('reports liveness and database readiness', async () => {
    await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
    const readiness = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200);
    expect(readiness.body).toMatchObject({ status: 'ready', database: 'up' });
  });

  it('serializes duplicate student signup', async () => {
    const suffix = Date.now().toString();
    const body = {
      full_name: 'Concurrency Student',
      email: `concurrency-${suffix}@example.test`,
      password: 'StrongPassword123',
      phone_number: `+20${suffix.slice(-10).padStart(10, '1')}`,
      role: 'STUDENT',
      student_number: `ST-${suffix}`,
      current_semester: 1,
    };
    const responses = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/auth/signup').send(body),
      request(app.getHttpServer()).post('/api/v1/auth/signup').send(body),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  });

  it('rotates a refresh token once and rejects concurrent reuse', async () => {
    const suffix = (Date.now() + 1).toString();
    const email = `refresh-${suffix}@example.test`;
    const password = 'StrongPassword123';
    await request(app.getHttpServer()).post('/api/v1/auth/signup').send({
      full_name: 'Refresh Student',
      email,
      password,
      phone_number: `+21${suffix.slice(-10).padStart(10, '2')}`,
      role: 'STUDENT',
      student_number: `RF-${suffix}`,
      current_semester: 1,
    }).expect(201);

    await dataSource.query(
      "UPDATE users SET email_verified=TRUE,status='ACTIVE' WHERE email=$1",
      [email],
    );
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    const token = login.body.refresh_token as string;
    const responses = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refresh_token: token }),
      request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refresh_token: token }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);
  });
});
