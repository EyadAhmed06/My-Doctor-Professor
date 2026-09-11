# Security integration

This document records the application-level controls that are expected to remain true as the platform evolves.

## Authentication and browser sessions

- Access tokens are short-lived bearer tokens.
- The web application stores only the access token in `sessionStorage`; legacy refresh-token storage is deleted on startup.
- Refresh credentials for the browser are stored in `HttpOnly` cookies scoped to `/api/v1/auth`.
- Browser-origin authentication responses expose only the access token and user payload; the refresh credential is not returned to browser JavaScript.
- Persistent versus browser-session login is controlled by the cookie lifetime selected at login.
- Refresh credentials rotate on every refresh.
- Refresh-token reuse revokes the affected server session.
- Non-browser API clients may continue to send/receive `refresh_token` in the request/response body for Postman and other integrations.
- Logout revokes the current session and clears the browser refresh cookie. A cookie-only cleanup endpoint also clears stale browser credentials when the server session was already revoked (for example after password rotation).
- Password change revokes all active sessions.
- Settings exposes active sessions and allows the current user to revoke all other sessions.
- Google authentication verifies the signed Google ID token server-side and links the immutable provider subject to the local user record.

The current cookie policy uses `SameSite=Lax`, which is appropriate when the frontend and API are deployed on the same site (including subdomains). A future deployment that intentionally puts the frontend and API on unrelated sites must not simply switch to `SameSite=None`; it needs an explicit cross-site cookie and CSRF design review.

## Authorization and IDOR protection

Knowing a database UUID is not authorization.

Academic reads and learning-state mutations are protected by server-side policy:

- Student: must have an active/non-revoked bundle enrollment that contains the requested course/week/lecture/content.
- Instructor: must be assigned to the relevant course or own the authoring workflow where ownership is the governing rule.
- System administrator: platform-wide administrative access.

Direct course, week, lecture, topic, question, resource, progress, and Flashcard access is checked on the backend. Test attempts remain student-owned; instructor grading remains test-owner/admin scoped. Notebook data is always filtered by the authenticated owner.

Course listing metadata is scoped as well: students see only enrolled bundle courses and instructors see only assigned courses. This prevents information leakage before an object is opened directly.

Unauthorized object lookups use not-found semantics where appropriate so the API does not confirm the existence of inaccessible content.

## Resource-file security

Managed lecture resources:

- are accepted only from instructor/admin workflows;
- require course-management authorization;
- require the parent lecture to be returned to draft before mutation;
- are size limited;
- validate MIME type and file signature/magic bytes;
- use server-generated storage keys rather than user paths;
- reject path traversal;
- are hashed with SHA-256;
- are stored with restrictive file permissions;
- are served only through an authenticated, authorization-checked API route.

The frontend fetches protected files with the bearer token and creates temporary in-memory Blob URLs for preview/download. Tokens and database IDs are not embedded into public file URLs.

## Browser and API response hardening

The backend sends no-store caching for API responses and headers including MIME-sniffing, frame, referrer, permissions, and cross-domain-policy protections. Production adds HSTS.

The Next.js frontend applies a production Content Security Policy. It permits the application itself, the configured API origin, Google Identity Services, and the image/media/blob sources required by the product while disabling object embedding and external framing.

## Secret and state hygiene

Repository ignore rules exclude local environment files, the local database CA bundle, uploaded files, backups, and build/test artifacts.

Production credentials must be supplied through the deployment secret manager/environment and must never be committed.

## Backup and recovery

Security includes recoverability. See `BACKUP_RECOVERY.md` for the database + managed-upload snapshot, checksum verification, guarded restore, retention, encrypted-storage requirement, and restore-drill procedures.

## Release security gate

Before a release:

1. Build/lint/unit tests must pass.
2. PostgreSQL clean bootstrap and legacy upgrade must show zero schema drift.
3. Authorization/security regression tests must pass.
4. Backup create → verify → restore drill must pass.
5. Production dependency audit must report no high-severity production vulnerabilities.
6. Browser tests must cover session restoration, absence of JS refresh credentials, RTL/theme behavior, command navigation, settings/session controls, and protected-resource workflows.
7. Production secrets, TLS, RDS backup retention, and external backup storage must be reviewed in the deployment environment.
