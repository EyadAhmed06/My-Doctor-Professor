import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseCanonicalMcqDocument } from '../src/modules/questions/canonical-mcq-parser';
import { PdfTextExtractionService } from '../src/modules/questions/pdf-text-extraction.service';

const EXPECTED_PAGES = 29;
const EXPECTED_SECTIONS: Record<string, number> = {
  'Peptic ulcer': 22,
  GERD: 28,
  Dysphagia: 24,
  'Gastric cancer': 39,
  'Esophageal cancer': 17,
};
const EXPECTED_TOTAL = Object.values(EXPECTED_SECTIONS).reduce((sum, count) => sum + count, 0);
const REQUIRED_RAW_TOKENS = [
  '<=5 mm',
  '>5 mm',
  '<75%',
  '>75%',
  '± partial fundoplication',
  '60%',
  '&',
];

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

const input = process.argv[2];
if (!input) {
  console.error('Usage: npm run audit:canonical-mcq-pdf -- <path-to-canonical.pdf>');
  process.exit(2);
}

const filePath = resolve(input);
const extractor = new PdfTextExtractionService();
const pdf = extractor.extract(readFileSync(filePath));
const parsed = parseCanonicalMcqDocument(pdf, 'MCQ');

if (pdf.pageCount !== EXPECTED_PAGES) {
  fail(`expected ${EXPECTED_PAGES} pages, extracted ${pdf.pageCount}`);
}
if (parsed.questions.length !== EXPECTED_TOTAL) {
  fail(`expected ${EXPECTED_TOTAL} questions, parsed ${parsed.questions.length}`);
}

const sectionCounts = parsed.questions.reduce<Record<string, number>>((result, question) => {
  const name = question.sourceSection || 'UNSCOPED';
  result[name] = (result[name] || 0) + 1;
  return result;
}, {});

for (const [name, count] of Object.entries(EXPECTED_SECTIONS)) {
  if (sectionCounts[name] !== count) {
    fail(`section ${name} expected ${count} questions, parsed ${sectionCounts[name] || 0}`);
  }
}

const malformed = parsed.questions.filter((question) => {
  const labels = question.options.map((option) => option.label).join('');
  return question.options.length !== 5 || labels !== 'ABCDE';
});
if (malformed.length) {
  fail(
    `${malformed.length} question(s) violate A-E option contract: ${malformed
      .slice(0, 10)
      .map((question) => `${question.sourceSection}#${question.questionNumber}@p${question.sourcePage}`)
      .join(', ')}`,
  );
}

const unmapped = parsed.questions.filter((question) => !question.correctLabel);
if (unmapped.length) {
  fail(
    `${unmapped.length} question(s) have no mapped answer: ${unmapped
      .slice(0, 10)
      .map((question) => `${question.sourceSection}#${question.questionNumber}@p${question.sourcePage}`)
      .join(', ')}`,
  );
}

const invalidAnswers = parsed.questions.filter(
  (question) =>
    !question.correctLabel ||
    !question.options.some((option) => option.label === question.correctLabel),
);
if (invalidAnswers.length) {
  fail(`${invalidAnswers.length} answer-key entries point outside A-E options`);
}

const missingTokens = REQUIRED_RAW_TOKENS.filter((token) => !pdf.text.includes(token));
if (missingTokens.length) {
  fail(`raw Unicode/symbol contract lost token(s): ${missingTokens.join(', ')}`);
}

const replacementCharacters = Array.from(pdf.text).filter((character) => character === '\uFFFD').length;
if (replacementCharacters > 0) {
  fail(`extracted text contains ${replacementCharacters} Unicode replacement character(s)`);
}

const report = {
  file: filePath,
  pages: pdf.pageCount,
  extractionConfidence: pdf.extractionConfidence,
  questions: parsed.questions.length,
  sections: sectionCounts,
  fiveOptionQuestions: parsed.questions.length - malformed.length,
  mappedAnswers: parsed.questions.length - unmapped.length,
  symbolTokensPreserved: REQUIRED_RAW_TOKENS,
  replacementCharacters,
  status: 'PASS',
};

console.log(JSON.stringify(report, null, 2));
