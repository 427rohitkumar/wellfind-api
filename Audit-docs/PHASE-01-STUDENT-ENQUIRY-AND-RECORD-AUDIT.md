# Phase 1 — Student Enquiry Extension and Conversion Audit

**Audit ID:** PHASE-01-STUDENT-ENQUIRY-AND-RECORD-AUDIT  
**Phase Name:** Phase 1 — Student Enquiry Extension and Conversion  
**PRD References:** `PRD/WELLFIND_BACKEND_API_PRD.md` (`WA-BE-PRD-001` v1.0, Module A `FR-A1`–`FR-A4`, Business Rules `BR-01`–`BR-03`, Sections 6, 8, 9, 10, 14)  
**Playbook Reference:** `BACKEND_EXECUTION_PLAYBOOK.md` (`WA-BE-EXEC-001` v1.0, Section 5 Phase 1, Sections 6–9)  
**Date/Time:** 2026-11-11 20:22 +05:30  
**Repository Root:** `d:\Dev-2026\Builder-Studio\wellfind-api`

---

## 1. Phase Name and PRD References

- **Phase:** Phase 1 — Student Enquiry Extension and Conversion
- **PRD Functional Requirements Covered:**
  - `FR-A1`: Add `enquirySource` tracking to `StudentEnquiries` while preserving public form compatibility.
  - `FR-A2`: Admin manual student enquiry creation (`POST /api/admin/student-enquiries`).
  - `FR-A3`: Atomic, idempotency-safe enquiry-to-student conversion (`POST /api/student-enquiries/:id/convert`) transitioning eligible enquiries (`new`, `contacted`, `in_progress`) to `converted`.
  - `FR-A4`: Operational `Students` collection and CRUD APIs (`POST /api/students`, `GET /api/students`, `GET /api/students/:id`, `PATCH /api/students/:id`).
- **Business Rules Enforced:** `BR-01`, `BR-02`, `BR-03` plus Phase 0 approved product and tooling decisions (`2026-11-11 20:04 +05:30`).

---

## 2. Date / Time

- Phase 1 implementation, Post-fix TypeScript check (`npx tsc --noEmit`), full Vitest suite (`npm run test:int`), PostgreSQL schema verification, Next.js production build (`npm run build`), lint check (`npm run lint`), API documentation updates, and audit completed on **2026-11-11** (latest verification checks completed at **20:18–20:21 +05:30**).

---

## 3. Summary of Delivered Functionality

### Pre-Phase-1 Approved Housekeeping & Tooling Decisions
1. Confirmed empty `Audits-docs/` directory contained no files and removed it, leaving `Audit-docs/` as the canonical audit folder.
2. Configured `fileParallelism: false` in `vitest.config.mts` so `npm run test:int` executes test suites sequentially against local PostgreSQL without concurrency collisions.
3. Recorded Phase 0 product/tooling decisions in `Audit-docs/PHASE-00-RECONNAISSANCE-AUDIT.md` and `BACKEND_IMPLEMENTATION_PROGRESS.md`.

### Phase 1 Functional Deliverables (`FR-A1`–`FR-A4`)
1. **Student Enquiry Source & Transition Extension (`FR-A1`, `BR-01`):**
   - Added `enquirySource` (`website`, `phone_call`, `email`, `referral`, `network`, `other`, default `'website'`, indexed) to `StudentEnquiries`.
   - Preserved existing `POST /api/student-enquiries` public contract (`{ message, enquiry }` / `{ error }`) while forcing unauthenticated/non-admin REST submissions to store `enquirySource: 'website'` even if spoofed, and rejecting invalid `enquirySource` values on admin/validated payloads.
   - Added `?enquirySource=` filter support on `GET /api/student-enquiries`.
   - Added `'converted'` as a distinct status in `enquiryStatuses` (`new -> contacted -> in_progress -> converted -> allocated`, plus allowed `'closed'` / transitions per workflow rules). Removed legacy auto-promotion from `'converted'` to `'allocated'`; conversion sets `'converted'` explicitly only when `req.context.isStudentConversion === true` from `'new'`, `'contacted'`, or `'in_progress'`.
2. **Admin Manual Student Enquiry Creation (`FR-A2`):**
   - Implemented `POST /api/admin/student-enquiries` for authenticated active `super_admin` users (`requireSuperAdmin`), supporting all valid `enquirySource` values without requiring public policy consent checkbox while validating required student/enquiry fields and `assignedTo` user existence.
