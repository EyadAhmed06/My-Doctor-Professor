# Content Studio UX Specification v1.0

Status: **Design specification / implementation not authorized by this document**  
Scope: MCQ importer first; shared foundations usable by essays, cases, and other educational content.  
Basis: instructor screenshots from 2026-10-12; existing question-import-page.tsx, question-import.css, and current importer validation behavior.  
Owner: My Doctor & Professor product team.  
Last reviewed: 2026-10-12.

## 0. Product charter

**Job to be done:** Given a PDF, JSON, TXT, lecture, section, or individual question, the instructor can understand what was extracted, correct only what needs correction, select exactly what to include, and publish to the right academic destination confidently, with minimal scrolling, ambiguity, repetition, waiting, and loss of work.

Primary outcomes (ranked): (1) prevent incorrect publication or wrong academic placement; (2) minimize necessary instructor effort; (3) minimize navigation and visual clutter; (4) remain efficient for 1–500 MCQs; (5) preserve accessible and reliable operation across desktop/tablet/phone.

Non-goals: automatically deciding that a medically disputed answer is correct; silently overriding source answer keys; making AI explanations mandatory when platform policy treats them as optional; hiding unresolved source integrity errors; removing existing permission or duplicate safeguards.

## 1. Evidence, diagnosis and what is still unverified

### Observed in current implementation
- Single destination topic is selected before inspection, although JSON carries source_section and the uploaded 196-question example contains seven heterogeneous lectures. One destination for all is a structural mismatch.
- Four large summary panels; approval counter and batch AI controls float at upper right; another publication bar sits at bottom. Global versus section versus question controls compete.
- Current state ties candidate.approved to publish payload. Section filter and search change visibility, not publication scope. “Approve visible” applies to filtered items, but “Publish approved” publishes approved items across **all** sections.
- On desktop, earlier code rendered all full editors, later code shifted to a focused editor and compact sidebar. The screenshots are of a stacked-card experience; do not assume they reflect the latest GitHub UI or production version.
- Candidate form renders four/five explanation textareas, question-level explanation, source section, difficulty, marks, multiple diagnostics and a small approval checkbox as peers.
- Candidate NEEDS_REVIEW combines materially different conditions: extraction uncertainty, warnings, topic confidence, possible duplicates. Its meaning to users is imprecise.
- Candidate publishability accepts a question with no explanations, but if *any* explanations exist, requires complete non-stale set. Preserve this behavior until product policy deliberately changes.
- Current batch structural completeness can block publishing the entire batch, even if an independent selected section is complete. This must be reviewed at backend contract level.

### Screenshot-specific, not automatically universal
- Import snapshot: 196/196 detected, 1 ready, 195 review, zero AI explanations; labels for seven lectures from Protein Chemistry through Pharmacology of Peptic Ulcer; a selected Endocrinology topic appears unrelated to several source sections.
- Warnings such as “Difficulty was estimated as MEDIUM” and weak lexical match dominate the candidate header despite differing practical urgency.
- Repeated full-width controls, generous textarea heights and gaps create unnecessary movement.

### Unverified
Actual instructor completion times, error rates, accessibility results, distribution of devices and key backend response latency are not measured. The prototype must be tested, not merely admired.

## 2. Domain semantics: establish a single truth

Distinct, independent dimensions:
1. **Extraction status** = complete / incomplete / unverified, scoped to the file, source section or question, with evidence.
2. **Validation status** = valid / blocked / requires-human-decision; calculated, not edited directly by UI.
3. **Review status** = not reviewed / reviewed accepted / reviewed edited / flagged; recorded with actor, timestamp and version.
4. **Selection status** = selected / not selected for the currently prepared publication operation; independent from visibility and review.
5. **Publication status** = draft / queued / published / skipped / failed / rolled back where technically supported.
6. **Explanation status** = absent / generated / stale / failed / deferred billing; never conflate with question correctness.
7. **Destination status** = mapped / unmapped / conflicting, scoped to lecture/section with optional question-level override.

