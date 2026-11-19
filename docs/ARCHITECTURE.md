# Architecture Decision Document — Client Document Chaser

## 1. System Overview & Context

**Client Document Chaser** is a multi-tenant B2B SaaS platform purpose-built for accounting firms and bookkeepers in the US and UK to manage client document collection, review workflows, automated reminders, and recurring compliance requests without requiring clients to create accounts.

### Environment Capabilities Inspection (Initial Baseline)
- **Runtime**: Node.js `v22.23.2`, npm `10.9.8`, Corepack + `pnpm` (`12.21.0`).
- **Local Container Daemons**: `docker`, `psql`, and `redis-server` are not pre-installed inside the remote build sandbox.
- **Architectural Response**: Per engineering requirements, all integrations (PostgreSQL via TypeORM, Redis + BullMQ, Private S3/MinIO presigned URLs, Resend email + webhook verification, Argon2id auth) are implemented cleanly using the mandated stack, accompanied by a complete `infra/docker/docker-compose.yml` stack for local and production execution. Unit and integration test suites verify domain, auth, RBAC, and tenant isolation logic cleanly in CI/sandbox without substituting Firebase, Express, Prisma, or mock business logic.

---

## 2. Repository & Monorepo Structure

```text
/
├── apps/
│   ├── web/                  # Next.js App Router (TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, RHF + Zod)
│   └── api/                  # NestJS Modular Monolith (TypeORM, PostgreSQL, BullMQ, Swagger, Argon2id, S3, Resend)
├── packages/
│   ├── contracts/            # Shared Zod schemas, TypeScript DTO types, domain enums, error codes
│   └── config/               # Shared tsconfig presets, ESLint/Prettier config, environment validation helpers
├── infra/
│   └── docker/               # Docker Compose (Postgres 16, Redis 7, MinIO + bucket init, ClamAV profile) & Dockerfiles
├── docs/                     # Architecture decisions, ERD, API contracts, phase checklists
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

### ADR-001: Modular Monolith in NestJS
- **Decision**: Organize `apps/api` as a strict **Modular Monolith** with 15 domain-bounded NestJS modules:
  1. `AuthModule`
  2. `OrganizationsModule`
  3. `MembershipsModule`
  4. `ClientsModule`
  5. `TemplatesModule`
  6. `RequestsModule`
  7. `PortalModule`
  8. `FilesModule`
  9. `ReviewsModule`
  10. `NotificationsModule`
  11. `RemindersModule`
  12. `DashboardModule`
  13. `AuditModule`
  14. `PlansModule`
  15. `HealthModule`
- **Rationale**: Enforces strict domain boundaries (`controller -> application service -> TypeORM repository`) without premature distributed-microservices overhead, while allowing future extraction of BullMQ workers or scanning pipelines.

### ADR-002: Database & Migration Discipline (PostgreSQL + TypeORM)
- **Decision**: Use PostgreSQL 16 with TypeORM (`synchronize: false` at all times in runtime and migrations; explicit versioned TypeORM migrations under `apps/api/src/database/migrations/`).
- **Primary Keys**: UUID v4 (`uuid` column type with `gen_random_uuid()` / TypeORM `@PrimaryGeneratedColumn('uuid')`).
- **Timestamps**: All timestamps stored in UTC (`timestamptz`).
- **Soft Deletion**: Applied via `deleted_at` (`@DeleteDateColumn({ type: 'timestamptz', nullable: true })`) on tenant-owned domain records (`organizations`, `clients`, `client_contacts`, `templates`, `document_requests`, `files`) so audit trails and historical compliance records remain intact.

### ADR-003: Strict Multi-Tenant Isolation & RBAC
- **Decision**:
  - Every tenant-owned table includes a non-null `organization_id` foreign key indexed in composite indexes `(organization_id, ...)`.
  - Authenticated requests derive `userId`, `organizationId`, and `role` (`OWNER` | `ADMIN` | `STAFF`) exclusively from the verified JWT access token and active `memberships` record in PostgreSQL—**never** from `req.body.organizationId`, `req.query.organizationId`, or client headers.
  - A dedicated `TenantGuard` + `RolesGuard` + `@RequireRoles(...)` decorator enforces role permissions and membership active status on every protected route.
  - Repositories accept `organizationId` as a mandatory parameter on tenant-scoped reads/writes to eliminate IDOR vulnerabilities.

### ADR-004: Authentication, Session Security & Refresh Token Rotation
- **Decision**:
  - Passwords hashed using **Argon2id** (`argon2` library with recommended memory/time parameters).
  - Short-lived JWT Access Token (15 minutes) + Opaque high-entropy Refresh Token (30 days) stored in `HttpOnly`, `SameSite=Lax`, `Secure` (in production) cookies.
  - Refresh tokens are stored in `refresh_sessions` as **SHA-256 hashes** (never plaintext) bound to a `family_id`.
  - **Refresh Token Rotation & Reuse Detection**: Each refresh rotates the token within the same `family_id`, marking the prior record `revoked_at` and `replaced_by_id`. Presenting a previously rotated/revoked token revokes the entire `family_id` immediately to mitigate token theft.
  - **CSRF Protection**: State-changing endpoints using cookie credentials enforce an `X-CSRF-Token` double-submit header check matched against a non-HttpOnly `cdc_csrf` cookie (or `Origin`/`Referer` verification).
  - **Rate Limiting**: `@nestjs/throttler` applied globally and tightened on `/auth/login`, `/auth/register`, `/auth/forgot-password`, and portal OTP verification endpoints.

### ADR-005: Transactional Outbox + BullMQ + Redis
- **Decision**: Critical side effects (sending invitation emails, document request notifications, reminder dispatches) are written into `outbox_events` inside the **same PostgreSQL transaction** as the domain state change. A BullMQ-backed outbox relay polls/claims pending rows (`SKIP LOCKED`) and enqueues idempotent jobs to Redis queues (`emails`, `reminders`, `recurrences`, `malware-scan`).

### ADR-006: Private Object Storage & Document Quarantine
- **Decision**:
  - Files are stored in a private S3-compatible bucket (MinIO locally) with zero public ACLs or public URLs.
  - Uploads and downloads use short-lived **presigned URLs** generated only after authorization checks (`organization_id` + role or valid `portal_session`).
  - Uploaded files enter `QUARANTINED` state until server-side magic-byte MIME verification and malware scanning pass (`CLEAN` vs `INFECTED`).

### ADR-007: Frontend Architecture (`apps/web`)
- **Decision**: Next.js App Router with Server/Client boundary separation, Tailwind CSS v4, accessible shadcn/ui-pattern primitives, TanStack Query for server state, React Hook Form + Zod using shared `@cdc/contracts` schemas.
- **Business Logic Boundary**: Zero authorization or billing logic on the client; the frontend treats API responses as authoritative and renders `noindex, nofollow` metadata on `/app/*` and `/portal/*`.