3. **Safe Atomic Enquiry-to-Student Conversion (`FR-A3`, `BR-02`, `BR-03`):**
   - Implemented `POST /api/student-enquiries/:id/convert` (`super_admin` only) inside a database transaction (`initTransaction` / `commitTransaction` / `killTransaction`).
   - Creates the `Students` record first so PostgreSQL's unique index on `student_enquiry_id` guarantees only one `Students` record can ever exist per enquiry even under parallel requests, then updates the enquiry status to `'converted'` with audit trail entry in `EnquiryAuditLog`.
   - Disallows conversion from `'converted'`, `'allocated'` (`409 Conflict`), or `'closed'` (`400 Bad Request`).
4. **Operational Students Record & APIs (`FR-A4`):**
   - Created `Students` collection (`src/collections/Students.ts`), registered in `src/payload.config.ts`, with `super_admin`-only CRUD collection access, indexed lookup fields, immutable `studentEnquiry` protection after creation, and phone normalization.
   - Implemented `POST /api/students`, `GET /api/students` (paginated + filtered), `GET /api/students/:id`, and `PATCH /api/students/:id` (`super_admin` only) using standardized PRD §10 JSON response envelopes (`{ success, message, data | errors }`).

---

## 4. Files Created

| File Path | Purpose |
|---|---|
| `src/lib/api.ts` | Standardized PRD §10 response helpers (`apiSuccess`, `apiError`), `requireSuperAdmin`, JSON body parser, PostgreSQL/Payload error extraction (`isUniqueConstraintError`, `extractValidationErrors`, `handleRouteError`) |
| `src/lib/studentValidation.ts` | Shared enums (`enquiryStatuses`, `CONVERTIBLE_ENQUIRY_STATUSES`, `enquirySources`, `studentStatuses`) and reusable validators/normalizers (`validateAndBuildEnquiryData`, `normalizeSubjectsInput`, `parsePositiveIntId`, etc.) |
| `src/collections/Students.ts` | Payload `students` collection schema, hooks, unique `studentEnquiry` relationship, and `super_admin`-only access control |
| `src/services/studentService.ts` | Shared serialization and service logic (`ServiceError`, `createManualStudentEnquiry`, `convertStudentEnquiry`, `createStudentRecord`, `listStudents`, `getStudentById`, `updateStudentById`) |
| `src/app/api/admin/student-enquiries/route.ts` | `POST /api/admin/student-enquiries` route handler |
| `src/app/api/student-enquiries/[id]/convert/route.ts` | `POST /api/student-enquiries/:id/convert` route handler |
| `src/app/api/students/route.ts` | `POST /api/students` and `GET /api/students` route handlers |
| `src/app/api/students/[id]/route.ts` | `GET /api/students/:id` and `PATCH /api/students/:id` route handlers |
| `tests/int/phase1-students.int.spec.ts` | 15 Phase 1 integration & unit tests covering `FR-A1`–`FR-A4`, parallel conversion race, transaction rollback, RBAC, and CRUD |
| `API-DOC/students.md` | Complete API documentation for `POST/GET /api/students` and `GET/PATCH /api/students/:id` |
| `Audit-docs/PHASE-01-STUDENT-ENQUIRY-AND-RECORD-AUDIT.md` | This Phase 1 audit report |

---

## 5. Files Modified (and Directory Removed)

