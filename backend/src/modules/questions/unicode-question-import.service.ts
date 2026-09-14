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
    // Capture explanations before publication because legacy clients currently submit
    // the human-editable serialized A-E block through question.explanation.
    const selected = dto.candidates.filter((candidate) => candidate.approved);
    const prepared = selected.map((candidate) => ({
      questionExplanation: this.questionOnlyExplanation(candidate.explanation),
      optionExplanations: candidate.options.some((option) => Boolean(option.explanation?.trim()))
        ? candidate.options.map((option) => option.explanation?.trim() || null)
        : this.optionExplanationsFromSerialized(candidate.explanation),
    }));

    // Keep the question-level explanation clean in the persisted Question row.
    const publishDto: PublishQuestionImportDto = {
      ...dto,
      candidates: dto.candidates.map((candidate) => {
        if (!candidate.approved) return candidate;
        const selectedIndex = selected.indexOf(candidate);
        return { ...candidate, explanation: prepared[selectedIndex]?.questionExplanation || candidate.explanation };
      }),
    };

    const result = await super.publish(publishDto, actor);
    const explanationUpdates: Array<{
      questionId: string;
      optionExplanations: Array<string | null>;
    }> = [];

    result.questions.forEach((published, index) => {
      if (published.action !== 'CREATED') return;
      const optionExplanations = prepared[index]?.optionExplanations || [];
      if (!optionExplanations.some(Boolean)) return;
      explanationUpdates.push({
        questionId: published.question_id,
        optionExplanations,
      });
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

  private questionOnlyExplanation(value?: string): string | undefined {
    if (!value?.trim()) return undefined;
    const marker = value.indexOf(OPTION_EXPLANATION_HEADER);
    return (marker >= 0 ? value.slice(0, marker) : value).trim() || undefined;
  }

  private optionExplanationsFromSerialized(value?: string): Array<string | null> {
    if (!value?.includes(OPTION_EXPLANATION_HEADER)) return [null, null, null, null, null];
    const block = value.slice(value.indexOf(OPTION_EXPLANATION_HEADER) + OPTION_EXPLANATION_HEADER.length).trim();
    const matches = Array.from(block.matchAll(/^([A-E])\)\s+([\s\S]*?)(?=^[A-E]\)\s+|$)/gm));
    const byLabel = new Map(matches.map((match) => [match[1], match[2].trim()]));
    return ['A', 'B', 'C', 'D', 'E'].map((label) => byLabel.get(label) || null);
  }
}
