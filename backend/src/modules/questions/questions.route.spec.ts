import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AcademicAccessService } from '../academic/academic-access.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { InstructorQuestionAccessService } from './instructor-question-access.service';
import { QuestionExplanationLifecycleService } from './question-explanation-lifecycle.service';
import { QuestionImportAiEnrichmentService } from './question-import-ai-enrichment.service';
import { QuestionImportService } from './question-import.service';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { StudentQuestionAccessService } from './student-question-access.service';

describe('QuestionsController route registration', () => {
  let app: INestApplication;
  const inspectPdf = jest.fn().mockResolvedValue({ status: 'OK', candidates: [], issues: [] });
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
        { provide: QuestionImportAiEnrichmentService, useValue: { enrichInspection } },
        { provide: QuestionExplanationLifecycleService, useValue: { questionIdForOption: jest.fn(), invalidateQuestion: jest.fn() } },
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

  afterAll(async () => { if (app) await app.close(); });
  beforeEach(() => { inspectPdf.mockClear(); enrichInspection.mockClear(); });

  it('registers POST /api/v1/questions/imports/inspect as multipart without blocking on AI', async () => {
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
    expect(enrichInspection).not.toHaveBeenCalled();
    expect(response.body).toEqual({
      status: 'OK',
      candidates: [],
      issues: [],
      inspector_contract_version: 7,
      enrichment_contract: 'deferred-source-answer+question-explanation+four-or-five-option-explanations+difficulty',
    });
  });

  it('registers POST /api/v1/questions/imports/enrich for bounded AI batches', async () => {
    enrichInspection.mockImplementationOnce(async (inspection) => ({
      ...inspection,
      candidates: inspection.candidates.map((candidate: Record<string, unknown>) => ({
        ...candidate,
        explanation: 'Concise explanation.',
      })),
      enrichment_summary: { generated: 1, cached: 0, failed: 0, billing_deferred: 0 },
    }));

    const response = await request(app.getHttpServer())
      .post('/api/v1/questions/imports/enrich')
      .send({
        topic_name: 'GERD',
        candidates: [{
          candidate_id: 'candidate-1',
          question_text: 'Which treatment is preferred for this patient?',
          options: ['A', 'B', 'C', 'D', 'E'].map((label, index) => ({
            label,
            option_text: `Option ${label}`,
            is_correct: index === 2,
          })),
        }],
      });

    expect(response.status).toBe(201);
    expect(enrichInspection).toHaveBeenCalledTimes(1);
    expect(response.body.enrichment_contract).toBe('source-answer+question-explanation+four-or-five-option-explanations+difficulty');
    expect(response.body.candidates).toHaveLength(1);
    expect(response.body.enrichment_summary).toEqual({ generated: 1, cached: 0, failed: 0, billing_deferred: 0 });
  });

  it('passes existing AI state and force-regeneration intent into enrichment', async () => {
    enrichInspection.mockImplementationOnce(async (inspection) => inspection);
    const options = ['A', 'B', 'C', 'D', 'E'].map((label, index) => ({
      label,
      option_text: `Option ${label}`,
      is_correct: index === 2,
      explanation: `${label} reason`,
    }));

    const response = await request(app.getHttpServer())
      .post('/api/v1/questions/imports/enrich')
      .send({
        topic_name: 'GERD',
        force: true,
        candidates: [{
          candidate_id: 'candidate-cache',
          question_text: 'Which treatment is preferred for this patient?',
          explanation: 'Question reason',
          difficulty: 'HARD',
          options,
          ai_enrichment: {
            provider: 'OPENROUTER',
            model: 'meta/muse-spark-1.3',
            prompt_version: 'mcq-explanation-v2-concise',
            content_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            confidence: 0.95,
            answer_consistency: 'CONSISTENT',
            status: 'GENERATED',
          },
        }],
      });

    expect(response.status).toBe(201);
    expect(enrichInspection).toHaveBeenCalledTimes(1);
    expect(enrichInspection.mock.calls[0][0]).toEqual(expect.objectContaining({
      force_ai_regeneration: true,
      candidates: [expect.objectContaining({
        explanation: 'Question reason',
        difficulty: 'HARD',
        ai_enrichment: expect.objectContaining({
          provider: 'OPENROUTER',
          model: 'meta/muse-spark-1.3',
          prompt_version: 'mcq-explanation-v2-concise',
          status: 'GENERATED',
        }),
        options: expect.arrayContaining([
          expect.objectContaining({ label: 'A', explanation: 'A reason' }),
        ]),
      })],
    }));
  });
});