**No conflation invariants:** Filtering never modifies selection. Selection never implies review. Review never automatically publishes. Hidden items cannot be affected by an action titled “visible”. Publishing requires preview of exactly which records and destination mappings will be modified. Every state change must have feedback.

Required provenance: file hash, source filename, pages, section ID/title, source question number, answer key label, content revision, selected topic ID, explanation provenance, reviewer identity and timestamps.

## 3. Information architecture and navigation

Step 1 **Upload** -> Step 2 **Organize** -> Step 3 **Review** -> Step 4 **Publish**. A persistent top progress indicator shows current stage and completed/blocked stages; navigation between finished steps preserves draft changes.

### Upload screen
- Short heading: “Import questions”. Course and file input are primary. Accepted PDF/JSON/TXT formats and size limits shown in small contextual text.
- Destination topic is OPTIONAL initially for multi-section files; never silently route all sections to an arbitrary topic. Allow explicit single-destination mode for truly single-lecture files.
- Copyright rights confirmation appears before publication (or upload if legal policy requires); avoid visually detached tiny checkbox.
- “Inspect file” shows operation and estimated stage, not an invented ETA. No AI generation automatically on inspect unless instructor explicitly opts into it.

### Organize screen
- Default landing after inspection: grouped **lecture/section table** with name, count, extraction integrity, actionable issues, mapped academic destination and inclusion.
- Each group may be mapped to course > week > lecture > topic. Inherit a default only if the user explicitly chooses it; warn on semantic mismatch but let the instructor make a documented override.
- One group can be included without selecting all groups. A source containing no section headings becomes “Ungrouped questions” and can be renamed/split.
- One-question/one-lecture imports behave identically; no dummy case/lecture heading required as a UI prerequisite, although parser support must be implemented separately.
- Bulk mapping must preview affected groups; preserve independent overrides.
- Structural completeness and answer-key integrity are shown at the **narrowest grounded scope**. Never infer section completeness from global totals alone.

### Review screen
- Desktop candidate A: left persistent section/question navigator (compact, scrollable independently), center reading area limited to approximately 65–85 characters per text line / 720–900px for readability, right contextual panel **only when needed**.
- Alternative candidate B: dense accessible question table with resizable detail side pane. Prototype both and compare tasks.
- Default **Read mode**: question stem, A–E options, visibly distinguished source-correct answer, source provenance, essential status and one prominent action area.
- **Edit mode**: on demand; question, answer choices, rationale, difficulty/marks and source metadata organized into clear editable sections. Never show five empty textarea fields in Read mode.
- AI rationales appear under an expandable “Explanations” section with status (not requested / generated / incomplete / stale / billing deferred); manual edit always available.
- Keyboard next/previous and a numbered navigator, with explicit “Question X of N — Lecture Y”; moving between questions must have strong heading/context change and preserve unsaved edits (draft persistence).
- Mobile: list -> individual reader -> edit/details screens or a focused drawer; avoid nested scroll traps, giant fixed footers, tiny tap targets.
- Save indicator: saving / saved / failed, with retry; a refresh or login timeout cannot discard acknowledged saved work.

### Publish screen
- The only primary CTA: “Review publication (N selected)”. Show preview grouped by destination and section, with counts create/reuse/skip/block and exact included question IDs.
- Explicit confirmation: “Publish 23 questions from Protein Chemistry to [course > week > lecture > topic].” Cross-topic publication lists each mapping.
- A preflight snapshot pins candidate revisions, selections and destination IDs. If any changes between preview and commit, require re-preview.
- Commit returns per-question results and a clear action for failures/retry. Duplicate retries must not create new copies accidentally.
- Student visibility, locking and unpublished/draft states remain governed by existing access controls.

## 4. Component hierarchy and visual rules

Primary visual priority: selected question, answer choice, current action. Secondary: navigation and status. Tertiary: extraction metadata, confidence, difficulty estimates, optional explanations and diagnostics.

