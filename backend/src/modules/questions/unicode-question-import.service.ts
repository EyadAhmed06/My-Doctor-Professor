import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Question } from '../../common/entities/question.entity';
import { Topic } from '../../common/entities/topic.entity';
import { AcademicAccessService } from '../academic/academic-access.service';
import {
  parseCanonicalMcqDocument,
  type CanonicalParsedQuestionDocument,
} from './canonical-mcq-parser';
import {
  PdfTextExtractionService,
  type UnicodeParsedPdf,
} from './pdf-text-extraction.service';
import { QuestionDocumentType } from './question-document-type';
import { QuestionImportService } from './question-import.service';

/**
 * Transitional adapter for the MCQ inspector.
 *
 * QuestionImportService historically owns parsing, validation, answer-key
 * mapping and publishing, but its PDF extraction method performs manual Tj/TJ
 * byte decoding and its legacy section parser assumes globally unique question
 * numbers. The canonical Gastroenterology template violates both assumptions:
 * it needs Unicode-aware extraction and deliberately restarts numbering in each
 * named section. This adapter replaces those two seams while leaving validation
 * and publication behavior intact.
 */
@Injectable()
export class UnicodeQuestionImportService extends QuestionImportService {
  constructor(
    @InjectRepository(Question)
    questions: Repository<Question>,
    @InjectRepository(Topic)
    topics: Repository<Topic>,
    dataSource: DataSource,
    academicAccess: AcademicAccessService,
    pdfTextExtraction: PdfTextExtractionService,
  ) {
    super(questions, topics, dataSource, academicAccess);

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
}
