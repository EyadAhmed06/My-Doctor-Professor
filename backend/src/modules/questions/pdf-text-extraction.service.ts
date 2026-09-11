import { BadRequestException, Injectable } from '@nestjs/common';
import {
  execFileSync,
  type ExecFileSyncOptionsWithStringEncoding,
} from 'child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export type UnicodePdfPage = {
  page: number;
  text: string;
};

export type UnicodeParsedPdf = {
  pages: UnicodePdfPage[];
  pageCount: number;
  text: string;
  extractionConfidence: number;
};

const MAX_PDF_PAGES = 200;
const PROCESS_TIMEOUT_MS = 20_000;
const PROCESS_MAX_BUFFER_BYTES = 32 * 1024 * 1024;

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

/** Remove visual template furniture that must never become part of a stem/option. */
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
 * pdftotext separates pages using form-feed. Keep empty pages because the
 * canonical MCQ template deliberately contains a watermark-only second page.
 */
export function splitPdftotextPages(
  extractedText: string,
  pageCount: number,
): UnicodePdfPage[] {
  const normalized = extractedText.replace(/\r\n?/g, '\n');
  const pageTexts = normalized.split('\f');

  // Poppler normally appends a final form-feed after the last page.
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

export function calculatePdfExtractionConfidence(
  pages: UnicodePdfPage[],
): number {
  const text = pages.map((page) => page.text).join('\n');
  if (!text.length) return 0;

  const characters = Array.from(text);
  const printable = characters.filter((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return character === '\n' || character === '\t' || codePoint >= 32;
  }).length;
  const replacementCharacters = characters.filter(
    (character) => character === '\uFFFD',
  ).length;
  const printableRatio = printable / Math.max(1, characters.length);
  const replacementPenalty = Math.min(
    0.5,
    replacementCharacters / Math.max(1, characters.length),
  );
  const density = Math.min(
    1,
    text.trim().length / Math.max(300, pages.length * 250),
  );

  return Number(
    Math.max(
      0,
      Math.min(1, printableRatio * 0.65 + density * 0.35 - replacementPenalty),
    ).toFixed(2),
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
      const extractedText = readFileSync(textPath, 'utf8');
      const rawPages = splitPdftotextPages(extractedText, pageCount);
      const pages = rawPages.map((page) => ({
        ...page,
        text: stripCanonicalPageFurniture(page.text),
      }));
      const text = pages.map((page) => page.text).join('\n');

      return {
        pages,
        pageCount,
        text,
        extractionConfidence: calculatePdfExtractionConfidence(pages),
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
          'Unicode PDF extraction is unavailable on this server. Install Poppler (pdfinfo + pdftotext) or configure PDFINFO_BIN/PDFTOTEXT_BIN.',
        );
      }

      throw new BadRequestException(
        'The PDF text layer could not be decoded safely. Re-export the PDF with an embedded Unicode text layer or use OCR.',
      );
    } finally {
      rmSync(workDir, { recursive: true, force: true });
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
