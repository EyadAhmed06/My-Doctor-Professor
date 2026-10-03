# Backend Setup

The backend is a NestJS application backed by PostgreSQL and TypeORM.

## Install

```bash
npm ci
```

## Configure

Copy `.env.example` to `.env` and replace every secret and SMTP placeholder. Generate the email-outbox key once with:

```bash
openssl rand -base64 32
```

## Database

Create a PostgreSQL database, apply the ordered files under `database/schemas`, and apply new forward migrations under `database/migrations` when updating an existing deployment.

Automatic TypeORM synchronization is disabled.

## Run

```bash
npm run start:dev
```

The API base URL is `http://localhost:3000/api/v1` by default.

Deployment remains intentionally deferred until the complete project is implemented.
