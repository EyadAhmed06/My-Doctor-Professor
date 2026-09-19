import {
  parseCanonicalMcqDocument,
  splitCanonicalSections,
} from './canonical-mcq-parser';
import { reflowMcqColumns, type UnicodeParsedPdf } from './pdf-text-extraction.service';

function pdfFromPages(pages: string[]): UnicodeParsedPdf {
  return {
    pages: pages.map((text, index) => ({ page: index + 1, text })),
    pageCount: pages.length,
    text: pages.join('\n'),
    extractionConfidence: 1,
  };
}

function fiveOptions(seed: string, style: 'paren' | 'wrapped' = 'paren'): string {
  const labels = ['A', 'B', 'C', 'D', 'E'];
  return labels
    .map((label) =>
      style === 'wrapped'
        ? `(${label}) ${seed} option ${label}`
        : `${label}) ${seed} option ${label}`,
    )
    .join('\n');
}

function section(
  name: string,
  count: number,
  answer = 'B',
  answerHeading = 'Answer Key',
): string {
  const questions = Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return `${number}) ${name} question ${number}?\n${fiveOptions(`${name} ${number}`)}`;
  }).join('\n');
  const key = Array.from(
    { length: count },
    (_, index) => `${index + 1}-${answer}`,
  ).join(', ');
  return `${name}\n${questions}\n${answerHeading}\n${key}`;
}