- Outer page content is centered and constrained; long editing lines do not span a full wide-screen monitor.
- One current question in focused view; no endless stacks of 196 expanded editors.
- Avoid repeating heavy border containers for every nested subsection. Use headings, whitespace and subtle separators; a border only when grouping materially helps.
- Minimum readable body typography approximately 16px with 1.4–1.6 line height; secondary labels normally >=13–14px; do not squeeze core question/options into tiny table text.
- Answer choices share a compact repeated rhythm; correctness uses text/icon as well as color.
- Tap targets >=44x44 CSS px where practical; confirmation must have a large clearly labeled click target, not only a tiny checkbox.
- The correct answer is prominent without being mistaken for a student-facing reveal. Always label “Source key”.
- Status badges represent actionable exceptional states; do not make every metadata property into a colored badge.
- Warning summaries collapsed by default for advisory items. Blocking issues always visible with repair guidance.
- Sticky navigation/actions only where they help; must not obscure final inputs or mobile browser controls.
- Avoid nested scrolling unless necessary for a fixed desktop navigator; preserve browser back/scroll expectations and keyboard focus.
- All hidden panels must remain accessible to keyboard and screen readers.

## 5. Interaction contract (MUST be unambiguous)

| Action | Scope | Mutation | Feedback/undo |
|---|---|---|---|
| Filter lecture/search/status | view only | none | visible filter breadcrumb and clear |
| Open Q75 | one record | selection focus only | new question heading; scroll top of reader |
| Include question | one record | selection ID set only | selected count updates; remove/undo |
| Include lecture | all **explicitly scoped** lecture questions | selection ID set only | “23 selected from lecture X” and undo |
| Clear visible selection | current filtered result snapshot | selection ID set | report affected count + undo |
| Accept question review | one revision | reviewed state | reviewer/date recorded |
| Review all eligible within lecture | current lecture only | reviewed state, NOT override key | show excluded/blocked count |
| Generate missing explanations | explicit selected/visible scope | bounded async jobs | cost/number estimate where possible, resumable and cancellable |
| Confirm topic override | explicit group or question | override audit record | affected content preview |
| Edit source answer | one question | new revision, invalidates prior review when necessary | preserve original provenance, stale AI notices |
| Review publication | selection set | no write to published records | exact preview |
| Confirm publication | frozen validated selection | idempotent server operation | per-item receipt and retryable failures |

Do not label actions merely “Approve all” without a visible scope. Explicit alternatives: “Mark 23 in this lecture as reviewed”, “Select 23 questions from this lecture”, “Review publication (23 selected)”.

Destructive actions (delete question, replace existing question, publish across multiple destinations) require confirmation proportional to harm. Routine reversible selection changes should not produce modal confirmations.

## 6. Validation, warnings and user trust

Issue classification:
- **Blocker**: missing correct choice, invalid/duplicate choices, conflicting or missing key evidenced by source, content integrity failure, incompatible destination/permission, stale partial explanation when current policy blocks.
- **Decision required**: possible duplicate, uncertain topic mapping, intentional A–D rather than A–E. Provide contextual one-click resolution or group-level override with explicit scope.
- **Advisory**: automatically estimated difficulty, nonblocking confidence metric, source page metadata. Show in expandable review notes.
- **Operational**: OpenRouter 402, timeout, AI unavailable. Show once per affected batch with count, cost-related explanation and resume action. Preserve previous results.

Warnings must answer: **What happened? What does it affect? Can I proceed? What action fixes it?** Avoid repeated topic-mismatch notices per question if all 23 share the same mapping decision.

No silent AI correction of authoritative source answers. Disputed medical keys are human-review decisions with original and proposed values both visible.

Distinguish **“needs review”** from **“blocked”** and **“unreviewed”**. A system-generated estimated difficulty alone cannot legitimately imply a question is invalid.

## 7. Batch engine / backend contract

