import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AcademicAccessService } from '../academic/academic-access.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { InstructorQuestionAccessService } from './instructor-question-access.service';
import { QuestionImportEnrichmentService } from './question-import-enrichment.service';
import { QuestionImportService } from './question-import.service';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { StudentQuestionAccessService } from './student-question-access.service';

describe('QuestionsController route registration', () => {
  let app: INestApplication;
  const inspectPdf = jest.fn().mockResolvedValue({ status: 'OK', candidates: [] });
  const enrichInspection = jest.fn().mockImplementation(async (inspection) => inspection);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [QuestionsController],
      providers: [
        { provide: QuestionsService, useValue: {} },
        { provide: StudentQuestionAccessService, useValue: {} },
        { provide: InstructorQuestionAccessService, useValue: {} },
        { provide: AcademicAccessService, useValue: {} },
        { provide: QuestionImportService, useValue: { inspectPdf, publish: jest.fn() } },
        { provide: QuestionImportEnrichmentService, useValue: { enrichInspection } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest().user = {
            userId: '10000000-0000-4000-8000-000000000002',
            sessionId: '20000000-0000-4000-8000-000000000002',
            email: 'instructor@example.test',
            role: 'INSTRUCTOR',
          };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    inspectPdf.mockClear();
    enrichInspection.mockClear();
  });

  it('registers POST /api/v1/questions/imports/inspect as multipart', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/questions/imports/inspect')
      .field('topic_id', '60000000-0000-4000-8000-000000000001')
      .field('copyright_confirmed', 'true')
      .attach('file', Buffer.from('%PDF-1.4\n%%EOF'), {
        filename: 'questions.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(201);
    expect(inspectPdf).toHaveBeenCalledTimes(1);
    expect(enrichInspection).toHaveBeenCalledTimes(1);
    expect(response.body).toEqual({
      status: 'OK',
      candidates: [],
      inspector_contract_version: 3,
      enrichment_contract: 'answer+explanation+difficulty',
    });
  });
});