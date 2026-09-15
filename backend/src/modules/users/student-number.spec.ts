import { generateStudentNumber } from './student-number';

describe('generateStudentNumber', () => {
  it('creates opaque server-owned identifiers that fit the student column', () => {
    const first = generateStudentNumber();
    const second = generateStudentNumber();

    expect(first).toMatch(/^MDP-[A-F0-9]{20}$/);
    expect(first.length).toBeLessThanOrEqual(30);
    expect(second).toMatch(/^MDP-[A-F0-9]{20}$/);
    expect(second).not.toBe(first);
  });
});
