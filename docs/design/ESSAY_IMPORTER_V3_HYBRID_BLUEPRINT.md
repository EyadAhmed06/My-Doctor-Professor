# Essay Importer V3 — Hybrid Clinical Review + Question Manager
Status: approved UI/UX blueprint; not implementation. Baseline: `agent/phase1-interactions` Essay Importer V2.

## Product design contract
Two views sharing one underlying review state: **Review** (clinical master–detail; single active question) and **Manage** (dense, accessible table; bulk operations). Both run within four task stages: Import → Review/Manage → Organize → Publish.

## Review: desktop
- Fixed-width 260–320 px content navigator with searchable **Cases** and **Lectures**, per-section counts and validation states. Selecting a section retains the last-visited question per section.
- Central question canvas has a full-width readable clinical stem at top for CASE sections; for LECTURE show the lecture title rather than fabricated clinical context. Entire stem is visible with optional expand/collapse, no tiny sidebar textarea. Explicit Edit toggles the editor.
- One active question only: prominent original wording, answer formatted with preserved line breaks, compact difficulty control, direct numeric marks, published/source status, issue indicators, inclusion checkbox next to question identity. Review/read state first, edit on demand; no permanently visible giant textareas.
- Sticky lightweight navigator **Previous · Q5 of 159 / 1 of 6 · Next**, Go to Q, jump to cases and lectures, keyboard shortcuts that do not interfere with form fields.
- Optional right-hand inspector *only when needed*: source PDF page, answer provenance, validation issues and edit history. Do not force medical context into a 300 px column.
- On tablets navigator collapses to drawer, question panel full width. Mobile uses one-column layout and persistent bottom previous/next.

## Manage: dense table
- One row per question; columns: selection, number, section, short stem, validation, answer origin, difficulty, marks, destination, publication state.
- Group by case/lecture with collapsible headers and counts; search, multi-sort, filters for missing answer, invalid/needs review, unassigned destination, published/unpublished.
- In-cell quick edits for difficulty, marks, approval; open any row in Review at that question preserving selection, filters and scroll state.
- Selection scope always explicit: current section / filtered results / entire import. Bulk assign destination, difficulty/marks and approve only eligible questions. Confirm effects on validation and publication. Use server-side pagination or windowed rows where needed.
- Expose reasons behind “not ready” as a count breakdown, not an unexplained zero.

## Step 1: Import
- Source file picker and accepted formats; content type and rights confirmation; inspect and show 6 cases, 8 lectures, 159 questions, 38 pages for the known example only when returned by parser.
- Resume recent session; show in-progress/failed extraction state and a source-file change action.
- Do not silently merge or throw away previous session edits when changing files.

## Step 2: Review / Manage
- Start in Review for first section with errors, otherwise first question. Toggle modes without network reinspection.
- Medical answer and clinical case text retain line breaks, numbered points and bullet structures.
- Draft status distinguishes Unchanged / Unsaved / Saving / Saved / Failed / Conflict; failed saves never claim success. Explicit retry; revision-safe recovery; refresh across device.
- Undo/redo for local edits but never reverse already published server state.

## Step 3: Organize
- Destination switch: Question Bank (course → week → lecture topic) or Case Studio (week; clinical CASE only).
- Table/map with source group,  number selected, selected destination, assignment status. Suggest exact matches but require clear review; never infer wrong destination.
- Default destination and group overrides must be clearly visible. Warn when a selected group is unassigned. User can return to Review or Manage without loss.

## Step 4: Publish
- Preflight summary of extracted, selected, eligible, unassigned, missing answer, invalid, already published, and destination.
- Distinguish “valid to review” from “ready to publish”; show blockers by section and deep-link to each.
- Publish selected eligible questions in bounded sequential batches; show progress, batches succeeded/failed and recoverable retry. Case Studio runs only against clinical cases with valid week assignment.
- Avoid duplicate publication on retry; published questions become immutable in local undo history.
- Final receipt with counts, links to destination and unfinished items.

## Responsiveness and typography
- Body text >=16 px; clinical stem, question, answer >=17–18 px where practical; metadata >=14 px; line height 1.5–1.65.
- No tiny side clinical stems, giant KPI cards or full-width difficulty selectors. Compact status strip, no second scroll area for every section.
- Visible checkbox labels and focus state; WCAG 2.2 AA review target, keyboard and screen-reader navigation.
- Keep existing navy/turquoise identity without making text low-contrast.

## Data contract — preserve
Frontend types from `essay-import-model.ts`: Candidate (candidate_id, section, block_type, case_number, case_label, case_stem, question_number, question_text, model_answer, answer_origin, source_page, answer_page, extraction_confidence, status, issues), ReviewCandidate (approved, difficulty, marks), Inspection (file metadata, summary, candidates). Preserve stable candidate IDs.
Backend: `/questions/imports/essay/sessions/inspect`, `/sessions`, `/sessions/:id`, `/sessions/:id/candidates?offset&limit`, `/sessions/:id/review` and `/publish`. Respect ownership, revisions and rate limits. Preserve original PDF/JSON/TXT parsing, title/stem grouping, multi-page answer matching and publication destinations.
The UI redesign must **not** change the validation meaning of status or fabricate a source answer. Avoid schema or API changes unless independently required by tested bug fixes.

## Acceptance suite
1. Real mixed PDF: verify 6 CASE blocks, 8 LECTURE blocks and 159 questions, with all stems and model answers intact.
2. Navigate by section, Q number, keyboard; edit Q5 then Q159 then return; no edits lost.
3. Manage filters and bulk actions select exact candidate IDs; no hidden selection surprise.
4. Correctly explain why 159 VALID can still equal zero publishable; section-level blocker links.
5. Autosave success/failure/conflict and refresh/cross-device recovery; no false “Saved”.
6. Publishing partial failure + retry is safe; no duplicate questions; receipt and published state accurate.
7. Desktop 1440px, tablet 768px, mobile 390px, keyboard-only and assisted technology checks.
8. All existing essay importer tests plus 501-question paging and 2000-question stress/regression pass.

## Implementation sequence
1. Isolate importer state/controller and preserve contracts.
2. Build responsive shell and navigator; implement Review with one active editor and source details.
3. Build Manage table with shared state and bulk selection semantics.
4. Rebuild Organize and Publish flow (preflight + safe retry).
5. Validate all scenarios with real PDF, screenshot regression and performance tests before guarded rollout.

## Decision record
Selected design: hybrid C + B. Rejected: full accordion with all question editors mounted, monolithic form with nested scrolling, table-only editor that hides clinical context, and single-question-only workflow without bulk operations.
