import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configurePublicationBodyParser } from './publication-body-parser';

@Controller()
class BodyParserProbeController {
  @Post('auth/login')
  login(@Body() body: unknown) { return body; }

  @Post('bundles/test/enrollments')
  enroll(@Body() body: unknown) { return body; }

  @Post('questions/imports/publish')
  publish(@Body() body: { text: string }) { return { length: body.text.length }; }
}

describe('Publication body parsing', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [BodyParserProbeController] }).compile();
    app = moduleRef.createNestApplication();
    configurePublicationBodyParser(app);
    app.setGlobalPrefix('api/v1');
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('preserves login and enrollment JSON fields', async () => {
    const login = { email: 'student@example.test', password: 'test-password' };
    const enrollment = { student_id: '10000000-0000-4000-8000-000000000001' };
    await request(app.getHttpServer()).post('/api/v1/auth/login').send(login).expect(201, login);
    await request(app.getHttpServer()).post('/api/v1/bundles/test/enrollments').send(enrollment).expect(201, enrollment);
  });

  it('accepts publication JSON above 8 MB while retaining normal route limits', async () => {
    const text = 'x'.repeat(9 * 1024 * 1024);
    await request(app.getHttpServer()).post('/api/v1/questions/imports/publish').send({ text }).expect(201, { length: text.length });
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ text: 'x'.repeat(150 * 1024) }).expect(413);
  });
});
