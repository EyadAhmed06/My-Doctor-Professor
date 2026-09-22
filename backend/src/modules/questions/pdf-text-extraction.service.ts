import { BadRequestException, Injectable, Logger } from '@nestjs/common';
// security-audit-reviewed: execFile uses no shell, fixed argument arrays, bounded time/buffer, and server-controlled binary paths.
import {
  execFile,
  type ExecFileOptionsWithStringEncoding,
} from 'child_process';
import { createHash } from 'crypto';
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
  ocrPages?: number[];
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
const EXTRACTION_CACHE_TTL_MS = 15 * 60 * 1000;
const EXTRACTION_CACHE_MAX_ENTRIES = 8;

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
  private readonly logger = new Logger(PdfTextExtractionService.name);
  private readonly extractionCache = new Map<
    string,
    { storedAt: number; value: UnicodeParsedPdf }
  >();

  async extract(
    buffer: Buffer,
    options: PdfExtractionOptions = {},
  ): Promise<UnicodeParsedPdf> {
    const startedAt = Date.now();
    const cacheEligible = !options.forceOcr && !(options.ocrPages?.length);
    const cacheKey = cacheEligible
      ? createHash('sha256').update(buffer).digest('hex')
      : null;
    if (cacheKey) {
      const cached = this.readExtractionCache(cacheKey);
      if (cached) {
        this.logger.log(
          JSON.stringify({
            event: 'pdf_extraction_cache_hit',
            page_count: cached.pageCount,
            total_ms: Date.now() - startedAt,
          }),
        );
        return cached;
      }
    }
    const workDir = mkdtempSync(join(tmpdir(), 'mdp-pdf-'));
    const pdfPath = join(workDir, 'input.pdf');
    const textPath = join(workDir, 'output.txt');
    const binaries = this.binaries();
    const processOptions = this.processOptions();

    let pageCount = 0;
    let pdfInfoMs = 0;
    let textLayerMs = 0;
    let ocrMs = 0;
    let requestedOcrPages = 0;

    try {
      writeFileSync(pdfPath, buffer, { flag: 'wx' });

      const pdfInfoStarted = Date.now();
      const info = await this.runProcess(
        binaries.pdfinfo,
        [pdfPath],
        processOptions,
      );
      pdfInfoMs = Date.now() - pdfInfoStarted;

      const pagesMatch = info.match(/^Pages:\s+(\d+)\s*$/m);
      if (!pagesMatch) {
        throw new BadRequestException(
          'The PDF does not contain a readable page structure',
        );
      }

      pageCount = Number(pagesMatch[1]);
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
      const textLayerStarted = Date.now();
      try {
        await this.runProcess(
          binaries.pdftotext,
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

        rawPages = Array.from({ length: pageCount }, (_, index) => ({
          page: index + 1,
          text: '',
        }));
      }
      textLayerMs = Date.now() - textLayerStarted;

      let pages = rawPages.map((page) => this.prepareTextLayerPage(page));
      const explicitOcrPages = new Set(
        (options.ocrPages || []).filter(
          (page) => Number.isInteger(page) && page >= 1 && page <= pageCount,
        ),
      );
      const pagesToOcr = pages
        .filter(
          (page) =>
            options.forceOcr ||
            explicitOcrPages.has(page.page) ||
            shouldOcrPage(page.text),
        )
        .map((page) => page.page);

      requestedOcrPages = pagesToOcr.length;
      if (pagesToOcr.length > 0) {
        const ocrStarted = Date.now();
        const recovered = await this.ocrPages(
          pdfPath,
          pagesToOcr,
          workDir,
          binaries.pdftoppm,
          binaries.tesseract,
          processOptions,
        );
        ocrMs = Date.now() - ocrStarted;

        const recoveredByPage = new Map(recovered.map((item) => [item.page, item.text]));
        pages = pages.map((page) => {
          if (!recoveredByPage.has(page.page)) return page;
          page.ocrAttempted = true;
          const ocrText = recoveredByPage.get(page.page);
          if (ocrText === null || ocrText === undefined) return page;

          const preparedOcr = this.prepareExtractedText(ocrText);
          const ocrConfidence = calculatePageExtractionConfidence(preparedOcr.text);
          const currentConfidence =
            page.confidence ?? calculatePageExtractionConfidence(page.text);
          const forceReplace =
            options.forceOcr || explicitOcrPages.has(page.page);

          if (
            preparedOcr.text.trim().length > 0 &&
            (
              forceReplace ||
              page.text.trim().length === 0 ||
              ocrConfidence > currentConfidence
            )
          ) {
            return {
              ...page,
              text: preparedOcr.text,
              source: 'OCR' as const,
              confidence: ocrConfidence,
              textLength: preparedOcr.text.trim().length,
              layoutReflowed: preparedOcr.reflowed,
            };
          }
          return page;
        });
      }

      const result = this.finalizePages(pages, pageCount);
      this.logger.log(
        JSON.stringify({
          event: 'pdf_extraction_timing',
          page_count: pageCount,
          pdfinfo_ms: pdfInfoMs,
          text_layer_ms: textLayerMs,
          ocr_pages: requestedOcrPages,
          ocr_ms: ocrMs,
          ocr_concurrency: this.ocrConcurrency(),
          total_ms: Date.now() - startedAt,
          method: result.extractionMethod,
        }),
      );
      if (
        cacheKey &&
        result.text.trim() &&
        (result.emptyPageCount ?? 0) === 0
      ) {
        this.writeExtractionCache(cacheKey, result);
      }
      return result;
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

  /**
   * Recover only the pages implicated by structural parsing failures.
   * This deliberately reuses the successful text-layer extraction instead of
   * repeating pdfinfo + pdftotext and OCRing the whole document.
   */
  async recoverPages(
    buffer: Buffer,
    currentPdf: UnicodeParsedPdf,
    requestedPages: number[],
  ): Promise<UnicodeParsedPdf> {
    const pageNumbers = [...new Set(requestedPages)]
      .filter(
        (page) =>
          Number.isInteger(page) &&
          page >= 1 &&
          page <= currentPdf.pageCount,
      )
      .sort((left, right) => left - right);

    if (pageNumbers.length === 0) return currentPdf;

    const startedAt = Date.now();
    const workDir = mkdtempSync(join(tmpdir(), 'mdp-pdf-recovery-'));
    const pdfPath = join(workDir, 'input.pdf');
    const binaries = this.binaries();
    const processOptions = this.processOptions();

    try {
      writeFileSync(pdfPath, buffer, { flag: 'wx' });
      const recovered = await this.ocrPages(
        pdfPath,
        pageNumbers,
        workDir,
        binaries.pdftoppm,
        binaries.tesseract,
        processOptions,
      );
      const recoveredByPage = new Map(recovered.map((item) => [item.page, item.text]));

      const merged = currentPdf.pages.map((page) => {
        if (!recoveredByPage.has(page.page)) return { ...page };
        const ocrText = recoveredByPage.get(page.page);
        const attempted = { ...page, ocrAttempted: true };
        if (ocrText === null || ocrText === undefined) return attempted;

        const preparedOcr = this.prepareExtractedText(ocrText);
        if (!preparedOcr.text.trim()) return attempted;

        return {
          ...attempted,
          text: preparedOcr.text,
          source: 'OCR' as const,
          confidence: calculatePageExtractionConfidence(preparedOcr.text),
          textLength: preparedOcr.text.trim().length,
          layoutReflowed: preparedOcr.reflowed,
        };
      });

      const result = this.finalizePages(merged, currentPdf.pageCount);
      this.logger.log(
        JSON.stringify({
          event: 'pdf_recovery_timing',
          page_count: currentPdf.pageCount,
          recovery_pages: pageNumbers,
          recovery_page_count: pageNumbers.length,
          ocr_concurrency: this.ocrConcurrency(),
          total_ms: Date.now() - startedAt,
          method: result.extractionMethod,
        }),
      );
      return result;
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }

  private finalizePages(
    pages: UnicodePdfPage[],
    pageCount: number,
  ): UnicodeParsedPdf {
    const normalizedPages = pages.map((page) =>
      page.text.trim()
        ? page
        : {
            ...page,
            source: 'EMPTY' as const,
            confidence: 0,
            textLength: 0,
          },
    );
    const cleanedPages = stripRepeatedEdgeFurniture(normalizedPages).map(
      (page) =>
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
    const ocrPageCount = cleanedPages.filter(
      (page) => page.source === 'OCR',
    ).length;
    const textLayerPageCount = cleanedPages.filter(
      (page) => page.source === 'TEXT_LAYER',
    ).length;
    const emptyPageCount = cleanedPages.filter(
      (page) => page.source === 'EMPTY',
    ).length;
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

  private async ocrPages(
    pdfPath: string,
    pageNumbers: number[],
    workDir: string,
    pdftoppmBinary: string,
    tesseractBinary: string,
    processOptions: ExecFileOptionsWithStringEncoding,
  ): Promise<Array<{ page: number; text: string | null }>> {
    return this.mapWithConcurrency(
      pageNumbers,
      this.ocrConcurrency(),
      async (page) => ({
        page,
        text: await this.ocrPage(
          pdfPath,
          page,
          workDir,
          pdftoppmBinary,
          tesseractBinary,
          processOptions,
        ),
      }),
    );
  }

  private async ocrPage(
    pdfPath: string,
    pageNumber: number,
    workDir: string,
    pdftoppmBinary: string,
    tesseractBinary: string,
    processOptions: ExecFileOptionsWithStringEncoding,
  ): Promise<string | null> {
    const prefix = join(workDir, `ocr-page-${pageNumber}`);
    const imagePath = `${prefix}.png`;

    try {
      await this.runProcess(
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

      return await this.runProcess(
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
      return null;
    } finally {
      rmSync(imagePath, { force: true });
    }
  }

  private runProcess(
    binary: string,
    args: string[],
    options: ExecFileOptionsWithStringEncoding,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(binary, args, options, (error, stdout, stderr) => {
        if (error) {
          const enriched = error as Error & {
            stderr?: string;
            stdout?: string;
            code?: string;
          };
          enriched.stderr = stderr;
          enriched.stdout = stdout;
          reject(enriched);
          return;
        }
        resolve(stdout);
      });
    });
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<R>,
  ): Promise<R[]> {
    if (items.length === 0) return [];
    const results = new Array<R>(items.length);
    let cursor = 0;
    const workerCount = Math.min(Math.max(1, concurrency), items.length);

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (true) {
          const index = cursor;
          cursor += 1;
          if (index >= items.length) return;
          results[index] = await worker(items[index]);
        }
      }),
    );

    return results;
  }

  private ocrConcurrency(): number {
    const configured = Number(process.env.PDF_OCR_CONCURRENCY || '2');
    if (!Number.isFinite(configured)) return 2;
    return Math.max(1, Math.min(4, Math.floor(configured)));
  }

  private readExtractionCache(key: string): UnicodeParsedPdf | null {
    const entry = this.extractionCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.storedAt > EXTRACTION_CACHE_TTL_MS) {
      this.extractionCache.delete(key);
      return null;
    }

    // Refresh LRU position.
    this.extractionCache.delete(key);
    this.extractionCache.set(key, entry);
    return this.cloneParsedPdf(entry.value);
  }

  private writeExtractionCache(key: string, value: UnicodeParsedPdf): void {
    this.extractionCache.delete(key);
    this.extractionCache.set(key, {
      storedAt: Date.now(),
      value: this.cloneParsedPdf(value),
    });
    while (this.extractionCache.size > EXTRACTION_CACHE_MAX_ENTRIES) {
      const oldest = this.extractionCache.keys().next().value as
        | string
        | undefined;
      if (!oldest) break;
      this.extractionCache.delete(oldest);
    }
  }

  private cloneParsedPdf(value: UnicodeParsedPdf): UnicodeParsedPdf {
    return {
      ...value,
      pages: value.pages.map((page) => ({ ...page })),
    };
  }

  private binaries() {
    return {
      pdftotext: process.env.PDFTOTEXT_BIN?.trim() || 'pdftotext',
      pdfinfo: process.env.PDFINFO_BIN?.trim() || 'pdfinfo',
      pdftoppm: process.env.PDFTOPPM_BIN?.trim() || 'pdftoppm',
      tesseract: process.env.TESSERACT_BIN?.trim() || 'tesseract',
    };
  }

  private processOptions(): ExecFileOptionsWithStringEncoding {
    return {
      encoding: 'utf8',
      timeout: PROCESS_TIMEOUT_MS,
      maxBuffer: PROCESS_MAX_BUFFER_BYTES,
      windowsHide: true,
    };
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

