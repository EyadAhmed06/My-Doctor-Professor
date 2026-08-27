import { EssayQuestionImportService } from './essay-question-import.service';

describe('EssayQuestionImportService PDF parsing', () => {
  const service = Object.create(EssayQuestionImportService.prototype) as EssayQuestionImportService;

  function parse(text: string) {
    return (service as any).parseEssayCases({
      pages: [{ page: 1, text }],
      pageCount: 1,
      text,
      extractionConfidence: 1,
    }, 'a'.repeat(64));
  }

  it('matches answer keys placed after all case question blocks', () => {
    const candidates = parse(`
      Final 2028
      CASE 1: A patient presents with progressive urinary symptoms.
      Q1. What investigations are required?
      Q2. Mention four causes of a hard prostate.
      CASE 2: A second patient presents with haematuria.
      Q1. State the initial investigation.
      Answers of case 1:
      1) Urinalysis, renal function, ultrasound and flow studies.
      2) Prostate cancer, prostatitis, calculi and granulomatous disease.
      Answers of case 2:
      Q1. Urinalysis and imaging.
    `);

    expect(candidates).toHaveLength(3);
    expect(candidates[0].model_answer).toContain('Urinalysis');
    expect(candidates[1].model_answer).toContain('Prostate cancer');
    expect(candidates[2].model_answer).toContain('imaging');
    expect(candidates.every((candidate: any) => candidate.status === 'VALID')).toBe(true);
  });

  it('removes repeated PDF leader glyphs from questions', () => {
    const [candidate] = parse(`
      Final 2028
      CASE 1: A patient presents with urinary symptoms.
      Q1. What investigation is required? «««««««« ««««««««
      Answers of case 1:
      1. Urinalysis.
    `);

    expect(candidate.question_text).toBe('What investigation is required?');
    expect(candidate.model_answer).toBe('Urinalysis.');
  });

  it('does not borrow an answer from a later exam that restarts case numbering', () => {
    const candidates = parse(`
      Final 2028
      CASE 1: First examination case stem.
      Q1. First examination question?
      Final 2027
      CASE 1: Second examination case stem.
      Q1. Second examination question?
      Answers of case 1:
      1) Second examination answer.
    `);

    expect(candidates[0].model_answer).toBeNull();
    expect(candidates[1].model_answer).toBe('Second examination answer.');
  });
});
