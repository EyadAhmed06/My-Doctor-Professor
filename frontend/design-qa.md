# Connected Product Screens — Design QA

- Visual sources: the 14 supplied dashboard, study-plan, notebook, examination, reasoning, settings, instructor, guideline, and drug-reference screenshots.
- Implementation: 12 new connected routes plus the existing `/dashboard` route.
- Visual system: shared navy, teal, violet, orange, and clinical-red semantic palette with dedicated light and dark surface tokens.
- Validation: Next.js production build, TypeScript static generation for all 17 application routes, ESLint, route/link inventory, and responsive CSS review at desktop, tablet, and mobile breakpoints.

## Route and purpose reconciliation

| Product purpose | Route | Connected action |
|---|---|---|
| Learning home | `/dashboard` | Opens rounds, study plan, notebook, references, and settings |
| Daily clinical case | `/rounds` | Opens the reasoning builder |
| Structured reasoning | `/rounds/case-14-02/reasoning` | Returns to rounds |
| Adaptive study schedule | `/study-plan` | Opens plan settings |
| Study preferences | `/study-plan/settings` | Saves and previews the plan |
| Knowledge library | `/notebook` | Opens the note editor |
| Structured note authoring | `/notebook/new` | Edits linked explanations, pearls, cases, and images |
| Exam discovery | `/past-exams` | Selects an exam and starts a session |
| Timed examination | `/mock-exam/session` | Supports navigation, answers, flags, notes, labs, and block controls |
| Account preferences | `/settings` | Controls the shared persistent theme |
| Instructor assessment authoring | `/instructor/quizzes` | Builds, previews, and publishes quizzes |
| Evidence pathways | `/guidelines` | Presents specialty navigation and the HFrEF pathway |
| Medication reference | `/references/drugs/lisinopril` | Connects safety, dosing context, and practice questions |

## Findings and fixes

- Unified formerly isolated mockups under one responsive product shell and persistent navigation.
- Reconciled the two past-exam references into one catalog with filters, card discovery, recent/recommended sections, and a persistent selected-exam detail rail.
- Connected the case-question and clinical-reasoning references as sequential screens in the same case workflow.
- Replaced the dashboard-only theme state with one application-level provider. The selected theme now persists under `mdp-theme` and applies to every route.
- Light mode uses real light surfaces, navy text, visible borders, and adjusted semantic accents; dark mode uses the existing deep navy system. Neither mode is implemented as a color filter.
- Responsive breakpoints collapse dense side rails and multi-column cards without reproducing the decorative phone mockup frames.
- All primary source content categories and page-level hierarchy are represented. Duplicate visual states are consolidated rather than exposed as redundant routes.

## Validation results

- `npm run build`: passed; 17 routes compiled and statically generated.
- `npm run lint`: passed with no errors or warnings.
- No missing imports, unresolved modules, TypeScript errors, or route-generation failures.
- Shared navigation and primary CTA destinations are implemented with Next.js links.

## Residual notes

- Data is currently representative UI state. Live backend hydration should be added through the existing API client layer without changing the screen hierarchy.
- Exact institutional photography and medical imaging from the concept boards are represented with structured content surfaces in this pass; no unlicensed source-board artwork was copied into production assets.

final result: passed
