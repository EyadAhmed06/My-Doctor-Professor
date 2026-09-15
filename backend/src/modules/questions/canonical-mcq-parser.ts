import { detectQuestionDocumentType, QuestionDocumentType } from './question-document-type';
import type { UnicodeParsedPdf } from './pdf-text-extraction.service';

export type CanonicalAnswerKeyEntry = {
  label: string;
  page: number | null;
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

export type CanonicalParsedQuestionDocument = {
  documentType: QuestionDocumentType;
  answerKey: Map<number, CanonicalAnswerKeyEntry>;
  questions: CanonicalParsedQuestion[];
};

type ParsingSection = {
  title: string | null;
  text: string;
  offset: number;
};

const MAX_PARSED_MCQ_OPTIONS = 6;
const CANONICAL_SECTION_NAMES = [
  'Peptic ulcer',
  'GERD',
  'Dysphagia',
  'Gastric cancer',
  'Esophageal cancer',
] as const;

const LECTURE_HEADING =
  'Lecture\\s+(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|\\d+)(?:\\s*[:-])?[^\\n]*';

/**
 * Parser for the canonical Week 1 Gastroenterology MCQ layout.
 *
 * The important invariant is that answer keys are scoped to their section,
 * because numbering intentionally restarts from 1 in every section.
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
  const sections = splitCanonicalSections(combined);
  const isMultiSection = sections.filter((section) => section.title).length > 1;
  const globalAnswerKey = isMultiSection
    ? new Map<number, CanonicalAnswerKeyEntry>()
    : extractAnswerKey(combined);

  const questions = sections.flatMap((section) => {
    const scopedAnswerKey = extractAnswerKey(section.text);
    return parseSectionQuestions(
      section,
      combined,
      scopedAnswerKey.size > 0 ? scopedAnswerKey : globalAnswerKey,
    );
  });

  return {
    documentType,
    // For multi-section documents a flat numeric map is ambiguous by design.
    // Keep it empty rather than expose a misleading cross-section answer key.
    answerKey: globalAnswerKey,
    questions,
  };
}

export function splitCanonicalSections(combined: string): ParsingSection[] {
  const canonicalNames = CANONICAL_SECTION_NAMES.map((name) => escapeRegex(name)).join('|');
  const headingPattern = new RegExp(
    `^\\s*(${canonicalNames}|${LECTURE_HEADING})\\s*$`,
    'gim',
  );
  const headings = Array.from(combined.matchAll(headingPattern));
  if (headings.length === 0) {
    return [{ title: null, text: combined, offset: 0 }];
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

function parseSectionQuestions(
  section: ParsingSection,
  combined: string,
  answerKey: Map<number, CanonicalAnswerKeyEntry>,
): CanonicalParsedQuestion[] {
  const starts = Array.from(
    section.text.matchAll(/^\s*(?:Q(?:uestion)?\s*)?(\d{1,3})[.)]\s+(.+)$/gim),
  ).filter((match) => !isCompactAnswerKeyLine(match[0]));
  const candidates: CanonicalParsedQuestion[] = [];

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const localStart = start.index || 0;
    const localEnd = starts[index + 1]?.index ?? section.text.length;
    let block = section.text.slice(localStart, localEnd);
    if (isCompactAnswerKeyLine(block.split('\n')[0] || '')) continue;

    const sourcePage = pageBefore(combined, section.offset + localStart);
    block = block.replace(/\[\[MDP_PAGE_\d+\]\]/g, '\n');
    const questionNumber = Number(start[1]);
    const firstOption = block.search(/^\s*[A-F][.)]\s+/im);
    if (firstOption < 0) continue;

    const stem = block
      .slice(0, firstOption)
      .replace(/^\s*(?:Q(?:uestion)?\s*)?\d{1,3}[.)]\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    const optionArea = block.slice(firstOption);
    const options = parseOptions(optionArea);
    const inlineAnswer =
      block
        .match(/(?:Correct\s+Answer|Answer)\s*[:-]\s*([A-F])\b/i)?.[1]
        ?.toUpperCase() || null;
    const answerKeyEntry = answerKey.get(questionNumber) || null;
    const correctLabel = inlineAnswer || answerKeyEntry?.label || null;
    const explanation =
      block
        .match(/(?:Explanation|Rationale)\s*:\s*([\s\S]+?)(?=$)/i)?.[1]
        ?.replace(/\s+/g, ' ')
        .trim() || null;

    if (!stem) continue;
    candidates.push({
      questionNumber,
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

function parseOptions(optionArea: string): Array<{ label: string; text: string }> {
  const metadata = optionArea.search(
    /^\s*(?:Correct\s+Answer|Answer|Explanation|Rationale)\s*:/im,
  );
  const compactKey = findCompactAnswerKeyOffset(optionArea);
  const hardEnd = [metadata, compactKey]
    .filter((value) => value >= 0)
    .reduce((lowest, value) => Math.min(lowest, value), optionArea.length);
  const area = optionArea.slice(0, hardEnd);
  const markers = Array.from(area.matchAll(/^\s*([A-F])[.)]\s*/gim));
  if (markers.length === 0) return [];

  const accepted: RegExpMatchArray[] = [];
  let previous = 64;
  let resetAt = area.length;
  for (const marker of markers) {
    const code = marker[1].toUpperCase().charCodeAt(0);
    if (accepted.length > 0 && code <= previous) {
      resetAt = marker.index ?? area.length;
      break;
    }
    if (accepted.length > 0 && code !== previous + 1) {
      resetAt = marker.index ?? area.length;
      break;
    }
    accepted.push(marker);
    previous = code;
    if (accepted.length >= MAX_PARSED_MCQ_OPTIONS) break;
  }

  return accepted
    .map((marker, index) => {
      const start = (marker.index || 0) + marker[0].length;
      const next = accepted[index + 1]?.index ?? resetAt;
      return {
        label: marker[1].toUpperCase(),
        text: area.slice(start, next).replace(/\s+/g, ' ').trim(),
      };
    })
    .filter((option) => Boolean(option.text));
}