| File / Path | Change Summary |
|---|---|
| `vitest.config.mts` | Added `fileParallelism: false` under `test` to serialize file execution against PostgreSQL |
| `src/lib/auth.ts` | Widened `isSuperAdminRole`, `isTeacherRole`, and `isAdminRole` parameter types to `{ role?: string | null } \| null \| undefined` |
| `src/collections/StudentEnquiries.ts` | Added `enquirySource`, `'converted'` status + transition guards, conversion context handling, and indexes on `enquiryStatus` / `phoneNumber` / `enquirySource` |
| `src/payload.config.ts` | Registered `Students` collection |
| `src/payload-types.ts` | Regenerated via `npm run generate:types` to include `Student` and updated `StudentEnquiry` types |
| `src/app/api/student-enquiries/route.ts` | Reused `validateAndBuildEnquiryData` and serializers while preserving public/existing response formats and adding `?enquirySource=` query filtering |
| `tests/int/student-enquiries.int.spec.ts` | Updated `enquiryStatuses` assertion to include `'converted'` |
| `tests/int/enquiry-audit-log.int.spec.ts` | Updated 3 legacy workflow transition chains from `in_progress -> allocated` to `in_progress -> converted -> allocated` and added negative test asserting bare `in_progress -> allocated` and `new -> converted` rejection |
| `API-DOC/student-enquiry.md` | Documented `enquirySource`, `'converted'` status & transitions, `POST /api/admin/student-enquiries`, and `POST /api/student-enquiries/:id/convert` |
| `Audit-docs/PHASE-00-RECONNAISSANCE-AUDIT.md` | Added approved Phase 0 decisions section and removed pending-decisions status |
| `BACKEND_IMPLEMENTATION_PROGRESS.md` | Recorded Phase 0 decisions, updated Phase 1 status/results, and maintained overall progress table |
| `Audits-docs/` *(removed)* | Confirmed empty (`Get-ChildItem -Force Audits-docs` returned empty) and removed duplicate directory |

---

## 6. Database / Schema Changes

PostgreSQL schema synchronized via Payload dev push and directly inspected against `information_schema.columns`, `pg_indexes`, and `pg_type`/`pg_enum`:

1. **`student_enquiries` Table Extensions & Enums:**
   - Added column `enquiry_source` (`enum_student_enquiries_enquiry_source`, nullable in DB column with Payload default `'website'`).
   - Enum `enum_student_enquiries_enquiry_source`: `'website'`, `'phone_call'`, `'email'`, `'referral'`, `'network'`, `'other'`.
   - Enum `enum_student_enquiries_enquiry_status`: `'new'`, `'contacted'`, `'in_progress'`, `'converted'`, `'allocated'`, `'closed'`.
   - Indexes verified on `student_enquiries`: `student_enquiries_enquiry_source_idx`, `student_enquiries_enquiry_status_idx`, `student_enquiries_phone_number_idx` (plus existing `assigned_to_idx`, `created_at_idx`, `updated_at_idx`, `pkey`).
2. **New `students` & `students_subjects` Tables:**
   - Columns verified on `students`: `id` (`integer` PK), `name`, `parent_name`, `phone_number`, `alternate_phone_number`, `parent_email`, `student_class`, `custom_subject`, `locality`, `custom_locality`, `preferred_timing`, `budget_range`, `learning_notes`, `student_enquiry_id` (`integer`), `status` (`enum_students_status`: `'active'`, `'inactive'`, `'paused'`, `'completed'`), `converted_at` (`timestamptz`), `converted_by_id` (`integer`), `updated_at`, `created_at`.
   - Child array table `students_subjects`: `_order`, `_parent_id`, `id`, `subject`.
   - Unique constraint & indexes verified on `students`: `students_student_enquiry_idx` (`CREATE UNIQUE INDEX ... ON public.students USING btree (student_enquiry_id)`), `students_name_idx`, `students_phone_number_idx`, `students_student_class_idx`, `students_locality_idx`, `students_status_idx`, `students_converted_by_idx`, `students_created_at_idx`, `students_updated_at_idx`, `students_pkey`.
   - **Migration Note:** No static files were added to `src/migrations/`; schema updates were applied by Payload schema sync (`push`).

---

## 7. Endpoints Implemented (Method, Path, Access)

| Method | Path | Access Control | Status in Phase 1 |
|---|---|---|---|
| `POST` | `/api/student-enquiries` | Public (rate-limited; forces `enquirySource: 'website'` for non-admin/public REST submissions) | Updated (backward-compatible) |
| `GET` | `/api/student-enquiries` | `super_admin` (`403` unauthenticated/teacher — existing route behavior preserved) | Updated (`?enquirySource=` filter) |
| `POST` | `/api/admin/student-enquiries` | Authenticated active `super_admin` (`401` unauthenticated, `403` non-admin/blocked/suspended) | New |
| `POST` | `/api/student-enquiries/:id/convert` | Authenticated active `super_admin` (`401`/`403`) | New |
| `POST` | `/api/students` | Authenticated active `super_admin` (`401`/`403`) | New |
| `GET` | `/api/students` | Authenticated active `super_admin` (`401`/`403`) | New |
| `GET` | `/api/students/:id` | Authenticated active `super_admin` (`401`/`403`) | New |
| `PATCH` | `/api/students/:id` | Authenticated active `super_admin` (`401`/`403`) | New |

