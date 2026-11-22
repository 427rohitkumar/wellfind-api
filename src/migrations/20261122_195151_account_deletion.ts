import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_data_deletion_requests_source" AS ENUM('web', 'app');
  CREATE TYPE "public"."enum_data_deletion_requests_requester_type" AS ENUM('student_parent', 'teacher', 'staff', 'other');
  CREATE TYPE "public"."enum_data_deletion_requests_status" AS ENUM('pending', 'completed', 'rejected', 'failed');
  CREATE TABLE "data_deletion_requests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"source" "enum_data_deletion_requests_source" DEFAULT 'web' NOT NULL,
  	"requester_type" "enum_data_deletion_requests_requester_type" DEFAULT 'other' NOT NULL,
  	"status" "enum_data_deletion_requests_status" DEFAULT 'pending' NOT NULL,
  	"full_name" varchar,
  	"email" varchar,
  	"phone" varchar,
  	"message" varchar,
  	"result_summary" jsonb,
  	"processed_by_id" integer,
  	"processed_at" timestamp(3) with time zone,
  	"rejection_reason" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "data_deletion_requests_id" integer;
  ALTER TABLE "data_deletion_requests" ADD CONSTRAINT "data_deletion_requests_processed_by_id_users_id_fk" FOREIGN KEY ("processed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "data_deletion_requests_source_idx" ON "data_deletion_requests" USING btree ("source");
  CREATE INDEX "data_deletion_requests_status_idx" ON "data_deletion_requests" USING btree ("status");
  CREATE INDEX "data_deletion_requests_processed_by_idx" ON "data_deletion_requests" USING btree ("processed_by_id");
  CREATE INDEX "data_deletion_requests_updated_at_idx" ON "data_deletion_requests" USING btree ("updated_at");
  CREATE INDEX "data_deletion_requests_created_at_idx" ON "data_deletion_requests" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_data_deletion_requests_fk" FOREIGN KEY ("data_deletion_requests_id") REFERENCES "public"."data_deletion_requests"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_data_deletion_requests_id_idx" ON "payload_locked_documents_rels" USING btree ("data_deletion_requests_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "data_deletion_requests" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "data_deletion_requests" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_data_deletion_requests_fk";
  
  DROP INDEX "payload_locked_documents_rels_data_deletion_requests_id_idx";
  ALTER TABLE "users" DROP COLUMN "deleted_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "data_deletion_requests_id";
  DROP TYPE "public"."enum_data_deletion_requests_source";
  DROP TYPE "public"."enum_data_deletion_requests_requester_type";
  DROP TYPE "public"."enum_data_deletion_requests_status";`)
}