function prepareForParsing(value: string): string {
  return value
    .replace(/\r/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+([A-F])[.)]\s+/g, '\n$1. ')
    .replace(
      /\s+(Correct\s+Answer|Answer|Explanation|Rationale)\s*:/gi,
      '\n$1:',
    )
    .replace(/\s+(Q(?:uestion)?\s*\d{1,3}[.)])\s+/gi, '\n$1 ')
    .replace(new RegExp(`\\s+(${LECTURE_HEADING})`, 'gi'), '\n$1')
    .trim();
}

function extractAnswerKey(
  value: string,
): Map<number, CanonicalAnswerKeyEntry> {
  const result = new Map<number, CanonicalAnswerKeyEntry>();
  let offset = 0;
  let inExplicitAnswerKey = false;

  for (const line of value.split('\n')) {
    if (/answer\s*key/i.test(line)) inExplicitAnswerKey = true;
    const pairs = Array.from(
      line.matchAll(
        /(?:^|\s|\||\()(\d{1,3})\s*[.)\-:]?\s*([A-F])(?=\s|$|\|)/gi,
      ),
    );
    if (inExplicitAnswerKey || isCompactAnswerKeyLine(line)) {
      for (const pair of pairs) {
        const questionNumber = Number(pair[1]);
        const entry = {
          label: pair[2].toUpperCase(),
          page: pageBefore(value, offset + (pair.index || 0)),
        };
        const existing = result.get(questionNumber);
        if (!existing || existing.label === entry.label) result.set(questionNumber, entry);
      }
    }
    offset += line.length + 1;
  }

  return result;
}

function isCompactAnswerKeyLine(value: string): boolean {
  const line = value.replace(/\[\[MDP_PAGE_\d+\]\]/g, '').trim();
  if (!line) return false;
  const pairs = Array.from(
    line.matchAll(
      /(?:^|\s|\||\()(\d{1,3})\s*[.)\-:]?\s*([A-F])(?=\s|$|\|)/gi,
    ),
  );
  if (!pairs.length) return false;

  const remainder = line
    .replace(
      /(?:^|\s|\||\()\d{1,3}\s*[.)\-:]?\s*[A-F](?=\s|$|\|)/gi,
      ' ',
    )
    .replace(/[|,;]+/g, ' ')
    .trim();
  return remainder.length === 0;
}

function findCompactAnswerKeyOffset(value: string): number {
  let offset = 0;
  for (const line of value.split('\n')) {
    if (isCompactAnswerKeyLine(line)) return offset;
    offset += line.length + 1;
  }
  return -1;
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
