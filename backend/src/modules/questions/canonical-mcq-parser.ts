import { detectQuestionDocumentType, QuestionDocumentType } from './question-document-type';
import type { UnicodeParsedPdf } from './pdf-text-extraction.service';

export type CanonicalAnswerKeyEntry = {
  label: string;
  page: number | null;
};

export type CanonicalAnswerKeyConflict = {
  questionNumber: number;
  labels: string[];
};

export type CanonicalParsedQuestion = {
  questionNumber: number;
  sourcePage: number | null;
  answerKeyPage: number | null;
  sourceSection: string | null;
  questionText: string;
  options: Array<{ label: string; text: string }>;
  correctLabel: string | null;
  explanation: string | null;
};

export type CanonicalParsedSection = {
  title: string | null;
  answerKey: Map<number, CanonicalAnswerKeyEntry>;
  answerKeyConflicts: CanonicalAnswerKeyConflict[];
  expectedQuestionNumbers: number[];
  parsedQuestionNumbers: number[];
  missingQuestionNumbers: number[];
  unexpectedQuestionNumbers: number[];
  duplicateQuestionNumbers: number[];
  expectedQuestionCount: number | null;
  parsedQuestionCount: number;
  completeness: number | null;
};

export type CanonicalParsedQuestionDocument = {
  documentType: QuestionDocumentType;
  answerKey: Map<number, CanonicalAnswerKeyEntry>;
  questions: CanonicalParsedQuestion[];
  sections: CanonicalParsedSection[];
  expectedQuestionCount: number | null;
  parsedQuestionCount: number;
  missingQuestionCount: number;
  isStructurallyComplete: boolean;
};

type ParsingSection = {
  title: string | null;
  text: string;
  offset: number;
};

type AnswerKeyParseResult = {
  entries: Map<number, CanonicalAnswerKeyEntry>;
  conflicts: CanonicalAnswerKeyConflict[];
};

type AnswerKeyBlock = {
  start: number;
  end: number;
};

const MAX_PARSED_MCQ_OPTIONS = 6;

const LEGACY_SECTION_NAMES = [
  'Peptic ulcer',
  'GERD',
  'Dysphagia',
  'Gastric cancer',
  'Esophageal cancer',
] as const;

const LECTURE_HEADING =
  'Lecture\\s+(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|\\d+)(?:\\s*[:-])?[^\\n]*';

const ANSWER_KEY_HEADING =
  /^\s*(?:answer\s*keys?|answers?|correct\s+answers?|solutions?|key)\s*:?(.*)$/i;

const QUESTION_START =
  /^\s*(?:Q(?:uestion)?\s*)?(?:\((\d+)\)|(\d+)\s*[.)\]:\-–—])\s+(.+)$/i;

const OPTION_START =
  /^\s*(?:\(([A-F])\)|([A-F])\s*[.)\]:\-–—])\s+/i;

/**
 * Parser for sectioned MCQ PDFs.
 *
 * The parser does not contain section question counts or a document question
 * total. Every section derives its expected question-number set from the
 * section's own answer key.
 *
 * Primary section boundary rule: an answer-key block closes the current
 * section. This makes arbitrary section names safe and lets numbering restart
 * in every section without cross-section answer collisions.
 */
