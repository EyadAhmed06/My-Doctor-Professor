import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Question } from '../../common/entities/question.entity';
import { Topic } from '../../common/entities/topic.entity';
import { AcademicAccessService } from '../academic/academic-access.service';
import {
  PdfTextExtractionService,
  type UnicodeParsedPdf,
} from './pdf-text-extraction.service';
import { QuestionImportService } from './question-import.service';

/**
 * Transitional adapter for the MCQ inspector.
 *
 * QuestionImportService historically owns parsing, validation, answer-key
 * mapping and publishing, but its PDF extraction method is private and performs
 * manual Tj/TJ byte decoding. Until that service is split into dedicated
 * parser/extractor collaborators, this adapter replaces only the extraction
 * seam at instance construction time and leaves the rest of the import flow
 * untouched.
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

    const serviceWithExtractionSeam = this as unknown as {
      extractPdf: (buffer: Buffer) => UnicodeParsedPdf;
    };
    Object.defineProperty(serviceWithExtractionSeam, 'extractPdf', {
      configurable: false,
      enumerable: false,
      writable: false,
      value: (buffer: Buffer) => pdfTextExtraction.extract(buffer),
    });
  }
}
