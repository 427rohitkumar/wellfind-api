import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_user_devices_platform" AS ENUM('android', 'ios');
  CREATE TYPE "public"."enum_user_devices_environment" AS ENUM('development', 'preview', 'production');
  CREATE TYPE "public"."enum_notification_deliveries_status" AS ENUM('sent', 'failed', 'invalid_token');
  CREATE TABLE "notifications" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"type" varchar NOT NULL,
  	"title" varchar NOT NULL,
  	"body" varchar NOT NULL,
  	"entity_type" varchar,
  	"entity_id" varchar,
  	"screen" varchar,
  	"read_at" timestamp(3) with time zone,
  	"dedupe_key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "user_devices" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"fcm_token" varchar NOT NULL,
  	"platform" "enum_user_devices_platform" DEFAULT 'android' NOT NULL,
  	"environment" "enum_user_devices_environment" NOT NULL,
  	"active" boolean DEFAULT true,
  	"last_seen" timestamp(3) with time zone,
  	"app_version" varchar,
  	"device_name" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "notification_deliveries" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"notification_id" integer NOT NULL,
  	"device_id" integer NOT NULL,
  	"status" "enum_notification_deliveries_status" NOT NULL,
  	"attempts" numeric DEFAULT 1,
  	"error_code" varchar,
  	"message_id" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "notifications_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "user_devices_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "notification_deliveries_id" integer;
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_device_id_user_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."user_devices"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");
  CREATE INDEX "notifications_type_idx" ON "notifications" USING btree ("type");
  CREATE UNIQUE INDEX "notifications_dedupe_key_idx" ON "notifications" USING btree ("dedupe_key");
  CREATE INDEX "notifications_updated_at_idx" ON "notifications" USING btree ("updated_at");
  CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");
  CREATE INDEX "user_devices_user_idx" ON "user_devices" USING btree ("user_id");
  CREATE UNIQUE INDEX "user_devices_fcm_token_idx" ON "user_devices" USING btree ("fcm_token");
  CREATE INDEX "user_devices_environment_idx" ON "user_devices" USING btree ("environment");
  CREATE INDEX "user_devices_active_idx" ON "user_devices" USING btree ("active");
  CREATE INDEX "user_devices_updated_at_idx" ON "user_devices" USING btree ("updated_at");
  CREATE INDEX "user_devices_created_at_idx" ON "user_devices" USING btree ("created_at");
  CREATE INDEX "notification_deliveries_notification_idx" ON "notification_deliveries" USING btree ("notification_id");
  CREATE INDEX "notification_deliveries_device_idx" ON "notification_deliveries" USING btree ("device_id");
  CREATE INDEX "notification_deliveries_status_idx" ON "notification_deliveries" USING btree ("status");
  CREATE INDEX "notification_deliveries_updated_at_idx" ON "notification_deliveries" USING btree ("updated_at");
  CREATE INDEX "notification_deliveries_created_at_idx" ON "notification_deliveries" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notifications_fk" FOREIGN KEY ("notifications_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_user_devices_fk" FOREIGN KEY ("user_devices_id") REFERENCES "public"."user_devices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notification_deliveries_fk" FOREIGN KEY ("notification_deliveries_id") REFERENCES "public"."notification_deliveries"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_notifications_id_idx" ON "payload_locked_documents_rels" USING btree ("notifications_id");
  CREATE INDEX "payload_locked_documents_rels_user_devices_id_idx" ON "payload_locked_documents_rels" USING btree ("user_devices_id");
  CREATE INDEX "payload_locked_documents_rels_notification_deliveries_id_idx" ON "payload_locked_documents_rels" USING btree ("notification_deliveries_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "notifications" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "user_devices" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "notification_deliveries" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "notifications" CASCADE;
  DROP TABLE "user_devices" CASCADE;
  DROP TABLE "notification_deliveries" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_notifications_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_user_devices_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_notification_deliveries_fk";
  
  DROP INDEX "payload_locked_documents_rels_notifications_id_idx";
  DROP INDEX "payload_locked_documents_rels_user_devices_id_idx";
  DROP INDEX "payload_locked_documents_rels_notification_deliveries_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "notifications_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "user_devices_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "notification_deliveries_id";
  DROP TYPE "public"."enum_user_devices_platform";
  DROP TYPE "public"."enum_user_devices_environment";
  DROP TYPE "public"."enum_notification_deliveries_status";`)
}