export function parseCanonicalMcqDocument(
  pdf: UnicodeParsedPdf,
  documentType: QuestionDocumentType = detectQuestionDocumentType(pdf.text),
): CanonicalParsedQuestionDocument {
  const preparedPages = pdf.pages.map((page) => ({
    page: page.page,
    text: prepareForParsing(page.text),
  }));
  const combined = preparedPages
    .map((page) => `\n[[MDP_PAGE_${page.page}]]\n${page.text}`)
    .join('\n');

  const parsingSections = splitCanonicalSections(combined);
  const sectionResults = parsingSections.map((section) => {
    const key = extractAnswerKeyDetailed(section.text);
    const questions = parseSectionQuestions(
      section,
      combined,
      key.entries,
    );
    return {
      questions,
      summary: summarizeSection(
        section.title,
        key,
        questions,
      ),
    };
  });

  const questions = sectionResults.flatMap((section) => section.questions);
  const sectionSummaries = sectionResults.map((section) => section.summary);
  const sectionsWithAnswerKeys = sectionSummaries.filter(
    (section) => section.expectedQuestionCount !== null,
  );
  const allSectionsHaveAnswerKeys =
    sectionSummaries.length > 0 &&
    sectionsWithAnswerKeys.length === sectionSummaries.length;

  const expectedQuestionCount = allSectionsHaveAnswerKeys
    ? sectionsWithAnswerKeys.reduce(
        (sum, section) => sum + (section.expectedQuestionCount ?? 0),
        0,
      )
    : null;

  const missingQuestionCount = sectionSummaries.reduce(
    (sum, section) => sum + section.missingQuestionNumbers.length,
    0,
  );

  const hasStructuralMismatch = sectionSummaries.some(
    (section) =>
      section.unexpectedQuestionNumbers.length > 0 ||
      section.duplicateQuestionNumbers.length > 0 ||
      section.answerKeyConflicts.length > 0,
  );

  const globalAnswerKey =
    sectionSummaries.length === 1
      ? new Map(sectionSummaries[0].answerKey)
      : new Map<number, CanonicalAnswerKeyEntry>();

  return {
    documentType,
    answerKey: globalAnswerKey,
    questions,
    sections: sectionSummaries,
    expectedQuestionCount,
    parsedQuestionCount: questions.length,
    missingQuestionCount,
    isStructurallyComplete:
      allSectionsHaveAnswerKeys &&
      missingQuestionCount === 0 &&
      !hasStructuralMismatch &&
      questions.length === expectedQuestionCount,
  };
}

/**
 * Prefer answer-key-delimited sections. If no answer-key boundary can be found,
 * retain legacy/lecture heading support as a compatibility fallback.
 */
export function splitCanonicalSections(combined: string): ParsingSection[] {
  const keyDelimited = splitSectionsByAnswerKeys(combined);
  if (keyDelimited.length > 0) return keyDelimited;

  const legacyNames = LEGACY_SECTION_NAMES.map((name) => escapeRegex(name)).join('|');
  const headingPattern = new RegExp(
    `^\\s*(${legacyNames}|${LECTURE_HEADING}|(?:Section|Chapter|Part|Topic)\\s+[^\\n]+)\\s*$`,
    'gim',
  );
  const headings = Array.from(combined.matchAll(headingPattern));
  if (headings.length === 0) {
    return [{ title: inferSectionTitle(combined), text: combined, offset: 0 }];
  }

  return headings.map((heading, index) => {
    const offset = heading.index || 0;
    const end = headings[index + 1]?.index ?? combined.length;
    return {
      title: heading[1].replace(/\s+/g, ' ').trim(),
      text: combined.slice(offset, end),
      offset,
    };
  });
}

function splitSectionsByAnswerKeys(combined: string): ParsingSection[] {
  const blocks = findAnswerKeyBlocks(combined);
  if (blocks.length === 0) return [];

  const sections: ParsingSection[] = [];
  let sectionStart = 0;

  for (const block of blocks) {
    const end = block.end;
    const text = combined.slice(sectionStart, end);
    if (containsQuestionStart(text)) {
      const bodyBeforeKey = combined.slice(sectionStart, block.start);
      sections.push({
        title: inferSectionTitle(bodyBeforeKey),
        text,
        offset: sectionStart,
      });
    }
    sectionStart = end;
  }

  const trailing = combined.slice(sectionStart);
  if (containsQuestionStart(trailing)) {
    sections.push({
      title: inferSectionTitle(trailing),
      text: trailing,
      offset: sectionStart,
    });
  }

  return sections;
}

function findAnswerKeyBlocks(value: string): AnswerKeyBlock[] {
  const lines = linesWithOffsets(value);
  const blocks: AnswerKeyBlock[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index];
    const explicit = ANSWER_KEY_HEADING.test(
      current.text.replace(/\[\[MDP_PAGE_\d+\]\]/g, '').trim(),
    );
    const compact = isCompactAnswerKeyLine(current.text);
    if (!explicit && !compact) continue;

    // A single compact pair can be a legitimate tiny answer key, but only use
    // it as an implicit boundary when the line is entirely key-shaped.
    if (!explicit && parseAnswerPairs(current.text).length === 0) continue;

    let endIndex = index;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const next = lines[cursor].text;
      const raw = next.trim();
      const isPageMarker = /^\[\[MDP_PAGE_\d+\]\]$/.test(raw);
      const cleaned = next.replace(/\[\[MDP_PAGE_\d+\]\]/g, '').trim();

      if (isPageMarker) {
        const nextMeaningful = lines
          .slice(cursor + 1)
          .find((line) => {
            const candidate = line.text.trim();
            return candidate && !/^\[\[MDP_PAGE_\d+\]\]$/.test(candidate);
          });
        if (nextMeaningful && isCompactAnswerKeyLine(nextMeaningful.text)) {
          endIndex = cursor;
          continue;
        }
        break;
      }
      if (!cleaned) {
        endIndex = cursor;
        continue;
      }
      if (isCompactAnswerKeyLine(next)) {
        endIndex = cursor;
        continue;
      }
      break;
    }

    const blockStart = current.offset;
    const blockEnd =
      endIndex + 1 < lines.length
        ? lines[endIndex + 1].offset
        : value.length;
    blocks.push({ start: blockStart, end: blockEnd });
    index = endIndex;
  }

  return blocks;
}

