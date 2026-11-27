import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_roles" AS ENUM('super_admin', 'course_manager', 'operations_manager', 'student_counselor', 'teacher_coordinator', 'finance_manager', 'marketing_analyst', 'support_executive', 'teacher', 'student');
  CREATE TYPE "public"."enum_teacher_payouts_payment_method" AS ENUM('upi', 'razorpay', 'bank_transfer', 'other');
  ALTER TYPE "public"."enum_users_role" ADD VALUE 'course_manager' BEFORE 'operations_manager';
  ALTER TYPE "public"."enum_users_role" ADD VALUE 'student';
  CREATE TABLE "users_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_users_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "teacher_payouts" ADD COLUMN "payment_method" "enum_teacher_payouts_payment_method" DEFAULT 'upi';
  ALTER TABLE "teacher_payouts" ADD COLUMN "utr" varchar;
  ALTER TABLE "teacher_payouts" ADD COLUMN "razorpay_payout_id" varchar;
  ALTER TABLE "teacher_payouts" ADD COLUMN "payout_details" jsonb;
  ALTER TABLE "teacher_enquiries" ADD COLUMN "payout_settings" jsonb;
  ALTER TABLE "teacher_profiles" ADD COLUMN "payout_settings" jsonb;
  ALTER TABLE "users_roles" ADD CONSTRAINT "users_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_roles_order_idx" ON "users_roles" USING btree ("order");
  CREATE INDEX "users_roles_parent_idx" ON "users_roles" USING btree ("parent_id");
  CREATE INDEX "teacher_enquiries_mobile_number_idx" ON "teacher_enquiries" USING btree ("mobile_number");
  CREATE INDEX "teacher_enquiries_email_idx" ON "teacher_enquiries" USING btree ("email");
  CREATE INDEX "teacher_enquiries_teaching_locality_idx" ON "teacher_enquiries" USING btree ("teaching_locality");
  CREATE INDEX "teacher_enquiries_application_status_idx" ON "teacher_enquiries" USING btree ("application_status");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users_roles" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "users_roles" CASCADE;
  ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE text;
  ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'teacher'::text;
  DROP TYPE "public"."enum_users_role";
  CREATE TYPE "public"."enum_users_role" AS ENUM('super_admin', 'operations_manager', 'student_counselor', 'teacher_coordinator', 'finance_manager', 'marketing_analyst', 'support_executive', 'teacher');
  ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'teacher'::"public"."enum_users_role";
  ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE "public"."enum_users_role" USING "role"::"public"."enum_users_role";
  DROP INDEX "teacher_enquiries_mobile_number_idx";
  DROP INDEX "teacher_enquiries_email_idx";
  DROP INDEX "teacher_enquiries_teaching_locality_idx";
  DROP INDEX "teacher_enquiries_application_status_idx";
  ALTER TABLE "teacher_payouts" DROP COLUMN "payment_method";
  ALTER TABLE "teacher_payouts" DROP COLUMN "utr";
  ALTER TABLE "teacher_payouts" DROP COLUMN "razorpay_payout_id";
  ALTER TABLE "teacher_payouts" DROP COLUMN "payout_details";
  ALTER TABLE "teacher_enquiries" DROP COLUMN "payout_settings";
  ALTER TABLE "teacher_profiles" DROP COLUMN "payout_settings";
  DROP TYPE "public"."enum_users_roles";
  DROP TYPE "public"."enum_teacher_payouts_payment_method";`)
}
