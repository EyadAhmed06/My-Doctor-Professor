# Essay Importer V3 — complete interface redesign specification

Status: approved direction for implementation; NOT implemented. Source of truth: screenshots of current Essay Importer V2 provided by stakeholder, latest frontend on agent/phase1-interactions.

## Product goals
Review and publish complex medical essay material with high comprehension, low friction, consistent state, accessible navigation, and no data loss.

## Non-negotiable interaction architecture
1. Upload: upload PDF/JSON/TXT, inspect, show file metadata and source rights; preserve diagnostics, extraction provenance, 6 cases/8 lectures and all 159 items.
2. Review: fixed logical three-area layout on desktop: narrow scrollable content navigator; focused central single-question editor; expandable clinical context panel immediately above or alongside question, with readable large text. On mobile, navigator becomes a drawer and clinical context appears before active question. No nested scroll as primary navigation mechanism.
3. Organize: assign course, topic/week, and publication destination with group-level bulk actions, smart suggestions, explicit unresolved destinations; navigation stays available.
4. Publish: preflight checklist, counts of approved, assigned, valid, already-published and blocked; confirmation and batch-by-batch progress; recovery after failure without duplicated publications.

## Design rules
- Default 16px+ body text; 18px+ for medical prompts. Metadata at least 14px. Minimum 44px touch controls; visible keyboard focus.
- Case stem takes full readable width and grows naturally. No 260–360px sidebar textareas or floating checkboxes.
- Question editor uses plain text fields only when editing; otherwise render structured, legible text with an obvious Edit action. Inline edits save when changing focus.
- Difficulty controls occupy approximately 140px, not a full row. Marks uses direct editable numeric input, no browser spinner, explicit increments only if intentionally requested.
- One question at a time, with previous/next, direct number jump, case/lecture jump, search and filters. Preserve location when filtering/back navigating.
- Global bulk commands belong in a menu with consequences explained; selection is always scoped and count shown.
- Five separate large KPI cards are replaced by one compact status strip. “Ready to publish: 0” must distinguish not selected versus missing destination versus invalid content.
- Autosave states: Unsaved changes, Saving, Saved, Save failed and Conflict. Never display success while an error exists. Add immediate Retry, recovery and offline awareness.
- Student learning content remains read-only until instructor expressly edits it; preserve bullets and original formatting in model answers.
- Keep selection checkboxes immediately beside their respective question or group title.
- No infinite nested scroll: virtualize navigator if needed, and render single question in editor. Page-level scroll and keyboard navigation must be intuitive.
- Keep the project's current dark navy and turquoise visual identity while improving contrast, whitespace discipline and hierarchy.

## Workflow shortcuts
Navigator: cases and lectures grouped and collapsible, question counts, selected counts, ready/error indicators. Search covers stem/question/answer. Keyboard: focus-safe shortcuts with on-screen discovery; avoid hijacking typing in editors.
Editor: source references, question and model answer, validation issues, difficulty and marks compactly arranged. Clinical stem is accessible without leaving question, editable separately. Next/previous must not discard unsaved edits.
Review actions: select current, select all in current group, select all valid in current filter, clear selection. Confirm destructive or expensive actions only.
Status: extracted = content structurally valid for review, publishable = selected + destination + valid + answer + not already published. Show explicit reasons for every excluded item.

## Data and safety contract
Do not alter inspection parsing behavior in this redesign. Preserve existing typed ReviewCandidate state model, server-backed session pagination and optimistic revisions, 100-question publishing batches and idempotency/duplicate semantics. Fix autosave payload and revision conflicts as a separately testable functional task.

## Acceptance testing
- Actual 38-page Semester 3 PDF: 6 cases, 8 lectures, 159 questions, no content lost.
- Browser keyboard-only navigation to Q159, edit question and answer, return to Q1; edits persist after reload and across devices.
- No double scrollbar trap or more than one default-expanded question editor.
- At 1440px, clinical stem readable at >=16px; question body >=18px; mobile 390px and tablet usable with no horizontal overflow.
- For 0 selected, 0 assigned destination and invalid conditions, publication readiness is explained correctly.
- Save fail and 409 conflicts never say Saved; retry mechanism works; no data loss or duplicate publication on partial failure.
- All existing Essay Importer and shared Playwright tests pass; add screenshots for key breakpoints, accessibility checks, and 501/2000 question stress scenarios.

## Implementation order
1. Extract controller/state and commands from legacy monolith; fix autosave contract.
2. Build new navigable review shell, context viewer, single-question editor and compact status.
3. Rebuild organization and publishing as coherent steps with preflight and recovery.
4. Responsive/accessibility QA, real PDF validation and performance testing.
5. Controlled rollout, regression verification; do not merge/deploy on partial sign-off.