---

## 8. Request / Response Contract Summary

- **New Phase 1 Endpoints (`/api/admin/student-enquiries`, `/api/student-enquiries/:id/convert`, `/api/students`, `/api/students/:id`):**
  - Success envelope: `{ "success": true, "message": "<string>", "data": <object | paginated_result> }` (`201` on resource creation / conversion, `200` on read / list / update).
  - Error envelope: `{ "success": false, "message": "<string>", "errors": [{ "field": "...", "message": "..." }] }` (`400` validation/invalid ID/closed state, `401` unauthenticated, `403` non-`super_admin` or inactive user, `404` missing record, `409` duplicate conversion/conflict, `415` unsupported media/JSON parse failure where applicable, `500` unexpected server failure).
  - Serialization: Student `subjects` normalized to `string[]` (`extractSubjectNames`) in API responses while stored in Payload array `{ subject }` rows internally.
- **Preserved Existing Endpoints (`POST/GET /api/student-enquiries`):**
  - Kept `{ message, enquiry }` (`201`) and `{ error }` (`400`/`429`) on `POST`, and Payload pagination `{ docs, totalDocs, ... }` (`200`) / `403` on `GET` so all pre-existing Phase 0 enquiry tests remain backward-compatible.

---

## 9. Validation and Business Rules Implemented

- **Enquiry Source Rules (`FR-A1`–`FR-A2`):**
  - Allowed `enquirySource` values: `website`, `phone_call`, `email`, `referral`, `network`, `other`.
  - Public REST submissions without active `super_admin` context default/coerce `enquirySource` to `'website'` and ignore spoofed sources (`'referral'`, etc.), while malformed source values on validated admin submissions return `400`.
  - Admin manual creation via `POST /api/admin/student-enquiries` does not require the frontend policy consent checkbox (`requireExplicitPolicy: false`).
- **Workflow State Machine & Conversion Protection (`FR-A3`, `BR-01`–`BR-03`):**
  - Canonical enquiry progression: `new -> contacted -> in_progress -> converted -> allocated` (with permitted `'closed'` transitions guarded by mandatory `changeReason` rules).
  - `POST /api/student-enquiries/:id/convert` accepts only enquiries in `['new', 'contacted', 'in_progress']`, never auto-sets `'allocated'`, rejects `'closed'` enquiries (`400`), rejects already `'converted'` or `'allocated'` enquiries (`409`), and protects against concurrent duplicate conversion using PostgreSQL transaction + unique `student_enquiry_id` index.
  - Direct creation on `POST /api/students` rejects client-supplied `studentEnquiry` links to preserve 1:1 enquiry state integrity; updates via `PATCH /api/students/:id` keep `studentEnquiry` immutable.
- **Phone / Email / Field Validation:**
  - Shared `normalizePhoneNumber` and `isValidPhoneNumber`, email checks on optional `parentEmail`, non-empty `subjects` string arrays, and valid `assignedTo` user checks.

---

## 10. Authorization / Access-Control Behavior

- `requireSuperAdmin` in `src/lib/api.ts`:
  - Returns `401` when `payload.auth` returns no authenticated user.
  - Returns `403` when user status is blocked/suspended or `role !== 'super_admin'`.
- `Students` collection access in `src/collections/Students.ts`:
  - Restricts `create`, `read`, `update`, and `delete` strictly to active `super_admin` users.
- Verified in `tests/int/phase1-students.int.spec.ts` that both unauthenticated callers (`401`) and `teacher` users (`403`) are blocked across `/api/admin/student-enquiries`, `/api/student-enquiries/:id/convert`, `/api/students`, `/api/students/:id`, and direct Payload `Students` collection operations.

---

## 11. Tests Executed, Exact Commands and Results

All checks below ran sequentially **after the final code edit**:

1. **TypeScript Type Check:**
   - Command: `npx tsc --noEmit`
   - Result: **PASS** (exit `0`, no output)
