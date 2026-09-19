import {
  parseCanonicalMcqDocument,
  splitCanonicalSections,
} from './canonical-mcq-parser';
import type { UnicodeParsedPdf } from './pdf-text-extraction.service';

function pdfFromPages(pages: string[]): UnicodeParsedPdf {
  return {
    pages: pages.map((text, index) => ({ page: index + 1, text })),
    pageCount: pages.length,
    text: pages.join('\n'),
    extractionConfidence: 1,
  };
}

function fiveOptions(seed: string): string {
  return [
    `A) ${seed} option A`,
    `B) ${seed} option B`,
    `C) ${seed} option C`,
    `D) ${seed} option D`,
    `E) ${seed} option E`,
  ].join('\n');
}

function section(name: string, count: number, answer = 'B'): string {
  const questions = Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return `${number}) ${name} question ${number}?\n${fiveOptions(`${name} ${number}`)}`;
  }).join('\n');
  const key = Array.from(
    { length: count },
    (_, index) => `${index + 1}) ${answer}`,
  ).join(' ');
  return `${name}\n${questions}\nAnswer Key\n${key}`;
}

describe('canonical MCQ parser', () => {
  it('recognizes all five canonical Gastroenterology sections', () => {
    const combined = [
      '[[MDP_PAGE_3]]',
      'Peptic ulcer',
      '1) Question',
      '[[MDP_PAGE_7]]',
      'GERD',
      '1) Question',
      '[[MDP_PAGE_13]]',
      'Dysphagia',
      '1) Question',
      '[[MDP_PAGE_18]]',
      'Gastric cancer',
      '1) Question',
      '[[MDP_PAGE_26]]',
      'Esophageal cancer',
      '1) Question',
    ].join('\n');

    expect(splitCanonicalSections(combined).map((item) => item.title)).toEqual([
      'Peptic ulcer',
      'GERD',
      'Dysphagia',
      'Gastric cancer',
      'Esophageal cancer',
    ]);
  });

  it('scopes repeated question numbers and answer keys to their own section', () => {
    const pdf = pdfFromPages([
      '',
      '',
      `Peptic ulcer\n1) Peptic question?\n${fiveOptions('peptic')}\nAnswer Key\n1) B`,
      `GERD\n1) GERD question?\n${fiveOptions('gerd')}\nAnswer Key\n1) D`,
    ]);

    const parsed = parseCanonicalMcqDocument(pdf, 'MCQ');

    expect(parsed.questions).toHaveLength(2);
    expect(parsed.questions.map((question) => ({
      section: question.sourceSection,
      number: question.questionNumber,
      answer: question.correctLabel,
    }))).toEqual([
      { section: 'Peptic ulcer', number: 1, answer: 'B' },
      { section: 'GERD', number: 1, answer: 'D' },
    ]);
    expect(parsed.answerKey.size).toBe(0);
    expect(parsed.expectedQuestionCount).toBe(2);
    expect(parsed.parsedQuestionCount).toBe(2);
    expect(parsed.isStructurallyComplete).toBe(true);
  });

  it('derives variable section counts and the document total from answer keys', () => {
    const requestedCounts: Record<string, number> = {
      'Peptic ulcer': 3,
      GERD: 7,
      Dysphagia: 2,
      'Gastric cancer': 5,
      'Esophageal cancer': 4,
    };
    const pages = [
      'Any cover length is allowed',
      '',
      ...Object.entries(requestedCounts).map(([name, count]) =>
        section(name, count, 'C'),
      ),
      'Trailing non-question page',
    ];

    const parsed = parseCanonicalMcqDocument(pdfFromPages(pages), 'MCQ');
    const expectedTotal = Object.values(requestedCounts).reduce(
      (sum, count) => sum + count,
      0,
    );

    expect(parsed.expectedQuestionCount).toBe(expectedTotal);
    expect(parsed.parsedQuestionCount).toBe(expectedTotal);
    expect(parsed.questions).toHaveLength(expectedTotal);
    expect(parsed.isStructurallyComplete).toBe(true);

    expect(
      Object.fromEntries(
        parsed.sections.map((item) => [
          item.title,
          {
            expected: item.expectedQuestionCount,
            parsed: item.parsedQuestionCount,
            missing: item.missingQuestionNumbers,
          },
        ]),
      ),
    ).toEqual(
      Object.fromEntries(
        Object.entries(requestedCounts).map(([name, count]) => [
          name,
          { expected: count, parsed: count, missing: [] },
        ]),
      ),
    );
  });

  it('reports missing questions from a section answer key instead of accepting a partial parse', () => {
    const pdf = pdfFromPages([
      [
        'GERD',
        `1) Question one?\n${fiveOptions('q1')}`,
        `2) Question two?\n${fiveOptions('q2')}`,
        `4) Question four?\n${fiveOptions('q4')}`,
        `5) Question five?\n${fiveOptions('q5')}`,
        'Answer Key',
        '1-B, 2-C, 3-A, 4-D, 5-E',
      ].join('\n'),
    ]);

    const parsed = parseCanonicalMcqDocument(pdf, 'MCQ');
    const [gerd] = parsed.sections;

    expect(gerd.expectedQuestionCount).toBe(5);
    expect(gerd.parsedQuestionCount).toBe(4);
    expect(gerd.missingQuestionNumbers).toEqual([3]);
    expect(gerd.unexpectedQuestionNumbers).toEqual([]);
    expect(gerd.completeness).toBe(0.8);
    expect(parsed.expectedQuestionCount).toBe(5);
    expect(parsed.parsedQuestionCount).toBe(4);
    expect(parsed.missingQuestionCount).toBe(1);
    expect(parsed.isStructurallyComplete).toBe(false);
  });

  it('preserves raw medical symbols in stems and option values', () => {
    const pdf = pdfFromPages([
      '',
      '',
      [
        'GERD',
        '15) Grade B uses >5 mm while Grade A may use <=5 mm; compare <75% and >75%.',
        'A) 60% & H₂ CO₂',
        'B) ± partial fundoplication',
        'C) cm² and 10⁶',
        'D) α β γ δ and × °',
        'E) → ← ↔',
        'Answer Key',
        '15) B',
      ].join('\n'),
    ]);

    const [question] = parseCanonicalMcqDocument(pdf, 'MCQ').questions;

    expect(question.questionText).toContain('>5 mm');
    expect(question.questionText).toContain('<=5 mm');
    expect(question.questionText).toContain('<75%');
    expect(question.questionText).toContain('>75%');
    expect(question.options.map((option) => option.text).join(' | ')).toContain('± partial fundoplication');
    expect(question.options.map((option) => option.text).join(' | ')).toContain('60% & H₂ CO₂');
    expect(question.options.map((option) => option.text).join(' | ')).toContain('cm² and 10⁶');
    expect(question.options.map((option) => option.text).join(' | ')).toContain('α β γ δ and × °');
    expect(question.options.map((option) => option.text).join(' | ')).toContain('→ ← ↔');
    expect(question.correctLabel).toBe('B');
  });

  it('retains real PDF page numbers for question and answer-key provenance', () => {
    const pdf = pdfFromPages([
      'cover',
      '',
      `Peptic ulcer\n1) First question?\n${fiveOptions('q1')}`,
      `2) Second question?\n${fiveOptions('q2')}`,
      'Answer Key\n1) A 2) E',
    ]);

    const parsed = parseCanonicalMcqDocument(pdf, 'MCQ');
    expect(parsed.questions.map((question) => question.sourcePage)).toEqual([3, 4]);
    expect(parsed.questions.map((question) => question.answerKeyPage)).toEqual([5, 5]);
    expect(parsed.expectedQuestionCount).toBe(2);
    expect(parsed.isStructurallyComplete).toBe(true);
  });
});
