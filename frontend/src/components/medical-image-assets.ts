export const HERO_MEDICAL_LEARNING = "/media/hero-medical-learning.webp";
export const QUESTION_HEMATOLOGY = "/media/question-hematology.webp";
export const QUESTION_GENETICS = "/media/question-genetics.webp";
export const QUESTION_ANATOMY = "/media/question-anatomy.webp";
export const QUESTION_NEUROLOGY = "/media/question-neurology.webp";
export const QUESTION_NEPHROLOGY = "/media/question-nephrology.webp";
export const QUESTION_ENDOCRINOLOGY = "/media/question-endocrinology.webp";
export const QUESTION_PHARMACOLOGY = "/media/question-pharmacology.webp";
export const QUESTION_MICROBIOLOGY = "/media/question-microbiology.webp";

type QuestionVisual = {
  src: string;
  alt: string;
  specialty: "hematology" | "genetics" | "anatomy" | "neurology" | "nephrology" | "endocrinology" | "pharmacology" | "microbiology";
};

const VISUAL_RULES: Array<{ pattern: RegExp; visual: QuestionVisual }> = [
  {
    pattern: /(blood|hematolog|haematolog|erythro|red cell|rbc|hemoglobin|haemoglobin|anemia|anaemia|platelet|coagulat)/,
    visual: { src: QUESTION_HEMATOLOGY, alt: "Red blood cells in circulation", specialty: "hematology" },
  },
  {
    pattern: /(dna|gene|genetic|chromosom|genom|inherit|mutation|allele)/,
    visual: { src: QUESTION_GENETICS, alt: "DNA and genetics study illustration", specialty: "genetics" },
  },
  {
    pattern: /(rib|thorax|thoracic|sternum|costal|chest wall|intercostal|anatom)/,
    visual: { src: QUESTION_ANATOMY, alt: "Anatomical illustration of the rib cage and sternum", specialty: "anatomy" },
  },
  {
    pattern: /(neuro|neuron|nerve|synap|axon|dendrit|brain|spinal|cerebr|cortex)/,
    visual: { src: QUESTION_NEUROLOGY, alt: "Neurons communicating across a neural network", specialty: "neurology" },
  },
  {
    pattern: /(kidney|renal|nephro|glomerul|ureter|creatinine|dialysis|urinary)/,
    visual: { src: QUESTION_NEPHROLOGY, alt: "Digital anatomical visualization of the kidneys", specialty: "nephrology" },
  },
  {
    pattern: /(thyroid|endocrin|hormone|pituitary|adrenal|insulin|parathyroid|tsh|thyroxine)/,
    visual: { src: QUESTION_ENDOCRINOLOGY, alt: "Clinical visualization of the thyroid gland", specialty: "endocrinology" },
  },
  {
    pattern: /(drug|pharmacol|medication|medicine|dose|dosage|tablet|capsule|antibiotic|receptor|agonist|antagonist)/,
    visual: { src: QUESTION_PHARMACOLOGY, alt: "Medicines and laboratory equipment", specialty: "pharmacology" },
  },
  {
    pattern: /(bacter|microbi|pathogen|microorgan|culture|gram[- ]?(positive|negative)|bacill|coccus|infection)/,
    visual: { src: QUESTION_MICROBIOLOGY, alt: "Microscopic visualization of bacteria", specialty: "microbiology" },
  },
];

export function getQuestionVisual(questionText: string) {
  const normalized = questionText.toLowerCase();
  return VISUAL_RULES.find(({ pattern }) => pattern.test(normalized))?.visual ?? null;
}
