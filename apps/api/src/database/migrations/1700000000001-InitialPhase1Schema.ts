import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialPhase1Schema1700000000001 implements MigrationInterface {
  name = 'InitialPhase1Schema1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

    await queryRunner.query(
      `CREATE TYPE "public"."organizations_country_enum" AS ENUM('US', 'UK')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."memberships_role_enum" AS ENUM('OWNER', 'ADMIN', 'STAFF')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."memberships_status_enum" AS ENUM('ACTIVE', 'SUSPENDED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."invitations_role_enum" AS ENUM('OWNER', 'ADMIN', 'STAFF')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."plans_code_enum" AS ENUM('STARTER', 'PROFESSIONAL')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."organization_subscriptions_status_enum" AS ENUM('TRIALING', 'ACTIVE', 'TRIAL_EXPIRED', 'READ_ONLY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."audit_events_actor_type_enum" AS ENUM('USER', 'SYSTEM', 'PORTAL_CLIENT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."outbox_events_status_enum" AS ENUM('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."email_events_status_enum" AS ENUM('QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'FAILED_MISSING_CREDENTIALS', 'FAILED')`,
    );

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying(255) NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "full_name" character varying(120) NOT NULL,
        "email_verified_at" TIMESTAMP WITH TIME ZONE,
        "email_verify_token_hash" character varying(128),
        "email_verify_expires_at" TIMESTAMP WITH TIME ZONE,
        "password_reset_token_hash" character varying(128),
        "password_reset_expires_at" TIMESTAMP WITH TIME ZONE,
        "last_login_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_users_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_users_email" ON "users" (LOWER("email"))`,
    );

    await queryRunner.query(`
      CREATE TABLE "organizations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(150) NOT NULL,
        "slug" character varying(120) NOT NULL,
        "country" "public"."organizations_country_enum" NOT NULL DEFAULT 'US',
        "timezone" character varying(100) NOT NULL DEFAULT 'America/New_York',
        "brand_logo_key" character varying(255),
        "brand_accent_color" character varying(32),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_organizations_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_organizations_slug" ON "organizations" ("slug")`,
    );

    await queryRunner.query(`
      CREATE TABLE "memberships" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role" "public"."memberships_role_enum" NOT NULL DEFAULT 'STAFF',
        "status" "public"."memberships_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_memberships_id" PRIMARY KEY ("id"),
        CONSTRAINT "fk_memberships_org" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_memberships_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_memberships_org_user" ON "memberships" ("organization_id", "user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_memberships_org_role" ON "memberships" ("organization_id", "role")`,
    );

    await queryRunner.query(`
      CREATE TABLE "refresh_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "organization_id" uuid NOT NULL,
        "family_id" uuid NOT NULL,
        "token_hash" character varying(128) NOT NULL,
        "replaced_by_id" uuid,
        "user_agent" character varying(512),
        "ip_address" character varying(64),
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_refresh_sessions_id" PRIMARY KEY ("id"),
        CONSTRAINT "fk_refresh_sessions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_refresh_sessions_org" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_refresh_sessions_token_hash" ON "refresh_sessions" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_sessions_user_org" ON "refresh_sessions" ("user_id", "organization_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_sessions_family" ON "refresh_sessions" ("family_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "invitations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "invited_by_user_id" uuid NOT NULL,
        "email" character varying(255) NOT NULL,
        "role" "public"."invitations_role_enum" NOT NULL DEFAULT 'STAFF',
        "token_hash" character varying(128) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "accepted_at" TIMESTAMP WITH TIME ZONE,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_invitations_id" PRIMARY KEY ("id"),
        CONSTRAINT "fk_invitations_org" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_invitations_invited_by" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_invitations_token_hash" ON "invitations" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_invitations_org_email" ON "invitations" ("organization_id", "email")`,
    );

    await queryRunner.query(`
      CREATE TABLE "plans" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "code" "public"."plans_code_enum" NOT NULL,
        "name" character varying(80) NOT NULL,
        "monthly_price_cents" integer NOT NULL,
        "max_active_clients" integer NOT NULL,
        "max_team_seats" integer NOT NULL,
        "max_storage_bytes" bigint NOT NULL,
        "max_emails_per_month" integer NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_plans_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_plans_code" ON "plans" ("code")`,
    );

    await queryRunner.query(`
      CREATE TABLE "organization_subscriptions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "plan_id" uuid NOT NULL,
        "status" "public"."organization_subscriptions_status_enum" NOT NULL DEFAULT 'TRIALING',
        "trial_starts_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "trial_ends_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "active_clients_count" integer NOT NULL DEFAULT 0,
        "storage_bytes_used" bigint NOT NULL DEFAULT 0,
        "emails_sent_this_period" integer NOT NULL DEFAULT 0,
        "period_reset_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_org_subscriptions_id" PRIMARY KEY ("id"),
        CONSTRAINT "fk_org_subscriptions_org" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_org_subscriptions_plan" FOREIGN KEY ("plan_id") REFERENCES "plans"("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_org_subscriptions_org" ON "organization_subscriptions" ("organization_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "audit_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "actor_user_id" uuid,
        "actor_type" "public"."audit_events_actor_type_enum" NOT NULL DEFAULT 'USER',
        "action" character varying(120) NOT NULL,
        "resource_type" character varying(80) NOT NULL,
        "resource_id" character varying(120),
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "ip_address" character varying(64),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_audit_events_id" PRIMARY KEY ("id"),
        CONSTRAINT "fk_audit_events_org" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_audit_events_actor_user" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_audit_events_org_created" ON "audit_events" ("organization_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_audit_events_org_action" ON "audit_events" ("organization_id", "action")`,
    );

    await queryRunner.query(`
      CREATE TABLE "outbox_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid,
        "aggregate_type" character varying(80) NOT NULL,
        "aggregate_id" uuid NOT NULL,
        "event_type" character varying(120) NOT NULL,
        "payload" jsonb NOT NULL,
        "idempotency_key" character varying(190) NOT NULL,
        "status" "public"."outbox_events_status_enum" NOT NULL DEFAULT 'PENDING',
        "attempts" integer NOT NULL DEFAULT 0,
        "next_attempt_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "last_error" text,
        "processed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_outbox_events_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_outbox_idempotency_key" ON "outbox_events" ("idempotency_key")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_outbox_status_next_attempt" ON "outbox_events" ("status", "next_attempt_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "email_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid,
        "outbox_event_id" uuid,
        "provider_message_id" character varying(160),
        "recipient_email" character varying(255) NOT NULL,
        "template_name" character varying(120) NOT NULL,
        "status" "public"."email_events_status_enum" NOT NULL DEFAULT 'QUEUED',
        "error_message" text,
        "provider_payload" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_email_events_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_email_events_org_created" ON "email_events" ("organization_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_email_events_provider_msg_id" ON "email_events" ("provider_message_id")`,
    );

    // Seed baseline Starter and Professional plans idempotently
    await queryRunner.query(`
      INSERT INTO "plans" (
        "code", "name", "monthly_price_cents", "max_active_clients",
        "max_team_seats", "max_storage_bytes", "max_emails_per_month"
      ) VALUES
        ('STARTER', 'Starter', 1900, 50, 5, 10737418240, 2500),
        ('PROFESSIONAL', 'Professional', 3900, 250, 25, 107374182400, 15000)
      ON CONFLICT ("code") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "email_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "outbox_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organization_subscriptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plans"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "invitations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "memberships"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organizations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."email_events_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."outbox_events_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."audit_events_actor_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."organization_subscriptions_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."plans_code_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."invitations_role_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."memberships_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."memberships_role_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."organizations_country_enum"`);
  }
}
