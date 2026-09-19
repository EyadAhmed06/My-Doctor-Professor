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
const buffer = readFileSync(filePath);
let pdf = extractor.extract(buffer);
let parsed = parseCanonicalMcqDocument(pdf, 'MCQ');

const needsRecovery =
  parsed.isStructurallyComplete === false ||
  parsed.questions.some(
    (question) =>
      question.options.length !== 5 ||
      !question.correctLabel ||
      !question.options.some(
        (option) => option.label === question.correctLabel,
      ),
  );

if (needsRecovery) {
  const recoveredPdf = extractor.extract(buffer, { forceOcr: true });
  const recoveredParsed = parseCanonicalMcqDocument(recoveredPdf, 'MCQ');
  const validStructures = (document: typeof parsed) =>
    document.questions.filter(
      (question) =>
        question.options.length === 5 &&
        Boolean(question.correctLabel) &&
        question.options.some(
          (option) => option.label === question.correctLabel,
        ),
    ).length;
  const currentExpected = parsed.expectedQuestionCount ?? 0;
  const recoveredExpected = recoveredParsed.expectedQuestionCount ?? 0;
  const currentMissing =
    parsed.missingQuestionCount ?? Number.POSITIVE_INFINITY;
  const recoveredMissing =
    recoveredParsed.missingQuestionCount ?? Number.POSITIVE_INFINITY;
  const currentValid = validStructures(parsed);
  const recoveredValid = validStructures(recoveredParsed);

  const recoveryImproves =
    recoveredExpected >= currentExpected &&
    recoveredMissing <= currentMissing &&
    recoveredValid >= currentValid &&
    (
      recoveredMissing < currentMissing ||
      recoveredValid > currentValid ||
      (
        recoveredParsed.isStructurallyComplete === true &&
        parsed.isStructurallyComplete !== true
      ) ||
      recoveredParsed.questions.length > parsed.questions.length
    );

  if (recoveryImproves) {
    pdf = recoveredPdf;
    parsed = recoveredParsed;
  }
}

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
    section.unexpectedQuestionNumbers.length > 0 ||
    section.duplicateQuestionNumbers.length > 0 ||
    section.answerKeyConflicts.length > 0,
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
        const duplicates = section.duplicateQuestionNumbers.length
          ? ` duplicates=[${section.duplicateQuestionNumbers.join(',')}]`
          : '';
        const conflicts = section.answerKeyConflicts.length
          ? ` answer_conflicts=[${section.answerKeyConflicts
              .map((conflict) => conflict.questionNumber)
              .join(',')}]`
          : '';
        return `${name} expected=${section.expectedQuestionCount} parsed=${section.parsedQuestionCount}${missing}${unexpected}${duplicates}${conflicts}`;
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
  extractionMethod: pdf.extractionMethod ?? 'TEXT_LAYER',
  extractionConfidence: pdf.extractionConfidence,
  extractionBreakdown: {
    textLayerPages:
      pdf.textLayerPageCount ??
      pdf.pages.filter((page) => page.source === 'TEXT_LAYER').length,
    ocrPages:
      pdf.ocrPageCount ??
      pdf.pages.filter((page) => page.source === 'OCR').length,
    emptyPages:
      pdf.emptyPageCount ??
      pdf.pages.filter((page) => !page.text.trim()).length,
  },
  pageDiagnostics: pdf.pages.map((page) => ({
    page: page.page,
    source: page.source ?? 'TEXT_LAYER',
    confidence: page.confidence ?? pdf.extractionConfidence,
    textLength: page.textLength ?? page.text.trim().length,
    ocrAttempted: page.ocrAttempted ?? false,
    layoutReflowed: page.layoutReflowed ?? false,
  })),
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
    duplicateQuestionNumbers: section.duplicateQuestionNumbers,
    answerKeyConflicts: section.answerKeyConflicts,
  })),
  fiveOptionQuestions: parsed.questions.length - malformed.length,
  mappedAnswers: parsed.questions.length - unmapped.length,
  replacementCharacters,
  status: 'PASS',
};

console.log(JSON.stringify(report, null, 2));
