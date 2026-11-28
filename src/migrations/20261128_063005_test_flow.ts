import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_allocation_work_period" AS ENUM('weekly', 'monthly', 'other');
  CREATE TABLE "enquiry_tests_report_extra_scores" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"score" numeric NOT NULL
  );
  
  ALTER TABLE "allocation_work" ADD COLUMN "period" "enum_allocation_work_period";
  ALTER TABLE "enquiry_tests_report_extra_scores" ADD CONSTRAINT "enquiry_tests_report_extra_scores_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."enquiry_tests"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "enquiry_tests_report_extra_scores_order_idx" ON "enquiry_tests_report_extra_scores" USING btree ("_order");
  CREATE INDEX "enquiry_tests_report_extra_scores_parent_id_idx" ON "enquiry_tests_report_extra_scores" USING btree ("_parent_id");
  CREATE INDEX "allocation_work_period_idx" ON "allocation_work" USING btree ("period");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "enquiry_tests_report_extra_scores" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "enquiry_tests_report_extra_scores" CASCADE;
  DROP INDEX "allocation_work_period_idx";
  ALTER TABLE "allocation_work" DROP COLUMN "period";
  DROP TYPE "public"."enum_allocation_work_period";`)
}
