import { EssayQuestionImportService } from './essay-question-import.service';

describe('EssayQuestionImportService PDF parsing', () => {
  const service = Object.create(EssayQuestionImportService.prototype) as EssayQuestionImportService;

  afterEach(() => {
    jest.restoreAllMocks();
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

  it('parses CASE headings without colons, bare numbered prompts, and local Answer sections', () => {
    const candidates = parse(`
      CASE 1
      A 68-year-old male presents with progressive shortness of breath and reduced ejection fraction.
      1: What is the most likely diagnosis?
      2: Define heart failure.
      16. What is cardiac output and how is it calculated?
      Answer:
      1)
      Heart failure with reduced ejection fraction (HFrEF).
      2)
      Heart failure is a clinical syndrome in which the heart cannot fill or pump adequately.
      16)
      Cardiac output is stroke volume multiplied by heart rate.
    `);

    expect(candidates).toHaveLength(3);
    expect(candidates.map((candidate: any) => candidate.question_number)).toEqual([1, 2, 16]);
    expect(candidates[0].case_stem).toContain('68-year-old male');
    expect(candidates[0].question_text).toBe('What is the most likely diagnosis?');
    expect(candidates[0].model_answer).toContain('HFrEF');
    expect(candidates[2].model_answer).toContain('stroke volume');
    expect(candidates.every((candidate: any) => candidate.answer_origin === 'SOURCE')).toBe(true);
    expect(candidates.every((candidate: any) => candidate.status === 'VALID')).toBe(true);
  });

  it('keeps local Answer sections isolated between consecutive CASE blocks', () => {
    const candidates = parse(`
      CASE 1
      First clinical stem.
      1: First question?
      Answer:
      1) First answer.
      CASE 2
      Second clinical stem.
      1. Second question?
      2) Another second-case question?
      Answers:
      1) Second answer.
      2) Another second answer.
    `);

    expect(candidates).toHaveLength(3);
    expect(candidates[0].case_number).toBe(1);
    expect(candidates[0].model_answer).toBe('First answer.');
    expect(candidates[1].case_number).toBe(2);
    expect(candidates[1].model_answer).toBe('Second answer.');
    expect(candidates[2].model_answer).toBe('Another second answer.');
  });

  it('maps exam-qualified answer headings and keeps nested numbered details inside the parent answer', () => {
    const candidates = parse(`
      Final 2028
      Case 1: A patient presents with an endocrine complaint.
      1. What is the diagnosis?
      2. List the investigations.
      Answers of Final 2028 case 1
      1)
      Primary endocrine diagnosis.
      2)
          1. First investigation.
          2. Second investigation.
          3. Third investigation.
    `);

    expect(candidates).toHaveLength(2);
    expect(candidates[0].model_answer).toBe('Primary endocrine diagnosis.');
    expect(candidates[1].model_answer).toContain('1. First investigation.');
    expect(candidates[1].model_answer).toContain('2. Second investigation.');
    expect(candidates[1].model_answer).toContain('3. Third investigation.');
    expect(candidates.every((candidate: any) => candidate.answer_origin === 'SOURCE')).toBe(true);
    expect(candidates.every((candidate: any) => candidate.status === 'VALID')).toBe(true);
  });

  it('preserves indentation needed to distinguish top-level answers from numbered sub-points', () => {
    const cleaned = (service as any).cleanPageText(`
Answers of case 1
1)
     1. First detail
     2. Second detail
2)
Second answer
    `);

    expect(cleaned).toContain('\n     1. First detail');
    expect(cleaned).toContain('\n     2. Second detail');
  });

  it('leaves questions with no source answer invalid instead of calling an AI answer generator', () => {
    const candidates = parse(`
      Final 2028
      CASE 1: A patient presents with progressive urinary symptoms.
      Q1. What investigations are required?
      Q2. Mention four causes of a hard prostate.
    `);

    expect(candidates).toHaveLength(2);
    expect(candidates.every((candidate: any) => candidate.model_answer === null)).toBe(true);
    expect(candidates.every((candidate: any) => candidate.answer_origin === 'MISSING')).toBe(true);
    expect(candidates.every((candidate: any) => candidate.status === 'INVALID')).toBe(true);
    expect(candidates.every((candidate: any) =>
      candidate.issues.some((issue: any) => issue.code === 'MODEL_ANSWER_MISSING'),
    )).toBe(true);
    expect((service as any).enrichMissingModelAnswers).toBeUndefined();
  });
});
