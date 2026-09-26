# Final security gate

This gate consolidates phases 1–12. A release is blocked unless every applicable item is green.

## Automated gates

- Reproducible installs for frontend and backend.
- Production dependency audit at high severity.
- Lint, build, backend unit tests, and frontend browser-sink audit.
- CodeQL security-extended analysis.
- Secret scanning and dependency review on pull requests.
- Runtime production configuration fails closed.
- Database migrations are explicit; schema synchronization remains disabled.

## Manual release gates

- Verify production CORS origins, TLS, proxy hop count, cookie domain, and Google OAuth origins.
- Rotate JWT, refresh, bootstrap, SMTP, database, Paymob, encryption, and third-party secrets.
- Verify backups by restoring into an isolated environment.
- Exercise student/instructor/admin authorization and bundle expiry/payment cases.
- Exercise malicious uploads, IDOR, CSRF/origin, rate-limit, webhook replay, and concurrent purchase tests.
- Review audit logs and alerts without storing tokens, passwords, payment data, or medical free text.
- Confirm incident owner, rollback procedure, and revocation procedure.

## Residual risk

A source review cannot prove the absence of vulnerabilities. Production penetration testing, infrastructure review, monitored canary deployment, and periodic reassessment remain required. The GitHub Security workflow is authoritative only after GitHub actually executes all jobs successfully.
