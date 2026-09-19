import { BadRequestException, Injectable } from '@nestjs/common';
// security-audit-reviewed: execFileSync uses no shell, fixed argument arrays, bounded time/buffer, and server-controlled binary paths.
import {
  execFileSync,
  type ExecFileSyncOptionsWithStringEncoding,
} from 'child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export type PdfPageSource = 'TEXT_LAYER' | 'OCR' | 'EMPTY';
export type PdfExtractionMethod = 'TEXT_LAYER' | 'OCR' | 'HYBRID_OCR';

export type PdfExtractionOptions = {
  forceOcr?: boolean;
};

export type UnicodePdfPage = {
  page: number;
  text: string;
  source?: PdfPageSource;
  confidence?: number;
  textLength?: number;
  ocrAttempted?: boolean;
  layoutReflowed?: boolean;
};

export type UnicodeParsedPdf = {
  pages: UnicodePdfPage[];
  pageCount: number;
  text: string;
  extractionConfidence: number;
  extractionMethod?: PdfExtractionMethod;
  ocrPageCount?: number;
  textLayerPageCount?: number;
  emptyPageCount?: number;
};

const MAX_PDF_PAGES = 200;
const PROCESS_TIMEOUT_MS = 30_000;
const PROCESS_MAX_BUFFER_BYTES = 32 * 1024 * 1024;
const OCR_RENDER_DPI = 220;
const MIN_GOOD_TEXT_CHARACTERS = 80;

const STRUCTURAL_LINE_START =
  /^(?:\(?\d+\)?\s*(?:[.)\]:=-]|->|→)?\s*[A-Fa-f](?:\b|\s|$)|(?:Q(?:uestion)?\s*)?\(?\d+\)?\s*[.)\]:-]\s+|\(?[A-Fa-f]\)?\s*[.)\]:-]\s+|(?:answer\s*key|answers?|correct\s+answers?)\b)/i;

/**
 * Presentation-only symbol normalization. Never use this value for persistence,
 * duplicate detection, answer mapping, or medical-content mutation.
 */
export function normalizePdfSymbolsForDisplay(value: string): string {
  return value
    .replace(/<=/g, '≤')
    .replace(/>=/g, '≥')
    .replace(/\+\/-/g, '±')
    .replace(/->/g, '→');
}

