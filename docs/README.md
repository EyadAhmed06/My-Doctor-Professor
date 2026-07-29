# Project Documentation

This folder is the canonical home for project documentation.

## Start here

- [Backend implementation status](backend-implementation-status.md)
- [Repository overview](../README.md)

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
6. Assessments and grading — next.
7. Flashcards.
8. Progress, notifications, audit, and administration.
