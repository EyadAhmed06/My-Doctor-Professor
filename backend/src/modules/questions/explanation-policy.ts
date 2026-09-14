import { ValidateBy, ValidationOptions } from 'class-validator';

export const EXPLANATION_MAX_LENGTH = 220;
export const EXPLANATION_MAX_SENTENCES = 2;

export function countExplanationSentences(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;

  const terminated = trimmed.match(/[.!?؟]+(?=\s|$)/g)?.length ?? 0;
  const hasTrailingTerminator = /[.!?؟]+$/.test(trimmed);
  return terminated + (hasTrailingTerminator ? 0 : 1);
}

export function isConciseExplanation(value: string) {
  return (
    value.length <= EXPLANATION_MAX_LENGTH &&
    countExplanationSentences(value) <= EXPLANATION_MAX_SENTENCES
  );
}

export function IsConciseExplanation(
  validationOptions?: ValidationOptions,
) {
  return ValidateBy(
    {
      name: 'isConciseExplanation',
      validator: {
        validate: (value: unknown) =>
          typeof value !== 'string' || isConciseExplanation(value),
        defaultMessage: () =>
          `explanation must be at most ${EXPLANATION_MAX_SENTENCES} sentences and ${EXPLANATION_MAX_LENGTH} characters`,
      },
    },
    validationOptions,
  );
}
