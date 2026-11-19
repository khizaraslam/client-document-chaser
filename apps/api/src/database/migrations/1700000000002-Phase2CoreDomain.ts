import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase2CoreDomain1700000000002 implements MigrationInterface {
  name = 'Phase2CoreDomain1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."clients_entity_type_enum" AS ENUM('SOLE_TRADER', 'PARTNERSHIP', 'LLC', 'CORP', 'LTD', 'LLP', 'CHARITY', 'TRUST', 'INDIVIDUAL')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."clients_country_enum" AS ENUM('US', 'UK')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."clients_status_enum" AS ENUM('ACTIVE', 'ARCHIVED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."templates_category_enum" AS ENUM('ONBOARDING', 'TAX_RETURN', 'BOOKKEEPING', 'VAT_SALES_TAX', 'PAYROLL', 'AUDIT', 'GENERAL')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."recurrences_frequency_enum" AS ENUM('MONTHLY', 'QUARTERLY', 'ANNUAL')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."recurrences_status_enum" AS ENUM('ACTIVE', 'PAUSED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."document_requests_status_enum" AS ENUM('DRAFT', 'SENT', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."request_items_status_enum" AS ENUM('PENDING', 'UPLOADED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED')`,
    );

    await queryRunner.query(`
      CREATE TABLE "clients" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "name" character varying(150) NOT NULL,
        "reference_code" character varying(60),
        "entity_type" "public"."clients_entity_type_enum" NOT NULL DEFAULT 'LLC',
        "country" "public"."clients_country_enum" NOT NULL DEFAULT 'US',
        "status" "public"."clients_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "assigned_user_id" uuid,
        "notes" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_clients_id" PRIMARY KEY ("id"),
        CONSTRAINT "fk_clients_org" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_clients_assigned_user" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_clients_org_status" ON "clients" ("organization_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_clients_org_assigned" ON "clients" ("organization_id", "assigned_user_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_clients_org_reference_code" ON "clients" ("organization_id", "reference_code") WHERE "reference_code" IS NOT NULL AND "deleted_at" IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "client_contacts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "client_id" uuid NOT NULL,
        "full_name" character varying(120) NOT NULL,
        "email" character varying(255) NOT NULL,
        "phone" character varying(40),
        "role_title" character varying(80),
        "is_primary" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_client_contacts_id" PRIMARY KEY ("id"),
        CONSTRAINT "fk_client_contacts_org" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_client_contacts_client" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_client_contacts_org_client" ON "client_contacts" ("organization_id", "client_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_client_contacts_org_email" ON "client_contacts" ("organization_id", "email")`,
    );

    await queryRunner.query(`
      CREATE TABLE "templates" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "name" character varying(150) NOT NULL,
        "description" text,
        "category" "public"."templates_category_enum" NOT NULL DEFAULT 'GENERAL',
        "is_system" boolean NOT NULL DEFAULT false,
        "created_by_user_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_templates_id" PRIMARY KEY ("id"),
        CONSTRAINT "fk_templates_org" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_templates_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_templates_org_category" ON "templates" ("organization_id", "category")`,
    );

    await queryRunner.query(`
      CREATE TABLE "template_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "template_id" uuid NOT NULL,
        "title" character varying(160) NOT NULL,
        "description" text,
        "is_required" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "accepted_mime_types" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_template_items_id" PRIMARY KEY ("id"),
        CONSTRAINT "fk_template_items_org" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_template_items_template" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_template_items_org_template" ON "template_items" ("organization_id", "template_id", "sort_order")`,
    );

    await queryRunner.query(`
      CREATE TABLE "recurrences" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "client_id" uuid NOT NULL,
        "template_id" uuid NOT NULL,
        "title_template" character varying(180) NOT NULL,
        "instructions" text,
        "frequency" "public"."recurrences_frequency_enum" NOT NULL DEFAULT 'MONTHLY',
        "day_of_month" integer NOT NULL DEFAULT 1,
        "due_days_after_issue" integer NOT NULL DEFAULT 14,
        "timezone" character varying(100) NOT NULL DEFAULT 'America/New_York',
        "status" "public"."recurrences_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "next_run_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "last_run_at" TIMESTAMP WITH TIME ZONE,
        "last_period_key" character varying(32),
        "created_by_user_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_recurrences_id" PRIMARY KEY ("id"),
        CONSTRAINT "fk_recurrences_org" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_recurrences_client" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_recurrences_template" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_recurrences_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_recurrences_org_status_next_run" ON "recurrences" ("organization_id", "status", "next_run_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_recurrences_org_client" ON "recurrences" ("organization_id", "client_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "document_requests" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "client_id" uuid NOT NULL,
        "template_id" uuid,
        "recurrence_id" uuid,
        "period_key" character varying(32),
        "title" character varying(180) NOT NULL,
        "instructions" text,
        "status" "public"."document_requests_status_enum" NOT NULL DEFAULT 'DRAFT',
        "due_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "sent_at" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "cancelled_at" TIMESTAMP WITH TIME ZONE,
        "created_by_user_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_document_requests_id" PRIMARY KEY ("id"),
        CONSTRAINT "fk_document_requests_org" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_document_requests_client" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_document_requests_template" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_document_requests_recurrence" FOREIGN KEY ("recurrence_id") REFERENCES "recurrences"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_document_requests_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_document_requests_org_status_due" ON "document_requests" ("organization_id", "status", "due_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_document_requests_org_client" ON "document_requests" ("organization_id", "client_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_document_requests_recurrence_period" ON "document_requests" ("recurrence_id", "period_key") WHERE "recurrence_id" IS NOT NULL AND "period_key" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "request_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "request_id" uuid NOT NULL,
        "title" character varying(160) NOT NULL,
        "description" text,
        "is_required" boolean NOT NULL DEFAULT true,
        "status" "public"."request_items_status_enum" NOT NULL DEFAULT 'PENDING',
        "sort_order" integer NOT NULL DEFAULT 0,
        "accepted_mime_types" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_request_items_id" PRIMARY KEY ("id"),
        CONSTRAINT "fk_request_items_org" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_request_items_request" FOREIGN KEY ("request_id") REFERENCES "document_requests"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_request_items_org_request" ON "request_items" ("organization_id", "request_id", "sort_order")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "request_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "document_requests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "recurrences"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "template_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "templates"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "client_contacts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "clients"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."request_items_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."document_requests_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."recurrences_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."recurrences_frequency_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."templates_category_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."clients_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."clients_country_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."clients_entity_type_enum"`);
  }
}
