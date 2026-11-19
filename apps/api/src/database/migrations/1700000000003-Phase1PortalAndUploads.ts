import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase1PortalAndUploads1700000000003 implements MigrationInterface {
  name = 'Phase1PortalAndUploads1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."uploaded_files_scan_status_enum" AS ENUM('PENDING_UPLOAD', 'QUARANTINED', 'SCANNING', 'CLEAN', 'INFECTED', 'REJECTED')`,
    );

    await queryRunner.query(`
      CREATE TABLE "portal_accesses" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "request_id" uuid NOT NULL,
        "client_id" uuid NOT NULL,
        "token_hash" character varying(64) NOT NULL,
        "recipient_email" character varying(255) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "last_accessed_at" TIMESTAMP WITH TIME ZONE,
        "access_count" integer NOT NULL DEFAULT 0,
        "created_by_user_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_portal_accesses_id" PRIMARY KEY ("id"),
        CONSTRAINT "fk_portal_accesses_org" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_portal_accesses_request" FOREIGN KEY ("request_id") REFERENCES "document_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_portal_accesses_client" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_portal_accesses_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_portal_accesses_token_hash" ON "portal_accesses" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_portal_accesses_org_request" ON "portal_accesses" ("organization_id", "request_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_portal_accesses_active_request" ON "portal_accesses" ("request_id") WHERE "revoked_at" IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "uploaded_files" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "request_id" uuid NOT NULL,
        "request_item_id" uuid NOT NULL,
        "client_id" uuid NOT NULL,
        "portal_access_id" uuid,
        "original_filename" character varying(255) NOT NULL,
        "sanitized_filename" character varying(255) NOT NULL,
        "mime_type" character varying(120) NOT NULL,
        "detected_mime_type" character varying(120),
        "size_bytes" bigint NOT NULL,
        "storage_bucket" character varying(120) NOT NULL,
        "storage_key" character varying(512) NOT NULL,
        "scan_status" "public"."uploaded_files_scan_status_enum" NOT NULL DEFAULT 'PENDING_UPLOAD',
        "scan_details" text,
        "uploaded_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_uploaded_files_id" PRIMARY KEY ("id"),
        CONSTRAINT "fk_uploaded_files_org" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_uploaded_files_request" FOREIGN KEY ("request_id") REFERENCES "document_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_uploaded_files_item" FOREIGN KEY ("request_item_id") REFERENCES "request_items"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_uploaded_files_client" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_uploaded_files_portal_access" FOREIGN KEY ("portal_access_id") REFERENCES "portal_accesses"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_uploaded_files_storage_key" ON "uploaded_files" ("storage_key")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_uploaded_files_org_request" ON "uploaded_files" ("organization_id", "request_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_uploaded_files_org_item" ON "uploaded_files" ("organization_id", "request_item_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "uploaded_files"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "portal_accesses"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."uploaded_files_scan_status_enum"`,
    );
  }
}
