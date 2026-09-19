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
  /^(?:(?:Q(?:uestion)?\s*)?\(?\d+\)?\s*[.)\]:-]\s+|\(?[A-Fa-f]\)?\s*[.)\]:-]\s+|(?:answer\s*key|answers?|correct\s+answers?)\b)/i;

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
  const candidates: number[] = [];

  for (const line of lines) {
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

  const leftColumn: string[] = [];
  const rightColumn: string[] = [];
  let splitRows = 0;

  for (const line of lines) {
    const gaps = Array.from(line.matchAll(/ {3,}/g));
    const separator = gaps.find((gap) => {
      const start = gap.index ?? 0;
      const end = start + gap[0].length;
      return start <= split + 5 && end >= split - 5;
    });

    if (!separator) {
      leftColumn.push(line.trimEnd());
      continue;
    }

    const start = separator.index ?? split;
    const end = start + separator[0].length;
    const left = line.slice(0, start).trimEnd();
    const right = line.slice(end).trim();
    leftColumn.push(left);
    if (right) rightColumn.push(right);
    splitRows += 1;
  }

  if (splitRows < 2 || rightColumn.length < 2) {
    return { text: normalized, reflowed: false };
  }

  const text = [
    ...leftColumn,
    '',
    ...rightColumn,
  ]
    .join('\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();

  return { text, reflowed: true };
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
  extract(buffer: Buffer): UnicodeParsedPdf {
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

      execFileSync(
        pdftotextBinary,
        ['-layout', '-enc', 'UTF-8', pdfPath, textPath],
        processOptions,
      );

      const rawPages = splitPdftotextPages(
        readFileSync(textPath, 'utf8'),
        pageCount,
      );
      const pages = rawPages.map((page) =>
        this.prepareTextLayerPage(page),
      );

      for (const page of pages) {
        if (!shouldOcrPage(page.text)) continue;
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
          (page.text.trim().length === 0 || ocrConfidence > currentConfidence)
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

      const text = pages.map((page) => page.text).join('\n');
      const ocrPageCount = pages.filter((page) => page.source === 'OCR').length;
      const textLayerPageCount = pages.filter(
        (page) => page.source === 'TEXT_LAYER',
      ).length;
      const emptyPageCount = pages.filter((page) => page.source === 'EMPTY').length;
      const extractionMethod: PdfExtractionMethod =
        ocrPageCount === 0
          ? 'TEXT_LAYER'
          : textLayerPageCount === 0
            ? 'OCR'
            : 'HYBRID_OCR';

      return {
        pages,
        pageCount,
        text,
        extractionConfidence: calculatePdfExtractionConfidence(pages),
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
    } catch (error) {
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
