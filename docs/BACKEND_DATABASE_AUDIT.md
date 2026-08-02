# Backend Database Audit and Execution Ledger

This document is the persistent source of truth for database and backend release-gate work. A task is complete only when its acceptance evidence is recorded from CI or a reproducible local run.

## Status vocabulary

- `PASS`: verified by an executed check whose output proves the acceptance condition.
- `FAIL`: executed and contradicted the acceptance condition.
- `IN PROGRESS`: implementation or verification is currently running.
- `BLOCKED`: cannot be verified until a named dependency is resolved.
- `NOT COVERED`: no automated check currently proves the condition.

Documentation claims, compilation success, and the absence of an error are not proof of runtime correctness.

## Current system model

| Layer | Location | Responsibility | Current finding |
|---|---|---|---|
| Runtime contract | `backend/src/**/*.entity.ts` | Tables and relationships required by NestJS/TypeORM | 37 compiled entity mappings observed |
| Clean bootstrap | `backend/database/schemas/00_*.sql` through `11_*.sql` | Build a new database | Entity compatibility passed in the most recent supplied clean run |
| Legacy baseline | `Eyad:backend/database/schemas/*.sql` | Reproduce the previously deployable database | Used only for `upgrade_test`; permissions intentionally excluded |
| Raw forward migrations | `backend/database/migrations/*.sql` | SQL transitions not tracked by TypeORM | Must be idempotent because the workflow has no SQL migration ledger |
| TypeORM migrations | `backend/src/database/migrations/*.ts` | Versioned application migrations | Seven migrations numbered 176 through 182; execution must be proved from the `migrations` ledger |
| Permissions | `backend/database/schemas/11_permissions.sql` | PostgreSQL roles and grants | Role creation repaired to be repeatable and concurrency-safe |
| Compatibility validator | `backend/scripts/check-schema-compatibility.cjs` | Compare entity-required columns, enums, and foreign keys to PostgreSQL | Compatibility check, not a complete schema equality check |
| HTTP contract | Postman/Newman workflow | Exercise all controller routes in a logical pipeline | Latest supplied run: 131 routes, 141 requests, zero 5xx/unexpected 4xx/Newman failures |

## Causal diagnosis

The clean path and upgrade path use the same entities and the same compatibility checker. The clean path passed while the upgrade path reported legacy delete policies, nullable `auto_submitted`, and a missing `auth_sessions` table. Therefore the last reported mismatch was caused by an incomplete legacy-to-current transition, not by the current clean schemas.

Earlier failures belonged to prerequisites that had hidden the schema drift:

1. ESM data-source loading (`__dirname`).
2. TypeScript loading of enums/decorators.
3. PostgreSQL array decoding in the checker.
4. `citext` representation through `information_schema`.
5. Non-idempotent and corrupted role SQL.
6. Actual clean-versus-upgrade schema incompatibility.

## Execution checklist

### A. Repository and dependency inventory

| ID | Check | Acceptance condition | Status | Evidence / next action |
|---|---|---|---|---|
| A1 | Entity inventory | Every runtime table maps to exactly one entity | IN PROGRESS | 37 compiled entity files counted; duplicate table-name scan still required |
| A2 | Clean SQL inventory | Ordered schema files and their dependencies are documented | PASS | `00_extensions` -> `01_enums` -> domain tables -> indexes/views -> permissions |
| A3 | Raw SQL migration inventory | Every file has owner, order, repeatability rule, and target versions | IN PROGRESS | `999_reconcile_current_contract.sql` observed; complete branch inventory still required |
| A4 | TypeORM migration inventory | All migration classes are discovered and recorded after execution | NOT COVERED | Add CI assertion against the TypeORM `migrations` table |
| A5 | Package/toolchain consistency | Node, TypeScript, TypeORM runner, module system, and lockfile agree | IN PROGRESS | Node 22 and ESM-compatible data source verified; migration discovery still unproved |

### B. Clean database path

| ID | Check | Acceptance condition | Status | Evidence / next action |
|---|---|---|---|---|
| B1 | Empty PostgreSQL bootstrap | All current schema files apply with `ON_ERROR_STOP=1` | PASS | Passed in supplied CI output after permission quoting repair |
| B2 | Entity compatibility | All entity-required columns/enums/FKs match | PASS | Most recent clean `schema:check` reached success before upgrade-only failure |
| B3 | Full database contract | PKs, defaults, unique/check constraints, indexes, views, triggers, extensions and grants match the declared contract | NOT COVERED | Extend contract audit beyond entity metadata |
| B4 | Clean integration | E2E/concurrency tests pass on `clean_test` | COVERED BY CI | Record latest run result after current changes finish |

### C. Legacy upgrade path

