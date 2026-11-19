import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClientAndRequestEnhancements1700000000004
  implements MigrationInterface
{
  name = 'ClientAndRequestEnhancements1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "clients"
        ADD COLUMN IF NOT EXISTS "company_name" character varying(180),
        ADD COLUMN IF NOT EXISTS "email" character varying(255),
        ADD COLUMN IF NOT EXISTS "phone" character varying(40),
        ADD COLUMN IF NOT EXISTS "address" text
    `);

    await queryRunner.query(`
      ALTER TABLE "client_contacts"
        ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_client_contacts_active_primary"
        ON "client_contacts" ("client_id")
        WHERE "is_primary" = true AND "is_active" = true AND "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "document_requests"
        ADD COLUMN IF NOT EXISTS "cancellation_reason" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "document_requests"
        DROP COLUMN IF EXISTS "cancellation_reason"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "uq_client_contacts_active_primary"
    `);

    await queryRunner.query(`
      ALTER TABLE "client_contacts"
        DROP COLUMN IF EXISTS "is_active"
    `);

    await queryRunner.query(`
      ALTER TABLE "clients"
        DROP COLUMN IF EXISTS "address",
        DROP COLUMN IF EXISTS "phone",
        DROP COLUMN IF EXISTS "email",
        DROP COLUMN IF EXISTS "company_name"
    `);
  }
}