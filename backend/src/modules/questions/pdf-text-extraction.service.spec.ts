import {
  calculatePdfExtractionConfidence,
  normalizePdfSymbolsForDisplay,
  splitPdftotextPages,
} from './pdf-text-extraction.service';

describe('PDF text extraction contract', () => {
  it('preserves page boundaries including the canonical watermark-only page 2', () => {
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

  it('keeps canonical medical and mathematical symbols unchanged in raw text', () => {
    const raw =
      '<=5 mm | >5 mm | <75% | >75% | ± partial fundoplication | 60% | × | ° | → ← ↔ | α β γ δ | H₂ CO₂ | cm² 10⁶ | &';
    const pages = splitPdftotextPages(`${raw}\f`, 1);

    expect(pages[0].text).toBe(raw);
  });

  it('normalizes only the explicitly approved presentation aliases', () => {
    const raw = '<=5 >=5 +/- -> <75% >75% H₂ cm² α &';

    expect(normalizePdfSymbolsForDisplay(raw)).toBe(
      '≤5 ≥5 ± → <75% >75% H₂ cm² α &',
    );
    expect(raw).toBe('<=5 >=5 +/- -> <75% >75% H₂ cm² α &');
  });

  it('reports high confidence for a normal Unicode text layer', () => {
    const pages = splitPdftotextPages(
      `${'Normal medical question text A) answer B) answer C) answer D) answer E) answer '.repeat(20)}\f`,
      1,
    );

    expect(calculatePdfExtractionConfidence(pages)).toBeGreaterThanOrEqual(0.95);
  });

  it('penalizes Unicode replacement-character corruption', () => {
    const clean = splitPdftotextPages(`${'medical text '.repeat(80)}\f`, 1);
    const corrupted = splitPdftotextPages(
      `${'medical � text � '.repeat(80)}\f`,
      1,
    );

    expect(calculatePdfExtractionConfidence(corrupted)).toBeLessThan(
      calculatePdfExtractionConfidence(clean),
    );
  });
});
