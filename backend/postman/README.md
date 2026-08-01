# Postman API pipeline

Import both JSON files from this directory into Postman. Select the local environment and keep the API running at `http://localhost:3000/api/v1`. On an empty database, set `ALLOW_ACCOUNT_BOOTSTRAP=true`, configure a matching 32+ character `ACCOUNT_BOOTSTRAP_TOKEN`, and copy it into the Postman `bootstrapToken` variable. The first request atomically creates a verified super-admin, instructor, and student. It permanently closes after an administrator exists.

Run folders in numeric order. Login requests capture bearer and refresh tokens. Creation requests capture IDs used by later paths. Email verification and password reset require manually copying the token delivered by the configured SMTP provider. The upload request requires `uploadFilePath` to point to a valid PDF. Folder `99` contains destructive cleanup and must run last.

Regenerate and verify controller coverage with:

```bash
node scripts/generate-postman.mjs
```

The generator fails if a controller route is missing. `controller-route-inventory.json` is the auditable source list.

The collection asserts that responses do not return unexpected 5xx errors and complete within five seconds. The automated verifier also fails on every unexpected 4xx response. The only accepted 4xx responses are named negative tests: invalid verification/reset tokens and deletion attempts that intentionally prove immutable, published, reviewed, submitted, or non-empty resources cannot be destroyed.

The current generated pipeline executes 141 requests across 131 unique controller routes. It validates that every dynamic route ID is populated before use, so an empty variable cannot accidentally hit a neighboring controller route and produce a misleading success response.

## Automated HTTP execution

The `Backend HTTP API` GitHub Actions workflow starts the real compiled NestJS application against an isolated PostgreSQL service and executes every collection request with Newman. It applies the canonical SQL schemas, creates an upload fixture, verifies the controller inventory, and publishes the Newman JSON/JUnit output, backend log, and a Markdown status summary as a workflow artifact.

The workflow fails when a collection request is skipped, a request receives no HTTP response, an HTTP 5xx occurs, a response exceeds five seconds, or a Postman assertion fails. HTTP 4xx responses are listed separately for business-flow review; they are not silently classified as successful behavior.