describe('canonical MCQ parser', () => {
  it('keeps legacy section-heading splitting as a compatibility fallback', () => {
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
    ].join('\n');

    expect(splitCanonicalSections(combined).map((item) => item.title)).toEqual([
      'Peptic ulcer',
      'GERD',
      'Dysphagia',
    ]);
  });

  it('uses answer-key endings to split arbitrary section names and repeated numbering', () => {
    const pdf = pdfFromPages([
      [
        'Upper GI Bleeding',
        `1) First upper GI question?\n${fiveOptions('ugi1')}`,
        `2) Second upper GI question?\n${fiveOptions('ugi2')}`,
        'Answers',
        '1-B, 2-D',
        'Inflammatory Bowel Disease',
        `1) First IBD question?\n${fiveOptions('ibd1')}`,
        `2) Second IBD question?\n${fiveOptions('ibd2')}`,
        `3) Third IBD question?\n${fiveOptions('ibd3')}`,
        'Correct Answers:',
        '1-A; 2-C; 3-E',
      ].join('\n'),
    ]);

    const parsed = parseCanonicalMcqDocument(pdf, 'MCQ');

    expect(parsed.sections.map((item) => item.title)).toEqual([
      'Upper GI Bleeding',
      'Inflammatory Bowel Disease',
    ]);
    expect(parsed.sections.map((item) => item.expectedQuestionCount)).toEqual([
      2,
      3,
    ]);
    expect(parsed.expectedQuestionCount).toBe(5);
    expect(parsed.parsedQuestionCount).toBe(5);
    expect(parsed.questions.map((question) => question.correctLabel)).toEqual([
      'B',
      'D',
      'A',
      'C',
      'E',
    ]);
    expect(parsed.isStructurallyComplete).toBe(true);
  });

  it('derives variable section counts and document total entirely from answer keys', () => {
    const requestedCounts: Record<string, number> = {
      'Peptic ulcer': 3,
      GERD: 7,
      'A completely new section': 2,
      'Another arbitrary heading': 5,
    };
    const pdf = pdfFromPages([
      'Any cover',
      '',
      ...Object.entries(requestedCounts).map(([name, count]) =>
        section(name, count, 'C'),
      ),
    ]);

    const parsed = parseCanonicalMcqDocument(pdf, 'MCQ');
    const total = Object.values(requestedCounts).reduce(
      (sum, count) => sum + count,
      0,
    );

    expect(parsed.expectedQuestionCount).toBe(total);
    expect(parsed.parsedQuestionCount).toBe(total);
    expect(parsed.isStructurallyComplete).toBe(true);
    expect(
      Object.fromEntries(
        parsed.sections.map((item) => [
          item.title,
          item.expectedQuestionCount,
        ]),
      ),
    ).toEqual(requestedCounts);
  });

  it('has no hard-coded section or document question ceiling', () => {
    const count = 517;
    const parsed = parseCanonicalMcqDocument(
      pdfFromPages([section('Large Dynamic Section', count, 'A')]),
      'MCQ',
    );

    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0].expectedQuestionCount).toBe(count);
    expect(parsed.sections[0].parsedQuestionCount).toBe(count);
    expect(parsed.expectedQuestionCount).toBe(count);
    expect(parsed.parsedQuestionCount).toBe(count);
    expect(parsed.questions).toHaveLength(count);
    expect(parsed.isStructurallyComplete).toBe(true);
  });

  it('does not impose the old 500-question or three-digit-number limits', () => {
    const count = 1001;
    const pdf = pdfFromPages([
      section('Large dynamic section', count, 'B'),
    ]);

    const parsed = parseCanonicalMcqDocument(pdf, 'MCQ');

    expect(parsed.expectedQuestionCount).toBe(count);
    expect(parsed.parsedQuestionCount).toBe(count);
    expect(parsed.questions).toHaveLength(count);
    expect(parsed.questions.at(-1)?.questionNumber).toBe(count);
    expect(parsed.isStructurallyComplete).toBe(true);
  });

  it('reports missing question numbers instead of accepting partial extraction', () => {
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
    expect(gerd.completeness).toBe(0.8);
    expect(parsed.isStructurallyComplete).toBe(false);
  });

  it('preserves a bottom answer key after two-column layout reflow', () => {
    const rows = [
      'Two Column Section',
      '1) Left question one?                         3) Right question three?',
      'A) left one A                                 A) right three A',
      'B) left one B                                 B) right three B',
      'C) left one C                                 C) right three C',
      'D) left one D                                 D) right three D',
      'E) left one E                                 E) right three E',
      '2) Left question two?                         4) Right question four?',
      'A) left two A                                 A) right four A',
      'B) left two B                                 B) right four B',
      'C) left two C                                 C) right four C',
      'D) left two D                                 D) right four D',
      'E) left two E                                 E) right four E',
      'Answer Key',
      '1-A, 2-B, 3-C, 4-D',
    ].join('\n');

    const reflowed = reflowMcqColumns(rows);
    const parsed = parseCanonicalMcqDocument(
      pdfFromPages([reflowed.text]),
      'MCQ',
    );

    expect(reflowed.reflowed).toBe(true);
    expect(reflowed.text.indexOf('4) Right question four?')).toBeLessThan(
      reflowed.text.indexOf('Answer Key'),
    );
    expect(parsed.questions.map((question) => question.questionNumber)).toEqual([
      1,
      2,
      3,
      4,
    ]);
    expect(parsed.questions.map((question) => question.correctLabel)).toEqual([
      'A',
      'B',
      'C',
      'D',
    ]);
    expect(parsed.isStructurallyComplete).toBe(true);
  });

  it('accepts common question and option marker variants', () => {
    const pdf = pdfFromPages([
      [
        'Flexible Formatting',
        'Question 1: Colon marker question?',
        '(A) first',
        '(B) second',
        '(C) third',
        '(D) fourth',
        '(E) fifth',
        'Q2 - Dash marker question?',
        'A: first',
        'B: second',
        'C: third',
        'D: fourth',
        'E: fifth',
        '3. Dot marker question?',
        'A. first',
        'B. second',
        'C. third',
        'D. fourth',
        'E. fifth',
        'Answer Keys: 1 – (B), 2—(C); 3: (D)',
      ].join('\n'),
    ]);

    const parsed = parseCanonicalMcqDocument(pdf, 'MCQ');

    expect(parsed.questions).toHaveLength(3);
    expect(parsed.questions.map((question) => question.questionNumber)).toEqual([
      1,
      2,
      3,
    ]);
    expect(parsed.questions.every((question) => question.options.length === 5)).toBe(true);
    expect(parsed.questions.map((question) => question.correctLabel)).toEqual([
      'B',
      'C',
      'D',
    ]);
  });

  it('flags conflicting answer entries instead of silently keeping one', () => {
    const pdf = pdfFromPages([
      [
        'Conflict Section',
        `1) Which answer?\n${fiveOptions('q1')}`,
        'Answer Key',
        '1-B, 1-D',
      ].join('\n'),
    ]);

    const parsed = parseCanonicalMcqDocument(pdf, 'MCQ');

    expect(parsed.sections[0].answerKeyConflicts).toEqual([
      { questionNumber: 1, labels: ['B', 'D'] },
    ]);
    expect(parsed.isStructurallyComplete).toBe(false);
  });

  it('flags duplicate question numbers inside one section', () => {
    const pdf = pdfFromPages([
      [
        'Duplicate Number Section',
        `1) First copy?\n${fiveOptions('first')}`,
        `1) Second copy?\n${fiveOptions('second')}`,
        'Answer Key',
        '1-A',
      ].join('\n'),
    ]);

    const parsed = parseCanonicalMcqDocument(pdf, 'MCQ');

    expect(parsed.sections[0].duplicateQuestionNumbers).toEqual([1]);
    expect(parsed.isStructurallyComplete).toBe(false);
  });

  it('preserves raw medical symbols in stems and option values', () => {
    const pdf = pdfFromPages([
      [
        'GERD',
        '15) Grade B uses >5 mm while Grade A may use <=5 mm; compare <75% and >75%.',
        'A) 60% & H₂ CO₂',
        'B) ± partial fundoplication',
        'C) cm² and 10⁶',
        'D) α β γ δ and × °',
        'E) → ← ↔',
        'Answer Key',
        '15-B',
      ].join('\n'),
    ]);

    const [question] = parseCanonicalMcqDocument(pdf, 'MCQ').questions;

    expect(question.questionText).toContain('>5 mm');
    expect(question.questionText).toContain('<=5 mm');
    expect(question.questionText).toContain('<75%');
    expect(question.questionText).toContain('>75%');
    expect(question.options.map((option) => option.text).join(' | ')).toContain(
      '± partial fundoplication',
    );
    expect(question.correctLabel).toBe('B');
  });

  it('preserves page provenance when a new section starts on the page after an answer key', () => {
    const pdf = pdfFromPages([
      [
        'Section Alpha',
        `1) Alpha question?\n${fiveOptions('alpha')}`,
        'Answer Key',
        '1-A',
      ].join('\n'),
      [
        'Section Beta',
        `1) Beta question?\n${fiveOptions('beta')}`,
        'Answer Key',
        '1-C',
      ].join('\n'),
    ]);

    const parsed = parseCanonicalMcqDocument(pdf, 'MCQ');

    expect(parsed.questions.map((question) => question.sourcePage)).toEqual([1, 2]);
    expect(parsed.questions.map((question) => question.answerKeyPage)).toEqual([1, 2]);
    expect(parsed.sections.map((section) => section.title)).toEqual([
      'Section Alpha',
      'Section Beta',
    ]);
  });

  it('retains physical source pages for question and answer-key provenance', () => {
    const pdf = pdfFromPages([
      'cover',
      '',
      `Peptic ulcer\n1) First question?\n${fiveOptions('q1')}`,
      `2) Second question?\n${fiveOptions('q2')}`,
      'Answer Key\n1-A 2-E',
    ]);

    const parsed = parseCanonicalMcqDocument(pdf, 'MCQ');
    expect(parsed.questions.map((question) => question.sourcePage)).toEqual([3, 4]);
    expect(parsed.questions.map((question) => question.answerKeyPage)).toEqual([5, 5]);
    expect(parsed.expectedQuestionCount).toBe(2);
    expect(parsed.isStructurallyComplete).toBe(true);
  });
});
