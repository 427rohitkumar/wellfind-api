# Phase 4 Audit — Teacher Evaluation (`FR-C1` to `FR-C3`)

**Audit Date:** 2026-11-11  
**PRD Reference:** `PRD/WELLFIND_BACKEND_API_PRD.md` (`WA-BE-PRD-001` v1.0) — `FR-C1`, `FR-C2`, `FR-C3`, `BR-10`, `BR-11`, §8–§10  
**Playbook Reference:** `BACKEND_EXECUTION_PLAYBOOK.md` (`WA-BE-EXEC-001` v1.0) — Phase 4  
**Phase Status:** `PASS`

---

## 1. Phase Summary

Phase 4 implements end-to-end backend support for evaluating teacher applicants via independently stored Written Test and Interview results, centrally configurable weighted Quality Score calculation (default `50%` written test / `50%` interview), non-silent audited updates preserving revision and attempt history, and active `super_admin`-only REST access without automatic teacher approval or rejection.

---

## 2. Requirements Implemented (`FR-C1`–`FR-C3`, `BR-10`, `BR-11`)

| Requirement | Status | Verification Summary |
|---|---|---|
| `FR-C1` (`POST /api/teacher-enquiries/:id/evaluations`) | `COMPLETED` | Stores `writtenTest` and `interview` groups independently; requires both for `completed` status (rejects missing section on explicit completion with `400`); validates `0 <= marksObtained <= totalMarks` and `totalMarks > 0`; derives `evaluator` and UTC timestamps server-side; preserves attempt history across multiple evaluations via sequential `attemptNumber`. |
| `FR-C2` (Teacher Quality Score) | `COMPLETED` | Implements exact PRD formula (`Written % = (marks/total)×100`, `Interview % = (marks/total)×100`, `Quality Score = (Written % × writtenWeight) + (Interview % × interviewWeight)`); reads centrally configurable weights from `teacher-evaluation-config` global (defaults `0.50` / `0.50`); stores applied weights and component percentages; recalculates consistently on authorized update (`PATCH`); never auto-approves or auto-rejects applicants. |
| `FR-C3` (Retrieval & Update) | `COMPLETED` | Implements `GET /api/teacher-enquiries/:id/evaluations` (paginated, filtered by `evaluationStatus`), `GET /api/teacher-enquiries/:id/evaluations/:evaluationId` (strictly scoped to `:id`), and `PATCH /api/teacher-enquiries/:id/evaluations/:evaluationId` (requires non-empty `changeReason` on completed records, appends immutable `revisionHistory` snapshots, writes `enquiry-audit-log` `'evaluation'` entries, recalculates score). Restricted exclusively to active `super_admin`. |
| `BR-10` & `BR-11` | `COMPLETED` | Evaluations separate written test and interview results (`BR-10`), and global weight validation enforces strictly positive weights (`0 < w < 1`, sum `= 1.0`) so both scores always contribute (`BR-11`). |

---

## 3. Collections, Globals, Services, and APIs Created / Updated

### Created Files
- `src/globals/TeacherEvaluationConfig.ts` — `teacher-evaluation-config` Payload global storing centralized `writtenTestWeight` (`0.5` default) and `interviewWeight` (`0.5` default) with active `super_admin` access control and `beforeValidate` sum/bounds enforcement.
- `src/collections/TeacherEvaluations.ts` — `teacher-evaluations` Payload collection storing `teacherEnquiry`, unique `(teacherEnquiry, attemptNumber)` index, `evaluationStatus` (`in_progress` \| `completed`), independent `writtenTest` and `interview` groups (`marksObtained`, `totalMarks`, `percentage`, `remarks`, `recordedBy`, `recordedAt`), `appliedWeights`, `qualityScore`, `overallRemarks`, `evaluator`, `evaluatedAt`, `completedAt`, `lastUpdatedBy`, `lastUpdatedAt`, and append-only `revisionHistory` with collection `beforeChange` integrity guards.
- `src/lib/teacherEvaluationValidation.ts` — Section marks validation, centralized weight validation, PRD quality score calculation, create/update request parsing, and non-silent overwrite rules (`changeReason` enforcement on completed evaluations).
- `src/services/teacherEvaluationService.ts` — Transactional (`initTransaction` / `commitTransaction` / `killTransaction`) service implementing creation, paginated listing, scoped detail retrieval, non-silent audited updates, centralized weight lookups, `shortlisted -> evaluation_completed` transition sync, and `enquiry-audit-log` logging.
- `src/app/api/teacher-enquiries/[id]/evaluations/route.ts` — `POST` & `GET /api/teacher-enquiries/:id/evaluations`.
- `src/app/api/teacher-enquiries/[id]/evaluations/[evaluationId]/route.ts` — `GET` & `PATCH /api/teacher-enquiries/:id/evaluations/:evaluationId`.
- `tests/int/phase4-teacher-evaluations.int.spec.ts` — Phase 4 unit & HTTP/DB integration test suite (`9` test cases).
- `API-DOC/teacher-evaluations.md` — Complete API reference for Phase 4 endpoints and global weight settings.

### Modified Files
- `src/collections/TeacherEnquiries.ts` — Added `'evaluation_completed'` to `applicationStatuses` and `VALID_TEACHER_STATUS_TRANSITIONS` (`shortlisted -> evaluation_completed | approved | rejected`; `evaluation_completed -> approved | rejected`), preserving compatibility with existing `shortlisted -> approved` workflows until Phase 5 (`FR-D1`).
- `src/collections/EnquiryAuditLog.ts` — Added `'evaluation'` option to `fieldChanged` so authorized evaluation updates also emit immutable audit-log entries.
- `src/payload.config.ts` — Registered `TeacherEvaluations` collection and `TeacherEvaluationConfig` global.
- `src/payload-types.ts` — Regenerated via `npm run generate:types`.
- `API-DOC/teacher-enquiry.md` — Documented `evaluation_completed` status and linked `API-DOC/teacher-evaluations.md`.

