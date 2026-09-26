# PDF Inspector Performance Contract

The MCQ inspector must optimize latency without changing the source-grounded parsing contract.

## Fast path

1. Hash and validate the PDF.
2. Run `pdfinfo` and `pdftotext -layout -enc UTF-8` asynchronously.
3. Parse section-scoped questions and answer keys before doing speculative OCR.
4. Return immediately when the A-E/question/answer-key structure is complete.

A clean text-layer PDF should therefore perform **zero OCR work**.

## Recovery path

When parsing proves structural incompleteness:

1. Derive the smallest set of implicated physical pages.
2. Include neighboring pages where a question may span a page boundary.
3. Render contiguous page ranges in bounded Poppler batches.
4. OCR rendered pages with bounded concurrency.
5. Merge only recovered pages into the original text-layer result.
6. Reparse and keep the recovered document only when it is structurally better.
7. If targeted recovery still leaves the document structurally incomplete, return that explicit incomplete state instead of escalating to unrelated pages.

A fully raster PDF is handled separately: when the text-only attempt yields no usable text at all, every physical page is genuinely suspect, so the raster fallback may OCR the entire document. This is distinct from structural recovery of a mostly-readable PDF.

## Runtime controls

Production defaults:

```
PDF_OCR_CONCURRENCY=2
PDF_OCR_THREADS_PER_WORKER=1
PDF_OCR_RENDER_BATCH_SIZE=8
```

The worker count and Tesseract OpenMP threads are deliberately bounded to avoid CPU oversubscription. Tune these values using production timing logs rather than increasing them blindly.

## Caching

Successful text extraction and targeted OCR recovery are cached in-memory using:

- PDF SHA-256
- extraction/cache contract version
- OCR mode
- Tesseract language
- render DPI
- requested recovery pages
- current extraction-state fingerprint

This prevents the same PDF/recovery request from rerunning expensive OCR during repeated inspection while preventing MCQ deferred-OCR results from contaminating eager-OCR consumers such as the essay inspector.

## Timing logs

The backend emits structured events:

- `pdf_extraction_timing`
- `pdf_extraction_cache_hit`
- `pdf_recovery_timing`
- `pdf_recovery_cache_hit`
- `pdf_inspection_timing`

Important fields include text-layer time, OCR time/page count, parser time, targeted recovery pages, candidate-evaluation time, and total request time. Structural recovery logs `structural_recovery_strategy=TARGETED_ONLY`.

## Correctness invariants

Performance work must not:

- invent source text;
- replace a good text-layer page merely for speed;
- remove answer-key completeness checks;
- silently accept missing questions;
- remove page provenance;
- change duplicate/topic scoring semantics;
- turn one local structural defect into a whole-document OCR pass;
- treat a fully raster PDF as equivalent to a mostly-readable PDF with one damaged question.

CI builds the production OCR image and runs the PDF/parser/import contract suite for every relevant change.
