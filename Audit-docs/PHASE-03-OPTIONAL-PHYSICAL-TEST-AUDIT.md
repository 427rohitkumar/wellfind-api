# Phase 3 Audit Report — Optional Physical Student Test (`FR-B2` – `FR-B6`)

- **Audit ID:** `PHASE-03-OPTIONAL-PHYSICAL-TEST-AUDIT`
- **Document Authority:** `PRD/WELLFIND_BACKEND_API_PRD.md` (`WA-BE-PRD-001` v1.0) & `BACKEND_EXECUTION_PLAYBOOK.md` (`WA-BE-EXEC-001` v1.0)
- **Date:** 2026-11-11
- **Status:** **PASS** (Phase 3 complete; awaiting explicit approval for Phase 4)

---

## 1. Phase Scope & Requirements Covered

Implemented and verified Phase 3 (**Optional Physical Student Test**), strictly scoped to `FR-B2` through `FR-B6` and business rules `BR-05`–`BR-09` and `BR-18` (plus Phase 0 Decision #2):

| PRD ID | Requirement | Verification Status |
| :--- | :--- | :--- |
| `FR-B2` | Optional physical student test request (`POST`/`GET /api/students/:studentId/tests`); skip cleanly without persistence when `parentSelected: false` | **PASS** |
| `FR-B3` | ₹100 (`INR`) fee payment record (`POST /api/student-tests/:testId/payment`), payment state transitions, and concurrent/sequential duplicate payment protection | **PASS** |
| `FR-B4` | Tester assignment/reassignment (`PATCH /api/student-tests/:testId/assign-tester`, `GET /api/student-tests/:testId`) for active `teacher` or `super_admin` users without creating a separate `tester` role | **PASS** |
| `FR-B5` | 1:1 physical test report submission (`POST /api/student-tests/:testId/report`), marks/subject bounds validation, assigned-tester & payment preconditions, atomic `report_available` transition | **PASS** |
| `FR-B6` | Report privacy enforcement (`GET /api/student-tests/:testId/report`), WhatsApp/phone-call sharing logs (`POST`/`GET /api/student-tests/:testId/report/share`) with truthful non-delivery flags | **PASS** |
| `BR-04` / `BR-18` | Independence from Phase 2 academic capability assessments (`student-assessments` continues working with zero physical tests) | **PASS** |

No Phase 4+ functionality (teacher evaluation, quality scores, teacher approval/profiles, tutor matching, or student allocations) was implemented.

---

## 2. Decisions Applied & Architectural Design

1. **No New `tester` Role (Phase 0 Decision #2):** Reused existing `Users` collection roles `'teacher'` and `'super_admin'`. Tester assignment validates that the target user exists (`404`), is `'active'` (`400` if blocked/suspended), and holds `'teacher'` or `'super_admin'` (`400`).
2. **Next.js App Router Segment Consistency:** Placed `tests` under `src/app/api/students/[id]/tests/route.ts` matching existing `[id]` dynamic segments (`/api/students/[id]/route.ts`, `/api/students/[id]/assessments/route.ts`) to prevent App Router dynamic slug conflicts.
3. **Acyclic Foreign-Key Graph (DAG):** Avoided circular foreign keys between `student_tests` ↔ `student_test_payments` / `student_test_reports`. Instead:
   - `student_test_payments.student_test_id` and `student_test_reports.student_test_id` reference `student_tests.id`.
   - `StudentTests.beforeChange` verifies persisted `'paid'` `student-test-payments` (`100` `INR`) inside the active transaction before allowing any paid-dependent status (`paid`, `tester_assigned`, `scheduled`, `completed`, `report_available`), and verifies a `student-test-reports` record before allowing `report_available`.
4. **Concurrency-Safe PostgreSQL Uniqueness:**
   - `StudentTestPayments.successfulPaymentKey` (`unique: true`, nullable) is populated with `String(studentTestId)` exclusively when `paymentStatus === 'paid'`, permitting multiple `'failed'` / `'pending'` retry records (`null`) while preventing duplicate `'paid'` settlements under concurrent requests (`23505` → `409 Conflict`).
   - `StudentTestReports.studentTest` (`unique: true`) enforces 1:1 report uniqueness at the PostgreSQL index layer (`23505` → `409 Conflict`).
5. **Truthful Non-Integrated Sharing (`FR-B6`):** Every share log forces `externalDeliveryConfirmed: false` and `providerIntegrated: false` in both service logic and collection `beforeChange` hook, and explicitly rejects client claims of `'delivered'` or `'read'` (`400 Bad Request`).
6. **UTC Timestamps:** `parseIsoTimestampWithOffset` requires an explicit timezone designator (`Z` or `±HH:MM`) and converts timestamps using `Date.toISOString()` without fixed timezone shifts.

---

## 3. Files Created and Modified

### Created Files
- `src/collections/StudentTests.ts` (`student-tests`)
- `src/collections/StudentTestPayments.ts` (`student-test-payments`)
- `src/collections/StudentTestReports.ts` (`student-test-reports`)
- `src/collections/StudentTestReportShares.ts` (`student-test-report-shares`)
- `src/lib/physicalTestValidation.ts` (validators, constants, UTC ISO timestamp parser)
- `src/services/physicalTestService.ts` (transactional Phase 3 workflows & serializers)
- `src/app/api/students/[id]/tests/route.ts` (`POST`, `GET`)
- `src/app/api/student-tests/[id]/route.ts` (`GET`)
- `src/app/api/student-tests/[id]/payment/route.ts` (`POST`)
- `src/app/api/student-tests/[id]/assign-tester/route.ts` (`PATCH`)
- `src/app/api/student-tests/[id]/report/route.ts` (`POST`, `GET`)
- `src/app/api/student-tests/[id]/report/share/route.ts` (`POST`, `GET`)
- `tests/int/phase3-physical-tests.int.spec.ts` (Phase 3 unit, integration, concurrency & RBAC test suite)
- `API-DOC/student-tests.md` (complete API documentation)
- `Audit-docs/PHASE-03-OPTIONAL-PHYSICAL-TEST-AUDIT.md` (this audit report)

### Modified Files
- `src/lib/api.ts` — extracted shared `requireActiveUser(request)` (composed by `requireSuperAdmin`) and `authorizeRouteWithId(request, context, options)` to avoid duplicated auth/ID preflight code.
- `src/payload.config.ts` — registered `StudentTests`, `StudentTestPayments`, `StudentTestReports`, and `StudentTestReportShares`.
- `src/payload-types.ts` — regenerated via `npm run generate:types`.
- `API-DOC/students.md` — appended optional physical test cross-reference section.

---

## 4. Database Schema, Indexes & Constraints Verified (PostgreSQL)

Inspected directly in PostgreSQL (`pg_indexes` and `information_schema.table_constraints` after Payload schema sync):

- **Tables Created (6):**
  - `student_tests`
  - `student_tests_assignment_history`
  - `student_test_payments`
  - `student_test_reports`
  - `student_test_reports_subject_results`
  - `student_test_report_shares`
- **Unique Indexes Verified:**
  - `student_test_payments_successful_payment_key_idx` (`CREATE UNIQUE INDEX ... ON public.student_test_payments USING btree (successful_payment_key)`)
  - `student_test_reports_student_test_idx` (`CREATE UNIQUE INDEX ... ON public.student_test_reports USING btree (student_test_id)`)
- **Foreign Keys & Delete Rules Verified:**
  - Relationship FKs on parent collections (`student_id` → `students`, `student_test_id` → `student_tests`, `report_id` → `student_test_reports`, `assigned_tester_id`/`assigned_by_id`/`created_by_id`/`recorded_by_id`/`submitted_by_id`/`shared_by_id` → `users`) use `SET NULL`.
  - Child array tables (`student_tests_assignment_history._parent_id`, `student_test_reports_subject_results._parent_id`) use `CASCADE`.
  - No circular foreign-key dependencies exist.

---

## 5. Security, RBAC & Data Privacy Verification

- **401 Unauthenticated:** Enforced across all 9 endpoint handlers via `requireActiveUser` / `requireSuperAdmin`.
- **403 Role & Status Guards:**
  - Blocked or suspended users (`super_admin` or `teacher`) are immediately rejected (`403`), even if previously assigned as a tester (`suspended` teacher blocked on `GET /api/student-tests/:testId`, `POST /api/student-tests/:testId/report`, `GET /api/student-tests/:testId/report`).
  - Teachers cannot create/skip tests, list student tests, record payments, assign testers, read `payments` arrays, or create/list report share logs (`403`).
  - Unassigned active teachers and previously assigned teachers who were reassigned away lose access immediately (`403` on detail, report submission, and report read).
  - Payload CMS collection-level ACLs (`overrideAccess: false`) enforce `assignedTester == user.id` scoping on `student-tests` and `student-test-reports`, restrict `student-test-payments` and `student-test-report-shares` reads to active `super_admin`, and set `student-test-report-shares` `update`/`delete` to `false`.

---

## 6. Verification Command Summary (Post-Final Code Edit)

| Check | Command | Result | Scope & Notes |
| :--- | :--- | :--- | :--- |
| Type Generation | `npm run generate:types` | **PASS** (exit `0`) | Generated `StudentTest`, `StudentTestPayment`, `StudentTestReport`, `StudentTestReportShare` interfaces in `src/payload-types.ts`. |
| Formatting | `npx prettier --check <14 Phase 3 files>` | **PASS** (exit `0`) | Verified after `--write` on all Phase 3 source/test files (`All matched files use Prettier code style!`). |
| TypeScript Check | `npx tsc --noEmit` | **PASS** (exit `0`) | Zero compiler errors across entire repository. |
| Integration & Unit Tests | `npm run test:int` | **PASS** (exit `0`) | **10/10 test files, 141/141 tests passed** sequentially in `54.58s`:<br>• `phase3-physical-tests.int.spec.ts`: `10/10`<br>• `phase2-student-assessments.int.spec.ts`: `8/8`<br>• `phase1-students.int.spec.ts`: `15/15`<br>• `student-enquiries.int.spec.ts`: `28/28`<br>• `enquiry-audit-log.int.spec.ts`: `28/28`<br>• `users.int.spec.ts`: `21/21`<br>• `teacher-enquiries.int.spec.ts`: `14/14`<br>• `auth.int.spec.ts`: `13/13`<br>• `teachers-api.int.spec.ts`: `3/3`<br>• `api.int.spec.ts`: `1/1` |
| Production Build | `npm run build` | **PASS** (exit `0`) | `Next.js 16.3.3 (Turbopack)`: compiled in `4.0s`, TypeScript in `7.2s`, `17/17` static pages in `759ms`; all 6 Phase 3 routes built as dynamic endpoints. |
| Linting | `npm run lint` | **FAIL (Pre-existing)** | Fails with `ERR_MODULE_NOT_FOUND: Cannot find package '@eslint/eslintrc'` imported from `eslint.config.mjs` (unchanged from Phase 0 decision #4). |
| Browser E2E | `npm run test:e2e` | **NOT RUN** | Out of scope for backend API Phase 3. |

---

## 7. Known Gaps & Non-Blocking Observations

1. **ESLint Dependency (`@eslint/eslintrc`):** Pre-existing repository issue in `eslint.config.mjs`; package dependencies were intentionally left untouched per Phase 0 Decision #4.
2. **Migration Files Directory:** `src/migrations/` does not exist; schema updates currently synchronize via `@payloadcms/db-postgres` schema push rather than checked-in SQL migration scripts.
3. **Provider Webhook Delivery Confirmation:** WhatsApp/telephony provider integration is outside backend Phase 3 scope (`externalDeliveryConfirmed: false`, `providerIntegrated: false`).
4. **Collection Query Cap on Teacher Report ACL:** `StudentTestReports.access.read` queries up to `limit: 1000` assigned tests for a `teacher` user.

---

## 8. Readiness Verdict

Phase 3 acceptance criteria (`FR-B2`–`FR-B6`, `BR-05`–`BR-09`, `BR-18`) and regression checks are **100% verified and passing**. Ready for explicit user approval to begin **Phase 4**.
