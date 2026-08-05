export const HERO_MEDICAL_LEARNING = "/media/hero-medical-learning.webp";
export const QUESTION_HEMATOLOGY = "/media/question-hematology.webp";
export const QUESTION_GENETICS = "/media/question-genetics.webp";

export function getQuestionVisual(questionText: string) {
  const normalized = questionText.toLowerCase();
  if (/(blood|hematolog|haematolog|erythro|red cell|rbc|hemoglobin|haemoglobin|anemia|anaemia|platelet|coagulat)/.test(normalized)) {
    return { src: QUESTION_HEMATOLOGY, alt: "Red blood cells in circulation" };
  }
  if (/(dna|gene|genetic|chromosom|genom|inherit|mutation|allele)/.test(normalized)) {
    return { src: QUESTION_GENETICS, alt: "DNA and genetics study illustration" };
  }
  return null;
}
