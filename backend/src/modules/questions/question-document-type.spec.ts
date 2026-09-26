import { detectQuestionDocumentType } from './question-document-type';

describe('detectQuestionDocumentType', () => {
  it('recognizes flexible case-based essay PDFs without CASE colons or Q prefixes', () => {
    const text = `
      CASE 1
      A patient presents with progressive dyspnea.
      1: What is the most likely diagnosis?
      2. Define heart failure.
      Answer:
      1) Heart failure with reduced ejection fraction.
      2) A clinical syndrome of impaired cardiac filling or pumping.
    `;

    expect(detectQuestionDocumentType(text)).toBe('ESSAY_CASES');
  });

  it('keeps the legacy CASE/Q/Answers of case format recognized', () => {
    const text = `
      CASE 1:
      A patient presents with haematuria.
      Q1. What is the initial investigation?
      Answers of case 1:
      1) Urinalysis and imaging.
    `;

    expect(detectQuestionDocumentType(text)).toBe('ESSAY_CASES');
  });
  it('recognizes exam-qualified answer headings used by essay packs', () => {
    const text = `
      Final 2028
      Case 1: A patient presents with a thyroid swelling.
      1. What is the most likely diagnosis?
      2. List three investigations.
      Answers of Final 2028 case 1
      1) Medullary thyroid carcinoma.
      2) Calcitonin, neck ultrasound, and metanephrines.
    `;

    expect(detectQuestionDocumentType(text)).toBe('ESSAY_CASES');
  });

});
