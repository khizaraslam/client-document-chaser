# Phase 2 Implementation Checklist — Clients, Templates, Requests & Recurring Schedules

## Milestone 2A: Shared Contracts & Database Schema
- [x] Extend `@cdc/contracts` (`ClientStatus`, `ClientEntityType`, `TemplateCategory`, Zod schemas & response DTOs in `packages/contracts/src/phase2.contracts.ts`)
- [x] Create TypeORM entities: `ClientEntity`, `ClientContactEntity`, `TemplateEntity`, `TemplateItemEntity`, `DocumentRequestEntity`, `RequestItemEntity`, `RecurrenceEntity`
- [x] Export `PHASE2_ENTITIES` and `ALL_ENTITIES` in `apps/api/src/database/entities/index.ts` and register in `data-source.ts` + `app.module.ts`
- [x] Author reversible TypeORM migration `1700000000002-Phase2CoreDomain.ts` with tenant-scoped foreign keys, composite indexes, and partial unique constraints (`uq_clients_org_reference_code`, `uq_document_requests_recurrence_period`)

## Milestone 2B: Backend Modules (`apps/api`)
- [x] Implement `ClientsModule` (`ClientsController`, `ClientsService`, DTOs):
  - [x] Client CRUD with active client quota enforcement and `organization_subscriptions.active_clients_count` synchronization
  - [x] Client Contacts CRUD with single-primary invariant & auto-promotion on primary removal
  - [x] `STAFF` assignment scoping and read-only expired trial enforcement
- [x] Implement `TemplatesModule` (`TemplatesController`, `TemplatesService`, DTOs):
  - [x] Checklist template CRUD, cloning, and checklist item management (preserving >= 1 item)
  - [x] Idempotent 4-template US & UK Accounting Starter Pack seeder (`POST /templates/starter-pack`)
  - [x] Deletion guard preventing removal of templates referenced by recurring schedules
- [x] Implement `RequestsModule` (`RequestsController`, `RequestsService`, `RecurrencesController`, `RecurrencesService`, `RecurrencesProcessor`, DTOs):
  - [x] Document request creation from template item snapshots or custom items
  - [x] `DRAFT` -> `SENT` transition validating contacts & items + transactional `outbox_events` & `audit_events`
  - [x] Cancellation flow and virtual `OVERDUE` status filtering
  - [x] Recurring schedules (`MONTHLY`, `QUARTERLY`, `ANNUAL`) with `{{period}}` interpolation, idempotent period key generation, manual `trigger`, and BullMQ `RecurrencesProcessor`

## Milestone 2C: Next.js Workspace UI (`apps/web`)
- [x] Update `AppShell` navigation (`Clients`, `Requests`, `Templates`, `Schedules`) and `/app` overview metrics
- [x] Implement Clients Directory (`/app/clients`) and Client Detail & Contacts Manager (`/app/clients/[id]`)
- [x] Implement Templates Directory (`/app/templates`) and Template Checklist Editor (`/app/templates/[id]`)
- [x] Implement Document Requests List (`/app/requests`) and Request Detail / Send / Cancel Page (`/app/requests/[id]`)
- [x] Implement Recurring Schedules Console (`/app/schedules`)

## Milestone 2D: Phase 2 Verification & Documentation
- [x] Backend `pg-mem` integration tests (`apps/api/test/phase2-core-domain.spec.ts`)
- [x] Frontend contract & page tests (`apps/web/test/phase2-contracts-and-pages.test.tsx`)
- [x] Update `docs/API_CONTRACTS.md` and `docs/PHASE_2_CHECKLIST.md`
- [x] Verify `@cdc/contracts` build, `npm run test`, `compile_applet`, and `lint_applet`
