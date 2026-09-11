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

type ParsingSection = {
  title: string | null;
  text: string;
  offset: number;
};

const CANONICAL_SECTION_HEADING =
  /^\s*((?:Lecture\s+(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|\d+)(?:\s*[:-])?[^\n]*)|Peptic\s+ulcer|GERD|Gastric\s+cancer|Esophageal\s+cancer)\s*$/gim;

export function splitCanonicalMcqSections(combined: string): ParsingSection[] {
  const headings = Array.from(combined.matchAll(CANONICAL_SECTION_HEADING));
  if (headings.length === 0) {
    return [{ title: null, text: combined, offset: 0 }];
  }

  return headings.map((heading, index) => {
    const offset = heading.index ?? 0;
    const end = headings[index + 1]?.index ?? combined.length;
    return {
      title: heading[1].replace(/\s+/g, ' ').trim(),
      text: combined.slice(offset, end),
      offset,
    };
  });
}

/**
 * Transitional adapter for the MCQ inspector.
 *
 * QuestionImportService historically owns parsing, validation, answer-key
 * mapping and publishing, but its PDF extraction method is private and performs
 * manual Tj/TJ byte decoding. Until that service is split into dedicated
 * parser/extractor collaborators, this adapter replaces the extraction seam and
 * the section-boundary seam while leaving validation/publishing behavior intact.
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

    const serviceWithTemplateSeams = this as unknown as {
      extractPdf: (buffer: Buffer) => UnicodeParsedPdf;
      splitLectureSections: (combined: string) => ParsingSection[];
    };

    Object.defineProperties(serviceWithTemplateSeams, {
      extractPdf: {
        configurable: false,
        enumerable: false,
        writable: false,
        value: (buffer: Buffer) => pdfTextExtraction.extract(buffer),
      },
      splitLectureSections: {
        configurable: false,
        enumerable: false,
        writable: false,
        value: splitCanonicalMcqSections,
      },
    });
  }
}
