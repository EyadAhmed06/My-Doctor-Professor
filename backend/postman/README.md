# Postman API pipeline

Import both JSON files from this directory into Postman. Select the local environment, keep the API running at `http://localhost:3000/api/v1`, and provide credentials for one seeded `SYSTEM_ADMIN`, `INSTRUCTOR`, and verified `STUDENT` account.

Run folders in numeric order. Login requests capture bearer and refresh tokens. Creation requests capture IDs used by later paths. Email verification and password reset require manually copying the token delivered by the configured SMTP provider. The upload request requires `uploadFilePath` to point to a valid PDF. Folder `99` contains destructive cleanup and must run last.

Regenerate and verify controller coverage with:

```bash
node scripts/generate-postman.mjs
```

The generator fails if a controller route is missing. `controller-route-inventory.json` is the auditable source list.

The collection asserts that responses do not return unexpected 5xx errors and complete within five seconds. Domain-dependent requests can legitimately return 4xx when prerequisites or roles are intentionally absent; run the seeded pipeline for success-path validation.
