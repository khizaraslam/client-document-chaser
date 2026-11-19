
# Client Document Chaser

Client Document Chaser is a web-based document management and follow-up platform designed to help businesses manage clients, request documents, track submissions, send reminders, and organize document workflows.

## Tech Stack

- Frontend: Next.js 15, React, TypeScript
- Backend: NestJS, TypeORM
- Database: PostgreSQL
- Cache & Queue: Redis, BullMQ
- Storage: S3-compatible storage (PGSTY Silo)
- Monorepo: pnpm workspaces, Turborepo
- Email: Resend

## Prerequisites

Install the following before running the project:

- Node.js
- pnpm
- Docker Desktop
- Git

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/Aman2888/client-document-chaser.git
cd client-document-chaser
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Configure Environment Variables

Create your local environment file using the example:

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env
```

Update `.env` with the required configuration.

Make sure the PostgreSQL configuration matches the Docker ports. For the local Docker setup, PostgreSQL is exposed on port `5433`.

Never commit actual API keys, credentials, or secrets.

### 4. Start Infrastructure Services

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

This starts the local infrastructure services:

- PostgreSQL
- Redis
- S3-compatible storage

### 5. Run the Backend API

Open a terminal:

```bash
pnpm --filter ./apps/api dev
```

API URL:

http://localhost:3001/api/v1

### 6. Run the Frontend

Open another terminal:

```bash
pnpm --filter ./apps/web dev
```

Web application:

http://localhost:3000

## Development Commands

### Type Check

```bash
pnpm -r typecheck
```

### Run Tests

```bash
pnpm -r test
```

### Build Backend

```bash
pnpm --filter ./apps/api build
```

### Build Frontend

```bash
pnpm --filter ./apps/web build
```

### Stop Docker Services

```bash
docker compose -f infra/docker/docker-compose.yml down
```

## Project Structure

```text
client-document-chaser/
├── apps/
│   ├── web/          # Next.js frontend
│   └── api/          # NestJS backend
├── packages/         # Shared packages
├── docs/             # Documentation
├── infra/            # Infrastructure & Docker configuration
├── .env.example      # Environment template
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

## Local Development URLs

| Service | URL |
|---|---|
| Web Application | http://localhost:3000 |
| Backend API | http://localhost:3001/api/v1 |
| PostgreSQL | localhost:5433 |
| Redis | localhost:6379 |
| Storage Console | http://localhost:9001 |

## Notes

- The project uses pnpm workspaces.
- PostgreSQL, Redis and object storage are managed through Docker Compose.
- Environment configuration is required before running the application.
- `.env` is excluded from Git.
