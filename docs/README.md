# Project Documentation

This folder is the canonical home for project documentation.

## Start here

### Canonical project documents

- [Product definition](PRODUCT_DEFINITION.md)
- [Complete backend specification](COMPLETE_BACKEND_SPEC.md)
- [API specification — Part 1](API_SPECIFICATION_PART_1.md)
- [Implementation roadmap](IMPLEMENTATION_ROADMAP.md)
- [Action plan](ACTION_PLAN.md)
- [Backend validation plan](BACKEND_VALIDATION_PLAN.md)

### Setup and navigation

- [Start here — specification](START_HERE_SPECIFICATION.md)
- [Documentation index](DOCUMENTATION_INDEX.md)
- [Quick start](QUICK_START.md)
- [Setup guide](SETUP_GUIDE.md)
- [Backend setup](backend-setup.md)
- [Frontend setup](frontend-setup.md)
- [Repository overview](../README.md)

### Status and delivery records

- [Backend implementation status](backend-implementation-status.md)
- [Project status](PROJECT_STATUS.md)
- [Status](STATUS.md)
- [Implementation summary](IMPLEMENTATION_SUMMARY.md)
- [Delivery summary](DELIVERY_SUMMARY.md)
- [README specification](README_SPECIFICATION.md)
- [Legacy user stories](user-stories-legacy.md)

## Documentation rules

- Keep the repository-root `README.md` as the conventional GitHub entry point.
- Put all additional Markdown specifications, decisions, workflows, API contracts, and implementation notes in this folder.
- PostgreSQL schemas and executable migrations remain under `backend/database`; they are implementation artifacts, not documentation.
- Source-code-local README files should exist only when a tool or isolated package genuinely requires one.

## Current backend sequence

1. Authentication and user foundation — implemented.
2. Canonical PostgreSQL/TypeORM entities — implemented.
3. Modules, controllers, and DTO foundations — implemented.
4. Academic workflows — implemented.
5. Question Bank workflows — implemented.
6. Assessments and grading — implemented.
7. Flashcards and spaced repetition — implemented.
8. Progress, notifications, audit, and administration — next.