function inferSectionTitle(value: string): string | null {
  const lines = value
    .split('\n')
    .map((line) => line.replace(/\[\[MDP_PAGE_\d+\]\]/g, '').trim())
    .filter(Boolean);
  const firstQuestion = lines.findIndex((line) => matchQuestionStart(line) !== null);
  const preamble = firstQuestion >= 0 ? lines.slice(0, firstQuestion) : lines;

  const candidates = preamble.filter((line) => {
    if (line.length > 120) return false;
    if (ANSWER_KEY_HEADING.test(line)) return false;
    if (/^(?:page\b|week\b|my doctor\b)/i.test(line)) return false;
    if (/^[\d\W]+$/.test(line)) return false;
    return true;
  });

  return candidates.at(-1)?.replace(/\s+/g, ' ').trim() || null;
}

function summarizeSection(
  title: string | null,
  answerKeyResult: AnswerKeyParseResult,
  questions: CanonicalParsedQuestion[],
): CanonicalParsedSection {
  const expectedQuestionNumbers = [...answerKeyResult.entries.keys()].sort(
    (left, right) => left - right,
  );
  const occurrenceCounts = new Map<number, number>();
  for (const question of questions) {
    occurrenceCounts.set(
      question.questionNumber,
      (occurrenceCounts.get(question.questionNumber) || 0) + 1,
    );
  }
  const parsedQuestionNumbers = [...occurrenceCounts.keys()].sort(
    (left, right) => left - right,
  );
  const duplicateQuestionNumbers = parsedQuestionNumbers.filter(
    (number) => (occurrenceCounts.get(number) || 0) > 1,
  );
  const parsedQuestionSet = new Set(parsedQuestionNumbers);
  const expectedQuestionSet = new Set(expectedQuestionNumbers);
  const missingQuestionNumbers = expectedQuestionNumbers.filter(
    (number) => !parsedQuestionSet.has(number),
  );
  const unexpectedQuestionNumbers =
    expectedQuestionNumbers.length === 0
      ? []
      : parsedQuestionNumbers.filter((number) => !expectedQuestionSet.has(number));
  const expectedQuestionCount =
    expectedQuestionNumbers.length > 0 ? expectedQuestionNumbers.length : null;
  const matchedQuestionCount =
    expectedQuestionCount === null
      ? 0
      : expectedQuestionNumbers.length - missingQuestionNumbers.length;
  const completeness =
    expectedQuestionCount === null
      ? null
      : Number((matchedQuestionCount / expectedQuestionCount).toFixed(4));

  return {
    title,
    answerKey: answerKeyResult.entries,
    answerKeyConflicts: answerKeyResult.conflicts,
    expectedQuestionNumbers,
    parsedQuestionNumbers,
    missingQuestionNumbers,
    unexpectedQuestionNumbers,
    duplicateQuestionNumbers,
    expectedQuestionCount,
    parsedQuestionCount: questions.length,
    completeness,
  };
}

