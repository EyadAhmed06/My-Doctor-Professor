export type QuestionDocumentType = 'MCQ' | 'ESSAY_CASES' | 'MIXED' | 'UNKNOWN';

export function detectQuestionDocumentType(value: string): QuestionDocumentType {
  const text = value.replace(/\r/g, '\n');
  const mcqQuestions = Array.from(
    text.matchAll(/^\s*(?:Q(?:uestion)?\s*)?\d{1,3}[.)]\s+.+$/gim),
  ).length;
  const optionMarkers = Array.from(text.matchAll(/^\s*[A-F][.)]\s+\S+/gim)).length;
  const answerPairs = Array.from(
    text.matchAll(/(?:^|\s|\|)\d{1,3}\s*[.)\-:]?\s*[A-F](?=\s|$|\|)/gim),
  ).length;
  const essayCases = Array.from(text.matchAll(/^\s*CASE\s+\d+\s*:?/gim)).length;
  const essayQuestions = Array.from(
    text.matchAll(/^\s*(?:Q(?:uestion)?\s*)?\d{1,3}\s*[:.)-]\s+\S.+$/gim),
  ).length;
  const explicitEssayQuestions = Array.from(
    text.matchAll(/^\s*Q(?:uestion)?\s*\d{1,3}\s*[:.)-]\s+\S.+$/gim),
  ).length;
  const essayAnswers = Array.from(
    text.matchAll(/^\s*(?:Answers?(?:\s+of\s+(?:[^\n]*?\s+)?case\s+\d+)?|Model\s+Answers?)\s*:?\s*$/gim),
  ).length;

  const mcq = optionMarkers >= 4 && mcqQuestions >= 1
    || optionMarkers >= 2 && answerPairs >= 2;
  const essay = essayCases >= 1 && essayQuestions >= 1 && (essayAnswers >= 1 || explicitEssayQuestions >= 1)
    || essayAnswers >= 1 && explicitEssayQuestions >= 1;

  if (mcq && essay) return 'MIXED';
  if (mcq) return 'MCQ';
  if (essay) return 'ESSAY_CASES';
  return 'UNKNOWN';
}
