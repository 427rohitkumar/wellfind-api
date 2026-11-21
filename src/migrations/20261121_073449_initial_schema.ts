import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_role" AS ENUM('super_admin', 'operations_manager', 'student_counselor', 'teacher_coordinator', 'finance_manager', 'marketing_analyst', 'support_executive', 'teacher');
  CREATE TYPE "public"."enum_users_gender" AS ENUM('male', 'female', 'other');
  CREATE TYPE "public"."enum_users_status" AS ENUM('active', 'blocked', 'suspended');
  CREATE TYPE "public"."enum_media_kind" AS ENUM('avatar', 'other');
  CREATE TYPE "public"."enum_student_enquiries_student_gender" AS ENUM('male', 'female', 'other');
  CREATE TYPE "public"."enum_student_enquiries_preferred_teacher_gender" AS ENUM('male', 'female', 'any');
  CREATE TYPE "public"."enum_student_enquiries_enquiry_source" AS ENUM('website', 'phone_call', 'email', 'referral', 'network', 'other');
  CREATE TYPE "public"."enum_student_enquiries_enquiry_status" AS ENUM('new', 'contacted', 'in_progress', 'test', 'converted', 'allocated', 'closed');
  CREATE TYPE "public"."enum_student_enquiries_test_mode" AS ENUM('physical', 'virtual', 'digital');
  CREATE TYPE "public"."enum_students_student_gender" AS ENUM('male', 'female', 'other');
  CREATE TYPE "public"."enum_students_preferred_teacher_gender" AS ENUM('male', 'female', 'any');
  CREATE TYPE "public"."enum_students_status" AS ENUM('active', 'inactive', 'paused', 'completed');
  CREATE TYPE "public"."enum_student_assessments_current_capability" AS ENUM('excellent', 'good', 'average', 'needs_improvement', 'weak');
  CREATE TYPE "public"."enum_student_tests_status" AS ENUM('requested', 'payment_pending', 'paid', 'tester_assigned', 'scheduled', 'completed', 'report_available');
  CREATE TYPE "public"."enum_student_tests_payment_status" AS ENUM('pending', 'paid', 'failed', 'refunded');
  CREATE TYPE "public"."enum_student_test_payments_payment_method" AS ENUM('cash', 'upi', 'card', 'bank_transfer', 'online', 'other');
  CREATE TYPE "public"."enum_student_test_payments_payment_status" AS ENUM('pending', 'paid', 'failed', 'refunded');
  CREATE TYPE "public"."enum_student_test_reports_capability" AS ENUM('excellent', 'good', 'average', 'needs_improvement', 'weak');
  CREATE TYPE "public"."enum_student_test_report_shares_channel" AS ENUM('whatsapp', 'phone_call');
  CREATE TYPE "public"."enum_student_test_report_shares_status" AS ENUM('recorded', 'sent', 'completed', 'failed', 'no_answer');
  CREATE TYPE "public"."enum_enquiry_tests_mode" AS ENUM('physical', 'digital');
  CREATE TYPE "public"."enum_enquiry_tests_status" AS ENUM('requested', 'scheduled', 'conducted', 'report_ready', 'cancelled');
  CREATE TYPE "public"."enum_enquiry_tests_payment_status" AS ENUM('pending', 'paid', 'waived');
  CREATE TYPE "public"."enum_teaching_sessions_status" AS ENUM('scheduled', 'taught', 'missed', 'cancelled');
  CREATE TYPE "public"."enum_allocation_work_kind" AS ENUM('assignment', 'test');
  CREATE TYPE "public"."enum_allocation_work_status" AS ENUM('assigned', 'submitted', 'graded', 'missed');
  CREATE TYPE "public"."enum_teacher_enquiries_gender" AS ENUM('male', 'female', 'other');
  CREATE TYPE "public"."enum_teacher_enquiries_application_status" AS ENUM('new', 'under_review', 'shortlisted', 'evaluation_completed', 'approved', 'rejected');
  CREATE TYPE "public"."enum_teacher_enquiries_teacher_availability" AS ENUM('free', 'allocated');
  CREATE TYPE "public"."enum_teacher_enquiries_rejection_category" AS ENUM('qualifications_mismatch', 'experience_insufficient', 'document_verification_failed', 'interview_demo_failed', 'character_conduct', 'other');
  CREATE TYPE "public"."enum_teacher_enquiries_registration_fee_status" AS ENUM('pending', 'submitted', 'paid', 'waived');
  CREATE TYPE "public"."enum_teacher_enquiries_registration_fee_payment_method" AS ENUM('razorpay', 'upi', 'bank_transfer', 'other');
  CREATE TYPE "public"."enum_teacher_enquiries_credentials_email_status" AS ENUM('sent', 'failed');
  CREATE TYPE "public"."enum_teacher_evaluations_revision_history_previous_status" AS ENUM('in_progress', 'completed');
  CREATE TYPE "public"."enum_teacher_evaluations_revision_history_new_status" AS ENUM('in_progress', 'completed');
  CREATE TYPE "public"."enum_teacher_evaluations_evaluation_status" AS ENUM('in_progress', 'completed');
  CREATE TYPE "public"."enum_teacher_matches_match_status" AS ENUM('eligible', 'shortlisted', 'rejected');
  CREATE TYPE "public"."enum_teacher_allocations_timetable_day" AS ENUM('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');
  CREATE TYPE "public"."enum_teacher_allocations_status" AS ENUM('assigned', 'accepted', 'rejected', 'active', 'completed', 'cancelled');
  CREATE TYPE "public"."enum_enquiry_audit_log_enquiry_type" AS ENUM('student', 'teacher');
  CREATE TYPE "public"."enum_enquiry_audit_log_field_changed" AS ENUM('enquiryStatus', 'applicationStatus', 'evaluation');
  CREATE TYPE "public"."enum_teacher_profiles_gender" AS ENUM('male', 'female', 'other');
  CREATE TYPE "public"."enum_teacher_profiles_availability_status" AS ENUM('free', 'allocated');
  CREATE TYPE "public"."enum_teacher_profiles_approval_status" AS ENUM('approved', 'pending', 'rejected');
  CREATE TYPE "public"."enum_teacher_profiles_registration_fee_status" AS ENUM('paid', 'pending', 'failed', 'waived');
  CREATE TYPE "public"."enum_teacher_profiles_kyc_status" AS ENUM('verified', 'under_review', 'pending', 'rejected');
  CREATE TYPE "public"."enum_teacher_profiles_student_allocation_status" AS ENUM('allocated', 'partially_allocated', 'unallocated');
  CREATE TYPE "public"."enum_teacher_profiles_account_status" AS ENUM('active', 'inactive', 'suspended');
  CREATE TYPE "public"."enum_email_logs_status" AS ENUM('queued', 'sent', 'failed', 'skipped');
  CREATE TYPE "public"."enum_payments_category" AS ENUM('teacher_registration', 'tuition_fee', 'other');
  CREATE TYPE "public"."enum_payments_status" AS ENUM('created', 'paid', 'failed', 'refunded');
  CREATE TYPE "public"."enum_payments_mode" AS ENUM('test', 'live');
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"role" "enum_users_role" DEFAULT 'teacher' NOT NULL,
  	"full_name" varchar,
  	"phone" varchar,
  	"gender" "enum_users_gender",
  	"avatar" varchar,
  	"status" "enum_users_status" DEFAULT 'active' NOT NULL,
  	"otp_hash" varchar,
  	"otp_expires_at" timestamp(3) with time zone,
  	"otp_attempts" numeric DEFAULT 0,
  	"otp_last_sent_at" timestamp(3) with time zone,
  	"reset_auth_token" varchar,
  	"reset_auth_expires_at" timestamp(3) with time zone,
  	"reset_auth_used" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar NOT NULL,
  	"kind" "enum_media_kind" DEFAULT 'other',
  	"owner_id" integer,
  	"prefix" varchar DEFAULT 'wellfind/media',
  	"_objectkey" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "user_files" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"owner_id" integer NOT NULL,
  	"label" varchar,
  	"category" varchar,
  	"prefix" varchar DEFAULT 'wellfind/user-files',
  	"_objectkey" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "student_enquiries_subjects" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"subject" varchar NOT NULL
  );
  
  CREATE TABLE "student_enquiries" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"student_class" varchar NOT NULL,
  	"custom_subject" varchar,
  	"preferred_timing" varchar NOT NULL,
  	"locality" varchar NOT NULL,
  	"custom_locality" varchar,
  	"student_gender" "enum_student_enquiries_student_gender",
  	"preferred_teacher_gender" "enum_student_enquiries_preferred_teacher_gender",
  	"budget_range" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"phone_number" varchar NOT NULL,
  	"enquiry_source" "enum_student_enquiries_enquiry_source" DEFAULT 'website',
  	"additional_notes" varchar,
  	"agreed_to_policy" boolean DEFAULT false NOT NULL,
  	"mark_as_read" boolean DEFAULT false,
  	"enquiry_status" "enum_student_enquiries_enquiry_status" DEFAULT 'new',
  	"admin_notes" varchar,
  	"assigned_to_id" integer,
  	"test_mode" "enum_student_enquiries_test_mode",
  	"test_scheduled_at" timestamp(3) with time zone,
  	"test_venue" varchar,
  	"test_notes" varchar,
  	"change_reason" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "students_subjects" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"subject" varchar NOT NULL
  );
  
  CREATE TABLE "students" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"parent_name" varchar,
  	"phone_number" varchar NOT NULL,
  	"alternate_phone_number" varchar,
  	"parent_email" varchar,
  	"student_class" varchar NOT NULL,
  	"custom_subject" varchar,
  	"locality" varchar NOT NULL,
  	"custom_locality" varchar,
  	"preferred_timing" varchar NOT NULL,
  	"student_gender" "enum_students_student_gender",
  	"preferred_teacher_gender" "enum_students_preferred_teacher_gender",
  	"budget_range" varchar,
  	"learning_notes" varchar,
  	"student_enquiry_id" integer,
  	"status" "enum_students_status" DEFAULT 'active' NOT NULL,
  	"converted_at" timestamp(3) with time zone,
  	"converted_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "student_assessments_strengths" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"item" varchar NOT NULL
  );
  
  CREATE TABLE "student_assessments_weaknesses" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"item" varchar NOT NULL
  );
  
  CREATE TABLE "student_assessments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"student_id" integer NOT NULL,
  	"assessment_type" varchar DEFAULT 'initial_review' NOT NULL,
  	"previous_performance_summary" varchar NOT NULL,
  	"previous_performance_details" varchar,
  	"current_capability" "enum_student_assessments_current_capability" NOT NULL,
  	"admin_notes" varchar,
  	"assessed_by_id" integer,
  	"assessed_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "student_tests_assignment_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tester_id" integer NOT NULL,
  	"assigned_by_id" integer,
  	"assigned_at" timestamp(3) with time zone NOT NULL,
  	"scheduled_at" timestamp(3) with time zone,
  	"notes" varchar
  );
  
  CREATE TABLE "student_tests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"student_id" integer NOT NULL,
  	"parent_selected" boolean DEFAULT true NOT NULL,
  	"test_type" varchar DEFAULT 'physical_assessment' NOT NULL,
  	"fee_amount" numeric DEFAULT 100 NOT NULL,
  	"currency" varchar DEFAULT 'INR' NOT NULL,
  	"location" varchar NOT NULL,
  	"scheduled_at" timestamp(3) with time zone,
  	"status" "enum_student_tests_status" DEFAULT 'payment_pending' NOT NULL,
  	"payment_status" "enum_student_tests_payment_status" DEFAULT 'pending' NOT NULL,
  	"assigned_tester_id" integer,
  	"assigned_by_id" integer,
  	"assigned_at" timestamp(3) with time zone,
  	"completed_at" timestamp(3) with time zone,
  	"notes" varchar,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "student_test_payments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"student_test_id" integer NOT NULL,
  	"student_id" integer NOT NULL,
  	"amount" numeric DEFAULT 100 NOT NULL,
  	"currency" varchar DEFAULT 'INR' NOT NULL,
  	"payment_method" "enum_student_test_payments_payment_method" NOT NULL,
  	"payment_status" "enum_student_test_payments_payment_status" NOT NULL,
  	"transaction_reference" varchar NOT NULL,
  	"successful_payment_key" varchar,
  	"recorded_by_id" integer,
  	"paid_at" timestamp(3) with time zone,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "student_test_reports_subject_results" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"subject" varchar NOT NULL,
  	"marks_obtained" numeric NOT NULL,
  	"total_marks" numeric NOT NULL
  );
  
  CREATE TABLE "student_test_reports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"student_test_id" integer NOT NULL,
  	"student_id" integer NOT NULL,
  	"marks_obtained" numeric NOT NULL,
  	"total_marks" numeric NOT NULL,
  	"capability" "enum_student_test_reports_capability" NOT NULL,
  	"remarks" varchar,
  	"submitted_by_id" integer NOT NULL,
  	"submitted_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "student_test_report_shares" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"student_test_id" integer NOT NULL,
  	"report_id" integer NOT NULL,
  	"student_id" integer NOT NULL,
  	"channel" "enum_student_test_report_shares_channel" NOT NULL,
  	"recipient" varchar NOT NULL,
  	"status" "enum_student_test_report_shares_status" DEFAULT 'recorded' NOT NULL,
  	"external_delivery_confirmed" boolean DEFAULT false NOT NULL,
  	"provider_integrated" boolean DEFAULT false NOT NULL,
  	"notes" varchar,
  	"shared_by_id" integer NOT NULL,
  	"shared_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "enquiry_tests_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" varchar NOT NULL,
  	"at" timestamp(3) with time zone,
  	"by_id" integer,
  	"note" varchar
  );
  
  CREATE TABLE "enquiry_tests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"student_enquiry_id" integer NOT NULL,
  	"mode" "enum_enquiry_tests_mode" NOT NULL,
  	"fee" numeric NOT NULL,
  	"status" "enum_enquiry_tests_status" DEFAULT 'requested' NOT NULL,
  	"payment_status" "enum_enquiry_tests_payment_status" DEFAULT 'pending',
  	"payment_paid_at" timestamp(3) with time zone,
  	"payment_reference" varchar,
  	"payment_note" varchar,
  	"tester_id" integer,
  	"scheduled_at" timestamp(3) with time zone,
  	"venue" varchar,
  	"scheduling_note" varchar,
  	"conducted_at" timestamp(3) with time zone,
  	"report_iq_score" numeric,
  	"report_creativity_score" numeric,
  	"report_academic_score" numeric,
  	"report_strengths" varchar,
  	"report_improvement_areas" varchar,
  	"report_recommendation" varchar,
  	"report_hours_per_week" numeric,
  	"report_tester_notes" varchar,
  	"report_reported_at" timestamp(3) with time zone,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "teaching_sessions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"allocation_id" integer NOT NULL,
  	"day" varchar NOT NULL,
  	"start_time" varchar NOT NULL,
  	"end_time" varchar NOT NULL,
  	"status" "enum_teaching_sessions_status" DEFAULT 'scheduled' NOT NULL,
  	"topic" varchar,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "teacher_payouts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"allocation_id" integer NOT NULL,
  	"teacher_id" integer NOT NULL,
  	"month" varchar NOT NULL,
  	"amount" numeric NOT NULL,
  	"paid_at" timestamp(3) with time zone NOT NULL,
  	"reference" varchar,
  	"note" varchar,
  	"recorded_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "push_subscriptions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"endpoint" varchar NOT NULL,
  	"p256dh" varchar NOT NULL,
  	"auth" varchar NOT NULL,
  	"user_agent" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "allocation_work" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"allocation_id" integer NOT NULL,
  	"kind" "enum_allocation_work_kind" DEFAULT 'assignment' NOT NULL,
  	"title" varchar NOT NULL,
  	"description" varchar,
  	"due_date" varchar,
  	"status" "enum_allocation_work_status" DEFAULT 'assigned' NOT NULL,
  	"marks" numeric,
  	"max_marks" numeric,
  	"feedback" varchar,
  	"submitted_at" timestamp(3) with time zone,
  	"graded_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "teacher_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"owner_id" integer,
  	"alt" varchar NOT NULL,
  	"prefix" varchar DEFAULT 'wellfind/kyc',
  	"_objectkey" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "teacher_enquiries" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"full_name" varchar NOT NULL,
  	"mobile_number" varchar NOT NULL,
  	"email" varchar,
  	"gender" "enum_teacher_enquiries_gender",
  	"highest_qualification" varchar NOT NULL,
  	"teaching_experience" varchar NOT NULL,
  	"primary_subject" varchar NOT NULL,
  	"class_level" varchar NOT NULL,
  	"teaching_locality" varchar NOT NULL,
  	"preferred_availability" varchar NOT NULL,
  	"additional_notes" varchar,
  	"agreed_to_policy" boolean DEFAULT false NOT NULL,
  	"aadhaar_document_id" integer,
  	"qualification_document_id" integer,
  	"mark_as_read" boolean DEFAULT false,
  	"application_status" "enum_teacher_enquiries_application_status" DEFAULT 'new',
  	"admin_notes" varchar,
  	"reviewed_by_id" integer,
  	"reviewed_at" timestamp(3) with time zone,
  	"teacher_availability" "enum_teacher_enquiries_teacher_availability" DEFAULT 'free',
  	"rejection_category" "enum_teacher_enquiries_rejection_category",
  	"change_reason" varchar,
  	"registration_fee_status" "enum_teacher_enquiries_registration_fee_status" DEFAULT 'pending',
  	"registration_fee_amount" numeric DEFAULT 1000,
  	"registration_fee_payment_date" timestamp(3) with time zone,
  	"registration_fee_payment_method" "enum_teacher_enquiries_registration_fee_payment_method",
  	"registration_fee_submitted_at" timestamp(3) with time zone,
  	"registration_fee_expires_at" timestamp(3) with time zone,
  	"registration_fee_transaction_ref" varchar,
  	"registration_fee_notes" varchar,
  	"teacher_user_id" integer,
  	"account_created_at" timestamp(3) with time zone,
  	"credentials_email_status" "enum_teacher_enquiries_credentials_email_status",
  	"teacher_profile_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "teacher_evaluations_revision_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"revision_number" numeric NOT NULL,
  	"previous_status" "enum_teacher_evaluations_revision_history_previous_status" NOT NULL,
  	"new_status" "enum_teacher_evaluations_revision_history_new_status" NOT NULL,
  	"previous_written_test" jsonb,
  	"previous_interview" jsonb,
  	"previous_applied_weights" jsonb,
  	"previous_quality_score" numeric,
  	"new_quality_score" numeric,
  	"change_reason" varchar,
  	"changed_by_id" integer,
  	"changed_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "teacher_evaluations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"teacher_enquiry_id" integer NOT NULL,
  	"attempt_number" numeric DEFAULT 1 NOT NULL,
  	"evaluation_status" "enum_teacher_evaluations_evaluation_status" DEFAULT 'in_progress' NOT NULL,
  	"written_test_is_recorded" boolean DEFAULT false,
  	"written_test_marks_obtained" numeric,
  	"written_test_total_marks" numeric,
  	"written_test_percentage" numeric,
  	"written_test_remarks" varchar,
  	"written_test_recorded_by_id" integer,
  	"written_test_recorded_at" timestamp(3) with time zone,
  	"interview_is_recorded" boolean DEFAULT false,
  	"interview_marks_obtained" numeric,
  	"interview_total_marks" numeric,
  	"interview_percentage" numeric,
  	"interview_remarks" varchar,
  	"interview_recorded_by_id" integer,
  	"interview_recorded_at" timestamp(3) with time zone,
  	"applied_weights_written_test_weight" numeric,
  	"applied_weights_interview_weight" numeric,
  	"quality_score" numeric,
  	"overall_remarks" varchar,
  	"evaluator_id" integer,
  	"evaluated_at" timestamp(3) with time zone,
  	"completed_at" timestamp(3) with time zone,
  	"last_updated_by_id" integer,
  	"last_updated_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "teacher_matches" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"student_id" integer NOT NULL,
  	"teacher_id" integer NOT NULL,
  	"match_status" "enum_teacher_matches_match_status" NOT NULL,
  	"criteria_snapshot" jsonb NOT NULL,
  	"quality_score" numeric,
  	"admin_notes" varchar,
  	"created_by_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "teacher_allocations_timetable" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"day" "enum_teacher_allocations_timetable_day" NOT NULL,
  	"start_time" varchar NOT NULL,
  	"end_time" varchar NOT NULL
  );
  
  CREATE TABLE "teacher_allocations_status_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"from_status" varchar,
  	"to_status" varchar NOT NULL,
  	"reason" varchar,
  	"changed_by_id" integer,
  	"changed_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "teacher_allocations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"student_id" integer NOT NULL,
  	"teacher_id" integer NOT NULL,
  	"subject" varchar NOT NULL,
  	"status" "enum_teacher_allocations_status" DEFAULT 'assigned' NOT NULL,
  	"allocation_notes" varchar,
  	"monthly_fee" numeric,
  	"commission_percent" numeric,
  	"commission_amount" numeric,
  	"teacher_payout" numeric,
  	"allocated_by_id" integer NOT NULL,
  	"allocated_at" timestamp(3) with time zone NOT NULL,
  	"active_key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "enquiry_audit_log" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"enquiry_type" "enum_enquiry_audit_log_enquiry_type" NOT NULL,
  	"student_enquiry_id" integer,
  	"teacher_enquiry_id" integer,
  	"field_changed" "enum_enquiry_audit_log_field_changed" NOT NULL,
  	"previous_status" varchar,
  	"new_status" varchar NOT NULL,
  	"changed_by_id" integer,
  	"changed_at" timestamp(3) with time zone,
  	"change_reason" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "teacher_profiles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"email" varchar,
  	"mobile" varchar NOT NULL,
  	"gender" "enum_teacher_profiles_gender",
  	"avatar" varchar,
  	"primary_subject" varchar NOT NULL,
  	"qualification" varchar NOT NULL,
  	"experience_years" numeric DEFAULT 0,
  	"class_levels" varchar,
  	"locality" varchar,
  	"availability" varchar,
  	"about" varchar,
  	"applicant_notes" varchar,
  	"teacher_enquiry_id" integer NOT NULL,
  	"user_id" integer,
  	"evaluation_id" integer,
  	"evaluation_score" numeric,
  	"availability_status" "enum_teacher_profiles_availability_status" DEFAULT 'free',
  	"approved_by_id" integer,
  	"approved_at" timestamp(3) with time zone,
  	"approval_status" "enum_teacher_profiles_approval_status" DEFAULT 'approved' NOT NULL,
  	"registration_fee_status" "enum_teacher_profiles_registration_fee_status" DEFAULT 'pending',
  	"registration_fee_amount" numeric DEFAULT 1000,
  	"registration_fee_currency" varchar DEFAULT 'INR',
  	"registration_fee_year" varchar DEFAULT '2026–2027',
  	"registration_fee_payment_date" varchar DEFAULT 'Pending',
  	"registration_fee_expires_at" timestamp(3) with time zone,
  	"registration_fee_transaction_ref" varchar DEFAULT 'None',
  	"kyc_status" "enum_teacher_profiles_kyc_status" DEFAULT 'verified',
  	"kyc_aadhaar_status" varchar,
  	"kyc_qualification_status" varchar,
  	"kyc_aadhaar_document_id" integer,
  	"kyc_qualification_document_id" integer,
  	"kyc_review_notes" varchar,
  	"kyc_reviewed_at" timestamp(3) with time zone,
  	"student_allocation_status" "enum_teacher_profiles_student_allocation_status" DEFAULT 'unallocated',
  	"student_allocation_allocated_count" numeric DEFAULT 0,
  	"student_allocation_students_summary" varchar DEFAULT 'Unallocated',
  	"student_allocation_allocation_date" varchar DEFAULT 'None',
  	"account_status" "enum_teacher_profiles_account_status" DEFAULT 'active',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "email_logs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"recipient" varchar NOT NULL,
  	"recipient_name" varchar,
  	"template" varchar NOT NULL,
  	"subject" varchar NOT NULL,
  	"status" "enum_email_logs_status" DEFAULT 'queued' NOT NULL,
  	"error" varchar,
  	"attempts" numeric DEFAULT 0,
  	"message_id" varchar,
  	"sent_at" timestamp(3) with time zone,
  	"related_type" varchar,
  	"related_id" varchar,
  	"dedupe_key" varchar,
  	"retryable" boolean DEFAULT false,
  	"template_data" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payments_events" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" varchar NOT NULL,
  	"at" timestamp(3) with time zone,
  	"source" varchar,
  	"event_id" varchar,
  	"note" varchar
  );
  
  CREATE TABLE "payments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"category" "enum_payments_category" NOT NULL,
  	"status" "enum_payments_status" DEFAULT 'created' NOT NULL,
  	"amount" numeric NOT NULL,
  	"currency" varchar DEFAULT 'INR',
  	"gateway" varchar DEFAULT 'razorpay',
  	"mode" "enum_payments_mode",
  	"razorpay_order_id" varchar,
  	"razorpay_payment_id" varchar,
  	"receipt" varchar,
  	"method" varchar,
  	"payer_name" varchar,
  	"payer_email" varchar,
  	"payer_phone" varchar,
  	"payer_user_id" integer,
  	"teacher_enquiry_id" integer,
  	"description" varchar,
  	"paid_at" timestamp(3) with time zone,
  	"failure_reason" varchar,
  	"refunded_amount" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"media_id" integer,
  	"user_files_id" integer,
  	"student_enquiries_id" integer,
  	"students_id" integer,
  	"student_assessments_id" integer,
  	"student_tests_id" integer,
  	"student_test_payments_id" integer,
  	"student_test_reports_id" integer,
  	"student_test_report_shares_id" integer,
  	"enquiry_tests_id" integer,
  	"teaching_sessions_id" integer,
  	"teacher_payouts_id" integer,
  	"push_subscriptions_id" integer,
  	"allocation_work_id" integer,
  	"teacher_documents_id" integer,
  	"teacher_enquiries_id" integer,
  	"teacher_evaluations_id" integer,
  	"teacher_matches_id" integer,
  	"teacher_allocations_id" integer,
  	"enquiry_audit_log_id" integer,
  	"teacher_profiles_id" integer,
  	"email_logs_id" integer,
  	"payments_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "teacher_evaluation_config" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"written_test_weight" numeric DEFAULT 0.5 NOT NULL,
  	"interview_weight" numeric DEFAULT 0.5 NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_files" ADD CONSTRAINT "user_files_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_enquiries_subjects" ADD CONSTRAINT "student_enquiries_subjects_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."student_enquiries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "student_enquiries" ADD CONSTRAINT "student_enquiries_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "students_subjects" ADD CONSTRAINT "students_subjects_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "students" ADD CONSTRAINT "students_student_enquiry_id_student_enquiries_id_fk" FOREIGN KEY ("student_enquiry_id") REFERENCES "public"."student_enquiries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "students" ADD CONSTRAINT "students_converted_by_id_users_id_fk" FOREIGN KEY ("converted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_assessments_strengths" ADD CONSTRAINT "student_assessments_strengths_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."student_assessments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "student_assessments_weaknesses" ADD CONSTRAINT "student_assessments_weaknesses_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."student_assessments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "student_assessments" ADD CONSTRAINT "student_assessments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_assessments" ADD CONSTRAINT "student_assessments_assessed_by_id_users_id_fk" FOREIGN KEY ("assessed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_tests_assignment_history" ADD CONSTRAINT "student_tests_assignment_history_tester_id_users_id_fk" FOREIGN KEY ("tester_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_tests_assignment_history" ADD CONSTRAINT "student_tests_assignment_history_assigned_by_id_users_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_tests_assignment_history" ADD CONSTRAINT "student_tests_assignment_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."student_tests"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "student_tests" ADD CONSTRAINT "student_tests_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_tests" ADD CONSTRAINT "student_tests_assigned_tester_id_users_id_fk" FOREIGN KEY ("assigned_tester_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_tests" ADD CONSTRAINT "student_tests_assigned_by_id_users_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_tests" ADD CONSTRAINT "student_tests_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_test_payments" ADD CONSTRAINT "student_test_payments_student_test_id_student_tests_id_fk" FOREIGN KEY ("student_test_id") REFERENCES "public"."student_tests"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_test_payments" ADD CONSTRAINT "student_test_payments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_test_payments" ADD CONSTRAINT "student_test_payments_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_test_reports_subject_results" ADD CONSTRAINT "student_test_reports_subject_results_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."student_test_reports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "student_test_reports" ADD CONSTRAINT "student_test_reports_student_test_id_student_tests_id_fk" FOREIGN KEY ("student_test_id") REFERENCES "public"."student_tests"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_test_reports" ADD CONSTRAINT "student_test_reports_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_test_reports" ADD CONSTRAINT "student_test_reports_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_test_report_shares" ADD CONSTRAINT "student_test_report_shares_student_test_id_student_tests_id_fk" FOREIGN KEY ("student_test_id") REFERENCES "public"."student_tests"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_test_report_shares" ADD CONSTRAINT "student_test_report_shares_report_id_student_test_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."student_test_reports"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_test_report_shares" ADD CONSTRAINT "student_test_report_shares_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_test_report_shares" ADD CONSTRAINT "student_test_report_shares_shared_by_id_users_id_fk" FOREIGN KEY ("shared_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "enquiry_tests_history" ADD CONSTRAINT "enquiry_tests_history_by_id_users_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "enquiry_tests_history" ADD CONSTRAINT "enquiry_tests_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."enquiry_tests"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "enquiry_tests" ADD CONSTRAINT "enquiry_tests_student_enquiry_id_student_enquiries_id_fk" FOREIGN KEY ("student_enquiry_id") REFERENCES "public"."student_enquiries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "enquiry_tests" ADD CONSTRAINT "enquiry_tests_tester_id_users_id_fk" FOREIGN KEY ("tester_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "enquiry_tests" ADD CONSTRAINT "enquiry_tests_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teaching_sessions" ADD CONSTRAINT "teaching_sessions_allocation_id_teacher_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."teacher_allocations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_payouts" ADD CONSTRAINT "teacher_payouts_allocation_id_teacher_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."teacher_allocations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_payouts" ADD CONSTRAINT "teacher_payouts_teacher_id_teacher_profiles_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher_profiles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_payouts" ADD CONSTRAINT "teacher_payouts_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "allocation_work" ADD CONSTRAINT "allocation_work_allocation_id_teacher_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."teacher_allocations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_documents" ADD CONSTRAINT "teacher_documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_enquiries" ADD CONSTRAINT "teacher_enquiries_aadhaar_document_id_teacher_documents_id_fk" FOREIGN KEY ("aadhaar_document_id") REFERENCES "public"."teacher_documents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_enquiries" ADD CONSTRAINT "teacher_enquiries_qualification_document_id_teacher_documents_id_fk" FOREIGN KEY ("qualification_document_id") REFERENCES "public"."teacher_documents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_enquiries" ADD CONSTRAINT "teacher_enquiries_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_enquiries" ADD CONSTRAINT "teacher_enquiries_teacher_user_id_users_id_fk" FOREIGN KEY ("teacher_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_enquiries" ADD CONSTRAINT "teacher_enquiries_teacher_profile_id_teacher_profiles_id_fk" FOREIGN KEY ("teacher_profile_id") REFERENCES "public"."teacher_profiles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_evaluations_revision_history" ADD CONSTRAINT "teacher_evaluations_revision_history_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_evaluations_revision_history" ADD CONSTRAINT "teacher_evaluations_revision_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."teacher_evaluations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "teacher_evaluations" ADD CONSTRAINT "teacher_evaluations_teacher_enquiry_id_teacher_enquiries_id_fk" FOREIGN KEY ("teacher_enquiry_id") REFERENCES "public"."teacher_enquiries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_evaluations" ADD CONSTRAINT "teacher_evaluations_written_test_recorded_by_id_users_id_fk" FOREIGN KEY ("written_test_recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_evaluations" ADD CONSTRAINT "teacher_evaluations_interview_recorded_by_id_users_id_fk" FOREIGN KEY ("interview_recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_evaluations" ADD CONSTRAINT "teacher_evaluations_evaluator_id_users_id_fk" FOREIGN KEY ("evaluator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_evaluations" ADD CONSTRAINT "teacher_evaluations_last_updated_by_id_users_id_fk" FOREIGN KEY ("last_updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_matches" ADD CONSTRAINT "teacher_matches_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_matches" ADD CONSTRAINT "teacher_matches_teacher_id_teacher_profiles_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher_profiles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_matches" ADD CONSTRAINT "teacher_matches_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_allocations_timetable" ADD CONSTRAINT "teacher_allocations_timetable_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."teacher_allocations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "teacher_allocations_status_history" ADD CONSTRAINT "teacher_allocations_status_history_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_allocations_status_history" ADD CONSTRAINT "teacher_allocations_status_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."teacher_allocations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "teacher_allocations" ADD CONSTRAINT "teacher_allocations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_allocations" ADD CONSTRAINT "teacher_allocations_teacher_id_teacher_profiles_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher_profiles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_allocations" ADD CONSTRAINT "teacher_allocations_allocated_by_id_users_id_fk" FOREIGN KEY ("allocated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "enquiry_audit_log" ADD CONSTRAINT "enquiry_audit_log_student_enquiry_id_student_enquiries_id_fk" FOREIGN KEY ("student_enquiry_id") REFERENCES "public"."student_enquiries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "enquiry_audit_log" ADD CONSTRAINT "enquiry_audit_log_teacher_enquiry_id_teacher_enquiries_id_fk" FOREIGN KEY ("teacher_enquiry_id") REFERENCES "public"."teacher_enquiries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "enquiry_audit_log" ADD CONSTRAINT "enquiry_audit_log_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_teacher_enquiry_id_teacher_enquiries_id_fk" FOREIGN KEY ("teacher_enquiry_id") REFERENCES "public"."teacher_enquiries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_evaluation_id_teacher_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."teacher_evaluations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_kyc_aadhaar_document_id_teacher_documents_id_fk" FOREIGN KEY ("kyc_aadhaar_document_id") REFERENCES "public"."teacher_documents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_kyc_qualification_document_id_teacher_documents_id_fk" FOREIGN KEY ("kyc_qualification_document_id") REFERENCES "public"."teacher_documents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payments_events" ADD CONSTRAINT "payments_events_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_teacher_enquiry_id_teacher_enquiries_id_fk" FOREIGN KEY ("teacher_enquiry_id") REFERENCES "public"."teacher_enquiries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_user_files_fk" FOREIGN KEY ("user_files_id") REFERENCES "public"."user_files"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_student_enquiries_fk" FOREIGN KEY ("student_enquiries_id") REFERENCES "public"."student_enquiries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_students_fk" FOREIGN KEY ("students_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_student_assessments_fk" FOREIGN KEY ("student_assessments_id") REFERENCES "public"."student_assessments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_student_tests_fk" FOREIGN KEY ("student_tests_id") REFERENCES "public"."student_tests"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_student_test_payments_fk" FOREIGN KEY ("student_test_payments_id") REFERENCES "public"."student_test_payments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_student_test_reports_fk" FOREIGN KEY ("student_test_reports_id") REFERENCES "public"."student_test_reports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_student_test_report_shares_fk" FOREIGN KEY ("student_test_report_shares_id") REFERENCES "public"."student_test_report_shares"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_enquiry_tests_fk" FOREIGN KEY ("enquiry_tests_id") REFERENCES "public"."enquiry_tests"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_teaching_sessions_fk" FOREIGN KEY ("teaching_sessions_id") REFERENCES "public"."teaching_sessions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_teacher_payouts_fk" FOREIGN KEY ("teacher_payouts_id") REFERENCES "public"."teacher_payouts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_push_subscriptions_fk" FOREIGN KEY ("push_subscriptions_id") REFERENCES "public"."push_subscriptions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_allocation_work_fk" FOREIGN KEY ("allocation_work_id") REFERENCES "public"."allocation_work"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_teacher_documents_fk" FOREIGN KEY ("teacher_documents_id") REFERENCES "public"."teacher_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_teacher_enquiries_fk" FOREIGN KEY ("teacher_enquiries_id") REFERENCES "public"."teacher_enquiries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_teacher_evaluations_fk" FOREIGN KEY ("teacher_evaluations_id") REFERENCES "public"."teacher_evaluations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_teacher_matches_fk" FOREIGN KEY ("teacher_matches_id") REFERENCES "public"."teacher_matches"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_teacher_allocations_fk" FOREIGN KEY ("teacher_allocations_id") REFERENCES "public"."teacher_allocations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_enquiry_audit_log_fk" FOREIGN KEY ("enquiry_audit_log_id") REFERENCES "public"."enquiry_audit_log"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_teacher_profiles_fk" FOREIGN KEY ("teacher_profiles_id") REFERENCES "public"."teacher_profiles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_email_logs_fk" FOREIGN KEY ("email_logs_id") REFERENCES "public"."email_logs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payments_fk" FOREIGN KEY ("payments_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "media_owner_idx" ON "media" USING btree ("owner_id");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "user_files_owner_idx" ON "user_files" USING btree ("owner_id");
  CREATE INDEX "user_files_updated_at_idx" ON "user_files" USING btree ("updated_at");
  CREATE INDEX "user_files_created_at_idx" ON "user_files" USING btree ("created_at");
  CREATE UNIQUE INDEX "user_files_filename_idx" ON "user_files" USING btree ("filename");
  CREATE INDEX "student_enquiries_subjects_order_idx" ON "student_enquiries_subjects" USING btree ("_order");
  CREATE INDEX "student_enquiries_subjects_parent_id_idx" ON "student_enquiries_subjects" USING btree ("_parent_id");
  CREATE INDEX "student_enquiries_phone_number_idx" ON "student_enquiries" USING btree ("phone_number");
  CREATE INDEX "student_enquiries_enquiry_source_idx" ON "student_enquiries" USING btree ("enquiry_source");
  CREATE INDEX "student_enquiries_enquiry_status_idx" ON "student_enquiries" USING btree ("enquiry_status");
  CREATE INDEX "student_enquiries_assigned_to_idx" ON "student_enquiries" USING btree ("assigned_to_id");
  CREATE INDEX "student_enquiries_test_scheduled_at_idx" ON "student_enquiries" USING btree ("test_scheduled_at");
  CREATE INDEX "student_enquiries_updated_at_idx" ON "student_enquiries" USING btree ("updated_at");
  CREATE INDEX "student_enquiries_created_at_idx" ON "student_enquiries" USING btree ("created_at");
  CREATE INDEX "students_subjects_order_idx" ON "students_subjects" USING btree ("_order");
  CREATE INDEX "students_subjects_parent_id_idx" ON "students_subjects" USING btree ("_parent_id");
  CREATE INDEX "students_name_idx" ON "students" USING btree ("name");
  CREATE INDEX "students_phone_number_idx" ON "students" USING btree ("phone_number");
  CREATE INDEX "students_student_class_idx" ON "students" USING btree ("student_class");
  CREATE INDEX "students_locality_idx" ON "students" USING btree ("locality");
  CREATE UNIQUE INDEX "students_student_enquiry_idx" ON "students" USING btree ("student_enquiry_id");
  CREATE INDEX "students_status_idx" ON "students" USING btree ("status");
  CREATE INDEX "students_converted_by_idx" ON "students" USING btree ("converted_by_id");
  CREATE INDEX "students_updated_at_idx" ON "students" USING btree ("updated_at");
  CREATE INDEX "students_created_at_idx" ON "students" USING btree ("created_at");
  CREATE INDEX "student_assessments_strengths_order_idx" ON "student_assessments_strengths" USING btree ("_order");
  CREATE INDEX "student_assessments_strengths_parent_id_idx" ON "student_assessments_strengths" USING btree ("_parent_id");
  CREATE INDEX "student_assessments_weaknesses_order_idx" ON "student_assessments_weaknesses" USING btree ("_order");
  CREATE INDEX "student_assessments_weaknesses_parent_id_idx" ON "student_assessments_weaknesses" USING btree ("_parent_id");
  CREATE INDEX "student_assessments_student_idx" ON "student_assessments" USING btree ("student_id");
  CREATE INDEX "student_assessments_assessment_type_idx" ON "student_assessments" USING btree ("assessment_type");
  CREATE INDEX "student_assessments_current_capability_idx" ON "student_assessments" USING btree ("current_capability");
  CREATE INDEX "student_assessments_assessed_by_idx" ON "student_assessments" USING btree ("assessed_by_id");
  CREATE INDEX "student_assessments_assessed_at_idx" ON "student_assessments" USING btree ("assessed_at");
  CREATE INDEX "student_assessments_updated_at_idx" ON "student_assessments" USING btree ("updated_at");
  CREATE INDEX "student_assessments_created_at_idx" ON "student_assessments" USING btree ("created_at");
  CREATE INDEX "student_tests_assignment_history_order_idx" ON "student_tests_assignment_history" USING btree ("_order");
  CREATE INDEX "student_tests_assignment_history_parent_id_idx" ON "student_tests_assignment_history" USING btree ("_parent_id");
  CREATE INDEX "student_tests_assignment_history_tester_idx" ON "student_tests_assignment_history" USING btree ("tester_id");
  CREATE INDEX "student_tests_assignment_history_assigned_by_idx" ON "student_tests_assignment_history" USING btree ("assigned_by_id");
  CREATE INDEX "student_tests_student_idx" ON "student_tests" USING btree ("student_id");
  CREATE INDEX "student_tests_scheduled_at_idx" ON "student_tests" USING btree ("scheduled_at");
  CREATE INDEX "student_tests_status_idx" ON "student_tests" USING btree ("status");
  CREATE INDEX "student_tests_payment_status_idx" ON "student_tests" USING btree ("payment_status");
  CREATE INDEX "student_tests_assigned_tester_idx" ON "student_tests" USING btree ("assigned_tester_id");
  CREATE INDEX "student_tests_assigned_by_idx" ON "student_tests" USING btree ("assigned_by_id");
  CREATE INDEX "student_tests_created_by_idx" ON "student_tests" USING btree ("created_by_id");
  CREATE INDEX "student_tests_updated_at_idx" ON "student_tests" USING btree ("updated_at");
  CREATE INDEX "student_tests_created_at_idx" ON "student_tests" USING btree ("created_at");
  CREATE INDEX "student_test_payments_student_test_idx" ON "student_test_payments" USING btree ("student_test_id");
  CREATE INDEX "student_test_payments_student_idx" ON "student_test_payments" USING btree ("student_id");
  CREATE INDEX "student_test_payments_payment_status_idx" ON "student_test_payments" USING btree ("payment_status");
  CREATE UNIQUE INDEX "student_test_payments_successful_payment_key_idx" ON "student_test_payments" USING btree ("successful_payment_key");
  CREATE INDEX "student_test_payments_recorded_by_idx" ON "student_test_payments" USING btree ("recorded_by_id");
  CREATE INDEX "student_test_payments_updated_at_idx" ON "student_test_payments" USING btree ("updated_at");
  CREATE INDEX "student_test_payments_created_at_idx" ON "student_test_payments" USING btree ("created_at");
  CREATE INDEX "student_test_reports_subject_results_order_idx" ON "student_test_reports_subject_results" USING btree ("_order");
  CREATE INDEX "student_test_reports_subject_results_parent_id_idx" ON "student_test_reports_subject_results" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "student_test_reports_student_test_idx" ON "student_test_reports" USING btree ("student_test_id");
  CREATE INDEX "student_test_reports_student_idx" ON "student_test_reports" USING btree ("student_id");
  CREATE INDEX "student_test_reports_submitted_by_idx" ON "student_test_reports" USING btree ("submitted_by_id");
  CREATE INDEX "student_test_reports_submitted_at_idx" ON "student_test_reports" USING btree ("submitted_at");
  CREATE INDEX "student_test_reports_updated_at_idx" ON "student_test_reports" USING btree ("updated_at");
  CREATE INDEX "student_test_reports_created_at_idx" ON "student_test_reports" USING btree ("created_at");
  CREATE INDEX "student_test_report_shares_student_test_idx" ON "student_test_report_shares" USING btree ("student_test_id");
  CREATE INDEX "student_test_report_shares_report_idx" ON "student_test_report_shares" USING btree ("report_id");
  CREATE INDEX "student_test_report_shares_student_idx" ON "student_test_report_shares" USING btree ("student_id");
  CREATE INDEX "student_test_report_shares_shared_by_idx" ON "student_test_report_shares" USING btree ("shared_by_id");
  CREATE INDEX "student_test_report_shares_shared_at_idx" ON "student_test_report_shares" USING btree ("shared_at");
  CREATE INDEX "student_test_report_shares_updated_at_idx" ON "student_test_report_shares" USING btree ("updated_at");
  CREATE INDEX "student_test_report_shares_created_at_idx" ON "student_test_report_shares" USING btree ("created_at");
  CREATE INDEX "enquiry_tests_history_order_idx" ON "enquiry_tests_history" USING btree ("_order");
  CREATE INDEX "enquiry_tests_history_parent_id_idx" ON "enquiry_tests_history" USING btree ("_parent_id");
  CREATE INDEX "enquiry_tests_history_by_idx" ON "enquiry_tests_history" USING btree ("by_id");
  CREATE INDEX "enquiry_tests_student_enquiry_idx" ON "enquiry_tests" USING btree ("student_enquiry_id");
  CREATE INDEX "enquiry_tests_mode_idx" ON "enquiry_tests" USING btree ("mode");
  CREATE INDEX "enquiry_tests_status_idx" ON "enquiry_tests" USING btree ("status");
  CREATE INDEX "enquiry_tests_tester_idx" ON "enquiry_tests" USING btree ("tester_id");
  CREATE INDEX "enquiry_tests_scheduled_at_idx" ON "enquiry_tests" USING btree ("scheduled_at");
  CREATE INDEX "enquiry_tests_created_by_idx" ON "enquiry_tests" USING btree ("created_by_id");
  CREATE INDEX "enquiry_tests_updated_at_idx" ON "enquiry_tests" USING btree ("updated_at");
  CREATE INDEX "enquiry_tests_created_at_idx" ON "enquiry_tests" USING btree ("created_at");
  CREATE INDEX "teaching_sessions_allocation_idx" ON "teaching_sessions" USING btree ("allocation_id");
  CREATE INDEX "teaching_sessions_day_idx" ON "teaching_sessions" USING btree ("day");
  CREATE INDEX "teaching_sessions_status_idx" ON "teaching_sessions" USING btree ("status");
  CREATE INDEX "teaching_sessions_updated_at_idx" ON "teaching_sessions" USING btree ("updated_at");
  CREATE INDEX "teaching_sessions_created_at_idx" ON "teaching_sessions" USING btree ("created_at");
  CREATE INDEX "teacher_payouts_allocation_idx" ON "teacher_payouts" USING btree ("allocation_id");
  CREATE INDEX "teacher_payouts_teacher_idx" ON "teacher_payouts" USING btree ("teacher_id");
  CREATE INDEX "teacher_payouts_month_idx" ON "teacher_payouts" USING btree ("month");
  CREATE INDEX "teacher_payouts_recorded_by_idx" ON "teacher_payouts" USING btree ("recorded_by_id");
  CREATE INDEX "teacher_payouts_updated_at_idx" ON "teacher_payouts" USING btree ("updated_at");
  CREATE INDEX "teacher_payouts_created_at_idx" ON "teacher_payouts" USING btree ("created_at");
  CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");
  CREATE UNIQUE INDEX "push_subscriptions_endpoint_idx" ON "push_subscriptions" USING btree ("endpoint");
  CREATE INDEX "push_subscriptions_updated_at_idx" ON "push_subscriptions" USING btree ("updated_at");
  CREATE INDEX "push_subscriptions_created_at_idx" ON "push_subscriptions" USING btree ("created_at");
  CREATE INDEX "allocation_work_allocation_idx" ON "allocation_work" USING btree ("allocation_id");
  CREATE INDEX "allocation_work_status_idx" ON "allocation_work" USING btree ("status");
  CREATE INDEX "allocation_work_updated_at_idx" ON "allocation_work" USING btree ("updated_at");
  CREATE INDEX "allocation_work_created_at_idx" ON "allocation_work" USING btree ("created_at");
  CREATE INDEX "teacher_documents_owner_idx" ON "teacher_documents" USING btree ("owner_id");
  CREATE INDEX "teacher_documents_updated_at_idx" ON "teacher_documents" USING btree ("updated_at");
  CREATE INDEX "teacher_documents_created_at_idx" ON "teacher_documents" USING btree ("created_at");
  CREATE UNIQUE INDEX "teacher_documents_filename_idx" ON "teacher_documents" USING btree ("filename");
  CREATE INDEX "teacher_enquiries_aadhaar_document_idx" ON "teacher_enquiries" USING btree ("aadhaar_document_id");
  CREATE INDEX "teacher_enquiries_qualification_document_idx" ON "teacher_enquiries" USING btree ("qualification_document_id");
  CREATE INDEX "teacher_enquiries_reviewed_by_idx" ON "teacher_enquiries" USING btree ("reviewed_by_id");
  CREATE INDEX "teacher_enquiries_teacher_user_idx" ON "teacher_enquiries" USING btree ("teacher_user_id");
  CREATE INDEX "teacher_enquiries_teacher_profile_idx" ON "teacher_enquiries" USING btree ("teacher_profile_id");
  CREATE INDEX "teacher_enquiries_updated_at_idx" ON "teacher_enquiries" USING btree ("updated_at");
  CREATE INDEX "teacher_enquiries_created_at_idx" ON "teacher_enquiries" USING btree ("created_at");
  CREATE INDEX "teacher_evaluations_revision_history_order_idx" ON "teacher_evaluations_revision_history" USING btree ("_order");
  CREATE INDEX "teacher_evaluations_revision_history_parent_id_idx" ON "teacher_evaluations_revision_history" USING btree ("_parent_id");
  CREATE INDEX "teacher_evaluations_revision_history_changed_by_idx" ON "teacher_evaluations_revision_history" USING btree ("changed_by_id");
  CREATE INDEX "teacher_evaluations_teacher_enquiry_idx" ON "teacher_evaluations" USING btree ("teacher_enquiry_id");
  CREATE INDEX "teacher_evaluations_evaluation_status_idx" ON "teacher_evaluations" USING btree ("evaluation_status");
  CREATE INDEX "teacher_evaluations_written_test_written_test_recorded_b_idx" ON "teacher_evaluations" USING btree ("written_test_recorded_by_id");
  CREATE INDEX "teacher_evaluations_interview_interview_recorded_by_idx" ON "teacher_evaluations" USING btree ("interview_recorded_by_id");
  CREATE INDEX "teacher_evaluations_quality_score_idx" ON "teacher_evaluations" USING btree ("quality_score");
  CREATE INDEX "teacher_evaluations_evaluator_idx" ON "teacher_evaluations" USING btree ("evaluator_id");
  CREATE INDEX "teacher_evaluations_evaluated_at_idx" ON "teacher_evaluations" USING btree ("evaluated_at");
  CREATE INDEX "teacher_evaluations_completed_at_idx" ON "teacher_evaluations" USING btree ("completed_at");
  CREATE INDEX "teacher_evaluations_last_updated_by_idx" ON "teacher_evaluations" USING btree ("last_updated_by_id");
  CREATE INDEX "teacher_evaluations_updated_at_idx" ON "teacher_evaluations" USING btree ("updated_at");
  CREATE INDEX "teacher_evaluations_created_at_idx" ON "teacher_evaluations" USING btree ("created_at");
  CREATE UNIQUE INDEX "teacherEnquiry_attemptNumber_idx" ON "teacher_evaluations" USING btree ("teacher_enquiry_id","attempt_number");
  CREATE INDEX "teacher_matches_student_idx" ON "teacher_matches" USING btree ("student_id");
  CREATE INDEX "teacher_matches_teacher_idx" ON "teacher_matches" USING btree ("teacher_id");
  CREATE INDEX "teacher_matches_match_status_idx" ON "teacher_matches" USING btree ("match_status");
  CREATE INDEX "teacher_matches_created_by_idx" ON "teacher_matches" USING btree ("created_by_id");
  CREATE INDEX "teacher_matches_updated_at_idx" ON "teacher_matches" USING btree ("updated_at");
  CREATE INDEX "teacher_matches_created_at_idx" ON "teacher_matches" USING btree ("created_at");
  CREATE INDEX "teacher_allocations_timetable_order_idx" ON "teacher_allocations_timetable" USING btree ("_order");
  CREATE INDEX "teacher_allocations_timetable_parent_id_idx" ON "teacher_allocations_timetable" USING btree ("_parent_id");
  CREATE INDEX "teacher_allocations_status_history_order_idx" ON "teacher_allocations_status_history" USING btree ("_order");
  CREATE INDEX "teacher_allocations_status_history_parent_id_idx" ON "teacher_allocations_status_history" USING btree ("_parent_id");
  CREATE INDEX "teacher_allocations_status_history_changed_by_idx" ON "teacher_allocations_status_history" USING btree ("changed_by_id");
  CREATE INDEX "teacher_allocations_student_idx" ON "teacher_allocations" USING btree ("student_id");
  CREATE INDEX "teacher_allocations_teacher_idx" ON "teacher_allocations" USING btree ("teacher_id");
  CREATE INDEX "teacher_allocations_status_idx" ON "teacher_allocations" USING btree ("status");
  CREATE INDEX "teacher_allocations_allocated_by_idx" ON "teacher_allocations" USING btree ("allocated_by_id");
  CREATE UNIQUE INDEX "teacher_allocations_active_key_idx" ON "teacher_allocations" USING btree ("active_key");
  CREATE INDEX "teacher_allocations_updated_at_idx" ON "teacher_allocations" USING btree ("updated_at");
  CREATE INDEX "teacher_allocations_created_at_idx" ON "teacher_allocations" USING btree ("created_at");
  CREATE INDEX "enquiry_audit_log_enquiry_type_idx" ON "enquiry_audit_log" USING btree ("enquiry_type");
  CREATE INDEX "enquiry_audit_log_student_enquiry_idx" ON "enquiry_audit_log" USING btree ("student_enquiry_id");
  CREATE INDEX "enquiry_audit_log_teacher_enquiry_idx" ON "enquiry_audit_log" USING btree ("teacher_enquiry_id");
  CREATE INDEX "enquiry_audit_log_changed_by_idx" ON "enquiry_audit_log" USING btree ("changed_by_id");
  CREATE INDEX "enquiry_audit_log_changed_at_idx" ON "enquiry_audit_log" USING btree ("changed_at");
  CREATE INDEX "enquiry_audit_log_updated_at_idx" ON "enquiry_audit_log" USING btree ("updated_at");
  CREATE INDEX "enquiry_audit_log_created_at_idx" ON "enquiry_audit_log" USING btree ("created_at");
  CREATE INDEX "teacher_profiles_teacher_enquiry_idx" ON "teacher_profiles" USING btree ("teacher_enquiry_id");
  CREATE UNIQUE INDEX "teacher_profiles_user_idx" ON "teacher_profiles" USING btree ("user_id");
  CREATE INDEX "teacher_profiles_evaluation_idx" ON "teacher_profiles" USING btree ("evaluation_id");
  CREATE INDEX "teacher_profiles_evaluation_score_idx" ON "teacher_profiles" USING btree ("evaluation_score");
  CREATE INDEX "teacher_profiles_availability_status_idx" ON "teacher_profiles" USING btree ("availability_status");
  CREATE INDEX "teacher_profiles_approved_by_idx" ON "teacher_profiles" USING btree ("approved_by_id");
  CREATE INDEX "teacher_profiles_kyc_kyc_aadhaar_document_idx" ON "teacher_profiles" USING btree ("kyc_aadhaar_document_id");
  CREATE INDEX "teacher_profiles_kyc_kyc_qualification_document_idx" ON "teacher_profiles" USING btree ("kyc_qualification_document_id");
  CREATE INDEX "teacher_profiles_updated_at_idx" ON "teacher_profiles" USING btree ("updated_at");
  CREATE INDEX "teacher_profiles_created_at_idx" ON "teacher_profiles" USING btree ("created_at");
  CREATE INDEX "email_logs_recipient_idx" ON "email_logs" USING btree ("recipient");
  CREATE INDEX "email_logs_template_idx" ON "email_logs" USING btree ("template");
  CREATE INDEX "email_logs_status_idx" ON "email_logs" USING btree ("status");
  CREATE INDEX "email_logs_related_type_idx" ON "email_logs" USING btree ("related_type");
  CREATE INDEX "email_logs_related_id_idx" ON "email_logs" USING btree ("related_id");
  CREATE INDEX "email_logs_dedupe_key_idx" ON "email_logs" USING btree ("dedupe_key");
  CREATE INDEX "email_logs_updated_at_idx" ON "email_logs" USING btree ("updated_at");
  CREATE INDEX "email_logs_created_at_idx" ON "email_logs" USING btree ("created_at");
  CREATE INDEX "payments_events_order_idx" ON "payments_events" USING btree ("_order");
  CREATE INDEX "payments_events_parent_id_idx" ON "payments_events" USING btree ("_parent_id");
  CREATE INDEX "payments_category_idx" ON "payments" USING btree ("category");
  CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");
  CREATE INDEX "payments_mode_idx" ON "payments" USING btree ("mode");
  CREATE UNIQUE INDEX "payments_razorpay_order_id_idx" ON "payments" USING btree ("razorpay_order_id");
  CREATE INDEX "payments_razorpay_payment_id_idx" ON "payments" USING btree ("razorpay_payment_id");
  CREATE INDEX "payments_payer_user_idx" ON "payments" USING btree ("payer_user_id");
  CREATE INDEX "payments_teacher_enquiry_idx" ON "payments" USING btree ("teacher_enquiry_id");
  CREATE INDEX "payments_paid_at_idx" ON "payments" USING btree ("paid_at");
  CREATE INDEX "payments_updated_at_idx" ON "payments" USING btree ("updated_at");
  CREATE INDEX "payments_created_at_idx" ON "payments" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_user_files_id_idx" ON "payload_locked_documents_rels" USING btree ("user_files_id");
  CREATE INDEX "payload_locked_documents_rels_student_enquiries_id_idx" ON "payload_locked_documents_rels" USING btree ("student_enquiries_id");
  CREATE INDEX "payload_locked_documents_rels_students_id_idx" ON "payload_locked_documents_rels" USING btree ("students_id");
  CREATE INDEX "payload_locked_documents_rels_student_assessments_id_idx" ON "payload_locked_documents_rels" USING btree ("student_assessments_id");
  CREATE INDEX "payload_locked_documents_rels_student_tests_id_idx" ON "payload_locked_documents_rels" USING btree ("student_tests_id");
  CREATE INDEX "payload_locked_documents_rels_student_test_payments_id_idx" ON "payload_locked_documents_rels" USING btree ("student_test_payments_id");
  CREATE INDEX "payload_locked_documents_rels_student_test_reports_id_idx" ON "payload_locked_documents_rels" USING btree ("student_test_reports_id");
  CREATE INDEX "payload_locked_documents_rels_student_test_report_shares_idx" ON "payload_locked_documents_rels" USING btree ("student_test_report_shares_id");
  CREATE INDEX "payload_locked_documents_rels_enquiry_tests_id_idx" ON "payload_locked_documents_rels" USING btree ("enquiry_tests_id");
  CREATE INDEX "payload_locked_documents_rels_teaching_sessions_id_idx" ON "payload_locked_documents_rels" USING btree ("teaching_sessions_id");
  CREATE INDEX "payload_locked_documents_rels_teacher_payouts_id_idx" ON "payload_locked_documents_rels" USING btree ("teacher_payouts_id");
  CREATE INDEX "payload_locked_documents_rels_push_subscriptions_id_idx" ON "payload_locked_documents_rels" USING btree ("push_subscriptions_id");
  CREATE INDEX "payload_locked_documents_rels_allocation_work_id_idx" ON "payload_locked_documents_rels" USING btree ("allocation_work_id");
  CREATE INDEX "payload_locked_documents_rels_teacher_documents_id_idx" ON "payload_locked_documents_rels" USING btree ("teacher_documents_id");
  CREATE INDEX "payload_locked_documents_rels_teacher_enquiries_id_idx" ON "payload_locked_documents_rels" USING btree ("teacher_enquiries_id");
  CREATE INDEX "payload_locked_documents_rels_teacher_evaluations_id_idx" ON "payload_locked_documents_rels" USING btree ("teacher_evaluations_id");
  CREATE INDEX "payload_locked_documents_rels_teacher_matches_id_idx" ON "payload_locked_documents_rels" USING btree ("teacher_matches_id");
  CREATE INDEX "payload_locked_documents_rels_teacher_allocations_id_idx" ON "payload_locked_documents_rels" USING btree ("teacher_allocations_id");
  CREATE INDEX "payload_locked_documents_rels_enquiry_audit_log_id_idx" ON "payload_locked_documents_rels" USING btree ("enquiry_audit_log_id");
  CREATE INDEX "payload_locked_documents_rels_teacher_profiles_id_idx" ON "payload_locked_documents_rels" USING btree ("teacher_profiles_id");
  CREATE INDEX "payload_locked_documents_rels_email_logs_id_idx" ON "payload_locked_documents_rels" USING btree ("email_logs_id");
  CREATE INDEX "payload_locked_documents_rels_payments_id_idx" ON "payload_locked_documents_rels" USING btree ("payments_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "user_files" CASCADE;
  DROP TABLE "student_enquiries_subjects" CASCADE;
  DROP TABLE "student_enquiries" CASCADE;
  DROP TABLE "students_subjects" CASCADE;
  DROP TABLE "students" CASCADE;
  DROP TABLE "student_assessments_strengths" CASCADE;
  DROP TABLE "student_assessments_weaknesses" CASCADE;
  DROP TABLE "student_assessments" CASCADE;
  DROP TABLE "student_tests_assignment_history" CASCADE;
  DROP TABLE "student_tests" CASCADE;
  DROP TABLE "student_test_payments" CASCADE;
  DROP TABLE "student_test_reports_subject_results" CASCADE;
  DROP TABLE "student_test_reports" CASCADE;
  DROP TABLE "student_test_report_shares" CASCADE;
  DROP TABLE "enquiry_tests_history" CASCADE;
  DROP TABLE "enquiry_tests" CASCADE;
  DROP TABLE "teaching_sessions" CASCADE;
  DROP TABLE "teacher_payouts" CASCADE;
  DROP TABLE "push_subscriptions" CASCADE;
  DROP TABLE "allocation_work" CASCADE;
  DROP TABLE "teacher_documents" CASCADE;
  DROP TABLE "teacher_enquiries" CASCADE;
  DROP TABLE "teacher_evaluations_revision_history" CASCADE;
  DROP TABLE "teacher_evaluations" CASCADE;
  DROP TABLE "teacher_matches" CASCADE;
  DROP TABLE "teacher_allocations_timetable" CASCADE;
  DROP TABLE "teacher_allocations_status_history" CASCADE;
  DROP TABLE "teacher_allocations" CASCADE;
  DROP TABLE "enquiry_audit_log" CASCADE;
  DROP TABLE "teacher_profiles" CASCADE;
  DROP TABLE "email_logs" CASCADE;
  DROP TABLE "payments_events" CASCADE;
  DROP TABLE "payments" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TABLE "teacher_evaluation_config" CASCADE;
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_users_gender";
  DROP TYPE "public"."enum_users_status";
  DROP TYPE "public"."enum_media_kind";
  DROP TYPE "public"."enum_student_enquiries_student_gender";
  DROP TYPE "public"."enum_student_enquiries_preferred_teacher_gender";
  DROP TYPE "public"."enum_student_enquiries_enquiry_source";
  DROP TYPE "public"."enum_student_enquiries_enquiry_status";
  DROP TYPE "public"."enum_student_enquiries_test_mode";
  DROP TYPE "public"."enum_students_student_gender";
  DROP TYPE "public"."enum_students_preferred_teacher_gender";
  DROP TYPE "public"."enum_students_status";
  DROP TYPE "public"."enum_student_assessments_current_capability";
  DROP TYPE "public"."enum_student_tests_status";
  DROP TYPE "public"."enum_student_tests_payment_status";
  DROP TYPE "public"."enum_student_test_payments_payment_method";
  DROP TYPE "public"."enum_student_test_payments_payment_status";
  DROP TYPE "public"."enum_student_test_reports_capability";
  DROP TYPE "public"."enum_student_test_report_shares_channel";
  DROP TYPE "public"."enum_student_test_report_shares_status";
  DROP TYPE "public"."enum_enquiry_tests_mode";
  DROP TYPE "public"."enum_enquiry_tests_status";
  DROP TYPE "public"."enum_enquiry_tests_payment_status";
  DROP TYPE "public"."enum_teaching_sessions_status";
  DROP TYPE "public"."enum_allocation_work_kind";
  DROP TYPE "public"."enum_allocation_work_status";
  DROP TYPE "public"."enum_teacher_enquiries_gender";
  DROP TYPE "public"."enum_teacher_enquiries_application_status";
  DROP TYPE "public"."enum_teacher_enquiries_teacher_availability";
  DROP TYPE "public"."enum_teacher_enquiries_rejection_category";
  DROP TYPE "public"."enum_teacher_enquiries_registration_fee_status";
  DROP TYPE "public"."enum_teacher_enquiries_registration_fee_payment_method";
  DROP TYPE "public"."enum_teacher_enquiries_credentials_email_status";
  DROP TYPE "public"."enum_teacher_evaluations_revision_history_previous_status";
  DROP TYPE "public"."enum_teacher_evaluations_revision_history_new_status";
  DROP TYPE "public"."enum_teacher_evaluations_evaluation_status";
  DROP TYPE "public"."enum_teacher_matches_match_status";
  DROP TYPE "public"."enum_teacher_allocations_timetable_day";
  DROP TYPE "public"."enum_teacher_allocations_status";
  DROP TYPE "public"."enum_enquiry_audit_log_enquiry_type";
  DROP TYPE "public"."enum_enquiry_audit_log_field_changed";
  DROP TYPE "public"."enum_teacher_profiles_gender";
  DROP TYPE "public"."enum_teacher_profiles_availability_status";
  DROP TYPE "public"."enum_teacher_profiles_approval_status";
  DROP TYPE "public"."enum_teacher_profiles_registration_fee_status";
  DROP TYPE "public"."enum_teacher_profiles_kyc_status";
  DROP TYPE "public"."enum_teacher_profiles_student_allocation_status";
  DROP TYPE "public"."enum_teacher_profiles_account_status";
  DROP TYPE "public"."enum_email_logs_status";
  DROP TYPE "public"."enum_payments_category";
  DROP TYPE "public"."enum_payments_status";
  DROP TYPE "public"."enum_payments_mode";`)
}