function parseSectionQuestions(
  section: ParsingSection,
  combined: string,
  answerKey: Map<number, CanonicalAnswerKeyEntry>,
): CanonicalParsedQuestion[] {
  const starts = questionStarts(section.text);
  const candidates: CanonicalParsedQuestion[] = [];

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const localEnd = starts[index + 1]?.index ?? section.text.length;
    let block = section.text.slice(start.index, localEnd);

    const sourcePage = pageBefore(combined, section.offset + start.index);
    block = block.replace(/\[\[MDP_PAGE_\d+\]\]/g, '\n');

    const firstOption = findFirstOptionOffset(block);
    if (firstOption < 0) continue;

    const stem = block
      .slice(0, firstOption)
      .replace(
        /^\s*(?:Q(?:uestion)?\s*)?(?:\(\d+\)|\d+\s*[.)\]:\-–—])\s*/i,
        '',
      )
      .replace(/\s+/g, ' ')
      .trim();

    const optionArea = block.slice(firstOption);
    const options = parseOptions(optionArea);
    const inlineAnswer =
      block
        .match(/(?:Correct\s+Answer|Answer)\s*[:-]\s*([A-F])\b/i)?.[1]
        ?.toUpperCase() || null;
    const answerKeyEntry = answerKey.get(start.number) || null;
    const correctLabel = inlineAnswer || answerKeyEntry?.label || null;
    const explanation =
      block
        .match(/(?:Explanation|Rationale)\s*:\s*([\s\S]+?)(?=$)/i)?.[1]
        ?.replace(/\s+/g, ' ')
        .trim() || null;

    if (!stem) continue;
    candidates.push({
      questionNumber: start.number,
      sourcePage,
      answerKeyPage: inlineAnswer ? sourcePage : answerKeyEntry?.page ?? null,
      sourceSection: section.title,
      questionText: stem,
      options,
      correctLabel,
      explanation,
    });
  }

  return candidates;
}

function questionStarts(value: string): Array<{ index: number; number: number }> {
  const lines = linesWithOffsets(value);
  const starts: Array<{ index: number; number: number }> = [];

  for (const line of lines) {
    if (isCompactAnswerKeyLine(line.text) || ANSWER_KEY_HEADING.test(line.text.trim())) {
      continue;
    }
    const match = matchQuestionStart(line.text);
    if (!match) continue;
    starts.push({ index: line.offset, number: match.number });
  }

  return starts;
}

function matchQuestionStart(value: string): { number: number } | null {
  const match = value.match(QUESTION_START);
  if (!match) return null;
  const number = Number(match[1] || match[2]);
  if (!Number.isInteger(number) || number < 1) return null;
  return { number };
}

function containsQuestionStart(value: string): boolean {
  return value.split('\n').some((line) => {
    if (isCompactAnswerKeyLine(line)) return false;
    return matchQuestionStart(line) !== null;
  });
}

function findFirstOptionOffset(value: string): number {
  const lines = linesWithOffsets(value);
  for (const line of lines) {
    if (OPTION_START.test(line.text)) return line.offset;
  }
  return -1;
}

function parseOptions(optionArea: string): Array<{ label: string; text: string }> {
  const metadata = optionArea.search(
    /^\s*(?:Correct\s+Answer|Answer|Explanation|Rationale)\s*:/im,
  );
  const compactKey = findCompactAnswerKeyOffset(optionArea);
  const hardEnd = [metadata, compactKey]
    .filter((value) => value >= 0)
    .reduce((lowest, value) => Math.min(lowest, value), optionArea.length);
  const area = optionArea.slice(0, hardEnd);
  const markers: Array<{ index: number; length: number; label: string }> = [];

  for (const line of linesWithOffsets(area)) {
    const match = line.text.match(OPTION_START);
    if (!match) continue;
    markers.push({
      index: line.offset,
      length: match[0].length,
      label: (match[1] || match[2]).toUpperCase(),
    });
  }

  if (markers.length === 0) return [];

  const accepted: typeof markers = [];
  let previous = 64;
  let resetAt = area.length;

  for (const marker of markers) {
    const code = marker.label.charCodeAt(0);
    if (accepted.length > 0 && code <= previous) {
      resetAt = marker.index;
      break;
    }
    if (accepted.length > 0 && code !== previous + 1) {
      resetAt = marker.index;
      break;
    }
    accepted.push(marker);
    previous = code;
    if (accepted.length >= MAX_PARSED_MCQ_OPTIONS) break;
  }

  return accepted
    .map((marker, index) => {
      const start = marker.index + marker.length;
      const next = accepted[index + 1]?.index ?? resetAt;
      return {
        label: marker.label,
        text: area.slice(start, next).replace(/\s+/g, ' ').trim(),
      };
    })
    .filter((option) => Boolean(option.text));
}

