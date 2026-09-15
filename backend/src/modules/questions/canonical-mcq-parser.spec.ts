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
    return `${number}) ${name} canonical question ${number}?\n${fiveOptions(`${name} ${number}`)}`;
  }).join('\n');
  const key = Array.from({ length: count }, (_, index) => `${index + 1}) ${answer}`).join(' ');
  return `${name}\n${questions}\n${key}`;
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
      `Peptic ulcer\n1) Peptic question?\n${fiveOptions('peptic')}\n1) B`,
      `GERD\n1) GERD question?\n${fiveOptions('gerd')}\n1) D`,
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
  });

  it('matches the canonical 130-question section-count contract', () => {
    const pages = [
      'Canonical cover',
      '',
      section('Peptic ulcer', 22, 'A'),
      section('GERD', 28, 'B'),
      section('Dysphagia', 24, 'C'),
      section('Gastric cancer', 39, 'D'),
      section('Esophageal cancer', 17, 'E'),
    ];
    const parsed = parseCanonicalMcqDocument(pdfFromPages(pages), 'MCQ');

    expect(parsed.questions).toHaveLength(130);
    const counts = parsed.questions.reduce<Record<string, number>>((result, question) => {
      const name = question.sourceSection || 'unknown';
      result[name] = (result[name] || 0) + 1;
      return result;
    }, {});
    expect(counts).toEqual({
      'Peptic ulcer': 22,
      GERD: 28,
      Dysphagia: 24,
      'Gastric cancer': 39,
      'Esophageal cancer': 17,
    });
    expect(parsed.questions.every((question) => question.options.length === 5)).toBe(true);
    expect(parsed.questions.every((question) => Boolean(question.correctLabel))).toBe(true);
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
      '1) A 2) E',
    ]);

    const parsed = parseCanonicalMcqDocument(pdf, 'MCQ');
    expect(parsed.questions.map((question) => question.sourcePage)).toEqual([3, 4]);
    expect(parsed.questions.map((question) => question.answerKeyPage)).toEqual([5, 5]);
  });
});