New server-side ImportBatch lifecycle: UPLOADED -> INSPECTING -> ORGANIZING -> REVIEWING -> READY_TO_PUBLISH -> PUBLISHING -> COMPLETED / PARTIAL / FAILED. Support pause/resume/reopen; saved records survive browser refresh and timeouts.

Suggested canonical objects:
- ImportBatch(id, owner, course, original filename/hash, format, inspector version, status, created_at, version)
- ImportSection(id, batch, source title/position, detected kind, integrity evidence, destination topic ID, selection state)
- ImportCandidate(id, section, source question number/page, canonical text/options/key, revision, validations, review state, selection state, explanation status)
- ImportDecision(candidate/group, decision type, actor, timestamp, prior/new revision and rationale)
- PublicationPlan(id, batch, selected ID/revision pairs, destination mapping, counts, expiration/fingerprint)
- PublicationReceipt(plan, per-record outcome, existing/new question IDs, idempotency key)

Server APIs (illustrative, not existing endpoints):
POST /imports, GET /imports/:id, PATCH /imports/:id/sections/:sectionId/mapping,
PATCH /imports/:id/selection, PATCH /imports/:id/candidates/:id,
POST /imports/:id/reviews, POST /imports/:id/explanations/jobs,
POST /imports/:id/publication-plans, POST /imports/:id/publish.

Use optimistic concurrency (If-Match/revision) and idempotency for publication; paginated server filtering/sorting for 500+ questions, never require remounting hundreds of rich editors. Capture and expose structured extraction errors at file/section/question scope.

**Security / integrity:** authorization checked for course and destination at each operation, server reevaluates candidate validation and source key, upload file size/type sniffing, rate limits, bounded AI work, secure file retention and audit. Maintain existing medical content invariants and role permissions.

**Compatibility:** legacy imports and published questions retain IDs and behavior; migrate stored drafts carefully. Feature flag allows old UI during rollout, not a parallel uncontrolled publication pipeline. Verify current backend API constraints before committing a final endpoint contract.

## 8. Required screens and states

For each stage provide states for loading, empty, success, recoverable failure, hard failure, offline/session expiry, no permissions and partial completion.

S1 Upload: none selected; valid file; wrong format; file too large; course missing; server queued; inspect running; inspect failed.
S2 Organize: no headings, one section, multiple lectures, misassigned topics, unresolved source completeness, unassigned destination, cross-week mapping.
S3 Review: first/last question; all/partial selection; dirty edit; saving; conflict; duplicate; A–D confirmation; incomplete/missing/stale AI; AI 402; invalid key.
S4 Publish: none selected; mixed eligible/blocked; missing mappings; duplicate reuse choices; preflight changed; partial published; retry; permission revoked.

Every action must preserve user context (section, search, focused question, scroll and selection) when possible.

## 9. Accessibility and responsiveness

- Conform to WCAG 2.2 AA in design and verification.
- Semantic heading levels and landmarks; label all fields. Explicit keyboard focus and visible focus outlines.
- Screen-reader announcements when a new question opens, when saving finishes, when selection totals change and when publish completes.
- No color-only indicators; text/icon labels for source answer, blocked issues and selected items.
- Desktop >=1024px: split navigator + focused reading panel; 721–1023px: narrower navigator or collapsible side panel; <=720px: list/detail navigation, not an infinitely wide table.
- Tests for 320px phones, desktop zoom 200%, longer question/choice text, RTL locale, reduced-motion, light/dark themes and touch accuracy.
- Fixed controls may not overlap editor, virtual keyboard or browser chrome.

## 10. Alternative prototypes and research protocol

Prototype A (leading hypothesis): lecture-first organizer + compact numbered navigator + read-first focused panel + on-demand edit.
Prototype B: compact editable table + contextual detail drawer; retain bulk selection and mapping.

Test at least **five representative instructors** if available (heuristic, not claimed research finding), with 196-question seven-lecture dataset and one-question dataset. Counterbalance order to reduce learning bias. Observe, do not coach during tasks.

