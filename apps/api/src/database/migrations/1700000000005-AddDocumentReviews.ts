import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentReviews1700000000005 implements MigrationInterface {
  name = 'AddDocumentReviews1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."document_reviews_decision_enum" AS ENUM('ACCEPTED', 'REJECTED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "document_reviews" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "request_id" uuid NOT NULL,
        "request_item_id" uuid NOT NULL,
        "uploaded_file_id" uuid,
        "reviewer_user_id" uuid,
        "decision" "public"."document_reviews_decision_enum" NOT NULL,
        "notes" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_document_reviews_id" PRIMARY KEY ("id"),
        CONSTRAINT "fk_document_reviews_org" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_document_reviews_request" FOREIGN KEY ("request_id") REFERENCES "document_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_document_reviews_item" FOREIGN KEY ("request_item_id") REFERENCES "request_items"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_document_reviews_file" FOREIGN KEY ("uploaded_file_id") REFERENCES "uploaded_files"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_document_reviews_reviewer" FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_document_reviews_org_request"
        ON "document_reviews" ("organization_id", "request_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_document_reviews_item_created"
        ON "document_reviews" ("request_item_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_document_reviews_item_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_document_reviews_org_request"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "document_reviews"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."document_reviews_decision_enum"`,
    );
  }
}
