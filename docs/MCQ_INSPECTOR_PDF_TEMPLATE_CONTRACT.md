# MCQ Inspector PDF Contract

## Scope

This contract defines the supported MCQ structure used by the inspector. The original Gastroenterology Week 1 PDF is a regression fixture, not a source of fixed page counts or question totals.

Parsing correctness is defined against semantic text, not against raw PDF content-stream bytes.

The extraction layer MUST use a Unicode-aware PDF engine. Direct/manual decoding of `Tj`/`TJ` strings as Latin-1 or WinAnsi bytes is not an accepted extraction path.

## Dynamic document structure

1. The physical PDF page count is discovered at runtime with `pdfinfo`. No exact page count is part of the MCQ contract.
2. Empty/watermark-only pages are preserved in the physical page sequence so source-page provenance remains correct.
3. Question content may begin on any physical page.
4. Content pages may repeat visual header/footer text. Repeated furniture is not part of question stems or options.
5. An answer-key block closes the current section. Section titles are metadata and may use arbitrary wording; the parser does not require a fixed list of medical section names.
6. Question numbering may restart when a new section begins. Question identity therefore MUST NOT be based on question number alone; at minimum use section + ordinal/source-page context.
7. Each currently supported MCQ has exactly five ordered choices: `A)` through `E)`.
8. An answer-key block belongs to its section and maps question number to exactly one label `A`–`E`.
9. **Question counts are never configured in code.** The answer-key entries in a section define that section's expected question-number set.
10. **The total number of questions is never configured in code.** It is the sum of the expected question counts derived from all section answer keys.

The canonical Gastroenterology fixture may happen to have a particular page count and particular section sizes. Those values are test data only and MUST NOT be used as runtime parser configuration.

## Dynamic completeness contract

For each section, the parser computes:

- `expectedQuestionNumbers`: the sorted question numbers present in that section's answer key;
- `parsedQuestionNumbers`: the sorted unique question numbers recognized from question bodies;
- `missingQuestionNumbers`: expected numbers that were not parsed;
- `unexpectedQuestionNumbers`: parsed numbers that are not present in the section answer key;
- `expectedQuestionCount`: the number of answer-key entries, or `null` when no answer key can be established;
- `parsedQuestionCount`: the number of parsed question candidates;
- `completeness`: the fraction of expected question numbers successfully parsed.

For the whole document, `expectedQuestionCount` is available only when every parsed section has a detectable answer key. When available, it is calculated from the PDF itself by summing the section expectations.

A structurally complete document must have:

- an answer key for every section;
- no missing expected question numbers;
- no unexpected question numbers;
- no duplicate question numbers inside a section;
- no conflicting answer-key entries for the same question;
- a parsed total equal to the dynamically derived expected total.

This allows section sizes and PDF totals to change without code changes.

## Question grammar

A question begins with a numbered marker. Common supported forms include:

```text
1) <question stem>
1. <question stem>
1: <question stem>
1 - <question stem>
(1) <question stem>
Q1) <question stem>
Question 1: <question stem>
```

The stem may wrap across physical lines/pages. The parser MUST continue the stem until the first option marker or another unambiguous structural boundary.

A valid MCQ option set is ordered and complete. Marker punctuation may vary, for example `A)`, `A.`, `A:`, or `(A)`. The current publishing contract still requires exactly A–E.

Wrapped option text belongs to the active option until the next option marker. The parser MUST reject/fail review for a candidate with fewer or more than five choices rather than silently truncating or fabricating a choice.

## Answer-key grammar

Answer entries may be laid out visually as rows/columns but semantically have the form:

```text
<number>) <A-E>
```

Compact separators such as spaces, pipes, commas, and semicolons may separate entries.

An answer-key entry is metadata, not a new MCQ. The parser MUST distinguish a compact `number + single letter` answer-key entry from a question stem.

A publishable MCQ MUST resolve to one and only one correct option. Missing, duplicate, or out-of-range answer mappings require instructor review.

