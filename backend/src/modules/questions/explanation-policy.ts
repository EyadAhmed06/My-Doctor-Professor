import { ValidateBy, ValidationOptions } from 'class-validator';

export const EXPLANATION_MAX_LENGTH = 700;
export const EXPLANATION_MAX_SENTENCES = 3;

// The limit is intentionally large enough for a clinically reasoned answer-key
// rationale (like a textbook MCQ explanation) while remaining bounded for
// provider output, transport, review UX, and storage. Database columns are TEXT.

export function countExplanationSentences(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;

  const terminated = trimmed.match(/[.!?؟]+(?=\s|$)/g)?.length ?? 0;
  const hasTrailingTerminator = /[.!?؟]+$/.test(trimmed);
  return terminated + (hasTrailingTerminator ? 0 : 1);
}

export function isExplanationWithinPolicy(value: string) {
  return (
    value.length <= EXPLANATION_MAX_LENGTH &&
    countExplanationSentences(value) <= EXPLANATION_MAX_SENTENCES
  );
}

export function IsExplanationWithinPolicy(
  validationOptions?: ValidationOptions,
) {
  return ValidateBy(
    {
      name: 'isExplanationWithinPolicy',
      validator: {
        validate: (value: unknown) =>
          typeof value !== 'string' || isExplanationWithinPolicy(value),
        defaultMessage: () =>
          `explanation must be at most ${EXPLANATION_MAX_SENTENCES} sentences and ${EXPLANATION_MAX_LENGTH} characters`,
      },
    },
    validationOptions,
  );
}
