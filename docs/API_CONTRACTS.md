# API Contracts — Client Document Chaser

Base Path: `/api/v1`  
Authentication: Cookie-based JWT access token (`cdc_access`) + rotating refresh token (`cdc_refresh`) + CSRF header (`X-CSRF-Token` matching `cdc_csrf` cookie on authenticated state-changing requests).

All error responses follow a uniform, non-leaking structure:

```json
{
  "statusCode": 400,
  "errorCode": "VALIDATION_ERROR",
  "message": "Human-readable summary",
  "details": [],
  "timestamp": "2026-11-15T22:00:00.000Z",
  "path": "/api/v1/..."
}
```

---

## Phase 1 Endpoints (Active)

### Health (`/api/v1/health`)
- `GET /health` — Returns liveness and readiness status (`database`, `redis`, `timestamp`).

### Auth (`/api/v1/auth`)
- `POST /auth/register` — Registers a new user + creates their firm (`Organization`), `OWNER` `Membership`, and 14-day trial `OrganizationSubscription`, plus email verification token & outbox event.
- `POST /auth/login` — Authenticates via email + Argon2id password verification, sets `cdc_access`, `cdc_refresh`, `cdc_csrf` cookies, returns current user + organization context.
- `POST /auth/refresh` — Rotates `cdc_refresh` cookie token; revokes entire token family on reuse detection.
- `POST /auth/logout` — Revokes active refresh session and clears auth cookies.
- `POST /auth/logout-all` — Revokes all active refresh sessions for the authenticated user.
- `POST /auth/verify-email` — Verifies email address using single-use token.
- `POST /auth/resend-verification` — Issues a fresh email verification token for authenticated unverified user.
- `POST /auth/forgot-password` — Always returns `200` (anti-enumeration), generates reset token & outbox event when account exists.
- `POST /auth/reset-password` — Validates reset token, updates Argon2id hash, revokes all prior refresh sessions.
- `GET /auth/me` — Returns authenticated user, active organization, membership role, and subscription trial state.
- `GET /auth/sessions` — Lists active refresh sessions for the current user (masked token family ID, IP, user agent, created/expires timestamps).
- `DELETE /auth/sessions/:sessionId` — Revokes a specific session belonging to the current user.

### Organizations (`/api/v1/organizations`)
- `GET /organizations/current` — Returns current tenant organization & subscription summary.
- `PATCH /organizations/current` — Updates firm name, country (`US`|`UK`), or IANA timezone (`OWNER` or `ADMIN` only).

### Memberships & Team Invitations (`/api/v1/memberships`)
- `GET /memberships` — Lists active/suspended members and pending invitations in the current organization.
- `POST /memberships/invitations` — Invites a new team member (`ADMIN` | `STAFF`, `OWNER` or `ADMIN` only; enforces plan seat limits).
- `DELETE /memberships/invitations/:invitationId` — Revokes a pending invitation (`OWNER` or `ADMIN` only).
- `POST /memberships/invitations/accept` — Accepts an invitation token (supports both logged-in existing users and new user registration).
- `PATCH /memberships/:membershipId/role` — Updates a member's role (`OWNER` only; cannot demote the sole `OWNER`).
- `DELETE /memberships/:membershipId` — Removes a member (`OWNER` or `ADMIN` with `OWNER` protection).

### Plans & Audit (`/api/v1/plans`, `/api/v1/audit`)
- `GET /plans` — Lists available plans (`STARTER`, `PROFESSIONAL`) and limits.
- `GET /audit` — Lists recent audit events scoped strictly to `organization_id` (`OWNER` or `ADMIN` only).

---

## Phase 2 Endpoints (Active)

### Clients & Client Contacts (`/api/v1/clients`)
- `GET /clients` — Lists firm clients (`status`, `search` filters; `STAFF` scoped to assigned clients).
- `POST /clients` — Creates a client and optional primary contact (`OWNER` or `ADMIN` only; enforces plan `maxActiveClients` quota and syncs `active_clients_count`).
- `GET /clients/:clientId` — Returns client details and ordered contacts (`STAFF` limited to assigned clients).
- `PATCH /clients/:clientId` — Updates client metadata (`OWNER`/`ADMIN` can reassign `assignedUserId` and change `status`; `STAFF` can edit notes/profile for assigned clients).
- `DELETE /clients/:clientId` — Soft-deletes a client (`OWNER` or `ADMIN` only; updates `active_clients_count`).
- `GET /clients/:clientId/contacts` — Lists contacts for a client.
- `POST /clients/:clientId/contacts` — Adds a client contact (maintains single `isPrimary` contact invariant).
- `PATCH /clients/:clientId/contacts/:contactId` — Updates contact or promotes to primary.
- `DELETE /clients/:clientId/contacts/:contactId` — Soft-deletes contact (auto-promotes oldest remaining contact if primary was deleted).

