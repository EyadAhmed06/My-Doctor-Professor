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

const OPTION_EXPLANATION_HEADER = '--- Option explanations ---';

/**
 * Unicode/canonical adapter for the MCQ inspector.
 *
 * Question-level and option-level explanations are deliberately persisted in
 * separate columns. The inspector may serialize both into one editable review
 * block, but that transport format must never leak into the canonical question
 * explanation stored in the database.
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
    private readonly pdfTextExtraction: PdfTextExtractionService,
  ) {
    super(questions, topics, importDataSource, academicAccess);
  }

  protected override async extractPdf(
    buffer: Buffer,
  ): Promise<UnicodeParsedPdf> {
    return this.pdfTextExtraction.extract(buffer);
  }

  protected override async recoverIncompletePdf(
    buffer: Buffer,
    currentPdf: UnicodeParsedPdf,
    pageNumbers: number[],
  ): Promise<UnicodeParsedPdf> {
    return this.pdfTextExtraction.recoverPages(
      buffer,
      currentPdf,
      pageNumbers,
    );
  }

  protected override parseQuestions(
    pdf: UnicodeParsedPdf,
    documentType?: QuestionDocumentType,
  ): CanonicalParsedQuestionDocument {
    return parseCanonicalMcqDocument(pdf, documentType);
  }

  override async publish(dto: PublishQuestionImportDto, actor: AuthenticatedUser) {
    const normalizedDto: PublishQuestionImportDto = {
      ...dto,
      candidates: dto.candidates.map((candidate) => {
        const serialized = this.deserializeInspectorExplanation(candidate.explanation);
        const optionExplanations = candidate.options.some((option) => Boolean(option.explanation?.trim()))
          ? candidate.options.map((option) => option.explanation?.trim() || null)
          : serialized.optionExplanations;
        return {
          ...candidate,
          explanation: serialized.questionExplanation || undefined,
          options: candidate.options.map((option, index) => ({
            ...option,
            explanation: optionExplanations[index] || undefined,
          })),
        };
      }),
    };

    const selected = normalizedDto.candidates.filter((candidate) => candidate.approved);
    const prepared = selected.map((candidate) => ({
      optionExplanations: candidate.options.map((option) => option.explanation?.trim() || null),
    }));

    const result = await super.publish(normalizedDto, actor);
    const explanationUpdates: Array<{
      questionId: string;
      optionExplanations: Array<string | null>;
    }> = [];

    result.questions.forEach((published, index) => {
      if (published.action !== 'CREATED') return;
      const optionExplanations = prepared[index]?.optionExplanations || [];
      if (!optionExplanations.some(Boolean)) return;
      explanationUpdates.push({ questionId: published.question_id, optionExplanations });
    });

    if (explanationUpdates.length) {
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

  private deserializeInspectorExplanation(value?: string): {
    questionExplanation: string | null;
    optionExplanations: Array<string | null>;
  } {
    const trimmed = value?.trim() || '';
    if (!trimmed.includes(OPTION_EXPLANATION_HEADER)) {
      return {
        questionExplanation: trimmed || null,
        optionExplanations: [null, null, null, null, null],
      };
    }

    const headerIndex = trimmed.indexOf(OPTION_EXPLANATION_HEADER);
    const questionExplanation = trimmed.slice(0, headerIndex).trim() || null;
    const block = trimmed.slice(headerIndex + OPTION_EXPLANATION_HEADER.length).trim();
    const matches = Array.from(block.matchAll(/^([A-E])\)\s+([\s\S]*?)(?=^[A-E]\)\s+|$)/gm));
    const byLabel = new Map(matches.map((match) => [match[1], match[2].trim()]));
    return {
      questionExplanation,
      optionExplanations: ['A', 'B', 'C', 'D', 'E'].map((label) => byLabel.get(label) || null),
    };
  }
}
