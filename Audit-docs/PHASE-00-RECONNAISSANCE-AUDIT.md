# Phase 0 — Repository Reconnaissance and Baseline Audit

**Audit ID:** PHASE-00-RECONNAISSANCE-AUDIT  
**Phase Name:** Phase 0 — Repository Reconnaissance and Contract Baseline  
**PRD References:** `PRD/WELLFIND_BACKEND_API_PRD.md` (`WA-BE-PRD-001` v1.0, Sections 1–15, Modules A–F / `FR-A1`–`FR-F2`, `BR-01`–`BR-18`)  
**Playbook Reference:** `BACKEND_EXECUTION_PLAYBOOK.md` (`WA-BE-EXEC-001` v1.0, Section 3, Section 5 Phase 0, Section 6)  
**Date/Time:** 2026-11-11 19:42 +05:30  
**Repository Root:** `d:\Dev-2026\Builder-Studio\wellfind-api`

---

## 1. Phase Name and PRD References

- **Phase:** Phase 0 — Reconnaissance and Baseline
- **Companion PRD:** `PRD/WELLFIND_BACKEND_API_PRD.md` (`WA-BE-PRD-001` v1.0)
- **Companion Execution Playbook:** `BACKEND_EXECUTION_PLAYBOOK.md` (`WA-BE-EXEC-001` v1.0)
- **PRD Modules Covered by Reconnaissance:**
  - Existing foundation reuse assessment (Auth, Users, Media, Student Enquiries, Teacher Enquiries, Private Teacher Documents, Audit Log, Teacher Profiles)
  - Scope baseline for Phases 1–8 (`FR-A1` to `FR-F2`)

---

## 2. Date / Time

- Baseline inspection, build verification, DB inspection, TypeScript type-check, ESLint check, and Vitest integration runs completed on **2026-11-11** (latest check completed at **19:41:44 +05:30**).

---

## 3. Summary of Delivered Functionality (Phase 0 Scope)

Phase 0 performed **read-only repository reconnaissance and baseline verification** with zero application source-code modifications. The following baseline facts were established:

1. **Technology Stack (`package.json`, `src/payload.config.ts`):**
   - Framework: **Payload CMS 3.92.1** on **Next.js 16.3.3**, **React 19.2.6**, **TypeScript 5.7.3**
   - Database Adapter: `@payloadcms/db-postgres` (PostgreSQL configured via `DATABASE_URL` in `.env`)
   - Test & Build Tooling: **Vitest 4.0.18** (`npm run test:int`), **Playwright 1.63.0** (`npm run test:e2e`), **ESLint** (`npm run lint`), **Next Build** (`npm run build`), **`npx tsc --noEmit`**
2. **Existing Git Working Tree State (Pre-Existing Baseline):**
   - Repository has 1 git commit (`d95299f feat: initial commit`) plus pre-existing uncommitted work across 17 modified tracked files and untracked directories/files including `API-DOC/`, `PRD/`, `scripts/`, `src/app/api/`, `src/lib/`, newer collections (`StudentEnquiries.ts`, `TeacherEnquiries.ts`, `TeacherProfiles.ts`, `TeacherDocuments.ts`, `EnquiryAuditLog.ts`), `tests/int/*.int.spec.ts`, `PROJECT_MAP.md`, `AGENTS.md`, `.kiro/`, and an empty `Audits-docs/` directory.
   - Neither `Audit-docs/` nor `src/migrations/` existed prior to Phase 0 deliverables.
3. **Existing Features Already Present in Codebase (Reconciled Against PRD §3 Reuse-First Table):**
   - Authentication (`/api/auth/login`, `logout`, `me`, `forgot-password`, `verify-otp`, `reset-password`)
   - Admin User Management (`/api/auth/admin/users`, `users/[id]` [`PATCH` only], `block`, `unblock`, `suspend`, `reactivate`, `reset-password`)
   - Student Enquiries (`StudentEnquiries` collection + `/api/student-enquiries` + `/api/student-enquiries/[id]/read`)
   - Teacher Enquiries (`TeacherEnquiries` collection + `/api/teacher-enquiries` + `/api/teacher-enquiries/[id]/read`)
   - Teacher Profiles & Directory APIs (`TeacherProfiles` collection + `/api/teachers` + `/api/teachers/[id]` — already present in repo, not yet documented in `API-DOC/`, and differing in key ways from PRD Phase 4/5 targets)
   - Private Teacher Document Upload Collection (`TeacherDocuments`)
   - Shared Enquiry Unread Counts (`/api/inquiries/unread-counts`)
   - Immutable Enquiry Status Audit Log (`EnquiryAuditLog`)