| ID | Check | Acceptance condition | Status | Evidence / next action |
|---|---|---|---|---|
| C1 | Reproduce Eyad baseline | Historical SQL builds `upgrade_test` | PASS | Baseline files apply; historical permissions are excluded to prevent host-global role collisions |
| C2 | Raw migrations | All SQL migrations apply in deterministic filename order | IN PROGRESS | Reconciliation migration added; rerun behavior not yet proved |
| C3 | TypeORM discovery | Migrations 176-182 are present in the runtime data source | NOT COVERED | Assert expected migration names in TypeORM ledger after `migration:run` |
| C4 | Upgrade compatibility | Upgraded DB satisfies entity-required contract | FAIL -> IN PROGRESS | Last failure: 11 delete policies, one nullability mismatch, missing `auth_sessions`; reconciliation run pending |
| C5 | Upgrade integration | Same E2E/concurrency suite passes on `upgrade_test` | NOT COVERED | Add CI execution after upgrade compatibility |
| C6 | Clean/upgrade equivalence | Both paths produce the same declared contract, allowing explicitly documented database-only objects | NOT COVERED | Add normalized structural comparison |

### D. Migration safety

| ID | Check | Acceptance condition | Status | Evidence / next action |
|---|---|---|---|---|
| D1 | Repeatability | Re-running deploy command causes no failure or drift | NOT COVERED | Add second raw-migration, TypeORM and permissions pass in CI |
| D2 | Data backfill | New `NOT NULL` constraints safely handle legacy nulls | IN PROGRESS | `auto_submitted` is backfilled to false before `SET NOT NULL` |
| D3 | Destructive policy review | Every CASCADE/RESTRICT/SET NULL change has intentional business semantics | IN PROGRESS | Eleven historical-content relationships currently require RESTRICT; user-owned/session relationships retain CASCADE |
| D4 | Transaction/partial failure | Interrupted migration can be safely detected and resumed or rolled back | NOT COVERED | Add failure-injection validation after migration authority is selected |
| D5 | Rollback | Supported rollback scope and backup dependency are explicit | NOT COVERED | Do not claim rollback safety from `down()` methods alone |
| D6 | Production lock impact | Table rewrites and FK validation are assessed on representative data | NOT COVERED | Required before production migration with substantial data |

### E. Schema-check coverage

| Contract element | Current coverage |
|---|---|
| Required entity columns, types, nullability, varchar length, numeric precision/scale | Covered |
| Enum values and order | Covered |
| Foreign-key target and `ON DELETE` | Covered |
| Primary keys, defaults, unique constraints, check constraints | Not covered |
| Indexes and partial indexes | Not covered |
| Views, functions and triggers | Not covered |
| Extensions | Executed by data-source initialization but not asserted as a complete declared set |
| Grants and PostgreSQL role attributes | Not covered |
| Unexpected tables/columns | Intentionally not rejected and therefore not covered |
| TypeORM migration ledger | Not covered |

### F. Backend and API release gates

| ID | Check | Status | Evidence / next action |
|---|---|---|---|
| F1 | `npm ci`, build, lint, unit | COVERED BY CI | Record current commit result |
| F2 | Production dependency audit | COVERED BY CI | `npm audit --omit=dev --audit-level=high` |
| F3 | Health/readiness load smoke | COVERED BY CI | 500 requests, concurrency 20, p95 threshold 500 ms |
| F4 | HTTP controller-route pipeline | PASS on last supplied report | 131 routes, 141 requests, zero blocking failures |
| F5 | Authorization role x endpoint matrix | PARTIAL | Sequential collection proves main flows, not every role/endpoint denial combination |
| F6 | Real SMTP, object storage and AWS RDS behavior | NOT COVERED | Requires environment-specific integration gates |
| F7 | Backup/restore and deployment rollback | NOT COVERED | Must be validated against deployment infrastructure |

## Current decisions

1. Do not enable TypeORM `synchronize`.
2. Do not treat documentation status as test evidence.
3. Do not delete either migration system until its deployed usage and coverage are inventoried.
4. New schema changes must have exactly one migration owner.
5. Every database fix must be tested against both `clean_test` and `upgrade_test`.
6. The raw reconciliation file is provisional because it executes before TypeORM migrations and is not represented in the TypeORM ledger. It may only be removed after TypeORM migration discovery and final-state equivalence are proven.

## Immediate execution order

1. Assert TypeORM migrations 176-182 were actually discovered and executed.
2. Run compatibility after the reconciliation migration.
3. Re-run deployment migrations and permissions to prove repeatability.
4. Run E2E/concurrency tests on `upgrade_test` as well as `clean_test`.
5. Implement a normalized clean-versus-upgrade contract comparison.
6. Only then select and consolidate the authoritative migration mechanism.

## Evidence log

| Date | Observation | Consequence |
|---|---|---|
| 2026-08-02 | Clean compatibility passed while upgrade compatibility exposed legacy schema | Upgrade transition is the controlled variable |
| 2026-08-02 | Upgrade retained eleven `CASCADE` FKs, nullable `auto_submitted`, and lacked `auth_sessions` | Historical hardening and auth-session creation were not fully represented in the executed transition |
| 2026-08-02 | `999_reconcile_current_contract.sql` sorts after raw SQL migrations but before TypeORM migrations | It is a provisional safety net, not yet the final migration architecture |