2. **Full Sequential Vitest Integration & Regression Suite (`fileParallelism: false`):**
   - Command: `npm run test:int` (`cross-env NODE_OPTIONS=--no-deprecation vitest run --config ./vitest.config.mts`)
   - Result: **PASS** (exit `0`, Duration `66.50s`, **`Test Files 8 passed (8)`**, **`Tests 123 passed (123)`**, `0` failed, `0` skipped)
   - Suite Breakdown:
     - `tests/int/enquiry-audit-log.int.spec.ts`: **28 passed** (`6281ms`)
     - `tests/int/student-enquiries.int.spec.ts`: **28 passed** (`4482ms`)
     - `tests/int/users.int.spec.ts`: **21 passed** (`3492ms`)
     - `tests/int/phase1-students.int.spec.ts`: **15 passed** (`5001ms`)
     - `tests/int/teachers-api.int.spec.ts`: **3 passed** (`3359ms`)
     - `tests/int/auth.int.spec.ts`: **13 passed** (`3105ms`)
     - `tests/int/teacher-enquiries.int.spec.ts`: **14 passed** (`2211ms`)
     - `tests/int/api.int.spec.ts`: **1 passed** (`1252ms`)
3. **Production Build:**
   - Command: `npm run build` (`cross-env NODE_OPTIONS="--no-deprecation --max-old-space-size=8000" next build`)
   - Result: **PASS** (exit `0`; compiled successfully in `18.8s`, TypeScript finished in `17.6s`, `17/17` static pages generated; all Phase 1 routes registered cleanly as dynamic server routes)
4. **PostgreSQL Schema Check:**
   - Command: `node scripts/_check-schema.mjs` + direct `pg` inspection of `information_schema.columns`, `pg_indexes`, and `pg_enum`
   - Result: **PASS** (verified `students`, `students_subjects`, `student_enquiries.enquiry_source`, new enums, btree indexes, and unique `students_student_enquiry_idx` index)
5. **ESLint Check:**
   - Command: `npm run lint` (`cross-env NODE_OPTIONS=--no-deprecation eslint .`)
   - Result: **FAIL** (exit `1` — pre-existing `ERR_MODULE_NOT_FOUND: Cannot find package '@eslint/eslintrc' imported from D:\Dev-2026\Builder-Studio\wellfind-api\eslint.config.mjs`)

---

## 12. Build / Type-Check Result

- `npx tsc --noEmit`: **PASS** (exit `0`)
- `npm run build`: **PASS** (exit `0`, Next.js 16.3.3 Turbopack build green, routes compiled including `/api/admin/student-enquiries`, `/api/student-enquiries`, `/api/student-enquiries/[id]/convert`, `/api/students`, `/api/students/[id]`).

---

## 13. Failures Encountered and Root-Cause Fixes

1. **Parallel Duplicate Conversion Race Returned `[201, 400]` Instead of `[201, 409]`:**
   - **Root Cause:** Under concurrent `POST /api/student-enquiries/:id/convert` requests, Payload `ValidationError` embeds field errors inside `err.data.errors` rather than top-level `err.errors`, causing PostgreSQL unique-constraint/duplicate-conversion handling to fall through as a generic `400` validation response.
   - **Fix:** Updated `extractValidationErrors` / `isUniqueConstraintError` in `src/lib/api.ts` and added post-error conflict detection inside `convertStudentEnquiry` in `src/services/studentService.ts` so the losing concurrent request deterministically returns `409 Conflict` while only one `Students` record exists.
   - **Verification:** Re-ran `phase1-students.int.spec.ts` (`15/15 PASS`) and full `npm run test:int` (`123/123 PASS`).
2. **Pre-existing Legacy Transition Tests Without `'converted'` Step:**
   - **Root Cause:** Existing `tests/int/enquiry-audit-log.int.spec.ts` (3 test chains) transitioned `in_progress -> allocated` directly and `tests/int/student-enquiries.int.spec.ts` asserted `enquiryStatuses` without `'converted'`. Per approved Phase 0 Decision #1, direct `in_progress -> allocated` must now be disallowed in favor of `in_progress -> converted -> allocated`.
   - **Fix:** Updated those 3 audit-log transition chains to pass through `'converted'`, added a dedicated negative test confirming bare `in_progress -> allocated` and `new -> converted` are rejected, and updated the `enquiryStatuses` unit assertion.
3. **Generated Types Cast Adjustment After `npm run generate:types`:**
   - **Root Cause:** Initial `npx tsc --noEmit` flagged one type cast in `src/services/studentService.ts` against freshly generated `src/payload-types.ts`.
   - **Fix:** Updated cast to align with `Student` / `StudentEnquiry` generated types; subsequent `npx tsc --noEmit` and `npm run build` both passed with exit `0`.