---

## 4. Files Created

- `Audit-docs/PHASE-00-RECONNAISSANCE-AUDIT.md` (this Phase 0 audit report)
- `BACKEND_IMPLEMENTATION_PROGRESS.md` (repository-root progress tracking file)

No application code, collection schemas, API routes, migrations, or test files were created in Phase 0.

---

## 5. Files Modified

- **None.** All existing repository code, tests, configs, and `API-DOC/` files were left unmodified during Phase 0.

---

## 6. Database / Schema Changes

No database schema modifications were applied by Phase 0 work. Live database reconnaissance (`node scripts/_check-schema.mjs` and direct PostgreSQL inspection via `pg`) confirmed:

1. **PostgreSQL Availability:** Reachable and active via `DATABASE_URL` in local `.env`.
2. **Live Tables Present (15 tables):** Payload core/auth, media, enquiries, teacher profiles, teacher documents, audit log, and `payload_migrations`.
3. **Seeded Baseline Rows Verified:**
   - `users`: 4 active user records (`2` `super_admin`, `2` `teacher`; no raw credentials/PII included in this report).
   - `payload_migrations`: contains `dev` (batch `-1`) and `20261027000000_seed_admin` (batch `1`), while `src/migrations/` does not exist on disk (schema updates currently rely on Payload/Drizzle dev schema push during development/tests).
4. **Live Schema vs `src/payload-generated-schema.ts` Drift:**
   - Live PostgreSQL `enum_student_enquiries_enquiry_status` contains `['new', 'contacted', 'in_progress', 'allocated', 'closed']` (matching `src/collections/StudentEnquiries.ts`).
   - Checked-in `src/payload-generated-schema.ts` (lines 27–30) still reflects an older snapshot (`['new', 'contacted', 'in_progress', 'converted', 'closed']`) and is missing newer schema additions (`mark_as_read`, `change_reason`, `rejection_category`, `teacher_availability`, `teacher_profiles`).
   - Live FK constraints on `teacher_enquiries` and `teacher_profiles` use PostgreSQL's 63-byte truncated identifiers (e.g., `teacher_enquiries_qualification_document_id_teacher_documents_i`, `teacher_profiles_kyc_aadhaar_document_id_teacher_documents_id_f`, `teacher_profiles_kyc_qualification_document_id_teacher_document`), which triggers DDL drop-constraint errors when multiple Vitest workers run `pushDevSchema` concurrently.

---

## 7. Endpoints Implemented (Baseline Existing Inventory)

No new endpoints were implemented in Phase 0. Existing endpoints discovered and verified against route source files:

### Built-in Payload REST API
- `* /api/[...slug]` (`src/app/(payload)/api/[...slug]/route.ts`) — Payload collection REST handlers (`GET`, `POST`, `PATCH`, `PUT`, `DELETE`, `OPTIONS`), gated by each collection's Payload access control.

### Authentication & Current Session (`src/app/api/auth/*`)
| Method | Route | Source File | Auth / Access |
|---|---|---|---|
| `POST` | `/api/auth/login` | `src/app/api/auth/login/route.ts` | Public (`blocked`/`suspended` rejected) |
| `POST` | `/api/auth/logout` | `src/app/api/auth/logout/route.ts` | Authenticated session cookie clear |
| `GET` | `/api/auth/me` | `src/app/api/auth/me/route.ts` | Authenticated user |
| `POST` | `/api/auth/forgot-password` | `src/app/api/auth/forgot-password/route.ts` | Public (OTP generation) |
| `POST` | `/api/auth/verify-otp` | `src/app/api/auth/verify-otp/route.ts` | Public (OTP verification -> reset token) |
| `POST` | `/api/auth/reset-password` | `src/app/api/auth/reset-password/route.ts` | Public with reset auth token |