/** Remove known template furniture without mutating semantic medical text. */
export function stripCanonicalPageFurniture(value: string): string {
  return value
    .split('\n')
    .filter((line) => {
      const compact = line.replace(/\s+/g, ' ').trim();
      if (!compact) return true;
      if (/^My Doctor\s*&\s*The Professor$/i.test(compact)) return false;
      if (/^\(Week\s+\d+\)$/i.test(compact)) return false;
      if (/^Page\s*\|\s*\d+$/i.test(compact)) return false;
      if (
        /^My Doctor\s*&\s*The Professor\b/i.test(compact) &&
        (/\(Week\s+\d+\)/i.test(compact) || /Page\s*\|\s*\d+/i.test(compact))
      ) {
        return false;
      }
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

/**
 * Reconstruct common two-column MCQ pages before whitespace normalization.
 * Poppler's -layout mode communicates columns using long horizontal gaps. The
 * previous parser collapsed those gaps and lost the right-hand column.
 *
 * We only reflow when multiple rows expose a stable gap whose right side begins
 * with an MCQ structural marker. This keeps ordinary prose pages unchanged.
 */
export function reflowMcqColumns(value: string): {
  text: string;
  reflowed: boolean;
} {
  const normalized = value.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');

  const explicitAnswerKeyIndex = lines.findIndex((line) =>
    /^\s*(?:answer\s*keys?|answers|correct\s+answers?|solutions?|key)\b/i.test(
      line,
    ),
  );
  const implicitAnswerKeyIndex = lines.findIndex((line) => {
    const gaps = Array.from(line.matchAll(/ {4,}/g));
    return gaps.some((gap) => {
      const start = gap.index ?? 0;
      const end = start + gap[0].length;
      const left = line.slice(0, start).trim();
      const right = line.slice(end).trim();
      return (
        isCompactAnswerKeyFragment(left) &&
        isCompactAnswerKeyFragment(right)
      );
    });
  });

  const tailStartCandidates = [
    explicitAnswerKeyIndex,
    implicitAnswerKeyIndex,
  ].filter((index) => index >= 0);
  const tailStart = tailStartCandidates.length
    ? Math.min(...tailStartCandidates)
    : lines.length;
  const bodyLines = lines.slice(0, tailStart);
  const tailLines = lines.slice(tailStart);
  const candidates: number[] = [];

  for (const line of bodyLines) {
    const gaps = Array.from(line.matchAll(/ {4,}/g));
    for (const gap of gaps) {
      const start = gap.index ?? 0;
      const end = start + gap[0].length;
      const left = line.slice(0, start).trim();
      const right = line.slice(end).trim();
      if (
        left.length >= 3 &&
        right.length >= 2 &&
        STRUCTURAL_LINE_START.test(right)
      ) {
        candidates.push(Math.round((start + end) / 2));
        break;
      }
    }
  }

  if (candidates.length < 2) {
    return { text: normalized, reflowed: false };
  }

  const sorted = [...candidates].sort((a, b) => a - b);
  const split = sorted[Math.floor(sorted.length / 2)];
  if (split < 20) {
    return { text: normalized, reflowed: false };
  }

  const separatorFor = (line: string): RegExpMatchArray | undefined =>
    Array.from(line.matchAll(/ {3,}/g)).find((gap) => {
      const start = gap.index ?? 0;
      const end = start + gap[0].length;
      return start <= split + 5 && end >= split - 5;
    });

  const splitIndexes = bodyLines
    .map((line, index) => ({ index, separator: separatorFor(line) }))
    .filter(
      (item): item is { index: number; separator: RegExpMatchArray } =>
        Boolean(item.separator),
    );

  if (splitIndexes.length < 2) {
    return { text: normalized, reflowed: false };
  }

  const firstSplitRow = splitIndexes[0].index;
  const lastSplitRow = splitIndexes.at(-1)?.index ?? firstSplitRow;
  const preamble = bodyLines.slice(0, firstSplitRow);
  const postamble = bodyLines.slice(lastSplitRow + 1);
  const leftColumn: string[] = [];
  const rightColumn: string[] = [];
  let splitRows = 0;

  for (let index = firstSplitRow; index <= lastSplitRow; index += 1) {
    const line = bodyLines[index];
    const separator = separatorFor(line);

    if (!separator) {
      const leadingSpaces = line.match(/^ */)?.[0].length ?? 0;
      if (line.trim() && leadingSpaces >= split - 5) {
        rightColumn.push(line.trim());
      } else {
        leftColumn.push(line.trimEnd());
      }
      continue;
    }

    const start = separator.index ?? split;
    const end = start + separator[0].length;
    const left = line.slice(0, start).trimEnd();
    const right = line.slice(end).trim();
    if (left) leftColumn.push(left);
    if (right) rightColumn.push(right);
    splitRows += 1;
  }

  if (splitRows < 2 || rightColumn.length < 2) {
    return { text: normalized, reflowed: false };
  }

  const text = [
    ...preamble,
    ...leftColumn,
    '',
    ...rightColumn,
    ...postamble,
    ...tailLines,
  ]
    .join('\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();

  return { text, reflowed: true };
}

function isCompactAnswerKeyFragment(value: string): boolean {
  return /^\(?\d+\)?\s*(?:[.)\]:=\-–—]|->|→)?\s*\(?[A-F]\)?$/i.test(
    value.trim(),
  );
}

/**
 * pdftotext separates pages using form-feed. Keep empty pages because physical
 * page provenance must remain stable even for watermark-only/scanned pages.
 */
export function splitPdftotextPages(
  extractedText: string,
  pageCount: number,
): UnicodePdfPage[] {
  const normalized = extractedText.replace(/\r\n?/g, '\n');
  const pageTexts = normalized.split('\f');

  if (pageTexts.length > pageCount && pageTexts[pageTexts.length - 1] === '') {
    pageTexts.pop();
  }

  while (pageTexts.length < pageCount) pageTexts.push('');
  if (pageTexts.length > pageCount) pageTexts.length = pageCount;

  return pageTexts.map((text, index) => ({
    page: index + 1,
    text: text.replace(/[ \t]+$/gm, '').trimEnd(),
  }));
}

export function calculatePageExtractionConfidence(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  const characters = Array.from(text);
  const printable = characters.filter((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return character === '\n' || character === '\t' || codePoint >= 32;
  }).length;
  const replacements = characters.filter(
    (character) => character === '\uFFFD',
  ).length;
  const printableRatio = printable / Math.max(1, characters.length);
  const replacementRatio = replacements / Math.max(1, characters.length);
  const structuralLines = text
    .split('\n')
    .filter((line) => STRUCTURAL_LINE_START.test(line.trim())).length;
  const density = Math.min(1, trimmed.length / MIN_GOOD_TEXT_CHARACTERS);
  const structuralSignal = Math.min(1, structuralLines / 4);

  return Number(
    Math.max(
      0,
      Math.min(
        1,
        printableRatio * 0.45 +
          density * 0.3 +
          structuralSignal * 0.25 -
          Math.min(0.65, replacementRatio * 4),
      ),
    ).toFixed(2),
  );
}

export function shouldOcrPage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  const structuralLines = text
    .split('\n')
    .filter((line) => STRUCTURAL_LINE_START.test(line.trim())).length;
  return (
    calculatePageExtractionConfidence(text) < 0.55 ||
    (trimmed.length < MIN_GOOD_TEXT_CHARACTERS && structuralLines < 2)
  );
}

export function stripRepeatedEdgeFurniture(
  pages: UnicodePdfPage[],
): UnicodePdfPage[] {
  const signaturePages = new Map<string, Set<number>>();

  for (const page of pages) {
    const nonEmpty = page.text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const edgeLines = [
      ...nonEmpty.slice(0, 2),
      ...nonEmpty.slice(Math.max(0, nonEmpty.length - 2)),
    ];

    for (const line of edgeLines) {
      const signature = furnitureSignature(line);
      if (!signature) continue;
      const pageSet = signaturePages.get(signature) || new Set<number>();
      pageSet.add(page.page);
      signaturePages.set(signature, pageSet);
    }
  }

  const requiredPages = Math.max(3, Math.ceil(pages.length * 0.6));
  const repeated = new Set(
    [...signaturePages.entries()]
      .filter(([, pageSet]) => pageSet.size >= requiredPages)
      .map(([signature]) => signature),
  );
  if (!repeated.size) return pages;

  return pages.map((page) => {
    const lines = page.text.split('\n');
    const nonEmptyIndexes = lines
      .map((line, index) => ({ line: line.trim(), index }))
      .filter((item) => Boolean(item.line));
    const edgeIndexes = new Set([
      ...nonEmptyIndexes.slice(0, 2).map((item) => item.index),
      ...nonEmptyIndexes
        .slice(Math.max(0, nonEmptyIndexes.length - 2))
        .map((item) => item.index),
    ]);

    const text = lines
      .filter((line, index) => {
        if (!edgeIndexes.has(index)) return true;
        const signature = furnitureSignature(line.trim());
        return !signature || !repeated.has(signature);
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd();

    return {
      ...page,
      text,
      textLength: text.trim().length,
      confidence: calculatePageExtractionConfidence(text),
    };
  });
}

function furnitureSignature(line: string): string | null {
  const compact = line.replace(/\s+/g, ' ').trim();
  if (compact.length < 2 || compact.length > 120) return null;
  if (STRUCTURAL_LINE_START.test(compact)) return null;
  return compact
    .toLocaleLowerCase()
    .replace(/\d+/g, '#')
    .replace(/[^\p{L}\p{N}#&|:/.-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function calculatePdfExtractionConfidence(
  pages: UnicodePdfPage[],
): number {
  if (!pages.length) return 0;
  const qualities = pages.map((page) =>
    page.confidence ?? calculatePageExtractionConfidence(page.text),
  );
  const nonEmpty = pages.filter((page) => page.text.trim().length > 0).length;
  const average =
    qualities.reduce((sum, quality) => sum + quality, 0) / pages.length;
  const coverage = nonEmpty / pages.length;

  return Number(
    Math.max(0, Math.min(1, average * 0.8 + coverage * 0.2)).toFixed(2),
  );
}

@Injectable()
export class PdfTextExtractionService {
  extract(
    buffer: Buffer,
    options: PdfExtractionOptions = {},
  ): UnicodeParsedPdf {
    const workDir = mkdtempSync(join(tmpdir(), 'mdp-pdf-'));
    const pdfPath = join(workDir, 'input.pdf');
    const textPath = join(workDir, 'output.txt');
    const pdftotextBinary = process.env.PDFTOTEXT_BIN?.trim() || 'pdftotext';
    const pdfinfoBinary = process.env.PDFINFO_BIN?.trim() || 'pdfinfo';
    const pdftoppmBinary = process.env.PDFTOPPM_BIN?.trim() || 'pdftoppm';
    const tesseractBinary = process.env.TESSERACT_BIN?.trim() || 'tesseract';
    const processOptions: ExecFileSyncOptionsWithStringEncoding = {
      encoding: 'utf8',
      timeout: PROCESS_TIMEOUT_MS,
      maxBuffer: PROCESS_MAX_BUFFER_BYTES,
      windowsHide: true,
    };

    try {
      writeFileSync(pdfPath, buffer, { flag: 'wx' });

      // security-audit-reviewed: execFileSync avoids shell parsing; pdfPath is generated in our private temp directory.
      const info = execFileSync(pdfinfoBinary, [pdfPath], processOptions);
      const pagesMatch = info.match(/^Pages:\s+(\d+)\s*$/m);
      if (!pagesMatch) {
        throw new BadRequestException(
          'The PDF does not contain a readable page structure',
        );
      }

      const pageCount = Number(pagesMatch[1]);
      if (!Number.isInteger(pageCount) || pageCount < 1) {
        throw new BadRequestException(
          'The PDF does not contain a readable page structure',
        );
      }
      if (pageCount > MAX_PDF_PAGES) {
        throw new BadRequestException(
          `PDF imports are limited to ${MAX_PDF_PAGES} pages`,
        );
      }

      let rawPages: UnicodePdfPage[];
      try {
        // security-audit-reviewed: execFileSync avoids shell parsing; every argument is a separate fixed/value argument.
        execFileSync(
          pdftotextBinary,
          ['-layout', '-enc', 'UTF-8', pdfPath, textPath],
          processOptions,
        );
        rawPages = splitPdftotextPages(
          readFileSync(textPath, 'utf8'),
          pageCount,
        );
      } catch (textLayerError) {
        const details = this.processErrorText(textLayerError);
        if (/password|encrypted|incorrect password/i.test(details)) {
          throw new BadRequestException(
            'Password-protected or encrypted PDFs are not supported for question import',
          );
        }

        // A broken/missing text layer is not terminal if the physical pages are
        // renderable. Start with empty pages so the normal per-page OCR path can
        // recover the document instead of aborting before OCR is attempted.
        rawPages = Array.from({ length: pageCount }, (_, index) => ({
          page: index + 1,
          text: '',
        }));
      }

      const pages = rawPages.map((page) =>
        this.prepareTextLayerPage(page),
      );

      for (const page of pages) {
        if (!options.forceOcr && !shouldOcrPage(page.text)) continue;
        page.ocrAttempted = true;

        const ocrText = this.ocrPage(
          pdfPath,
          page.page,
          workDir,
          pdftoppmBinary,
          tesseractBinary,
          processOptions,
        );
        if (ocrText === null) continue;

        const preparedOcr = this.prepareExtractedText(ocrText);
        const ocrConfidence = calculatePageExtractionConfidence(
          preparedOcr.text,
        );
        const currentConfidence =
          page.confidence ?? calculatePageExtractionConfidence(page.text);

        if (
          preparedOcr.text.trim().length > 0 &&
          (
            options.forceOcr ||
            page.text.trim().length === 0 ||
            ocrConfidence > currentConfidence
          )
        ) {
          page.text = preparedOcr.text;
          page.source = 'OCR';
          page.confidence = ocrConfidence;
          page.textLength = page.text.trim().length;
          page.layoutReflowed = preparedOcr.reflowed;
        }
      }

      for (const page of pages) {
        if (!page.text.trim()) {
          page.source = 'EMPTY';
          page.confidence = 0;
          page.textLength = 0;
        }
      }

      const cleanedPages = stripRepeatedEdgeFurniture(pages).map((page) =>
        page.text.trim()
          ? page
          : {
              ...page,
              source: 'EMPTY' as const,
              confidence: 0,
              textLength: 0,
            },
      );
      const text = cleanedPages.map((page) => page.text).join('\n');
      const ocrPageCount = cleanedPages.filter((page) => page.source === 'OCR').length;
      const textLayerPageCount = cleanedPages.filter(
        (page) => page.source === 'TEXT_LAYER',
      ).length;
      const emptyPageCount = cleanedPages.filter((page) => page.source === 'EMPTY').length;
      const extractionMethod: PdfExtractionMethod =
        ocrPageCount === 0
          ? 'TEXT_LAYER'
          : textLayerPageCount === 0
            ? 'OCR'
            : 'HYBRID_OCR';

      return {
        pages: cleanedPages,
        pageCount,
        text,
        extractionConfidence: calculatePdfExtractionConfidence(cleanedPages),
        extractionMethod,
        ocrPageCount,
        textLayerPageCount,
        emptyPageCount,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;

      const details = this.processErrorText(error);
      if (/password|encrypted|incorrect password/i.test(details)) {
        throw new BadRequestException(
          'Password-protected or encrypted PDFs are not supported for question import',
        );
      }
      if (/ENOENT|not recognized|not found/i.test(details)) {
        throw new BadRequestException(
          'PDF extraction is unavailable on this server. Install Poppler (pdfinfo + pdftotext + pdftoppm) and Tesseract OCR, or configure the corresponding binary paths.',
        );
      }

      throw new BadRequestException(
        'The PDF could not be decoded safely for question import.',
      );
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }

  private prepareTextLayerPage(page: UnicodePdfPage): UnicodePdfPage {
    const prepared = this.prepareExtractedText(page.text);
    return {
      page: page.page,
      text: prepared.text,
      source: prepared.text.trim() ? 'TEXT_LAYER' : 'EMPTY',
      confidence: calculatePageExtractionConfidence(prepared.text),
      textLength: prepared.text.trim().length,
      ocrAttempted: false,
      layoutReflowed: prepared.reflowed,
    };
  }

  private prepareExtractedText(value: string): {
    text: string;
    reflowed: boolean;
  } {
    const withoutFurniture = stripCanonicalPageFurniture(value);
    const reflowed = reflowMcqColumns(withoutFurniture);
    return {
      text: reflowed.text
        .replace(/[ \t]+$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trimEnd(),
      reflowed: reflowed.reflowed,
    };
  }

  private ocrPage(
    pdfPath: string,
    pageNumber: number,
    workDir: string,
    pdftoppmBinary: string,
    tesseractBinary: string,
    processOptions: ExecFileSyncOptionsWithStringEncoding,
  ): string | null {
    const prefix = join(workDir, `ocr-page-${pageNumber}`);
    const imagePath = `${prefix}.png`;

    try {
      // security-audit-reviewed: execFileSync avoids shell parsing; pdfPath is generated in our private temp directory.
      execFileSync(
        pdftoppmBinary,
        [
          '-f',
          String(pageNumber),
          '-l',
          String(pageNumber),
          '-singlefile',
          '-png',
          '-r',
          String(OCR_RENDER_DPI),
          pdfPath,
          prefix,
        ],
        processOptions,
      );
      if (!existsSync(imagePath)) return null;

      // security-audit-reviewed: execFileSync avoids shell parsing; every argument is a separate fixed/value argument.
      return execFileSync(
        tesseractBinary,
        [
          imagePath,
          'stdout',
          '-l',
          process.env.TESSERACT_LANG?.trim() || 'eng',
          '--psm',
          '3',
          '-c',
          'preserve_interword_spaces=1',
        ],
        processOptions,
      );
    } catch {
      // OCR is an enhancement. If the text layer contains anything usable,
      // preserve it and let structural completeness report the missing content.
      // A completely unreadable document is rejected later by inspectPdf.
      return null;
    } finally {
      rmSync(imagePath, { force: true });
    }
  }

  private processErrorText(error: unknown): string {
    if (!(error instanceof Error)) return String(error);
    const candidate = error as Error & {
      stderr?: Buffer | string;
      stdout?: Buffer | string;
      code?: string;
    };
    return [
      candidate.message,
      candidate.code,
      candidate.stderr?.toString(),
      candidate.stdout?.toString(),
    ]
      .filter(Boolean)
      .join('\n');
  }
}