---

## 4. Schema Changes & PostgreSQL Verification

Inspected live PostgreSQL tables, indexes, and enum definitions via `payload.db.pool.query(...)` after running schema push:
- **Tables Verified:** `teacher_evaluations`, `teacher_evaluations_revision_history`, `teacher_evaluation_config`, `teacher_enquiries`, `enquiry_audit_log`.
- **Unique & Performance Indexes Verified:**
  - `teacherEnquiry_attemptNumber_idx` (`CREATE UNIQUE INDEX "teacherEnquiry_attemptNumber_idx" ON public.teacher_evaluations USING btree (teacher_enquiry_id, attempt_number)`)
  - Indexes on `teacher_enquiry_id`, `evaluation_status`, `quality_score`, `evaluator_id`, `evaluated_at`, `completed_at`, `written_test_recorded_by_id`, `interview_recorded_by_id`, `last_updated_by_id`, and `teacher_evaluations_revision_history` (`_parent_id`, `_order`, `changed_by_id`).
- **PostgreSQL Enums Verified:**
  - `enum_teacher_enquiries_application_status`: `new`, `under_review`, `shortlisted`, `evaluation_completed`, `approved`, `rejected`
  - `enum_teacher_evaluations_evaluation_status`: `in_progress`, `completed`
  - `enum_enquiry_audit_log_field_changed`: `enquiryStatus`, `applicationStatus`, `evaluation`

---

## 5. Authentication, Authorization & Security Review

- All four evaluation endpoints enforce `requireSuperAdmin(request)` (`401` when unauthenticated, `403` for `teacher` users or `blocked`/`suspended` accounts).
- Both `TeacherEvaluations` collection access and `TeacherEvaluationConfig` global access enforce `isActiveSuperAdmin(user)` at Payload's access layer.
- Client-supplied values for `evaluator`, `recordedBy`, `lastUpdatedBy`, `qualityScore`, `appliedWeights`, and timestamps are never trusted; identity comes strictly from verified JWT user (`req.user.id`) and timestamps from UTC `new Date().toISOString()`.
- Detail (`GET`) and update (`PATCH`) routes scope lookup strictly by `(teacherEnquiryId, evaluationId)`, returning `404` for mismatched cross-enquiry IDs.
- Evaluations on `approved` or `rejected` teacher applications are rejected with `409 Conflict`.
- Collection hooks reject changing `teacherEnquiry` ownership or truncating/shrinking `revisionHistory`.

---

## 6. Tests Executed & Results

| Check | Command | Result | Scope / Notes |
|---|---|---|---|
| Payload Typegen | `npm run generate:types` | **PASS** (exit `0`) | Regenerated `src/payload-types.ts` for collection + global |
| Formatting | `npx prettier --check ...` | **PASS** (exit `0`) | `10/10` Phase 4 code/test files verified |
| Type Check | `npx tsc --noEmit` | **PASS** (exit `0`) | Zero TypeScript errors across project |
| Targeted Phase 4 Suite | `npx vitest run tests/int/phase4-teacher-evaluations.int.spec.ts --config ./vitest.config.mts` | **PASS** (`9/9`) | Formula math, weights config, RBAC (`401`/`403`), incomplete vs completed rules, non-auto-approve/reject, non-silent overwrite, history & audit logs, 404/409/400 guards, collection immutability |
| Full Integration & Regression Suite | `npm run test:int` | **PASS** (`11/11` files, `150/150` tests, `103.25s`) | Phase 4 (`9/9`) + all 10 prior suites (`141/141`) with zero failures or skipped tests |
| Production Build | `npm run build` | **PASS** (exit `0`) | Next.js `16.3.3` compiled `17.9s`, TS `15.4s`, `17/17` static pages; registered `/api/teacher-enquiries/[id]/evaluations` & `[evaluationId]` |
| ESLint | `npm run lint` | **FAIL** (exit `1`) | Pre-existing missing `@eslint/eslintrc` in top-level `node_modules` (documented in Phase 0 Decision #4) |
| Playwright E2E | — | **NOT RUN** | Excluded per backend-only scope |

---

## 7. Issues Found & Fixed During Phase 4

1. **Collection Validation Test Assertion Match:** Payload `ValidationError` sets top-level `err.message` to `"The following field is invalid: teacherEnquiry"` while storing the custom rule message in `err.data.errors[0].message`. Updated the collection-immutability test in `tests/int/phase4-teacher-evaluations.int.spec.ts` to inspect `err?.data?.errors?.[0]?.message || err?.message` and verified clean rejection on both cross-enquiry rebinding and `revisionHistory` truncation.

---

## 8. Remaining Risks / Limitations (Deferred to Phase 5)

- **Approval Gating Deliberately Deferred (`FR-D1` / Phase 5):** Consistent with Phase 4 boundaries, legacy `shortlisted -> approved` direct updates on `/api/teacher-enquiries/:id` remain permitted in Phase 4 so pre-existing workflow tests pass untouched. Phase 5 (`FR-D1`–`FR-D3`) will enforce completed-evaluation + user-account linkage gating via the dedicated approval workflow and link `TeacherProfiles` to `users` and evaluation scores.
- **Pre-existing ESLint Dependency Limitation:** `npm run lint` remains blocked by missing `@eslint/eslintrc` (pre-existing repo issue; left untouched per Phase 0 Decision #4).

---

## 9. Recommended Next Phase

- **Phase 5 — Teacher Approval, Profile & Account Integration (`FR-D1` to `FR-D3`, `BR-12`, `BR-13`)**, pending explicit user approval.