### Admin User Management (`src/app/api/auth/admin/users/*`)
| Method | Route | Source File | Auth / Access |
|---|---|---|---|
| `GET`, `POST` | `/api/auth/admin/users` | `src/app/api/auth/admin/users/route.ts` | `super_admin` |
| `PATCH` | `/api/auth/admin/users/:id` | `src/app/api/auth/admin/users/[id]/route.ts` | `super_admin` (Note: `GET` and `DELETE` are NOT exported on this custom route) |
| `POST` | `/api/auth/admin/users/block` | `src/app/api/auth/admin/users/block/route.ts` | `super_admin` |
| `POST` | `/api/auth/admin/users/unblock` | `src/app/api/auth/admin/users/unblock/route.ts` | `super_admin` |
| `POST` | `/api/auth/admin/users/suspend` | `src/app/api/auth/admin/users/suspend/route.ts` | `super_admin` |
| `POST` | `/api/auth/admin/users/reactivate` | `src/app/api/auth/admin/users/reactivate/route.ts` | `super_admin` |
| `POST` | `/api/auth/admin/users/reset-password` | `src/app/api/auth/admin/users/reset-password/route.ts` | `super_admin` |

### Student Enquiries, Teacher Enquiries & Unread Counters
| Method | Route | Source File | Auth / Access |
|---|---|---|---|
| `GET`, `POST` | `/api/student-enquiries` | `src/app/api/student-enquiries/route.ts` | `POST`: public; `GET`: `super_admin` |
| `POST`, `PATCH` | `/api/student-enquiries/:id/read` | `src/app/api/student-enquiries/[id]/read/route.ts` | `super_admin` |
| `GET`, `POST` | `/api/teacher-enquiries` | `src/app/api/teacher-enquiries/route.ts` | `POST`: public; `GET`: `super_admin` |
| `POST`, `PATCH` | `/api/teacher-enquiries/:id/read` | `src/app/api/teacher-enquiries/[id]/read/route.ts` | `super_admin` |
| `GET` | `/api/inquiries/unread-counts` | `src/app/api/inquiries/unread-counts/route.ts` | `super_admin` |

### Teacher Profiles Directory (Pre-Existing Beyond `API-DOC/`)
| Method | Route | Source File | Auth / Access |
|---|---|---|---|
| `GET`, `POST` | `/api/teachers` | `src/app/api/teachers/route.ts` | `super_admin` |
| `GET`, `PATCH`, `DELETE` | `/api/teachers/:id` | `src/app/api/teachers/[id]/route.ts` | `super_admin` |

**PRD Target Endpoints Not Yet Implemented (29 custom routes + PRD-aligned extensions across Phases 1–7):**  
All Phase 1–7 student, assessment, physical test/payment/report/sharing, teacher evaluation, teacher approval/availability/status, matching, and allocation endpoints listed in PRD Section 14 (except partial overlap on `/api/teachers` and `/api/teachers/:id`, which require Phase 5 schema/rule alignment).

---

## 8. Request / Response Contract Summary & Contract Discrepancies

### Discrepancies Identified Between Code, `API-DOC/`, `PROJECT_MAP.md`, and PRD

1. **User Roles & Statuses (`API-DOC/auth.md` & `README.md` vs Live `Users.ts`, `src/lib/auth.ts`, `API-DOC/users.md`):**
   - **Live Canonical Truth:** `role` is strictly `'super_admin' | 'teacher'` (default `'teacher'`); `status` is strictly `'active' | 'blocked' | 'suspended'` (default `'active'`).
   - **Stale Documentation:** `API-DOC/auth.md` and `README.md` reference removed roles (`admin`, `staff` with default `staff`) and removed status (`inactive`), which do not exist in `Users.ts` or Postgres (`users.md` Section 10 notes `admin`, `staff`, and `inactive` were removed).
   - **Login Status Check Mismatch (`src/app/api/auth/login/route.ts`):** `login/route.ts` explicitly checks `user.status === 'suspended' || user.status === 'inactive'` (referencing legacy `'inactive'` rather than `'blocked'`). While `Users.ts`'s `afterLogin` hook still blocks `'blocked'` and `'suspended'` users, `'blocked'` triggers the `afterLogin` error path in `catch` rather than the explicit status check in `login/route.ts`.
2. **Response Envelope Conventions (`API-DOC/` vs Existing Routes vs PRD):**
   - Existing custom routes vary across modules (e.g., `/api/auth/admin/users` vs `/api/teachers` vs `/api/student-enquiries`). Future PRD Phase 1–7 endpoints specify `{ success, message, data }` (PRD Section 10), while existing routes must preserve backward compatibility (Playbook Section 2 rule 7).
