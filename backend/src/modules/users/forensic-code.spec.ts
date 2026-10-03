import {
  FORENSIC_CODE_ALPHABET,
  FORENSIC_CODE_LENGTH,
  generateForensicCode,
} from './forensic-code';

describe('generateForensicCode', () => {
  it('creates 6-character uppercase alphanumeric identifiers', () => {
    const code = generateForensicCode();
    expect(code).toHaveLength(FORENSIC_CODE_LENGTH);
    expect(code).toBe(code.toUpperCase());
  });

  it('uses only characters from the allowed alphabet and excludes lookalikes (0, O, 1, I, L)', () => {
    const regex = new RegExp(`^[${FORENSIC_CODE_ALPHABET}]{${FORENSIC_CODE_LENGTH}}$`);
    const lookalikes = ['0', 'O', '1', 'I', 'L'];

    for (let i = 0; i < 100; i++) {
      const code = generateForensicCode();
      expect(code).toMatch(regex);
      for (const char of lookalikes) {
        expect(code).not.toContain(char);
      }
    }
  });

  it('generates distinct codes across successive calls', () => {
    const generated = new Set<string>();
    const count = 100;

    for (let i = 0; i < count; i++) {
      generated.add(generateForensicCode());
    }

    // Over 100 calls with 31^6 (~887 million) possibilities, all should be unique
    expect(generated.size).toBe(count);
  });
});
