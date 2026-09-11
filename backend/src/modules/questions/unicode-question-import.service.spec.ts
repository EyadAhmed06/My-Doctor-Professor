import { splitCanonicalMcqSections } from './unicode-question-import.service';

describe('canonical MCQ section parsing', () => {
  it('splits Gastroenterology Week 1 sections so repeated numbering and answer keys stay scoped', () => {
    const text = [
      '[[MDP_PAGE_3]]',
      'Gastroenterology Week 1',
      'Peptic ulcer',
      '1) Peptic question',
      'A) a',
      'B) b',
      'C) c',
      'D) d',
      'E) e',
      '1) E',
      '[[MDP_PAGE_7]]',
      'GERD',
      '1) GERD question',
      'A) a',
      'B) b',
      'C) c',
      'D) d',
      'E) e',
      '1) B',
      '[[MDP_PAGE_18]]',
      'Gastric cancer',
      '1) Gastric question',
      'A) a',
      'B) b',
      'C) c',
      'D) d',
      'E) e',
      '1) C',
      '[[MDP_PAGE_26]]',
      'Esophageal cancer',
      '1) Esophageal question',
      'A) a',
      'B) b',
      'C) c',
      'D) d',
      'E) e',
      '1) D',
    ].join('\n');

    const sections = splitCanonicalMcqSections(text);

    expect(sections.map((section) => section.title)).toEqual([
      'Peptic ulcer',
      'GERD',
      'Gastric cancer',
      'Esophageal cancer',
    ]);
    expect(sections[0].text).toContain('1) E');
    expect(sections[0].text).not.toContain('1) GERD question');
    expect(sections[1].text).toContain('1) B');
    expect(sections[1].text).not.toContain('1) Gastric question');
    expect(sections[2].text).toContain('1) C');
    expect(sections[3].text).toContain('1) D');
  });

  it('keeps the existing Lecture heading format supported', () => {
    const sections = splitCanonicalMcqSections(
      'Lecture One: Anatomy\n1) Question\nA) a\nB) b\nC) c\nD) d\nE) e',
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('Lecture One: Anatomy');
  });
});