3. **`/api/auth/admin/users/[id]` Route Coverage (`PROJECT_MAP.md` vs Actual Route):**
   - `src/app/api/auth/admin/users/[id]/route.ts` exports **only `PATCH`** (no `GET` or `DELETE`), whereas `PROJECT_MAP.md` §7.2 describes `GET` / `DELETE` behavior. Built-in Payload `/api/users/:id` handles `GET`/`PATCH`/`DELETE`, subject to `Users.ts` collection access control.
4. **Student Enquiry Status `'converted'` vs `'allocated'` (CRITICAL — Affects Phase 1):**
   - **Live `StudentEnquiries.ts` & Postgres enum:** `['new', 'contacted', 'in_progress', 'allocated', 'closed']`, where `'converted'` is normalized to `'allocated'`, `'allocated'` is terminal, and `'new' -> 'allocated'` directly is disallowed (`new -> contacted -> in_progress -> allocated`).
   - **PRD (`FR-A3` & Section 9):** Specifies setting enquiry status to `'converted'` when converting an enquiry into a Student record, BEFORE capability assessment, optional physical test, matching, and teacher allocation occur.
5. **Teacher Evaluation & Approval Workflow (`TeacherEnquiries.ts` & `TeacherProfiles.ts` vs PRD `FR-C1`–`FR-D3`):**
   - Currently `TeacherEnquiries.afterChange` automatically runs `syncApprovedTeacherProfile()` when `applicationStatus` becomes `'approved'`, creating/linking a `TeacherProfiles` record **without requiring an evaluation record** and **without creating/linking a `users` account**.
   - `TeacherEnquiries` does not yet include `'evaluation_completed'` status (PRD Section 9), and `TeacherProfiles` does not yet include a `user` relationship or `qualityScore` field.
6. **Undocumented Pre-Existing Endpoints in `API-DOC/`:**
   - `/api/teachers`, `/api/teachers/[id]`, `/api/student-enquiries/[id]/read`, `/api/teacher-enquiries/[id]/read`, `/api/inquiries/unread-counts`, and `EnquiryAuditLog` exist in code/tests but have no documentation in `API-DOC/`.

---

## 9. Validation and Business Rules Implemented (Live Baseline)

- **Users (`src/collections/Users.ts`):**
  - `role`: `'super_admin' | 'teacher'` (default `'teacher'`)
  - `status`: `'active' | 'blocked' | 'suspended'` (default `'active'`)
  - `afterLogin`: rejects `blocked` and `suspended` accounts.
  - Admin user routes prevent deactivating/demoting/blocking/suspending the last active `super_admin` and redact sensitive auth/OTP/reset token fields.
- **Student Enquiries (`src/collections/StudentEnquiries.ts`):**
  - Canonical `enquiryStatuses`: `new`, `contacted`, `in_progress`, `allocated`, `closed`.
  - `'converted'` normalized to `'allocated'` in `beforeChange`; `'allocated'` is terminal.
  - Non-empty `changeReason` required when transitioning to `closed` or reopening from `closed`.
  - Phone normalization and validation implemented.
  - Status changes automatically write immutable entries to `enquiry-audit-log`.
- **Teacher Enquiries (`src/collections/TeacherEnquiries.ts`):**
  - Canonical `applicationStatuses`: `new`, `under_review`, `shortlisted`, `approved`, `rejected`.
  - `rejectionCategories`: includes `character_conduct` (cannot be reopened once rejected under `character_conduct`).
  - `teacherAvailabilityStates`: `free`, `allocated`.
  - Approval triggers `syncApprovedTeacherProfile()` and `enquiry-audit-log` hooks.
- **Teacher Profiles (`src/collections/TeacherProfiles.ts`):**
  - Fields: `name`, `email`, `mobile`, `avatar`, `primarySubject`, `qualification`, `experienceYears`, `classLevels`, `locality`, `availability`, `applicantNotes`, `teacherEnquiry` (required), `approvalStatus` (`approved`/`pending`/`rejected`), plus `registrationFee`, `kyc`, `studentAllocation`, and `account` (`active`/`inactive`/`suspended`).

---

## 10. Authorization / Access-Control Behavior