### Checklist Templates (`/api/v1/templates`)
- `GET /templates` — Lists reusable templates (`category`, `search` filters).
- `POST /templates/starter-pack` — Idempotently seeds 4 US & UK accounting starter templates (`OWNER` or `ADMIN` only).
- `POST /templates` — Creates a custom checklist template with ordered items (`OWNER` or `ADMIN` only).
- `GET /templates/:templateId` — Returns template details and checklist items.
- `POST /templates/:templateId/clone` — Clones an existing template and all items (`OWNER` or `ADMIN` only).
- `PATCH /templates/:templateId` — Updates template name, description, or category (`OWNER` or `ADMIN` only).
- `DELETE /templates/:templateId` — Soft-deletes a template (`OWNER` or `ADMIN` only; blocked with `409 Conflict` if referenced by a recurring schedule).
- `POST /templates/:templateId/items` — Adds a checklist item (`OWNER` or `ADMIN` only).
- `PATCH /templates/:templateId/items/:itemId` — Updates a checklist item (`OWNER` or `ADMIN` only).
- `DELETE /templates/:templateId/items/:itemId` — Deletes a checklist item (`OWNER` or `ADMIN` only; prevents removing the final item).

### Document Requests & Request Items (`/api/v1/requests`)
- `GET /requests` — Lists document requests (`status` including virtual `OVERDUE`, `clientId`, `search`; `STAFF` scoped to assigned clients).
- `POST /requests` — Creates a `DRAFT` document request by snapshotting a template or custom items (`STAFF` scoped to assigned active clients).
- `GET /requests/:requestId` — Returns request details and ordered snapshot checklist items.
- `PATCH /requests/:requestId` — Updates title, instructions, or due date on non-terminal requests.
- `POST /requests/:requestId/items` — Adds a request checklist item.
- `PATCH /requests/:requestId/items/:itemId` — Updates a request checklist item.
- `DELETE /requests/:requestId/items/:itemId` — Removes a request checklist item (keeps at least 1 item).
- `POST /requests/:requestId/send` — Validates at least 1 checklist item and 1 client contact, transitions `DRAFT` -> `SENT`, writes `DOCUMENT_REQUEST_SENT` outbox & audit events.
- `POST /requests/:requestId/cancel` — Cancels a non-terminal request and writes `DOCUMENT_REQUEST_CANCELLED` audit event.

### Recurring Request Schedules (`/api/v1/recurrences`)
- `GET /recurrences` — Lists recurring request schedules (`clientId`, `status` filters; `STAFF` scoped to assigned clients).
- `POST /recurrences` — Creates a `MONTHLY`, `QUARTERLY`, or `ANNUAL` schedule bound to an active client and template (`dayOfMonth` 1–28).
- `PATCH /recurrences/:recurrenceId` — Updates schedule cadence, title template, instructions, timezone, or pauses/resumes (`ACTIVE`/`PAUSED`).
- `DELETE /recurrences/:recurrenceId` — Deletes a recurring schedule (`OWNER` or `ADMIN` only).
- `POST /recurrences/:recurrenceId/trigger` — Immediately generates an idempotent request for the current period (`YYYY-MM`, `YYYY-Q[1-4]`, or `YYYY`), snapshots template items, advances `nextRunAt`, and rejects duplicate period runs with `409 Conflict`.

---

## Phase 3–4 Planned Contracts (Typed in `@cdc/contracts`)
- **Portal**: `/api/v1/portal/:token`, `/api/v1/portal/:token/otp`, `/api/v1/portal/:token/upload-url`
- **Files & Reviews**: `/api/v1/files/:id/download-url`, `/api/v1/reviews`
- **Reminders**: `/api/v1/reminder-policies`, `/api/v1/reminder-events`
- **Dashboard**: `/api/v1/dashboard/summary`

