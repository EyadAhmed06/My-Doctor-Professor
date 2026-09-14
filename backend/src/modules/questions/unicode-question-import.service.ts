import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { McqOption } from '../../common/entities/mcq-option.entity';
import { Question } from '../../common/entities/question.entity';
import { Topic } from '../../common/entities/topic.entity';
import { AcademicAccessService } from '../academic/academic-access.service';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import {
  parseCanonicalMcqDocument,
  type CanonicalParsedQuestionDocument,
} from './canonical-mcq-parser';
import type { PublishQuestionImportDto } from './dtos/questions.dto';
import {
  PdfTextExtractionService,
  type UnicodeParsedPdf,
} from './pdf-text-extraction.service';
import { QuestionDocumentType } from './question-document-type';
import { QuestionImportService } from './question-import.service';

/**
 * Transitional adapter for the MCQ inspector.
 *
 * It replaces the legacy manual PDF decoding/parser seams with Unicode-aware
 * extraction and canonical section-aware parsing. It also persists the new
 * per-option explanations returned by the inspector without changing the
 * legacy publication transaction internals.
 */
@Injectable()
export class UnicodeQuestionImportService extends QuestionImportService {
  constructor(
    @InjectRepository(Question)
    questions: Repository<Question>,
    @InjectRepository(Topic)
    topics: Repository<Topic>,
    private readonly importDataSource: DataSource,
    academicAccess: AcademicAccessService,
    pdfTextExtraction: PdfTextExtractionService,
  ) {
    super(questions, topics, importDataSource, academicAccess);

    const serviceWithCanonicalSeams = this as unknown as {
      extractPdf: (buffer: Buffer) => UnicodeParsedPdf;
      parseQuestions: (
        pdf: UnicodeParsedPdf,
        documentType?: QuestionDocumentType,
      ) => CanonicalParsedQuestionDocument;
    };

    Object.defineProperties(serviceWithCanonicalSeams, {
      extractPdf: {
        configurable: false,
        enumerable: false,
        writable: false,
        value: (buffer: Buffer) => pdfTextExtraction.extract(buffer),
      },
      parseQuestions: {
        configurable: false,
        enumerable: false,
        writable: false,
        value: (
          pdf: UnicodeParsedPdf,
          documentType?: QuestionDocumentType,
        ) => parseCanonicalMcqDocument(pdf, documentType),
      },
    });
  }

  override async publish(dto: PublishQuestionImportDto, actor: AuthenticatedUser) {
    const result = await super.publish(dto, actor);
    const selected = dto.candidates.filter((candidate) => candidate.approved);

    const explanationUpdates: Array<{
      questionId: string;
      optionExplanations: Array<string | null>;
    }> = [];

    result.questions.forEach((published, index) => {
      const candidate = selected[index];
      if (!candidate || published.action !== 'CREATED') return;
      explanationUpdates.push({
        questionId: published.question_id,
        optionExplanations: candidate.options.map((option) => option.explanation?.trim() || null),
      });
    });

    if (explanationUpdates.some((update) => update.optionExplanations.some(Boolean))) {
      await this.importDataSource.transaction(async (manager) => {
        for (const update of explanationUpdates) {
          const options = await manager.find(McqOption, {
            where: { questionId: update.questionId },
            order: { displayOrder: 'ASC' },
          });
          if (options.length !== update.optionExplanations.length) {
            throw new Error(`Published question ${update.questionId} option count changed before explanation persistence.`);
          }
          for (let index = 0; index < options.length; index += 1) {
            options[index].explanation = update.optionExplanations[index];
          }
          await manager.save(McqOption, options);
        }
      });
    }

    return result;
  }
}