Tasks:
1. Find and validate Q75; correct a wrong answer choice and return to Q75 after another section.
2. Select only Lecture 3 and explain what will be published.
3. Assign seven lecture sections to differing destination topics; resolve one mismatch.
4. Publish one selected question without modifying unrelated approvals.
5. Resolve an incomplete section while publishing an independent complete one (only if integrity evidence supports isolation).
6. Resume after simulated refresh/login expiry.
7. Handle AI payment-deferred error without losing generated results.

Measure elapsed task time, wrong clicks, scrolling distance, navigation reversals, publication scope errors, lost edits, confidence in consequences (ask “What will happen if you press this?”), perceived workload and completion success.

Proposed thresholds to validate (not guarantees):
- Q75 located under 10s after familiarization.
- Lecture-only selection under 15s excluding content review.
- 100% publication scope accuracy in critical task before release.
- Zero lost acknowledged edits in reconnect test.
- Zero published candidates with missing correct option, wrong destination or violated permissions.
- Keyboard-only primary task completion without trap.

## 11. Rollout sequence and gates

Phase 0: freeze UX contract and audit legacy/backend constraints; no visual code changes.
Phase 1: interactive prototype A/B and observational testing; select design based on evidence.
Phase 2: backend persistence, selection/review/publication state separation and scoped validation, behind a feature flag; contract tests.
Phase 3: implemented responsive UI, accessibility, bulk-action semantics and staged explanations; E2E tests on actual 196-question structure.
Phase 4: instructor pilot with old UI fallback, analytics and rollback; remove old UI only after task/accuracy gates pass.

Release gates: approved semantics, no security regression, stable import/publish and duplicate handling, successful edit/resume tests, human validation of scope preview, WCAG audit, mobile UI audit and production observability.

## 12. Decisions, risks and explicit open questions

D1 (proposal): lecture-first organizer and read-first focused review. **Validate A vs B.**
D2 (requirement): selection, review, validation and publication states remain independent.
D3 (requirement): structural correctness is enforced server-side; never hide blockers.
D4 (proposal): group-level topic mapping and grouped mismatch resolution.
D5 (requirement): explicit publication preview and idempotent write.
D6 (requirement): no automatic AI-generation payment or answer-key substitution.

R1: A section might lack an independently complete answer key. Do not permit partial publication solely because the selected question *looks* valid.
R2: Existing backend uses global completeness and one destination topic. Frontend-only work cannot solve scoped publishing.
R3: Auto-saving on each keystroke can cause stale revisions and request overload; use debouncing with durable queued writes/conflict handling.
R4: Bulk “review” can become rubber-stamping; distinguish review attestation from batch selection.
R5: Very large sections need virtualization/pagination with reliable focused-item navigation.
R6: Bad UI labels could compromise permissions and wrong-course mapping even if extraction is perfect.

Open product decisions (to resolve from instructor study): should manually reviewing every question be required, or can high-confidence imports be selected without individual attestation? What audit record is mandatory for a disputed medical answer? Should AI rationale generation happen before or after publication? What is the retention policy for unpublished file content? What constitutes independently complete extraction evidence for a selected subset?

## 13. Definition of done

A release is acceptable only when an instructor can import a standalone question, one lecture, or multiple lectures; see clear destination assignments; read one question at a time with readable options; edit only when necessary; select a precise subset; resolve meaningful issues; preview exactly what will publish; and complete publication with no unauthorized/misplaced content and no lost acknowledged work. Independent functional tests and user-observed tasks must confirm this; visual attractiveness alone is insufficient.

## 14. Immediate next action

**Do not refactor the existing 1,300-line component yet.** First create low-fidelity prototypes of A and B using the exact seven-lecture / 196-question scenario, specify action scope in each, and conduct a short task-based evaluation. Then approve the interaction contract and build the backend changes necessary for scoped, persistent, idempotent publishing.