- **Canonical Roles Verified in Code:** ONLY `'super_admin'` and `'teacher'` exist in `Users.ts` and `src/lib/auth.ts`.
- **Users Collection (`Users.ts`):**
  - `access.read` currently returns `{ id: { equals: user.id } }` for any logged-in user and **lacks an explicit `super_admin` `return true` condition** at the collection level. Custom admin endpoints (`/api/auth/admin/users*`) succeed because they check `super_admin` at route level and call Payload Local API with default `overrideAccess: true`.
- **Enquiries & Profiles & Private Documents:**
  - `StudentEnquiries` and `TeacherEnquiries`: public `POST` submission allowed; read/list/update/read-marking restricted to `super_admin`.
  - `TeacherProfiles` & `/api/teachers*`: restricted to `super_admin`.
  - `TeacherDocuments`: private upload collection locked down to `super_admin` for all CRUD operations.
  - `EnquiryAuditLog`: immutable (`create: () => false`, `update: () => false`, `delete: () => false`), `read` restricted to `super_admin`.

---

## 11. Tests Executed, Exact Commands and Results

| Check | Exact Command | Exit Code | Result Summary |
|---|---|---|---|
| TypeScript Type-Check | `npx tsc --noEmit` | `0` | **PASS** (no compiler errors) |
| ESLint Check | `npm run lint` | `1` | **FAIL (Pre-existing environment/dependency issue):** `Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@eslint/eslintrc' imported from D:\Dev-2026\Builder-Studio\wellfind-api\eslint.config.mjs` |
| Vitest (Default Parallel) | `npm run test:int` | `1` | **FAIL (Pre-existing parallel DB/race):** `Test Files 4 failed \| 3 passed (7)`, `Tests 2 failed \| 62 passed \| 43 skipped (107)`, Duration `23.41s` |
| Vitest (Sequential Verified) | `npx vitest run --config ./vitest.config.mts --no-file-parallelism` | `0` | **PASS:** `Test Files 7 passed (7)`, `Tests 107 passed (107)`, Duration `43.93s` |
| Playwright E2E | `npm run test:e2e` | — | **NOT RUN** (out of backend-only scope per Playbook §2.8 & §8) |

### Per-File Breakdown — Default Parallel (`npm run test:int`)
- `tests/int/api.int.spec.ts`: **FAILED** at `beforeAll` (`1 skipped`) — concurrent `pushDevSchema` error (`42704: constraint "teacher_profiles_kyc_aadhaar_document_id_teacher_documents_id_f" does not exist`)
- `tests/int/auth.int.spec.ts`: **FAILED** at `beforeAll` (`13 skipped`) — concurrent `pushDevSchema` error (`42704: constraint "teacher_enquiries_qualification_document_id_teacher_documents_i" does not exist`)
- `tests/int/users.int.spec.ts`: **FAILED** at `beforeAll` (`21 skipped`) — concurrent `pushDevSchema` error (`42704: constraint "teacher_enquiries_qualification_document_id_teacher_documents_i" does not exist`)
- `tests/int/teachers-api.int.spec.ts`: **FAILED** (`1 passed | 2 failed`) — `should allow super_admin to list approved teachers` and `should allow super_admin to get teacher details by profile ID` returned `403` instead of `200` due to concurrent auth/password mutation across parallel test workers
- `tests/int/teacher-enquiries.int.spec.ts`: suite `✓`, `6 passed | 8 skipped` (caught `pushDevSchema` `42704` error and skipped DB-backed tests)
- `tests/int/enquiry-audit-log.int.spec.ts`: **PASS** (`27/27`)
- `tests/int/student-enquiries.int.spec.ts`: **PASS** (`28/28`)

### Per-File Breakdown — Sequential (`npx vitest run --config ./vitest.config.mts --no-file-parallelism`)
- `tests/int/teachers-api.int.spec.ts`: **PASS** (`3/3`, `2805ms`)
- `tests/int/auth.int.spec.ts`: **PASS** (`13/13`, `2753ms`)
- `tests/int/users.int.spec.ts`: **PASS** (`21/21`, `3907ms`)
- `tests/int/api.int.spec.ts`: **PASS** (`1/1`, `828ms`)
- `tests/int/enquiry-audit-log.int.spec.ts`: **PASS** (`27/27`, `3658ms`)
- `tests/int/student-enquiries.int.spec.ts`: **PASS** (`28/28`, `4495ms`)
- `tests/int/teacher-enquiries.int.spec.ts`: **PASS** (`14/14`, `1543ms`)

