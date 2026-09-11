# Frontend Screenshot Restoration — Execution Brief

## Mission

Restore the student-facing application screens to the supplied reference designs while preserving the current backend-driven product model. Visual fidelity and real behavior are equally mandatory.

## Non-negotiable rules

1. Use the supplied screenshot assigned to each route as the visual source of truth.
2. Preserve the shared My Doctor & The Professor brand, typography, light/dark tokens, header, logo, navigation, spacing rhythm, card density, and responsive behavior.
3. Do not hardcode domain records, metrics, people, exams, questions, progress, schedules, notes, or analytics.
4. Every displayed record and number must come from an authenticated API response or be a deterministic calculation from that response.
5. Unsupported product capabilities must be omitted or explicitly shown as unavailable. Never fabricate a successful state.
6. Implement loading, empty, error, forbidden, expired/read-only bundle, and success states for every primary screen.
7. Bundle entitlement is the access boundary. Students may only see and start content assigned to an entitled bundle. Expired/archived access is read-only.
8. Preserve role separation for STUDENT, INSTRUCTOR, and ADMIN.
9. Keep the Mock Exam visual rebuild out of this pass. Preserve its current persisted runtime behavior.
10. No page is complete until build, lint, API contract checks, interaction checks, responsive checks, and screenshot comparison pass.

## Route-to-reference map

- Rounds: Week/Lecture navigator → Tutor questions, matching the supplied Rounds desktop/mobile reference.
- Questions & Assessments: separate Question Banks and Past Exams presentations, matching their supplied references while using bundle-scoped records.
- Study Plan: full settings/calendar/readiness layout from the supplied Study Plan reference, backed by persisted plan and schedule APIs.
- Notebook: library, filters, cards, inspector, collections, tags, and real CRUD matching the supplied Notebook reference.
- New Note: structured editor matching the supplied New Note reference, limited to backend-supported note fields and relationships.
- Analytics: full dashboard hierarchy from the supplied Analytics reference, populated only from calculated analytics endpoints.
- Settings: full reference hierarchy, showing only profile, account, password/security, and appearance capabilities currently supported.
- Mock Exam: excluded from visual restoration in this pass; maintain existing persisted answers, flags, notes, deadline, Tutor/Timed rules, and submission behavior.

## Required flows

### Rounds

Bundle → Course → Week → Lecture → Tutor attempt. Show lecture question/flashcard/resource counts from bundle content. Starting Tutor mode must generate a bundle-linked assessment and route to the persisted session.

### Question Banks

Bundle → Course → Week → one or more Lectures → count/difficulty/mode → generated attempt. Enforce uniqueness and available-question limits server-side.

### Past Exams

Show only published tests linked to the active bundle. Respect availability windows and read-only bundle state.

### Study Plan

Persist preferences, generate a real schedule/calendar, allow completion/skip transitions, and calculate readiness from actual progress.

### Notebook

Create, read, update, delete, search, filter, tag, favorite, collect, and schedule review using real endpoints.

### Analytics

Show real question accuracy, calibrated confidence, saved questions, flashcard status, topic mastery, schedule consistency, and readiness. Zero-data states must remain visually complete without invented numbers.

### Settings

Read/update the authenticated profile, change password securely, and persist theme locally. Do not show fake billing, subscriptions, 2FA, or device sessions.

## Acceptance checklist for every screen

- [ ] Reference layout and component hierarchy reproduced.
- [ ] Desktop viewport compared against the corresponding screenshot.
- [ ] Responsive/mobile behavior verified.
- [ ] All primary controls work.
- [ ] No hardcoded domain data remains.
- [ ] API mapping documented in code types and request calls.
- [ ] Loading, empty, error, forbidden, and read-only states work.
- [ ] Keyboard focus and accessible labels are present.
- [ ] Build and lint pass.
- [ ] Design QA has no P0/P1/P2 differences.

## Definition of done

The work is complete only when functional verification and visual comparison both pass. A green build alone is not visual verification, and successful API calls alone are not design fidelity.