## Source-page contract

- Page numbers are physical PDF page numbers, starting at 1.
- Empty/watermark-only pages are preserved in the page sequence.
- A question's `sourcePage` is the page where its numbered stem begins.
- Page furniture and watermark text must never be concatenated into a stem or option.

## Symbol contract

Raw extracted text is authoritative. These characters/sequences MUST survive extraction unchanged when present in the source:

| Source | Raw internal text | Optional display form |
| --- | --- | --- |
| `<5` | `<5` | `<5` |
| `>5` | `>5` | `>5` |
| `<=5` | `<=5` | `≤5` |
| `>=5` | `>=5` | `≥5` |
| `+/-` | `+/-` | `±` |
| `±` | `±` | `±` |
| `%` | `%` | `%` |
| `×` | `×` | `×` |
| `°` | `°` | `°` |
| `->` | `->` | `→` |
| `→ ← ↔` | unchanged | unchanged |
| `α β γ δ` | unchanged | unchanged |
| `H₂`, `CO₂` | unchanged | unchanged |
| `cm²`, `10⁶` | unchanged | unchanged |
| `&` | `&` | `&` |

Approved normalization (`<= → ≤`, `>= → ≥`, `+/- → ±`, `-> → →`) is presentation-only. It MUST NOT modify stored medical text, answer mapping, hashing/duplicate detection, or parser boundaries.

## UI contract

Question stems and options are rendered as React text or `value` properties. `<`, `>`, `&`, and other symbols MUST NOT be passed through HTML parsing and the Inspector MUST NOT use `dangerouslySetInnerHTML` for imported medical text.

If a symbol is absent from a normal React input/textarea value, the defect is upstream in extraction/parsing or API serialization, not an HTML escaping requirement.

## Extraction implementation

The backend uses a page-aware hybrid extraction path:

```text
pdfinfo <pdf>
pdftotext -layout -enc UTF-8 <pdf> <text-output>
        │
        ├─ usable page text ───────────────┐
        │                                  │
        └─ weak/empty page                 │
             ↓                             │
          pdftoppm                         │
             ↓                             │
          Tesseract OCR                    │
             ↓                             │
       choose better page text             │
                                            ↓
                         two-column MCQ layout reflow
                                            ↓
                                  structural parser
```

The extractor scores every physical page independently. Weak or empty pages are OCR candidates even when the rest of the PDF has a healthy text layer, preventing mixed text/scanned PDFs from silently losing pages.

`pdftotext -layout` spacing is consumed before whitespace normalization. When a stable MCQ column separator is detected, the page is reordered left-column first and right-column second instead of collapsing both columns onto one line.

The runtime image contains Poppler (`pdfinfo`, `pdftotext`, `pdftoppm`) and Tesseract OCR. Page diagnostics record the selected source (`TEXT_LAYER`, `OCR`, or `EMPTY`), page confidence, OCR attempt status, and whether layout reflow occurred.

## Fail-closed rules

A candidate or document is not silently considered complete when any of these invariants fail:

- unreadable or encrypted PDF structure;
- a page remains unreadable after text-layer extraction and OCR fallback;
- ambiguous page structure;
- a section has no detectable answer key;
- an answer-key question number has no parsed question body;
- a parsed question number is outside the section answer key;
- missing question stem;
- option labels other than a complete ordered A–E set;
- missing or conflicting correct answer;
- answer-key number cannot be scoped to a section;
- text extraction contains substantial replacement-character/corruption evidence;
- duplicate candidate is detected without explicit instructor resolution.

## LaTeX authoring recommendation

The source may visually use mathematical forms such as `\leq`, `\geq`, percentages, Greek letters, subscripts, and superscripts. The generated PDF should embed fonts/Unicode mappings so standards-compliant extractors can reconstruct semantic Unicode text. Changing the visible notation in LaTeX is a content/presentation decision; it is not a substitute for a Unicode-aware extraction layer.