---

## 14. Regression Tests Executed

Executed the entire repository integration suite via `npm run test:int` after final edits:
- Pre-existing suites (all 7 files, **108/108 tests PASS**):
  - `enquiry-audit-log.int.spec.ts` (`28/28`)
  - `student-enquiries.int.spec.ts` (`28/28`)
  - `users.int.spec.ts` (`21/21`)
  - `teachers-api.int.spec.ts` (`3/3`)
  - `auth.int.spec.ts` (`13/13`)
  - `teacher-enquiries.int.spec.ts` (`14/14`)
  - `api.int.spec.ts` (`1/1`)

---

## 15. Known Limitations, Blockers and Not-Run Tests

- **`npm run lint` (Pre-existing Tooling Limitation):** Fails with `ERR_MODULE_NOT_FOUND` for `@eslint/eslintrc` imported by `eslint.config.mjs`. Per Phase 0 approval directives, unrelated dependency/package-manager modifications were intentionally excluded.
- **Global `pnpm` CLI Shim on Windows `PATH`:** Global `pnpm` fails with `MODULE_NOT_FOUND` on this machine (`npm run ...` and `corepack pnpm` operate cleanly).
- **`npm run test:e2e` (Playwright UI Suite):** Intentionally **NOT RUN** per Playbook §2.8 & §8 (out of backend REST API verification scope).
- **Static Migrations:** `src/migrations/` formal migration files were not generated; PostgreSQL schema is synchronized via Payload `push`.

---

## 16. API Documentation Path Updated

- Updated: `API-DOC/student-enquiry.md` (added `enquirySource`, `'converted'` status & transitions, `POST /api/admin/student-enquiries`, `POST /api/student-enquiries/:id/convert`)
- Created: `API-DOC/students.md` (documented `POST /api/students`, `GET /api/students`, `GET /api/students/:id`, `PATCH /api/students/:id`)

---

## 17. Acceptance Criteria Checklist (Playbook Phase 1 Gate & PRD `FR-A1`–`FR-A4`)

- [x] `FR-A1`: `enquirySource` added (`website`, `phone_call`, `email`, `referral`, `network`, `other`, default `'website'`, indexed); public website submissions preserve existing request/response contract and coerce non-admin submissions to `'website'`.
- [x] `FR-A2`: `POST /api/admin/student-enquiries` created, restricted to active `super_admin`, supports all valid sources without public policy-checkbox blocking.
- [x] `FR-A3` + `BR-01`/`BR-02`/`BR-03`: `POST /api/student-enquiries/:id/convert` atomically converts eligible enquiries (`new`, `contacted`, `in_progress`) to `'converted'` and creates one `Students` record; never auto-sets `'allocated'`; rejects `'closed'` (`400`) and already `'converted'`/`'allocated'` (`409`); resists concurrent race duplicates; rolls back transaction if enquiry update fails.
- [x] `FR-A4`: `Students` collection + `POST/GET /api/students` + `GET/PATCH /api/students/:id` implemented with `super_admin` RBAC (`401`/`403`), filters, pagination, field validation, and `studentEnquiry` immutability.
- [x] `npx tsc --noEmit` passes (`exit 0`).
- [x] `npm run test:int` passes all 8 suites (**123/123 tests**, `0` failures, `0` skipped).
- [x] `npm run build` passes (`exit 0`, all new and existing routes compiled).
- [x] API documentation updated (`API-DOC/student-enquiry.md`, `API-DOC/students.md`).
- [x] Phase 1 audit report generated (`Audit-docs/PHASE-01-STUDENT-ENQUIRY-AND-RECORD-AUDIT.md`) and `BACKEND_IMPLEMENTATION_PROGRESS.md` updated.

---

## 18. Final Phase Status

**`PASS WITH DOCUMENTED LIMITATIONS`** *(Phase 1 Functional, Schema, Security, Build, API Test, and Regression Gates: **100% PASS** (`123/123` Vitest integration tests, `npx tsc --noEmit`, `npm run build`, PostgreSQL schema checks). Documented limitation is limited strictly to the pre-existing `npm run lint` missing `@eslint/eslintrc` module and intentional backend-only exclusion of Playwright E2E tests.)*

- **Next Gate:** Await explicit product-owner approval before starting **Phase 2 — Student capability assessment (`FR-B1`)**.