---

## 12. Build / Type-Check Result

- **Production Build Command:** `npm run build` (`cross-env NODE_OPTIONS="--no-deprecation --max-old-space-size=8000" next build`)
- **Exit Code:** `0` (**PASS**)
- **Observed Output:** `Compiled successfully in 7.3s`, `Finished TypeScript in 12.4s`, `Generating static pages ... 15/15`.
- **TypeScript Direct Check (`npx tsc --noEmit`):** Exit Code `0` (**PASS**).

---

## 13. Failures Encountered and Root-Cause Analysis

No code edits were performed during Phase 0; all failures observed are **pre-existing baseline issues**:

1. **Default `npm run test:int` Parallel Database & State Race:**
   - **Root Cause:** Vitest runs all 7 integration suites concurrently against a single shared PostgreSQL database (`DATABASE_URL`). Each worker initializes Payload and invokes Drizzle `pushDevSchema`, racing on `ALTER TABLE ... DROP CONSTRAINT` against truncated 63-char FK constraint names (`SQLSTATE 42704`) while `auth.int.spec.ts` concurrently rotates `ADMIN_EMAIL`'s password during OTP reset tests (breaking concurrent admin logins in `teachers-api.int.spec.ts`).
   - **Baseline Verification:** Running Vitest sequentially (`--no-file-parallelism`) resolved the race completely (`7/7` test files, `107/107` tests passing). Recommendation for Phase 1 setup: evaluate setting `fileParallelism: false` in `vitest.config.mts` or isolated per-worker test schemas before writing new test suites.
2. **ESLint Execution Failure (`npm run lint`):**
   - **Root Cause:** `eslint.config.mjs` imports `@eslint/eslintrc`, which exists in `pnpm-lock.yaml` (`@eslint/eslintrc@3.3.7` under `eslint-config-next`) but is not hoisted to top-level `node_modules/@eslint/eslintrc` under pnpm's strict layout.
3. **`pnpm` Global CLI Broken on Windows `PATH`:**
   - **Root Cause:** Global `pnpm` shim throws `MODULE_NOT_FOUND` (`C:\Users\427ro\AppData\Roaming\npm\node_modules\pnpm\bin\pnpm.cjs`), causing `"test": "pnpm run test:int && pnpm run test:e2e"` in `package.json` to fail if invoked directly via `pnpm`. `npm` (`v10.9.8`) and `corepack pnpm` (`12.18.0`) work cleanly.

---

## 14. Regression Tests Executed

In Phase 0, the full existing backend test suite (`107` tests across `7` integration suites) serves as the baseline regression benchmark. Sequential execution verified **107/107 passing** when isolated from parallel DB schema-push contention.

---

## 15. Known Limitations, Blockers, Not-Run Tests, and Product Decisions Required Before Phase 1

### Tooling / Baseline Limitations
- `npm run lint` is currently broken (`ERR_MODULE_NOT_FOUND` for `@eslint/eslintrc`).
- Default `npm run test:int` fails under parallel worker execution unless run with `--no-file-parallelism`.
- `src/payload-generated-schema.ts` is out of sync with live collections and live DB, and `src/migrations/` does not yet contain formal migration files.
- `tests/e2e/admin.e2e.spec.ts` (Playwright UI suite) was intentionally **NOT RUN** (out of backend API scope per Playbook §2.8 & §8; additionally, its helper `seedTestUser()` does not set `role: 'super_admin'`).
- Empty pre-existing `Audits-docs/` directory exists at repository root alongside the required `Audit-docs/` directory created in Phase 0.
- External WhatsApp delivery and payment gateway checkout/webhook integrations are intentionally unconfigured and out of scope per PRD/Playbook (Phase 3 will use record/status storage only unless otherwise directed).

### Resolved Product & Tooling Decisions (Approved 2026-11-11 20:04 +05:30)
Per Playbook Section 3.1, Phase 0 Gate, and Section 11, the product owner reviewed Phase 0 findings and resolved all pending decisions before Phase 1:

1. **Student Enquiry Conversion (Resolves Phase 1 `FR-A3` Design):**
   - Add `'converted'` as a distinct status in `enquiryStatuses`.
   - Use the transition flow: `new -> contacted -> in_progress -> converted -> allocated`.
   - Allow explicit admin conversion from `'new'`, `'contacted'`, and `'in_progress'`.
   - Do **not** convert status to `'allocated'` automatically during student conversion.
   - Do **not** allow conversion from `'closed'` or already `'allocated'` enquiries.
2. **Physical Test Tester Assignment (Resolves Phase 3 `FR-B4`):**
   - Do **not** introduce a new `tester` role.
   - `testerUserId` will reference an active `'teacher'` or `'super_admin'` user, keeping tester assignment permissions restricted to the required functionality.
3. **Teacher Evaluation and Approval (Resolves Phase 4–5 `FR-C1`–`FR-D3`):**
   - Approval must require a completed teacher evaluation and valid user-account linkage.
   - Preserve existing `TeacherProfiles` fields and `/api/teachers` API compatibility while adding user linkage and quality score without breaking existing functionality.
4. **Tooling and Directory Decisions:**
   - Configure Vitest with `fileParallelism: false` in `vitest.config.mts` to prevent PostgreSQL test concurrency issues.
   - Use `Audit-docs/` as the canonical audit directory and remove empty `Audits-docs/` after confirming emptiness.
   - Keep `pnpm` global `PATH` issue documented separately (`npm` / `corepack pnpm` work); do not make unrelated dependency or package-manager changes.

---

## 16. API Documentation Path Updated

- Existing `API-DOC/` files inspected:
  - `API-DOC/auth.md`
  - `API-DOC/users.md`
  - `API-DOC/student-enquiry.md`
  - `API-DOC/teacher-enquiry.md`
- **No `API-DOC/` files were modified in Phase 0.** Per Playbook §7, documentation must reflect only implemented/verified behavior; discrepancies in `API-DOC/auth.md` (legacy roles/statuses) and undocumented pre-existing endpoints (`/api/teachers*`, `/api/inquiries/unread-counts`, `.../read`) are recorded in Sections 7–8 above to guide clean updates starting in Phase 1+.

---

## 17. Acceptance Criteria Checklist (Playbook Phase 0 Gate)

- [x] Both `PRD/WELLFIND_BACKEND_API_PRD.md` and `BACKEND_EXECUTION_PLAYBOOK.md` read completely before any edits.
- [x] Repository structure, `package.json` scripts, Payload config, TypeScript config, test configs, and collections inspected.
- [x] Existing custom routes inspected and compared against `API-DOC/`.
- [x] Canonical database role/status values (`super_admin`, `teacher`; `active`, `blocked`, `suspended`) and collection state enums verified from live code and live PostgreSQL.
- [x] Local PostgreSQL connectivity and baseline data verified (`15` tables, `4` users, `payload_migrations` inspected).
- [x] Root `Audit-docs/` folder confirmed/created and `Audits-docs/` duplicate noted without overwriting anything.
- [x] Baseline `npx tsc --noEmit` executed (`PASS`).
- [x] Baseline `npm run build` executed (`PASS`).
- [x] Baseline `npm run lint` executed and pre-existing failure documented (`FAIL` — missing `@eslint/eslintrc`).
- [x] Baseline `npm run test:int` (parallel) and sequential Vitest executed and exact results/root cause recorded (`FAIL` parallel `4/7` suites -> `PASS` sequential `7/7` suites, `107/107` tests).
- [x] Root `BACKEND_IMPLEMENTATION_PROGRESS.md` created.
- [x] `Audit-docs/PHASE-00-RECONNAISSANCE-AUDIT.md` created.
- [x] Product decisions and baseline tooling resolution approved by product owner (2026-11-11 20:04 +05:30).

---

## 18. Final Phase Status

**`PASS WITH DOCUMENTED LIMITATIONS`** (Phase 0 Reconnaissance & Baseline Complete; product decisions resolved and **Phase 1 explicitly approved**).

- **Baseline Notes:** Pre-existing `npm run lint` (`ERR_MODULE_NOT_FOUND` for `@eslint/eslintrc`) and broken global `pnpm` on `PATH` remain documented separately without unrelated dependency/package-manager modifications. `vitest.config.mts` concurrency and `Audits-docs/` cleanup are approved to apply before Phase 1 coding.
- **Next Gate:** Proceed to **Phase 1 — Student enquiry extension and conversion**.