function prepareForParsing(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    // Recover structural markers that survived on the same physical line.
    // Require a wide gap so normal prose such as "type A) ..." is untouched.
    .replace(
      / {2,}((?:Q(?:uestion)?\s*)?(?:\(\d+\)|\d+\s*[.)\]:-])\s+)/gi,
      '\n$1',
    )
    .replace(
      / {2,}((?:\([A-F]\)|[A-F]\s*[.)\]:-])\s+)/gi,
      '\n$1',
    )
    .replace(
      / {2,}(Correct\s+Answer|Answer|Explanation|Rationale)\s*:/gi,
      '\n$1:',
    )
    .trim();
}

function extractAnswerKeyDetailed(value: string): AnswerKeyParseResult {
  const result = new Map<number, CanonicalAnswerKeyEntry>();
  const conflictLabels = new Map<number, Set<string>>();
  let inExplicitAnswerKey = false;

  for (const line of linesWithOffsets(value)) {
    const cleaned = line.text.replace(/\[\[MDP_PAGE_\d+\]\]/g, '').trim();
    const heading = cleaned.match(ANSWER_KEY_HEADING);
    if (heading) inExplicitAnswerKey = true;

    const pairs = parseAnswerPairs(heading ? heading[1] : cleaned);
    if (!inExplicitAnswerKey && !isCompactAnswerKeyLine(cleaned)) continue;

    for (const pair of pairs) {
      const entry = {
        label: pair.label,
        page: pageBefore(value, line.offset + pair.index),
      };
      const existing = result.get(pair.number);
      if (!existing) {
        result.set(pair.number, entry);
        continue;
      }
      if (existing.label === entry.label) continue;

      const labels = conflictLabels.get(pair.number) || new Set<string>();
      labels.add(existing.label);
      labels.add(entry.label);
      conflictLabels.set(pair.number, labels);
    }
  }

  return {
    entries: result,
    conflicts: [...conflictLabels.entries()]
      .map(([questionNumber, labels]) => ({
        questionNumber,
        labels: [...labels].sort(),
      }))
      .sort((left, right) => left.questionNumber - right.questionNumber),
  };
}

function parseAnswerPairs(
  value: string,
): Array<{ number: number; label: string; index: number }> {
  const pairs: Array<{ number: number; label: string; index: number }> = [];
  const pattern =
    /(?:^|[\s|,;])\(?(\d+)\)?\s*(?:[.)\]:=\-–—]|->|→)?\s*\(?([A-F])\)?(?=$|[\s|,;])/gi;

  for (const match of value.matchAll(pattern)) {
    pairs.push({
      number: Number(match[1]),
      label: match[2].toUpperCase(),
      index: match.index ?? 0,
    });
  }
  return pairs;
}

function isCompactAnswerKeyLine(value: string): boolean {
  const line = value.replace(/\[\[MDP_PAGE_\d+\]\]/g, '').trim();
  if (!line) return false;
  const heading = line.match(ANSWER_KEY_HEADING);
  if (heading) {
    const suffix = heading[1].trim();
    return !suffix || parseAnswerPairs(suffix).length > 0;
  }

  const pairs = parseAnswerPairs(line);
  if (!pairs.length) return false;

  const remainder = line
    .replace(
      /(?:^|[\s|,;])\(?\d+\)?\s*(?:[.)\]:=\-–—]|->|→)?\s*\(?[A-F]\)?(?=$|[\s|,;])/gi,
      ' ',
    )
    .replace(/[|,;]+/g, ' ')
    .trim();

  return remainder.length === 0;
}

function findCompactAnswerKeyOffset(value: string): number {
  for (const line of linesWithOffsets(value)) {
    if (ANSWER_KEY_HEADING.test(line.text.trim()) || isCompactAnswerKeyLine(line.text)) {
      return line.offset;
    }
  }
  return -1;
}

function linesWithOffsets(value: string): Array<{ text: string; offset: number }> {
  const lines: Array<{ text: string; offset: number }> = [];
  let offset = 0;
  for (const text of value.split('\n')) {
    lines.push({ text, offset });
    offset += text.length + 1;
  }
  return lines;
}

function pageBefore(value: string, index: number): number | null {
  const prefix = value.slice(0, index);
  const matches = Array.from(prefix.matchAll(/\[\[MDP_PAGE_(\d+)\]\]/g));
  const last = matches.at(-1);
  return last ? Number(last[1]) : null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
