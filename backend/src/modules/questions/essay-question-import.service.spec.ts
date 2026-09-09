import { EssayQuestionImportService } from './essay-question-import.service';

describe('EssayQuestionImportService PDF parsing', () => {
  const service = Object.create(EssayQuestionImportService.prototype) as EssayQuestionImportService;
  const originalApiKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  });

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
    expect(candidates.map((candidate: any) => candidate.question_number)).toEqual([1, 2, 1]);
    expect(candidates.every((candidate: any) => candidate.answer_origin === 'SOURCE')).toBe(true);
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

  it('generates review-required answers for every question missing a source answer', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const candidates = parse(`
      Final 2028
      CASE 1: A patient presents with progressive urinary symptoms.
      Q1. What investigations are required?
      Q2. Mention four causes of a hard prostate.
    `);
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({ answers: candidates.map((candidate: any) => ({
          candidate_id: candidate.candidate_id,
          model_answer: `Generated answer for Q${candidate.question_number}`,
        })) }),
      }),
    } as Response);

    const enriched = await (service as any).enrichMissingModelAnswers(candidates);

    expect(enriched.map((candidate: any) => candidate.model_answer)).toEqual([
      'Generated answer for Q1',
      'Generated answer for Q2',
    ]);
    expect(enriched.every((candidate: any) => candidate.status === 'NEEDS_REVIEW')).toBe(true);
    expect(enriched.every((candidate: any) => candidate.answer_origin === 'AI')).toBe(true);
    expect(enriched.every((candidate: any) => candidate.issues.some((issue: any) => issue.code === 'AI_MODEL_ANSWER_GENERATED'))).toBe(true);
  });
});
