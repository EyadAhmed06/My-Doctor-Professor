import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseCanonicalMcqDocument } from '../src/modules/questions/canonical-mcq-parser';
import { PdfTextExtractionService } from '../src/modules/questions/pdf-text-extraction.service';

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

const input = process.argv[2];
if (!input) {
  console.error('Usage: npm run audit:canonical-mcq-pdf -- <path-to-pdf>');
  process.exit(2);
}

const filePath = resolve(input);
const extractor = new PdfTextExtractionService();
const pdf = extractor.extract(readFileSync(filePath));
const parsed = parseCanonicalMcqDocument(pdf, 'MCQ');

if (!parsed.sections.length) {
  fail('no MCQ sections were detected');
}

const sectionsWithoutAnswerKeys = parsed.sections.filter(
  (section) => section.expectedQuestionCount === null,
);
if (sectionsWithoutAnswerKeys.length) {
  fail(
    `${sectionsWithoutAnswerKeys.length} section(s) have no detectable answer key: ${sectionsWithoutAnswerKeys
      .map((section) => section.title || 'UNSCOPED')
      .join(', ')}`,
  );
}

const incompleteSections = parsed.sections.filter(
  (section) =>
    section.missingQuestionNumbers.length > 0 ||
    section.unexpectedQuestionNumbers.length > 0,
);
if (incompleteSections.length) {
  fail(
    `section completeness mismatch: ${incompleteSections
      .map((section) => {
        const name = section.title || 'UNSCOPED';
        const missing = section.missingQuestionNumbers.length
          ? ` missing=[${section.missingQuestionNumbers.join(',')}]`
          : '';
        const unexpected = section.unexpectedQuestionNumbers.length
          ? ` unexpected=[${section.unexpectedQuestionNumbers.join(',')}]`
          : '';
        return `${name} expected=${section.expectedQuestionCount} parsed=${section.parsedQuestionCount}${missing}${unexpected}`;
      })
      .join('; ')}`,
  );
}

if (
  parsed.expectedQuestionCount === null ||
  parsed.questions.length !== parsed.expectedQuestionCount
) {
  fail(
    `document question count mismatch: answer keys describe ${parsed.expectedQuestionCount ?? 'unknown'} question(s), parser produced ${parsed.questions.length}`,
  );
}

const malformed = parsed.questions.filter((question) => {
  const labels = question.options.map((option) => option.label).join('');
  return question.options.length !== 5 || labels !== 'ABCDE';
});
if (malformed.length) {
  fail(
    `${malformed.length} question(s) violate A-E option contract: ${malformed
      .slice(0, 10)
      .map(
        (question) =>
          `${question.sourceSection}#${question.questionNumber}@p${question.sourcePage}`,
      )
      .join(', ')}`,
  );
}

const unmapped = parsed.questions.filter((question) => !question.correctLabel);
if (unmapped.length) {
  fail(
    `${unmapped.length} question(s) have no mapped answer: ${unmapped
      .slice(0, 10)
      .map(
        (question) =>
          `${question.sourceSection}#${question.questionNumber}@p${question.sourcePage}`,
      )
      .join(', ')}`,
  );
}

const invalidAnswers = parsed.questions.filter(
  (question) =>
    !question.correctLabel ||
    !question.options.some(
      (option) => option.label === question.correctLabel,
    ),
);
if (invalidAnswers.length) {
  fail(`${invalidAnswers.length} answer-key entries point outside A-E options`);
}

const replacementCharacters = Array.from(pdf.text).filter(
  (character) => character === '\uFFFD',
).length;
if (replacementCharacters > 0) {
  fail(
    `extracted text contains ${replacementCharacters} Unicode replacement character(s)`,
  );
}

const report = {
  file: filePath,
  pages: pdf.pageCount,
  extractionConfidence: pdf.extractionConfidence,
  expectedQuestions: parsed.expectedQuestionCount,
  parsedQuestions: parsed.parsedQuestionCount,
  missingQuestions: parsed.missingQuestionCount,
  structurallyComplete: parsed.isStructurallyComplete,
  sections: parsed.sections.map((section) => ({
    title: section.title || 'UNSCOPED',
    expectedQuestions: section.expectedQuestionCount,
    parsedQuestions: section.parsedQuestionCount,
    completeness: section.completeness,
    missingQuestionNumbers: section.missingQuestionNumbers,
    unexpectedQuestionNumbers: section.unexpectedQuestionNumbers,
  })),
  fiveOptionQuestions: parsed.questions.length - malformed.length,
  mappedAnswers: parsed.questions.length - unmapped.length,
  replacementCharacters,
  status: 'PASS',
};

console.log(JSON.stringify(report, null, 2));
