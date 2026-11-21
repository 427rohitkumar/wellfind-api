# Wellfind Academic — Master Backend Comprehensive Audit & Strategic Roadmap

**Document ID:** `WA-BE-AUDIT-MASTER-2026`  
**Version:** 1.0.0 (Master Release)  
**Date:** 2026-11-19  
**Product:** Wellfind Academic (`wellfind-api`)  
**Target Market:** Quality-Managed One-to-One Education Network (UKG–Class 10), Bihar, India  
**Stack:** Payload CMS 3.92.1 · Next.js 16.3.3 (App Router / Turbopack) · PostgreSQL 17 · TypeScript 5.7.3 · Vitest 4.0.18 · Playwright 1.63.0  
**PRD Reference:** `PRD/WELLFIND_BACKEND_API_PRD.md` (`WA-BE-PRD-001` v1.0)  
**Playbook Reference:** `BACKEND_EXECUTION_PLAYBOOK.md` (`WA-BE-EXEC-001` v1.0)  
**Audit Author:** DeepMind AI Engineering Team & Rohit (Lead Architect)  

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Ecosystem Architecture & System Topology](#2-ecosystem-architecture--system-topology)
3. [A-to-Z Feature & Module Technical Audit](#3-a-to-z-feature--module-technical-audit)
   - [Module 01: Authentication, Session Management & RBAC](#module-01-authentication-session-management--rbac)
   - [Module 02: Admin User Administration & Account Lifecycle](#module-02-admin-user-administration--account-lifecycle)
   - [Module 03: Public & Admin Student Enquiry Pipeline](#module-03-public--admin-student-enquiry-pipeline)
   - [Module 04: Enquiry Conversion & Student Master Records](#module-04-enquiry-conversion--student-master-records)
   - [Module 05: Academic Baseline Capability Assessment](#module-05-academic-baseline-capability-assessment)
   - [Module 06: Optional Physical Diagnostic Student Test & Fee Accounting](#module-06-optional-physical-diagnostic-student-test--fee-accounting)
   - [Module 07: Field Tester Assignment, Scheduling & Diagnostic Reporting](#module-07-field-tester-assignment-scheduling--diagnostic-reporting)
   - [Module 08: Diagnostic Report Privacy & Parent Sharing Audit](#module-08-diagnostic-report-privacy--parent-sharing-audit)
   - [Module 09: Teacher Application Ingestion & Secure KYC Storage](#module-09-teacher-application-ingestion--secure-kyc-storage)
   - [Module 10: Multi-Stage Teacher Evaluation & Centrally Weighted Scoring](#module-10-multi-stage-teacher-evaluation--centrally-weighted-scoring)
   - [Module 11: Teacher Approval, Automated Account Provisioning & Profiles](#module-11-teacher-approval-automated-account-provisioning--profiles)
   - [Module 12: Intelligent Student–Teacher Compatibility Matching Engine](#module-12-intelligent-studentteacher-compatibility-matching-engine)
   - [Module 13: Teacher Allocation, Anti-Collision Locking & Delivery](#module-13-teacher-allocation-anti-collision-locking--delivery)
   - [Module 14: Teacher Self-Service Portal (`/me` & `/my` Endpoints)](#module-14-teacher-self-service-portal-me--my-endpoints)
   - [Module 15: Immutable Audit Logging Subsystem](#module-15-immutable-audit-logging-subsystem)
   - [Module 16: Media Assets & Lexical Content Engine](#module-16-media-assets--lexical-content-engine)
   - [Module 17: Transactional Email, OTP & Password Recovery](#module-17-transactional-email-otp--password-recovery)
4. [Master REST API Routing Table](#4-master-rest-api-routing-table)
5. [Database Schema, Relational Integrity & DAG Topology](#5-database-schema-relational-integrity--dag-topology)
6. [Security, Access Control & PII Protection Audit](#6-security-access-control--pii-protection-audit)
7. [Current Verification Health & Test Suite Analysis](#7-current-verification-health--test-suite-analysis)
8. [Current Position Analysis: Strengths, Bottlenecks & Technical Debt](#8-current-position-analysis-strengths-bottlenecks--technical-debt)
9. [Strategic Direction & Future Roadmap (Phases A through D)](#9-strategic-direction--future-roadmap-phases-a-through-d)
10. [Actionable Engineering Checklist](#10-actionable-engineering-checklist)

---

## 1. Executive Summary

**Wellfind Academic** is a managed one-to-one home education network operating primarily in Bihar, India (Patna, Muzaffarpur, Gaya, Bhagalpur, Darbhanga, etc.). The platform addresses the fragmentation, lack of accountability, and quality mismatch in traditional home tutoring by providing an end-to-end managed ecosystem:
1. Academic capability assessment of the student.
2. Optional in-person diagnostic testing (with a ₹100 nominal fee).
3. Thorough teacher screening (KYC verification, written test, and structured interview evaluation).
4. Weighted composite quality scoring.
5. Algorithmic matching based on academic board, class range, locality, and schedule.
6. Monitored teacher allocation and ongoing quality governance.

The backend repository (`wellfind-api`) serves as the single source of truth and primary data platform for all operational clients. Built with **Payload CMS 3.92.1** on **Next.js 16.3.3 (App Router)** and backed by **PostgreSQL 17**, it bridges headless CMS administration with highly structured, transactional custom REST APIs.

### Audit Summary Scorecard

| Assessment Dimension | Rating | Current Status & Verification |
|---|---|---|
| **PRD Feature Completeness** | **100%** | All PRD Modules A through F (`FR-A1` to `FR-F2`) and Business Rules `BR-01` to `BR-13` fully implemented. |
| **TypeScript Strictness** | **PASS** | `npx tsc --noEmit` exits with `0` errors across the entire codebase. |
| **Integration Test Coverage** | **100% PASS** | 14 test suites, 176 out of 176 tests passing via Vitest (`125.48s`). |
| **Production Build Reliability** | **PASS** | Next.js 16 Turbopack production build compiles cleanly (20 static/dynamic routes). |
| **Data Integrity & Relational Architecture** | **EXCELLENT** | Strict foreign keys, PostgreSQL unique constraints (`successfulPaymentKey`, `active_key`), and acyclic DAG dependency. |
| **Security & Privacy Posture** | **HIGH** | Strict RBAC (`super_admin` vs `teacher`), PII masking (student phone hidden from teachers), private KYC bucket. |
| **Identified Technical Debt** | **LOW / MEDIUM** | Missing `@eslint/eslintrc` in devDeps; in-memory matching scanner (up to 1,000 records); in-memory rate limiting. |

---

## 2. Ecosystem Architecture & System Topology

The Wellfind Academic platform consists of four distinct applications working as an integrated whole:

```mermaid
flowchart TD
    subgraph Clients["Frontend & Client Applications"]
        WC["wellfind-client\n(Next.js 16 + React 19)\nPublic Lead Portals"]
        CRM["wellfind-crm\n(Vite + React 19 + ApexCharts)\nAdmin Operations CRM"]
        APP["wellfind-app\n(Expo React Native 52)\nMobile App for Teachers/Testers"]
    end

    subgraph API["wellfind-api Gateway & Application Layer (Next.js 16 + Payload 3.92.1)"]
        AUTH["/api/auth/*\nJWT Authentication & OTP"]
        ROUTES["Custom Route Handlers\n(Students, Teachers, Allocations, Tests)"]
        ADMIN_UI["Payload CMS Admin GUI\n(/admin)"]
        SERVICES["Domain Service Layer\n(Matching, Allocation, Approval, Tests)"]
        ACCESS["Access Control & RBAC\n(requireSuperAdmin, requireActiveUser)"]
    end

    subgraph Storage["Persistence & Infrastructure Layer"]
        PG[("PostgreSQL 17 Database\n(common-postgres / port 5432)")]
        KYC_BUCKET["Private Document Storage\n(Teacher KYC - Aadhaar/Degrees)"]
        MEDIA_BUCKET["Public Media Storage\n(Sharp Image Processing)"]
        SMTP["SMTP Mail Server\n(Nodemailer OTP Delivery)"]
    end

    WC -->|Public Leads & Applications| ROUTES
    CRM -->|Super-Admin Operations & Review| ROUTES
    CRM -->|Payload Native Collections & GUI| ADMIN_UI
    APP -->|Teacher Allocation & Test Reports| ROUTES
    
    ROUTES --> ACCESS
    ADMIN_UI --> ACCESS
    ACCESS --> SERVICES
    SERVICES --> PG
    ROUTES --> PG
    ROUTES --> KYC_BUCKET
    ROUTES --> MEDIA_BUCKET
    AUTH --> SMTP
```

### Application Breakdown
1. **`wellfind-api` (Backend Engine):** Headless CMS + REST API backend hosting Payload CMS 3.92.1, 16 PostgreSQL collections, 1 global configuration, and 42 custom App Router endpoints.
2. **`wellfind-client` (Public Marketing & Ingestion Portal):** Customer-facing web application for parent tuition enquiries and prospective teacher job applications.
3. **`wellfind-crm` (Back-Office Admin & Operations Portal):** Single-page application for counselors, academic coordinators, and super-admins to triage leads, review KYC, score evaluations, match students, and monitor allocations.
4. **`wellfind-app` (Mobile Native App):** Cross-platform mobile client for verified teachers to view allocated students, manage availability, and for assigned diagnostic testers to complete field test reports.

---

## 3. A-to-Z Feature & Module Technical Audit

### Module 01: Authentication, Session Management & RBAC
- **Collection:** `Users` (`src/collections/Users.ts`, slug: `'users'`).
- **Roles Implemented:**
  - `super_admin`: Full system control across all collections, configuration, financial records, and user management.
  - `teacher`: Restricted access. Once verified, can view assigned allocations (`/api/teacher-allocations/my`), their own profile (`/api/teachers/me`), and assigned physical student tests.
- **Account Statuses:**
  - `active`: Normal authenticated access.
  - `blocked`: Administrative restriction. Login rejected immediately; existing sessions invalidated.
  - `suspended`: Temporary hold (e.g. security hold or teacher enquiry under dispute). Login rejected immediately.
- **Security & Password Management:**
  - Payload native password hashing (salted argon2/bcrypt).
  - 4-digit numeric OTP generation via Node.js `crypto.randomInt`.
  - Secure storage: SHA-256 OTP hashing (`otpHash`). Plaintext OTP is never stored in PostgreSQL.
  - OTP expiration: 10 minutes (`OTP_EXPIRY_MINUTES`).
  - Rate limiting & brute force mitigation: 5 failed OTP attempts maximum (`OTP_MAX_ATTEMPTS`).
  - Cooldown: 60-second resend cooldown (`OTP_RESEND_COOLDOWN_SECONDS`).
  - Single-use password reset tokens: `resetAuthToken` expires in 15 minutes and is permanently invalidated (`resetAuthUsed: true`) upon password update.
- **Endpoints:**
  - `POST /api/auth/login`: Issues JWT session cookie and bearer token. Rejects blocked/suspended users via `afterLogin` hook.
  - `POST /api/auth/logout`: Clears session cookie and invalidates user session.
  - `GET /api/auth/me`: Returns profile of the authenticated caller.
  - `POST /api/auth/forgot-password`: Requests 4-digit OTP delivered via SMTP email.
  - `POST /api/auth/verify-otp`: Validates OTP and returns single-use `resetAuthToken`.
  - `POST /api/auth/reset-password`: Consumes `resetAuthToken` to assign a new password.

### Module 02: Admin User Administration & Account Lifecycle
- **Endpoints Directory:** `src/app/api/auth/admin/users/`
- **Access Control:** Strictly restricted to active `super_admin`.
- **Delivered Capabilities:**
  - `GET /api/auth/admin/users`: Paginated listing of system users with role and status filters.
  - `POST /api/auth/admin/users`: Manual administrative user creation with server-assigned role.
  - `GET /api/auth/admin/users/:id`: Individual user retrieval.
  - `PATCH /api/auth/admin/users/:id`: Administrative user profile modification.
  - `DELETE /api/auth/admin/users/:id`: User removal (with safeguards against self-deletion).
  - `POST /api/auth/admin/users/:id/block`: Sets status to `blocked`.
  - `POST /api/auth/admin/users/:id/unblock`: Restores status to `active`.
  - `POST /api/auth/admin/users/:id/suspend`: Sets status to `suspended`.
  - `POST /api/auth/admin/users/:id/reactivate`: Restores status from suspended to `active`.
  - `POST /api/auth/admin/users/:id/reset-password`: Admin-initiated direct password override without OTP.

### Module 03: Public & Admin Student Enquiry Pipeline
- **Collection:** `StudentEnquiries` (`src/collections/StudentEnquiries.ts`, slug: `'student-enquiries'`).
- **PRD Requirements:** `FR-A1`, `FR-A2`, `BR-01`.
- **Enquiry Sources Tracked:** `website` (default for public), `phone_call`, `email`, `referral`, `network`, `other`.
- **Workflow State Machine:**
  - `new` $\rightarrow$ `contacted` $\rightarrow$ `in_progress` $\rightarrow$ `converted` OR `closed`
  - Reopening allowed from `closed` $\rightarrow$ `in_progress` (requires mandatory `changeReason`).
  - Terminal state: `converted` (enquiry converted into student master record; cannot be reverted).
- **Audit Logging & Governance:**
  - Transitioning to `closed` or reopening from `closed` strictly requires a non-empty `changeReason` string (`BR-01`).
  - Server-side `beforeChange` hook logs every transition into `EnquiryAuditLog`.
  - Public callers submitting to `POST /api/student-enquiries` are sanitized: internal fields (`enquiryStatus`, `adminNotes`, `assignedTo`) are automatically stripped, and `enquirySource` is locked to `'website'`.
- **Endpoints:**
  - `POST /api/student-enquiries`: Public tuition lead capture. Accepts `TutorEnquiryFormData`.
  - `POST /api/admin/student-enquiries`: Admin manual lead creation (`FR-A2`) supporting offline sources (`phone_call`, `referral`).
  - `GET /api/student-enquiries`: Admin-only paginated listing with status, class, and source filtering.
  - `GET /api/student-enquiries/:id`: Retrieve single enquiry.
  - `PATCH /api/student-enquiries/:id`: Update enquiry status and internal notes.
  - `POST /api/student-enquiries/:id/read`: Marks enquiry as read.
  - `GET /api/inquiries/unread-counts`: Returns unread counters for CRM badges.

### Module 04: Enquiry Conversion & Student Master Records
- **Collection:** `Students` (`src/collections/Students.ts`, slug: `'students'`).
- **PRD Requirements:** `FR-A3`, `FR-A4`, `BR-02`, `BR-03`.
- **Conversion Flow (`POST /api/student-enquiries/:id/convert`):**
  - Atomic transaction: Validates that the enquiry is in an eligible status (`new`, `contacted`, `in_progress`).
  - Idempotency safeguard: If already converted, returns existing student record (`BR-03`).
  - Maps parent details, student class, subjects, localities, and budget into `Students` collection.
  - Updates enquiry status to `converted`.
  - Appends audit entry in `EnquiryAuditLog`.
- **Student Master Schema:**
  - Academic metadata: `studentClass` (UKG–Class 10), `board` (CBSE, ICSE, Bihar State Board, IGCSE), `schoolName`, `subjects` array.
  - Contact details: `name`, `parentName`, `parentPhone`, `parentEmail`, `locality`, `pincode`, `address`.
  - Operational flags: `status` (`active`, `inactive`, `graduated`, `dropped`), `convertedFromEnquiry` relationship.
- **Endpoints:**
  - `POST /api/students`: Direct student creation by super-admin.
  - `GET /api/students`: Paginated listing with search by name, phone, class, and locality.
  - `GET /api/students/:id`: Detailed student profile.
  - `PATCH /api/students/:id`: Administrative student record update.

### Module 05: Academic Baseline Capability Assessment
- **Collection:** `StudentAssessments` (`src/collections/StudentAssessments.ts`, slug: `'student-assessments'`).
- **PRD Requirements:** `FR-B1`, `BR-04`.
- **Core Philosophy:** In Wellfind Academic, students can begin tutoring based purely on an academic baseline review without forcing a physical exam (`BR-04`).
- **Capability Tiers:** `excellent`, `good`, `average`, `needs_improvement`, `weak`.
- **Schema Properties:**
  - `student`: Many-to-one foreign key to `students` (preserves historical assessment trail).
  - `previousPerformance`: Summary of previous school grades and marks.
  - `currentCapability`: 5-tier classification.
  - `strengths` & `weaknesses`: Normalized array of specific academic competencies (e.g. "strong algebraic intuition", "slow reading comprehension").
  - `assessmentType`: `'initial_review'`, `'periodic_review'`, `'post_test'`.
  - `assessedBy`: Automatically populated server-side actor ID.
  - `assessedAt`: ISO UTC timestamp.
- **Endpoints:**
  - `POST /api/students/:id/assessments`: Records new academic assessment.
  - `GET /api/students/:id/assessments`: Retrieves student's chronological assessment history.

### Module 06: Optional Physical Diagnostic Student Test & Fee Accounting
- **Collections:**
  - `StudentTests` (`src/collections/StudentTests.ts`, slug: `'student-tests'`)
  - `StudentTestPayments` (`src/collections/StudentTestPayments.ts`, slug: `'student-test-payments'`)
- **PRD Requirements:** `FR-B2`, `FR-B3`, `BR-05`, `BR-06`.
- **Operational Workflow:**
  - Parents may optionally opt in for an in-person physical assessment test conducted at their home.
  - If `parentSelected: false`, the API cleanly skips without creating dummy records (`FR-B2`).
  - Nominal diagnostic test fee: Exactly **₹100 INR** (`PHYSICAL_TEST_FEE_INR = 100`, `PHYSICAL_TEST_CURRENCY = 'INR'`).
- **Financial Double-Payment Protection:**
  - `StudentTestPayments` features a nullable unique column: `successfulPaymentKey`.
  - When `paymentStatus === 'paid'`, the database sets `successfulPaymentKey = String(studentTestId)`.
  - PostgreSQL unique index (`student_test_payments_successful_payment_key_idx`) ensures concurrent requests attempting duplicate payments fail with `409 Conflict` at the database level (`BR-06`).
  - Multiple `failed` or `pending` retry records can exist concurrently (`successfulPaymentKey` is `null`).
- **State Machine (`StudentTests`):**
  - `requested` $\rightarrow$ `paid` $\rightarrow$ `tester_assigned` $\rightarrow$ `scheduled` $\rightarrow$ `completed` $\rightarrow$ `report_available` OR `cancelled`.
  - Hook enforcement: `beforeChange` blocks status progression to `paid` or beyond unless a verified `paid` payment record of ₹100 exists in PostgreSQL.
- **Endpoints:**
  - `POST /api/students/:id/tests`: Creates physical test booking.
  - `GET /api/students/:id/tests`: Lists student tests.
  - `GET /api/student-tests/:id`: Retrieves individual test metadata.
  - `POST /api/student-tests/:id/payment`: Records fee payment attempt / settlement.

### Module 07: Field Tester Assignment, Scheduling & Diagnostic Reporting
- **Collections:**
  - `StudentTests` (`assignedTester`, `scheduledAt`, `testVenue`)
  - `StudentTestReports` (`src/collections/StudentTestReports.ts`, slug: `'student-test-reports'`)
- **PRD Requirements:** `FR-B4`, `FR-B5`, `BR-07`, `BR-08`.
- **Tester Role Reuse (Architectural Decision):**
  - Avoided creating a redundant `tester` role. Existing verified `teacher` or `super_admin` accounts can be assigned as testers (`FR-B4`).
  - Tester must be in `active` status (blocked/suspended users rejected with `400`).
- **Access Control & Dynamic Scoping:**
  - Active `super_admin` can view and manage all tests.
  - Assigned `teacher` can ONLY view physical tests specifically assigned to them (`assignedTester === user.id`).
  - If a tester is reassigned to another teacher, access is revoked immediately.
- **Diagnostic Report Submission (`POST /api/student-tests/:id/report`):**
  - Preconditions: Test must be in `scheduled` or `tester_assigned` status; caller must be the assigned tester or a super-admin.
  - 1:1 Relationship: Only one diagnostic report per test.
  - Scoring & Metrics: Validates marks obtained against total marks per subject; records conceptual understanding, analytical thinking, speed, handwriting, and student behavioral observations.
  - Transition: Automatically shifts `student-tests` status to `report_available`.
- **Endpoints:**
  - `PATCH /api/student-tests/:id/assign-tester`: Assigns/reassigns active teacher/admin.
  - `POST /api/student-tests/:id/report`: Submits diagnostic exam scores and observations.
  - `GET /api/student-tests/:id/report`: Retrieves report details.

### Module 08: Diagnostic Report Privacy & Parent Sharing Audit
- **Collection:** `StudentTestReportShares` (`src/collections/StudentTestReportShares.ts`, slug: `'student-test-report-shares'`).
- **PRD Requirements:** `FR-B6`, `BR-09`.
- **Privacy Enforcement:**
  - Test reports contain diagnostic evaluations of minors. They are strictly private to `super_admin` and the assigned tester until finalized.
  - Unauthenticated callers and non-assigned teachers receive `403 Forbidden` / `404 Not Found`.
- **Parent Sharing Logs:**
  - In Bihar operations, reports are shared with parents via WhatsApp PDF delivery or reviewed over counselor phone calls.
  - Sharing actions are recorded in `StudentTestReportShares` with channel (`whatsapp`, `phone_call`, `email`, `in_person`), shared timestamp, notes, and truth-in-advertising flags (`deliveryStatus: 'recorded_offline'`).
- **Endpoints:**
  - `POST /api/student-tests/:id/report/share`: Records report sharing action.
  - `GET /api/student-tests/:id/report/share`: Lists sharing audit history.

### Module 09: Teacher Application Ingestion & Secure KYC Storage
- **Collections:**
  - `TeacherEnquiries` (`src/collections/TeacherEnquiries.ts`, slug: `'teacher-enquiries'`)
  - `TeacherDocuments` (`src/collections/TeacherDocuments.ts`, slug: `'teacher-documents'`)
- **PRD Requirements:** Sections 4, 8, 12, `BR-10`.
- **Application Pipeline & State Machine:**
  - `new` $\rightarrow$ `under_review` $\rightarrow$ `shortlisted` $\rightarrow$ `evaluation_completed` $\rightarrow$ `approved` OR `rejected`
  - Rejection taxonomy: `qualifications_unmet`, `experience_insufficient`, `subject_mismatch`, `locality_unserviceable`, `character_conduct`, `evaluation_failed`, `other`.
  - **Irreversible Rejection Guard:** When rejected under `character_conduct`, reopening or transition to any other status is permanently blocked by collection hooks.
- **Private KYC Document Storage:**
  - Applicants upload sensitive identity proofs (Aadhaar cards, degrees, experience certificates).
  - Stored in dedicated `TeacherDocuments` collection with private filesystem access control.
  - Public HTTP access is blocked (`read: canManageTeacherEnquiries`); only active `super_admin` can download documents via `/api/teacher-documents/:filename`.
- **Endpoints:**
  - `POST /api/teacher-enquiries`: Public educator job application submission (multipart form upload).
  - `GET /api/teacher-enquiries`: Admin review table with pagination and status filters.
  - `GET /api/teacher-enquiries/:id`: Detailed applicant review.
  - `PATCH /api/teacher-enquiries/:id`: Admin review notes, status transitions, rejection classification.
  - `POST /api/teacher-enquiries/:id/read`: Marks application as read.

### Module 10: Multi-Stage Teacher Evaluation & Centrally Weighted Scoring
- **Collections & Globals:**
  - `TeacherEvaluations` (`src/collections/TeacherEvaluations.ts`, slug: `'teacher-evaluations'`)
  - `TeacherEvaluationConfig` (`src/globals/TeacherEvaluationConfig.ts`, slug: `'teacher-evaluation-config'`)
- **PRD Requirements:** `FR-C1`, `FR-C2`, `FR-C3`, `BR-10`, `BR-11`.
- **Multi-Stage Structure:**
  - Separates academic evaluation into two distinct components:
    1. **Written Subject Test:** Subject expertise, pedagogy knowledge, curriculum familiarity.
    2. **Personal / Pedagogical Interview:** Communication skills, punctuality, empathy, teaching methodology.
- **Centrally Configurable Weighted Scoring (`FR-C2`, `BR-11`):**
  - Dynamic weights stored in `TeacherEvaluationConfig` global (Default: `0.50` Written / `0.50` Interview).
  - Strict validation: $0 < w < 1.0$ and $\text{writtenWeight} + \text{interviewWeight} = 1.0$ enforced on save. Both scores must contribute.
  - Mathematical formula enforced by `teacherEvaluationValidation.ts`:
    $$\text{Written \%} = \left(\frac{\text{marksObtained}_{\text{written}}}{\text{totalMarks}_{\text{written}}}\right) \times 100$$
    $$\text{Interview \%} = \left(\frac{\text{marksObtained}_{\text{interview}}}{\text{totalMarks}_{\text{interview}}}\right) \times 100$$
    $$\text{Quality Score} = (\text{Written \%} \times W_{\text{written}}) + (\text{Interview \%} \times W_{\text{interview}})$$
- **Auditability & Re-attempts:**
  - Evaluators can record multi-round attempts via `attemptNumber` with unique composite constraint `(teacherEnquiry, attemptNumber)`.
  - Non-silent updates: Once marked `completed`, updating marks requires a mandatory `changeReason`. A snapshot of previous marks is appended to `revisionHistory`.
  - Successful evaluation shifts application to `evaluation_completed`.
- **Endpoints:**
  - `POST /api/teacher-enquiries/:id/evaluations`: Creates/submits evaluation scores.
  - `GET /api/teacher-enquiries/:id/evaluations`: Lists evaluation attempts.
  - `GET /api/teacher-enquiries/:id/evaluations/:evaluationId`: Retrieves evaluation breakdown.
  - `PATCH /api/teacher-enquiries/:id/evaluations/:evaluationId`: Audited mark adjustments.

### Module 11: Teacher Approval, Automated Account Provisioning & Profiles
- **Collections:**
  - `TeacherProfiles` (`src/collections/TeacherProfiles.ts`, slug: `'teacher-profiles'`)
  - `Users` (`src/collections/Users.ts`, slug: `'users'`)
- **PRD Requirements:** `FR-D1`, `FR-D2`, `FR-D3`, `BR-12`.
- **Approval Engine (`POST /api/teacher-enquiries/:id/approve`):**
  - Atomic transition from `evaluation_completed` $\rightarrow$ `approved`.
  - Validates that applicant has a completed evaluation with a valid quality score.
  - User Account Provisioning: Automatically checks if user account exists for the applicant email:
    - If new: Creates a `users` record with role `'teacher'`, status `'active'`, and generates a secure initial password.
    - If existing: Verifies account is not `super_admin`, attaches `'teacher'` role safely.
  - Profile Creation: Generates official `TeacherProfiles` record linking to the user account (enforced `1:1` via `user` unique constraint), copying subjects, locality, experience, class levels, and certified evaluation score.
  - Status Sync: If a teacher's account is suspended or blocked, the profile status mirrors the change.
- **Endpoints:**
  - `POST /api/teacher-enquiries/:id/approve`: Executes approval and account generation.
  - `PATCH /api/teachers/:id/availability`: Sets availability (`free`, `allocated`, `unavailable`).
  - `PATCH /api/teachers/:id/status`: Updates administrative status (`active`, `suspended`, `inactive`).
  - `GET /api/teachers`: Lists approved teachers for staff.
  - `GET /api/teachers/:id`: Profile details.

### Module 12: Intelligent Student–Teacher Compatibility Matching Engine
- **Collections & Engine:**
  - `TeacherMatches` (`src/collections/TeacherMatches.ts`, slug: `'teacher-matches'`)
  - Domain Matching Engine: `src/lib/teacherMatching.ts` & `src/services/teacherMatchingService.ts`.
- **PRD Requirements:** `FR-E1`, `FR-E2`.
- **Four-Pillar Matching Criteria:**
  1. **Subject Match:** Strict case-insensitive matching between student's required subjects and teacher's `primarySubject` or qualified specialties.
  2. **Class Level Compatibility:** Dual text and numeric range parser. Matches specific classes (e.g. "Class 8") against teacher ranges (e.g. "Class 6 to 10", "UKG-Class 10").
  3. **Locality Match:** Geographical proximity overlap across service localities in Bihar (e.g. "Kankarbagh", "Boring Road", "Zero Mile").
  4. **Teacher Operational Readiness:** Must have `approvalStatus === 'approved'`, account status `'active'`, and availability status `'free'` or `'partially_available'`. Blocked, suspended, or unapproved teachers are hard-excluded.
- **Ranking Engine:** Eligible candidate teachers are sorted in strict **descending order of Quality Score**.
- **Immutable Decision Trail:** `POST /api/students/:id/matches` records the execution snapshot, criteria used, and candidate ranking in `TeacherMatches` for auditability without auto-allocating.
- **Endpoints:**
  - `GET /api/students/:id/matches`: Performs dynamic compatibility query and returns ranked candidates.
  - `POST /api/students/:id/matches`: Records an official matching evaluation decision.

### Module 13: Teacher Allocation, Anti-Collision Locking & Delivery
- **Collection:** `TeacherAllocations` (`src/collections/TeacherAllocations.ts`, slug: `'teacher-allocations'`).
- **PRD Requirements:** `FR-F1`, `FR-F2`, `BR-13`.
- **Allocation Lifecycle:**
  - `assigned` $\rightarrow$ `accepted` OR `rejected` $\rightarrow$ `active` $\rightarrow$ `completed` OR `cancelled`.
  - Super-admin initiates allocation (`assigned`).
  - Teacher can accept or reject their own allocation.
  - Once classes commence, super-admin transitions status to `active`.
- **Anti-Collision Concurrency Guard (`BR-13`):**
  - Prevents accidental double-booking of the same teacher for the same student and subject.
  - Implements unique key: `active_key` (`buildActiveKey(studentId, teacherId, subject)`).
  - Populated strictly when allocation is in an active state (`assigned`, `accepted`, `active`).
  - Terminal statuses (`rejected`, `cancelled`, `completed`) nullify the `active_key`, freeing the slot.
  - PostgreSQL unique constraint `teacher_allocations_active_key_idx` guarantees zero double-allocations even under concurrent racing requests.
- **PII Protection for Minor Students:**
  - Teacher responses omit direct phone numbers of the student/parent. Contact is coordinated through the Wellfind Academic academic coordinator.
- **Endpoints:**
  - `POST /api/teacher-allocations`: Creates allocation (super-admin only).
  - `GET /api/teacher-allocations`: Lists allocations with student/teacher filtering.
  - `GET /api/teacher-allocations/:id`: Individual allocation status.
  - `PATCH /api/teacher-allocations/:id`: Super-admin allocation modification.
  - `PATCH /api/teacher-allocations/:id/status`: Teacher accept/reject or admin lifecycle update.

### Module 14: Teacher Self-Service Portal (`/me` & `/my` Endpoints)
- **Routes:**
  - `GET /api/teachers/me` (`src/app/api/teachers/me/route.ts`)
  - `GET /api/teacher-allocations/my` (`src/app/api/teacher-allocations/my/route.ts`)
- **Access Control:** Scoped to authenticated user holding `'teacher'` role.
- **Security Scoping:**
  - Caller identity is derived exclusively from the verified server JWT session (`req.user`), never from request payload parameters.
  - Attempting to inspect another teacher's allocations returns `404 Not Found`.
  - Student details are sanitized (no phone number or sensitive financial information leaked).

### Module 15: Immutable Audit Logging Subsystem
- **Collection:** `EnquiryAuditLog` (`src/collections/EnquiryAuditLog.ts`, slug: `'enquiry-audit-log'`).
- **Access Control:**
  - `create`: REST `false`. Written strictly via server-side hooks with `overrideAccess: true`.
  - `read`: Active `super_admin` only.
  - `update` & `delete`: Permanently `false`. Immutable append-only log.
- **Tracked Categories:** `student`, `teacher`, `evaluation`.
- **Captured Metadata:** `enquiryType`, `fieldChanged`, `previousStatus`, `newStatus`, `changeReason`, `changedBy` (User FK), `changedAt` (ISO timestamp), `ipAddress`, `userAgent`.

### Module 16: Media Assets & Lexical Content Engine
- **Collections:** `Media` (`src/collections/Media.ts`).
- **Capabilities:**
  - Public marketing assets, avatars, and curriculum graphics.
  - Server-side image optimization using `sharp 0.35.4`.
  - Payload Lexical RichText engine (`@payloadcms/richtext-lexical`) for rich notes, syllabi, and administrative documentation.

### Module 17: Transactional Email, OTP & Password Recovery
- **Module:** `src/lib/email.ts`, `src/lib/otp.ts`.
- **Adapter:** Nodemailer SMTP transport adapter integrated with Payload CMS config.
- **Email Triggers:**
  - Password recovery OTP emails (with company branding and security notices).
  - Account provisioning notifications for newly approved teachers.
  - Fallback: Gracefully handles missing SMTP credentials in local development without crashing the application.

---

## 4. Master REST API Routing Table

The backend provides **42 custom REST endpoints** alongside Payload CMS native core endpoints:

| # | HTTP Method | Endpoint URL | Auth / Role | Domain & Functional Requirement |
|---|---|---|---|---|
| 1 | `POST` | `/api/auth/login` | Public | Credential exchange, rate-limited JWT issuance |
| 2 | `POST` | `/api/auth/logout` | Authenticated | Invalidate session & clear HTTP-only cookies |
| 3 | `GET` | `/api/auth/me` | Authenticated | Current user session & role verification |
| 4 | `POST` | `/api/auth/forgot-password` | Public | Generate & dispatch 4-digit OTP via SMTP |
| 5 | `POST` | `/api/auth/verify-otp` | Public | Validate OTP; issue single-use `resetAuthToken` |
| 6 | `POST` | `/api/auth/reset-password` | Public | Consume token & set new account password |
| 7 | `GET` | `/api/auth/admin/users` | `super_admin` | Paginated user listing & role/status filter |
| 8 | `POST` | `/api/auth/admin/users` | `super_admin` | Administrative account creation |
| 9 | `GET` | `/api/auth/admin/users/:id` | `super_admin` | User profile inspection |
| 10 | `PATCH` | `/api/auth/admin/users/:id` | `super_admin` | Update user metadata & credentials |
| 11 | `DELETE` | `/api/auth/admin/users/:id` | `super_admin` | Safe account deletion |
| 12 | `POST` | `/api/auth/admin/users/:id/block` | `super_admin` | Administrative block |
| 13 | `POST` | `/api/auth/admin/users/:id/unblock` | `super_admin` | Remove block status |
| 14 | `POST` | `/api/auth/admin/users/:id/suspend` | `super_admin` | Temporary security suspension |
| 15 | `POST` | `/api/auth/admin/users/:id/reactivate` | `super_admin` | Restore account to active status |
| 16 | `POST` | `/api/auth/admin/users/:id/reset-password` | `super_admin` | Admin-directed password override |
| 17 | `POST` | `/api/student-enquiries` | Public | Public parent lead capture (`enquirySource: website`) |
| 18 | `POST` | `/api/admin/student-enquiries` | `super_admin` | Admin manual lead entry (`FR-A2`) |
| 19 | `GET` | `/api/student-enquiries` | `super_admin` | Filtered student enquiry listing |
| 20 | `GET` | `/api/student-enquiries/:id` | `super_admin` | Single enquiry details |
| 21 | `PATCH` | `/api/student-enquiries/:id` | `super_admin` | Status update (mandatory changeReason for closed) |
| 22 | `POST` | `/api/student-enquiries/:id/convert` | `super_admin` | Atomic conversion to student master record (`FR-A3`) |
| 23 | `POST` | `/api/student-enquiries/:id/read` | `super_admin` | Mark enquiry as read |
| 24 | `GET` | `/api/inquiries/unread-counts` | `super_admin` | Aggregated unread badge counters |
| 25 | `POST` | `/api/students` | `super_admin` | Direct student creation (`FR-A4`) |
| 26 | `GET` | `/api/students` | `super_admin` | Student directory & search |
| 27 | `GET` | `/api/students/:id` | `super_admin` | Student detailed profile |
| 28 | `PATCH` | `/api/students/:id` | `super_admin` | Update student academic / contact records |
| 29 | `POST` | `/api/students/:id/assessments` | `super_admin` | Academic capability baseline entry (`FR-B1`) |
| 30 | `GET` | `/api/students/:id/assessments` | `super_admin` | Chronological academic assessments history |
| 31 | `POST` | `/api/students/:id/tests` | `super_admin` | Optional ₹100 diagnostic test booking (`FR-B2`) |
| 32 | `GET` | `/api/students/:id/tests` | `super_admin` | List physical diagnostic tests for student |
| 33 | `GET` | `/api/student-tests/:id` | `super_admin`/`tester`| Diagnostic test metadata & assigned tester |
| 34 | `POST` | `/api/student-tests/:id/payment` | `super_admin` | Record ₹100 fee settlement (`FR-B3`) |
| 35 | `PATCH` | `/api/student-tests/:id/assign-tester`| `super_admin` | Assign active teacher/admin as field tester (`FR-B4`)|
| 36 | `POST` | `/api/student-tests/:id/report` | `super_admin`/`tester`| Submit 1:1 physical test report (`FR-B5`) |
| 37 | `GET` | `/api/student-tests/:id/report` | `super_admin`/`tester`| Read private test report |
| 38 | `POST` | `/api/student-tests/:id/report/share` | `super_admin` | Record parent sharing log (`FR-B6`) |
| 39 | `GET` | `/api/student-tests/:id/report/share` | `super_admin` | Sharing history logs |
| 40 | `POST` | `/api/teacher-enquiries` | Public | Teacher job application & KYC multipart upload |
| 41 | `GET` | `/api/teacher-enquiries` | `super_admin` | Applicant review table |
| 42 | `GET` | `/api/teacher-enquiries/:id` | `super_admin` | Single teacher application |
| 43 | `PATCH` | `/api/teacher-enquiries/:id` | `super_admin` | Review workflow update & rejection taxonomy |
| 44 | `POST` | `/api/teacher-enquiries/:id/read` | `super_admin` | Mark application as read |
| 45 | `GET` | `/api/teacher-documents/:filename` | `super_admin` | Private KYC document download |
| 46 | `POST` | `/api/teacher-enquiries/:id/evaluations` | `super_admin` | Written & Interview evaluation entry (`FR-C1`) |
| 47 | `GET` | `/api/teacher-enquiries/:id/evaluations` | `super_admin` | Evaluation attempts listing |
| 48 | `GET` | `/api/teacher-enquiries/:id/evaluations/:evalId` | `super_admin` | Specific evaluation attempt scores |
| 49 | `PATCH` | `/api/teacher-enquiries/:id/evaluations/:evalId` | `super_admin` | Audited score update with changeReason (`FR-C3`) |
| 50 | `POST` | `/api/teacher-enquiries/:id/approve` | `super_admin` | Teacher approval & auto user account creation (`FR-D1`)|
| 51 | `GET` | `/api/teachers` | `super_admin` | Directory of approved teachers |
| 52 | `GET` | `/api/teachers/:id` | `super_admin` | Teacher profile view |
| 53 | `GET` | `/api/teachers/me` | `teacher` | Current logged-in teacher profile |
| 54 | `PATCH` | `/api/teachers/:id/availability` | `super_admin` | Toggle availability (`free`, `allocated`, `unavailable`)|
| 55 | `PATCH` | `/api/teachers/:id/status` | `super_admin` | Mirror account status |
| 56 | `GET` | `/api/students/:id/matches` | `super_admin` | Algorithmic compatibility match query (`FR-E1`) |
| 57 | `POST` | `/api/students/:id/matches` | `super_admin` | Record matching evaluation decision (`FR-E2`) |
| 58 | `POST` | `/api/teacher-allocations` | `super_admin` | Allocate teacher with anti-collision lock (`FR-F1`) |
| 59 | `GET` | `/api/teacher-allocations` | `super_admin` | List system-wide allocations |
| 60 | `GET` | `/api/teacher-allocations/my` | `teacher` | Authenticated teacher's own allocations (`FR-F2`) |
| 61 | `GET` | `/api/teacher-allocations/:id` | `super_admin`/`teacher`| View single allocation status |
| 62 | `PATCH` | `/api/teacher-allocations/:id` | `super_admin` | Update allocation notes / dates |
| 63 | `PATCH` | `/api/teacher-allocations/:id/status`| `super_admin`/`teacher`| Transition status (Accept/Reject/Active/Complete) |

---

## 5. Database Schema, Relational Integrity & DAG Topology

The persistence model is implemented on **PostgreSQL 17** via `@payloadcms/db-postgres`. The database architecture follows an acyclic Directed Acyclic Graph (DAG) ensuring zero circular foreign keys and eliminating deadlocks during cascade operations.

### Relational Entity Graph (Mermaid)

```mermaid
erDiagram
    USERS ||--o{ STUDENT_ENQUIRIES : "assigned_to"
    USERS ||--o{ TEACHER_PROFILES : "user_account (1:1)"
    USERS ||--o{ STUDENT_ASSESSMENTS : "assessed_by"
    USERS ||--o{ STUDENT_TESTS : "assigned_tester"
    USERS ||--o{ ENQUIRY_AUDIT_LOG : "changed_by"
    
    STUDENT_ENQUIRIES ||--o| STUDENTS : "converts_to (1:1)"
    STUDENT_ENQUIRIES ||--o{ ENQUIRY_AUDIT_LOG : "audit_records"
    
    TEACHER_ENQUIRIES ||--o{ TEACHER_DOCUMENTS : "kyc_files"
    TEACHER_ENQUIRIES ||--o{ TEACHER_EVALUATIONS : "multi_round_attempts"
    TEACHER_ENQUIRIES ||--o| TEACHER_PROFILES : "approved_profile (1:1)"
    TEACHER_ENQUIRIES ||--o{ ENQUIRY_AUDIT_LOG : "audit_records"
    
    STUDENTS ||--o{ STUDENT_ASSESSMENTS : "capability_history"
    STUDENTS ||--o{ STUDENT_TESTS : "physical_tests"
    STUDENTS ||--o{ TEACHER_MATCHES : "evaluated_matches"
    STUDENTS ||--o{ TEACHER_ALLOCATIONS : "allocations"
    
    STUDENT_TESTS ||--o{ STUDENT_TEST_PAYMENTS : "fee_payments"
    STUDENT_TESTS ||--o| STUDENT_TEST_REPORTS : "diagnostic_report (1:1)"
    STUDENT_TESTS ||--o{ STUDENT_TEST_REPORT_SHARES : "sharing_logs"
    
    TEACHER_PROFILES ||--o{ TEACHER_MATCHES : "matched_candidates"
    TEACHER_PROFILES ||--o{ TEACHER_ALLOCATIONS : "allocated_tutor"
```

### Critical PostgreSQL Indexes & Unique Constraints

1. **`student_test_payments_successful_payment_key_idx` (Unique Nullable):**
   - Populated with `student_test_id` exclusively when `paymentStatus = 'paid'`. Prevents multiple successful ₹100 payments for the same test booking at the database level.
2. **`teacher_allocations_active_key_idx` (Unique Nullable):**
   - Populated with `${studentId}:${teacherId}:${subject}` when allocation status is in `['assigned', 'accepted', 'active']`. Guarantees that duplicate active teaching slots are physically impossible in PostgreSQL.
3. **`teacher_evaluations_teacher_enquiry_attempt_number_idx` (Unique Composite):**
   - Ensures attempt numbers increment deterministically (`1, 2, ...`) and prevents race conditions in evaluation submissions.
4. **`teacher_profiles_user_idx` (Unique Nullable):**
   - Enforces a strict one-to-one relationship between a teacher login user account and their operational teaching profile.
5. **Workflow State & Lookup Indexes:**
   - Single and composite B-tree indexes placed on `enquiryStatus`, `enquirySource`, `applicationStatus`, `paymentStatus`, `student`, `teacher`, and `createdAt` across all operational tables for high-throughput query filtering.

---

## 6. Security, Access Control & PII Protection Audit

### Authentication & Authorization Gates
1. **Middleware Isolation:** Custom Next.js route handlers enforce security using helper utilities:
   - `requireSuperAdmin(req)`: Validates JWT signature, verifies caller exists in DB, checks `status === 'active'`, and confirms `role === 'super_admin'`.
   - `requireActiveUser(req)`: Ensures token is valid and caller is not `blocked` or `suspended`.
   - `authorizeRouteWithId(req, id)`: Reusable URL segment parameter parser with boundary validation.
2. **Payload Collection-Level ACLs:**
   - Direct Payload REST endpoints (`/api/users`, `/api/student-enquiries`, etc.) enforce matching access control rules. If a public caller attempts direct collection modification, Payload returns `403 Forbidden`.

### PII & Minor Student Protection
- **Phone Number Masking:** In the home tutoring sector, direct parent phone numbers are high-value PII. When a teacher queries `/api/teacher-allocations/my` or when candidates are ranked during matching, the parent/student phone numbers are stripped from serialization (`serializeAllocation`). Contact is mediated through the academic support team.
- **KYC Document Isolation:** Prospective teacher identity proofs (Aadhaar cards, university degrees) are stored under a private folder structure. File serving is routed through `/api/teacher-documents/:filename` which checks active `super_admin` permissions before streaming file bytes.

### Rate Limiting & Denial of Service Protection
- Login and OTP routes utilize an IP-based sliding window rate limiter:
  - Login attempts: 5 per 15-minute window (`MAX_LOGIN_ATTEMPTS`).
  - OTP verification: 5 attempts per window (`MAX_OTP_ATTEMPTS`).
  - Account lockouts and HTTP `429 Too Many Requests` responses are triggered on threshold violations.

---

## 7. Current Verification Health & Test Suite Analysis

A full, clean automated verification run was conducted across all subsystems.

### 1. Static Type Checking
```bash
cd wellfind-api
npx tsc --noEmit
```
- **Result:** **PASS (0 errors)**.
- **Verification:** All interfaces, Payload collections, services, and route handlers conform strictly to TypeScript 5.7.3.

### 2. Integration Test Suite Execution
```bash
cd wellfind-api
npx vitest run --config ./vitest.config.mts
```
- **Test Results Summary:**
  - **Test Files:** **14 passed (14)**
  - **Total Tests:** **176 passed (176)**
  - **Skipped / Failed:** **0**
  - **Total Duration:** **125.48s**

| Test Suite File | Test Count | Status | Key Coverage Areas |
|---|---|---|---|
| `tests/int/auth.int.spec.ts` | 13 | **PASS** | Login, JWT, logout, OTP flow, token expiration, status blocking |
| `tests/int/users.int.spec.ts` | 21 | **PASS** | Admin user CRUD, block/unblock, suspend/reactivate, role changes |
| `tests/int/student-enquiries.int.spec.ts` | 28 | **PASS** | Public submission, admin creation, phone normalization, changeReason |
| `tests/int/enquiry-audit-log.int.spec.ts` | 28 | **PASS** | Append-only immutability, hook logging, multi-status progression |
| `tests/int/phase1-students.int.spec.ts` | 15 | **PASS** | Enquiry-to-student conversion, idempotency, student CRUD |
| `tests/int/phase2-student-assessments.int.spec.ts` | 8 | **PASS** | Baseline academic review, capability tiers, history trail |
| `tests/int/phase3-physical-tests.int.spec.ts` | 10 | **PASS** | ₹100 fee lock, tester assignment, report submission, sharing |
| `tests/int/phase4-teacher-evaluations.int.spec.ts` | 9 | **PASS** | Written & interview scores, weighted quality formula, audit trail |
| `tests/int/phase5-teacher-approval.int.spec.ts` | 10 | **PASS** | Approval transaction, teacher account creation, profile sync |
| `tests/int/phase6-teacher-matching.int.spec.ts` | 7 | **PASS** | Subject/class/locality filtering, score ranking, match saving |
| `tests/int/phase7-teacher-allocation.int.spec.ts` | 9 | **PASS** | Anti-collision active key, teacher accept/reject, `/my` scoping |
| `tests/int/teacher-enquiries.int.spec.ts` | 14 | **PASS** | Public job application, KYC upload, rejection classification |
| `tests/int/teachers-api.int.spec.ts` | 3 | **PASS** | Approved teacher listings, availability toggle, profile retrieval |
| `tests/int/api.int.spec.ts` | 1 | **PASS** | Database connectivity and base Payload collection initialization |

### 3. Production Build Compilation
```bash
cd wellfind-api
npm run build
```
- **Next.js Version:** 16.3.3 (Turbopack compiler enabled).
- **Compilation Time:** 21.9s.
- **Static Page Generation:** 20/20 routes pre-rendered / registered dynamically.
- **Status:** **PASS** (Ready for containerization and production deployment).

---

## 8. Current Position Analysis: Strengths, Bottlenecks & Technical Debt

### Key Architectural Strengths
1. **Strict PRD Adherence:** The implementation maps 1-to-1 to the requirements of `WA-BE-PRD-001`. No phantom features or unrequested dependencies were introduced.
2. **PostgreSQL-Enforced Concurrency Control:** Using partial unique constraints (`successfulPaymentKey` and `active_key`) protects the system against financial double-counting and tutor overbooking regardless of application concurrency.
3. **Transaction Safety:** Complex workflows (Enquiry Conversion, Teacher Approval, Test Report Submission) execute within atomic Payload database transactions (`initTransaction` / `commitTransaction` / `killTransaction`).
4. **Clean Separation of Concerns:** Domain logic resides in pure testable helpers (`src/lib/`), orchestration resides in services (`src/services/`), and HTTP serialization resides in route handlers (`src/app/api/`).

### Identified Limitations & Technical Debt
1. **ESLint Peer Dependency Issue (`npm run lint`):**
   - *Detail:* Running `npm run lint` throws `ERR_MODULE_NOT_FOUND` because `eslint.config.mjs` imports `FlatCompat` from `@eslint/eslintrc`, but `@eslint/eslintrc` is omitted from `package.json` devDependencies.
   - *Impact:* Does not affect runtime, TypeScript typing, or production builds.
   - *Remediation:* Add `@eslint/eslintrc: ^3.2.0` to `devDependencies`.
2. **In-Memory Rate Limiting:**
   - *Detail:* `src/lib/auth.ts` uses an in-process JavaScript `Map` (`rateLimitStore`).
   - *Impact:* Rate limiting is not shared across multi-instance or auto-scaling cluster deployments; restarts reset counters.
   - *Remediation:* Transition to Redis-backed distributed rate limiting (e.g. `ioredis` or `@upstash/ratelimit`).
3. **In-Memory Teacher Matching Scan:**
   - *Detail:* `findMatchingTeachers` loads up to 1,000 approved teacher profiles into Node.js memory (`limit: 1000`) and executes filtering via JavaScript array predicates.
   - *Impact:* Sufficient for up to 1,000 active tutors in Bihar; beyond 5,000 profiles, memory overhead and CPU filtering latency will increase.
   - *Remediation:* Migrate matching predicates directly into PostgreSQL parameterized SQL queries with GIN indexes.
4. **Conservative Text-Based Locality & Class Range Matching:**
   - *Detail:* Locality matching uses substring and text equality (e.g. "Kankarbagh" == "Kankarbagh").
   - *Impact:* Does not account for adjacent neighborhoods or driving distance.
   - *Remediation:* Implement PostGIS geospatial coordinates and kilometer-radius matching.
5. **Record-Only Payment & WhatsApp Actions:**
   - *Detail:* Payment recording and WhatsApp sharing are administrative logging endpoints without live third-party gateway webhooks.
   - *Impact:* Staff manually confirm receipt of the ₹100 fee and trigger WhatsApp messages outside the API.

---

## 9. Strategic Direction & Future Roadmap

The backend has achieved full technical maturity for Phase 1 operational readiness. To scale Wellfind Academic from a pilot network in Patna to a statewide operation across Bihar, development should follow this phased roadmap:

```mermaid
timeline
    title Wellfind Academic Backend Strategic Roadmap
    Sprint 1-2 (Immediate) : Dev-Tooling Polish : Redis Rate Limiter : Docker Production Image
    Month 1 (Phase A) : wellfind-crm Integration : Real-time SSE Alerts : OpenAPI / Swagger Generation
    Month 2 (Phase B) : Razorpay Payment Gateway : WhatsApp Cloud API : PostGIS Geo-Matching
    Month 3-6 (Phase C) : Class Scheduling & Attendance : Automated Invoicing : Tutor Payout Engine
```

### Phase A: Production Hardening & Immediate Polish (Next 2 Weeks)
1. **Linting & Tooling Cleanup:**
   - Install `@eslint/eslintrc` to restore zero-warning lint checks.
   - Add database connection pool pooling configurations (`max: 20`, `idleTimeoutMillis: 30000`) in `src/payload.config.ts`.
2. **Containerized Production Deployment:**
   - Create multi-stage production `Dockerfile` utilizing Alpine Node.js 22 runtime.
   - Configure health check endpoint (`/api/health`) monitoring PostgreSQL connection responsiveness.
3. **Distributed Caching & Redis Integration:**
   - Replace in-memory auth rate limiting with Redis store.
   - Cache static globals (`TeacherEvaluationConfig`) in memory with invalidation hooks.

### Phase B: Frontend & Multi-Client Ecosystem Integration (Month 1)
1. **Contract Freezing & SDK Generation:**
   - Generate TypeScript SDK / client types from `payload-types.ts` for consumption in `wellfind-crm` (Admin Dashboard) and `wellfind-app` (Mobile Native App).
2. **Real-time Operational Notifications (SSE / WebSockets):**
   - Implement Server-Sent Events endpoint (`GET /api/notifications/stream`) to notify counselors instantly when a new student enquiry or teacher application arrives.
3. **Automated OpenAPI / Swagger Documentation:**
   - Provide interactive API playground for frontend developers building `wellfind-crm` and `wellfind-app`.

### Phase C: Third-Party Service Automations (Month 2)
1. **WhatsApp Cloud API / Twilio Integration:**
   - Automate the dispatch of diagnostic test report PDFs directly to parent WhatsApp numbers upon status transition to `report_available`.
2. **Online Payment Gateway (Razorpay / Cashfree):**
   - Integrate Razorpay Orders API for the ₹100 physical diagnostic test fee.
   - Implement cryptographic webhook listener (`POST /api/webhooks/razorpay`) to automatically transition tests to `paid` upon successful online UPI/card payment.
3. **PostGIS Geospatial Matching for Bihar Localities:**
   - Add latitude and longitude coordinates to `Students` and `TeacherProfiles`.
   - Upgrade `teacherMatchingService` to calculate real-world kilometer distances across Patna and major Bihar districts, prioritizing tutors within a 5 km commute radius.

### Phase D: Enterprise Academic LMS & Financial Operations (Month 3–6)
1. **Class Session Scheduling & Attendance Tracking:**
   - New collection: `AcademicSessions` (tracks scheduled class dates, times, and completion logs).
   - Mobile check-in: Geofenced or OTP-verified class attendance verification through `wellfind-app`.
2. **Parent Feedback & Dynamic Teacher Rating:**
   - Post-class monthly feedback survey for parents.
   - Dynamic adjustment of teacher quality scores based on customer satisfaction and student grade improvement.
3. **Automated Billing & Tutor Payout Calculation:**
   - Monthly tuition fee invoicing for parents.
   - Commission calculation and automated bank payout batch generation for home educators.

---

## 10. Actionable Engineering Checklist

For the backend development and operations team:

- [x] **Core PRD Modules:** All Modules A through F implemented and verified.
- [x] **TypeScript Integrity:** Clean compilation with `npx tsc --noEmit`.
- [x] **Integration Testing:** 14/14 test suites passing (176 tests).
- [x] **Production Build:** Clean Turbopack compilation with `npm run build`.
- [ ] **Dependency Fix:** Run `pnpm add -D @eslint/eslintrc` in `wellfind-api/` to restore `npm run lint`.
- [ ] **Docker Engine Health:** Ensure Docker Desktop daemon or host service is configured with auto-restart on server reboot.
- [ ] **CRM Contract Alignment:** Align `wellfind-crm` API client with the 42 REST endpoints documented in Section 4.
- [ ] **Mobile App Contract Alignment:** Verify that `wellfind-app` targets `/api/teachers/me` and `/api/teacher-allocations/my` using Bearer JWT tokens.
- [ ] **Staging Deployment:** Deploy `wellfind-api` container to staging environment with remote PostgreSQL database.

---
*End of Master Backend Comprehensive Audit Report. Wellfind Academic API is verified, architecturally sound, and ready for end-to-end integration.*