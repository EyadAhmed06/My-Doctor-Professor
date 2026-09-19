import {
  calculatePageExtractionConfidence,
  calculatePdfExtractionConfidence,
  normalizePdfSymbolsForDisplay,
  reflowMcqColumns,
  shouldOcrPage,
  splitPdftotextPages,
  stripCanonicalPageFurniture,
} from './pdf-text-extraction.service';

describe('PDF text extraction contract', () => {
  it('preserves physical page boundaries including empty pages', () => {
    const pages = splitPdftotextPages(
      'Cover\f\fGastroenterology Week 1\n1) Question\nA) One\nB) Two\nC) Three\nD) Four\nE) Five\f',
      3,
    );

    expect(pages).toEqual([
      { page: 1, text: 'Cover' },
      { page: 2, text: '' },
      {
        page: 3,
        text: 'Gastroenterology Week 1\n1) Question\nA) One\nB) Two\nC) Three\nD) Four\nE) Five',
      },
    ]);
  });

  it('strips known repeated template furniture without touching medical text', () => {
    const source = [
      'My Doctor& The Professor',
      '(Week 1)',
      'Page|9',
      'GERD',
      '12) Which grade contains a mucosal break <=5 mm?',
      'A) <=5 mm',
      'B) >5 mm',
      'C) <75%',
      'D) >75%',
      'E) 100%',
    ].join('\n');

    expect(stripCanonicalPageFurniture(source)).toBe(
      [
        'GERD',
        '12) Which grade contains a mucosal break <=5 mm?',
        'A) <=5 mm',
        'B) >5 mm',
        'C) <75%',
        'D) >75%',
        'E) 100%',
      ].join('\n'),
    );
  });

  it('reflows a stable two-column MCQ page into left-column then right-column reading order', () => {
    const source = [
      '1) Left question                         3) Right question',
      'A) Left A                               A) Right A',
      'B) Left B                               B) Right B',
      'C) Left C                               C) Right C',
      'D) Left D                               D) Right D',
      'E) Left E                               E) Right E',
      '2) Left second                           4) Right second',
    ].join('\n');

    const result = reflowMcqColumns(source);

    expect(result.reflowed).toBe(true);
    expect(result.text.indexOf('1) Left question')).toBeLessThan(
      result.text.indexOf('2) Left second'),
    );
    expect(result.text.indexOf('2) Left second')).toBeLessThan(
      result.text.indexOf('3) Right question'),
    );
    expect(result.text).toContain('A) Right A');
    expect(result.text).toContain('4) Right second');
  });

  it('does not reflow ordinary single-column prose', () => {
    const source = [
      'GERD',
      '1) A normal single-column question?',
      'A) First option',
      'B) Second option',
      'C) Third option',
      'D) Fourth option',
      'E) Fifth option',
    ].join('\n');

    expect(reflowMcqColumns(source)).toEqual({
      text: source,
      reflowed: false,
    });
  });

  it('keeps medical and mathematical symbols unchanged in raw text', () => {
    const raw =
      '<=5 mm | >5 mm | <75% | >75% | ± partial fundoplication | 60% | × | ° | → ← ↔ | α β γ δ | H₂ CO₂ | cm² 10⁶ | &';
    const pages = splitPdftotextPages(`${raw}\f`, 1);

    expect(pages[0].text).toBe(raw);
  });

  it('normalizes only approved presentation aliases', () => {
    const raw = '<=5 >=5 +/- -> <75% >75% H₂ cm² α &';

    expect(normalizePdfSymbolsForDisplay(raw)).toBe(
      '≤5 ≥5 ± → <75% >75% H₂ cm² α &',
    );
    expect(raw).toBe('<=5 >=5 +/- -> <75% >75% H₂ cm² α &');
  });

  it('scores a structurally rich MCQ text layer highly', () => {
    const text = [
      '1) Which statement is correct?',
      'A) Alpha option',
      'B) Beta option',
      'C) Gamma option',
      'D) Delta option',
      'E) Epsilon option',
      'Answer Key',
      '1-B',
    ].join('\n');

    expect(calculatePageExtractionConfidence(text)).toBeGreaterThanOrEqual(0.9);
    expect(shouldOcrPage(text)).toBe(false);
  });

  it('marks empty or weak pages for OCR independently of the rest of the PDF', () => {
    expect(shouldOcrPage('')).toBe(true);
    expect(shouldOcrPage('Page 12')).toBe(true);
    expect(
      shouldOcrPage(
        '1) Question\nA) one\nB) two\nC) three\nD) four\nE) five',
      ),
    ).toBe(false);
  });

  it('penalizes a document with many empty pages instead of reporting false near-100% confidence', () => {
    const full = [
      '1) Question',
      'A) one',
      'B) two',
      'C) three',
      'D) four',
      'E) five',
    ].join('\n');
    const pages = [
      { page: 1, text: full },
      { page: 2, text: full },
      { page: 3, text: '' },
      { page: 4, text: '' },
      { page: 5, text: '' },
    ];

    expect(calculatePdfExtractionConfidence(pages)).toBeLessThan(0.65);
  });

  it('penalizes Unicode replacement-character corruption', () => {
    const clean =
      '1) medical text\nA) answer\nB) answer\nC) answer\nD) answer\nE) answer';
    const corrupted =
      '1) medical � text �\nA) �\nB) answer\nC) �\nD) answer\nE) �';

    expect(calculatePageExtractionConfidence(corrupted)).toBeLessThan(
      calculatePageExtractionConfidence(clean),
    );
  });
});
