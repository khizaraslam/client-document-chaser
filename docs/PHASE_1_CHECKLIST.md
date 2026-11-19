# Phase 1 Implementation Checklist — Foundation

## Milestone 1A: Architecture, Contracts & Infrastructure
- [x] Inspect current workspace and environment capabilities
- [x] Update `metadata.json` with project name and description
- [x] Create Architecture Decision Document (`docs/ARCHITECTURE.md`)
- [x] Create Database ERD & Migration Strategy (`docs/DATABASE_ERD.md`)
- [x] Create API Contracts reference (`docs/API_CONTRACTS.md`)
- [x] Configure pnpm workspace (`pnpm-workspace.yaml`), `turbo.json`, root `package.json`, `.env.example`
- [x] Create `packages/config` (shared TypeScript base configs, ESLint rules)
- [x] Create `packages/contracts` (Zod schemas, domain enums, shared DTO interfaces)
- [x] Create Docker infrastructure (`infra/docker/docker-compose.yml` for PostgreSQL 16, Redis 7, MinIO + bucket setup, ClamAV optional profile; `apps/api/Dockerfile`, `apps/web/Dockerfile`)

## Milestone 1B: NestJS API Foundation (`apps/api`)
- [x] Bootstrap NestJS application with TypeScript strict mode, Swagger/OpenAPI, Helmet, ValidationPipe, Global Exception Filter
- [x] Configure TypeORM (`synchronize: false`) + CLI `data-source.ts` + Initial Migration `1700000000001-InitialPhase1Schema.ts`
- [x] Implement Phase 1 entities: `UserEntity`, `RefreshSessionEntity`, `OrganizationEntity`, `MembershipEntity`, `InvitationEntity`, `PlanEntity`, `OrganizationSubscriptionEntity`, `AuditEventEntity`, `OutboxEventEntity`, `EmailEventEntity`
- [x] Implement `HealthModule` (`/api/v1/health`)
- [x] Implement `PlansModule` (Starter & Professional plan seeding + 14-day trial initialization)
- [x] Implement `AuditModule` (audit logger + tenant-scoped audit query endpoint)
- [x] Implement `NotificationsModule` (Resend API integration + missing-credential error state + `email_events` tracking)
- [x] Implement `AuthModule`:
  - [x] Argon2id password hashing
  - [x] Registration + Firm onboarding + 14-day trial creation in single DB transaction
  - [x] Email verification token generation & consumption
  - [x] Login with HttpOnly cookies (`cdc_access`, `cdc_refresh`) + CSRF cookie (`cdc_csrf`)
  - [x] Refresh token rotation + reuse detection (family revocation)
  - [x] Password reset request & completion
  - [x] Session listing & revocation
  - [x] Rate limiting (`@nestjs/throttler`) + CSRF Guard
- [x] Implement `OrganizationsModule` (get/update current org with RBAC)
- [x] Implement `MembershipsModule` (list roster, invite member, revoke invite, accept invite, role update with OWNER protection)
- [x] Scaffold Phase 2–4 module boundaries (`ClientsModule`, `TemplatesModule`, `RequestsModule`, `PortalModule`, `FilesModule`, `ReviewsModule`, `RemindersModule`, `DashboardModule`)

## Milestone 1C: Next.js Frontend Foundation (`apps/web`)
- [x] Configure Next.js App Router, Tailwind CSS v4, custom typography (`Plus Jakarta Sans`, `DM Sans`, `JetBrains Mono`), ivory/navy/teal B2B financial SaaS palette
- [x] Set up TanStack Query provider, API client with automatic refresh retry & CSRF header forwarding, Toast system, accessible UI primitives
- [x] Implement Public Landing Page (`/`)
- [x] Implement Auth pages (`/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`, `/accept-invite`)
- [x] Implement Protected Firm Workspace (`/app` layout with `noindex`, sidebar + top bar, `/app` overview, `/app/team`, `/app/settings`)

## Milestone 1D: Phase 1 Verification
- [x] Backend unit & integration tests (Argon2id, refresh rotation & reuse detection, RBAC & cross-tenant isolation, auth onboarding)
- [x] Frontend component & form validation tests (Login, Signup, Zod schema validation)
- [x] Run lint, typecheck, unit tests, and production builds across monorepo
- [x] Document results, unresolved issues, and local Docker run commands
