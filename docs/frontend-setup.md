# Frontend Setup

The current frontend is the original Next.js scaffold. Product frontend implementation is intentionally deferred until the backend workflows and contracts are complete.

## Run the scaffold

```bash
npm ci
npm run dev
```

## Future contract

The frontend must consume the versioned backend API under `/api/v1`, implement role-based routing, and follow the verification/reset token-handling rules recorded in the project documentation. No AWS integration or deployment should be introduced before the complete project is finished.
