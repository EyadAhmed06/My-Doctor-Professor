# Canonical MCQ Inspector PDF Contract

## Scope

This contract defines the supported LaTeX/XeTeX MCQ format represented by the canonical **Gastroenterology Week 1** PDF. Parsing correctness is defined against semantic text, not against raw PDF content-stream bytes.

The extraction layer MUST use a Unicode-aware PDF engine. Direct/manual decoding of `Tj`/`TJ` strings as Latin-1 or WinAnsi bytes is not an accepted extraction path.

## Document structure

1. Page 1 is a cover and is not question content.
2. Page 2 is intentionally watermark-only and may have an empty text layer. It MUST still occupy source page 2.
3. Question content starts on page 3.
4. Content pages may repeat visual header/footer text such as `My Doctor& The Professor`, `(Week 1)`, and `Page|N`. Repeated furniture is not part of question stems or options.
5. A section title (for example `Peptic ulcer` or `GERD`) establishes the section for subsequent questions until the next section title or document end.
6. Question numbering may restart at 1 when a new section begins. Question identity therefore MUST NOT be based on question number alone; at minimum use section + ordinal/source page context.
7. Each MCQ has exactly five ordered choices: `A)` through `E)`.
8. An answer-key block belongs to the immediately preceding section and maps question number to exactly one label `A`–`E`.

## Question grammar

A question begins with a numbered marker equivalent to:

```text
<number>) <question stem>
```

The stem may wrap across physical lines/pages. The parser MUST continue the stem until the first option marker or another unambiguous structural boundary.

A valid MCQ option set is ordered and complete:

```text
A) ...
B) ...
C) ...
D) ...
E) ...
```

Wrapped option text belongs to the active option until the next option marker. The parser MUST reject/fail review for a candidate with fewer or more than five choices rather than silently truncating or fabricating a choice.

## Answer-key grammar

Answer entries may be laid out visually as rows/columns but semantically have the form:

```text
<number>) <A-E>
```

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

The canonical GERD Grade-B source currently contains literal `<=5 mm`, `>5 mm`, `<75%`, and `>75%`; those raw values are therefore correct extraction results.

## UI contract

Question stems and options are rendered as React text or `value` properties. `<`, `>`, `&`, and other symbols MUST NOT be passed through HTML parsing and the Inspector MUST NOT use `dangerouslySetInnerHTML` for imported medical text.

If a symbol is absent from a normal React input/textarea value, the defect is upstream in extraction/parsing or API serialization, not an HTML escaping requirement.

## Extraction implementation

The supported backend path uses Poppler:

```text
pdfinfo <pdf>
pdftotext -layout -enc UTF-8 <pdf> <text-output>
```

`pdfinfo` supplies the physical page count. `pdftotext` form-feed boundaries preserve pages, including empty page 2. The runtime image must contain both `pdfinfo` and `pdftotext`.

## Fail-closed rules

A candidate is not silently publishable when any of these invariants fail:

- unreadable or encrypted text layer;
- ambiguous page structure;
- missing question stem;
- option labels other than a complete ordered A–E set;
- missing or conflicting correct answer;
- answer-key number cannot be scoped to a section;
- text extraction contains substantial replacement-character/corruption evidence;
- duplicate candidate is detected without explicit instructor resolution.

## LaTeX authoring recommendation

The source may visually use mathematical forms such as `\leq`, `\geq`, percentages, Greek letters, subscripts, and superscripts. The generated PDF should embed fonts/Unicode mappings so standards-compliant extractors can reconstruct semantic Unicode text. Changing the visible notation in LaTeX is a content/presentation decision; it is not a substitute for a Unicode-aware extraction layer.
