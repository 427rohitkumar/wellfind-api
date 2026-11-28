import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_student_enquiries_inquiry_intent" AS ENUM('tutor_only', 'test_and_tutor');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_student_enquiries_preferred_test_mode" AS ENUM('digital', 'physical');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    ALTER TABLE "student_enquiries"
      ADD COLUMN IF NOT EXISTS "inquiry_intent" "enum_student_enquiries_inquiry_intent" DEFAULT 'tutor_only',
      ADD COLUMN IF NOT EXISTS "preferred_test_mode" "enum_student_enquiries_preferred_test_mode",
      ADD COLUMN IF NOT EXISTS "test_skipped" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "test_skipped_at" timestamp(3) with time zone;
    CREATE INDEX IF NOT EXISTS "student_enquiries_inquiry_intent_idx"
      ON "student_enquiries" USING btree ("inquiry_intent");
    CREATE INDEX IF NOT EXISTS "student_enquiries_test_skipped_idx"
      ON "student_enquiries" USING btree ("test_skipped");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "student_enquiries_test_skipped_idx";
    DROP INDEX IF EXISTS "student_enquiries_inquiry_intent_idx";
    ALTER TABLE "student_enquiries"
      DROP COLUMN IF EXISTS "test_skipped_at",
      DROP COLUMN IF EXISTS "test_skipped",
      DROP COLUMN IF EXISTS "preferred_test_mode",
      DROP COLUMN IF EXISTS "inquiry_intent";
    DROP TYPE IF EXISTS "public"."enum_student_enquiries_preferred_test_mode";
    DROP TYPE IF EXISTS "public"."enum_student_enquiries_inquiry_intent";
  `)
}
