# Wellfind Academic — Backend Implementation Documentation

**Project:** `wellfind-api` — Payload CMS 3.92 + Next.js 16 + PostgreSQL backend for a managed one-to-one education network (UKG–Class 10).
**Requirement source:** `PRD/WELLFIND_BACKEND_API_PRD.md` (WA-BE-PRD-001 v1.0) · **Execution rules:** `BACKEND_EXECUTION_PLAYBOOK.md` (WA-BE-EXEC-001 v1.0)
**Status:** All phases 0–8 complete and verified. Last verification: type check clean, **176/176** integration tests passing, production build passing.
**Last updated:** 2026-11-17

> This file is the single overview of what is built. Details live in `API-DOC/` (per-endpoint contracts), `Audit-docs/` (per-phase audits) and `BACKEND_IMPLEMENTATION_PROGRESS.md` (phase tracker).

---

## 1. Completion summary

| Phase | Scope | PRD refs | Status |
|---|---|---|---|
| 0 | Reconnaissance and baseline | — | Done |
| 1 | Student enquiry extension, conversion, student records | FR-A1–A4 | Done |
| 2 | Student capability assessment | FR-B1 | Done |
| 3 | Optional physical test (₹100), tester, report, sharing | FR-B2–B6 | Done |
| 4 | Teacher evaluation and quality score | FR-C1–C3 | Done |
| 5 | Teacher approval, profile, user account | FR-D1–D3 | Done |
| 6 | Student–teacher matching | FR-E1–E2 | Done |
| 7 | Teacher allocation | FR-F1–F2 | Done |
| 8 | Final integration, regression, audit | — | Done |

Business rules BR-01 to BR-13 are all implemented (see §6).

## 2. End-to-end workflow

```
Student side
  Enquiry (website / admin-created) ──convert──▶ Student ──▶ Assessment(s)
                                                   │            (optional) Physical test ₹100
                                                   │            → payment → tester → report → share record
                                                   ▼
                                             Matching (eligible teachers, saved decisions)
                                                   ▼
                                             Allocation (assigned → accepted → active → completed)
Teacher side
  Public application ─▶ under_review ─▶ shortlisted ─▶ Evaluation (written + interview, quality score)
        ─▶ evaluation_completed ─▶ Approve ─▶ Teacher profile + teacher login account
```

Nothing is auto-approved, auto-rejected or auto-allocated: every decision is an explicit `super_admin` action.

## 3. What existed before this work (baseline, preserved)

- **Authentication:** login, logout, `me`, forgot-password / OTP verification / reset-password.
- **User management (super_admin):** create/list/get/update users, block/unblock, suspend/reactivate, admin password reset. Roles are `super_admin` and `teacher`; statuses `active`, `blocked`, `suspended`. No roles or statuses were added or renamed.
- **Student enquiries** (public submission, admin list/read/update, unread counts, status workflow with audited changes) and **teacher applications** (public submission with private KYC documents, review workflow, audit log, profile sync).
- **Teacher profile list/read/update** at `/api/teachers`.

All of these remain backward compatible; their regression tests still pass.

## 4. What was implemented, by phase

### Phase 1 — Student enquiries and student records (FR-A1–A4)
- `enquirySource` on student enquiries (`website`, `phone_call`, `email`, `referral`, `network`, `other`); public submissions are always stored as `website`; list supports `?enquirySource=`.
- New enquiry status `converted` (`new → contacted → in_progress → converted → allocated`).
- `POST /api/admin/student-enquiries` — admin creates offline enquiries.
- `POST /api/student-enquiries/:id/convert` — atomic conversion into exactly one `students` record plus audit entry; duplicate and concurrent conversions are blocked (409); closed enquiries rejected (400).
- `Students` collection with `POST/GET /api/students`, `GET/PATCH /api/students/:id`; the link to the original enquiry is immutable.

### Phase 2 — Capability assessment (FR-B1)
- `student-assessments` (many per student, full history): assessment type, previous performance, current capability (`excellent`, `good`, `average`, `needs_improvement`, `weak`), strengths, weaknesses, admin notes, assessor, timestamp. No physical test required.
- `POST/GET /api/students/:studentId/assessments` (paginated, filterable).

### Phase 3 — Optional physical test (FR-B2–B6)
- Collections: `student-tests`, `student-test-payments`, `student-test-reports`, `student-test-report-shares`.
- Requesting a test is optional (`parentSelected: false` simply skips, no record written). Fee is fixed at ₹100 INR; any other amount is rejected.
- Payment is a **record only** (`pending`/`paid`/`failed`); no gateway exists. Only one `paid` payment per test (database-enforced).
- Tester must be an active `teacher` or `super_admin` user (no new role). A tester is required before the test proceeds; reassignment revokes the previous tester's access.
- Report: marks ≥ 0 and ≤ total, subject-wise results, capability, remarks; one report per test; visible only to `super_admin` and the currently assigned tester.
- Sharing (`whatsapp`, `phone_call`) is recorded as a communication log only; the API never claims external delivery.
- Endpoints: `POST/GET /api/students/:id/tests`, `GET /api/student-tests/:id`, `POST /api/student-tests/:id/payment`, `PATCH /api/student-tests/:id/assign-tester`, `POST/GET /api/student-tests/:id/report`, `POST/GET /api/student-tests/:id/report/share`.

### Phase 4 — Teacher evaluation (FR-C1–C3)
- `teacher-evaluations`: written test and interview stored independently; an evaluation is **completed** only when both exist.
- Quality score = `written% × writtenWeight + interview% × interviewWeight`. Weights are centrally configurable in the `teacher-evaluation-config` global (default 50/50, must be positive and sum to 1). Example: 75/100 and 80/100 → **77.5**.
- Multiple attempts preserved; updates require a change reason, keep a revision history and write an audit-log entry; the score is recalculated consistently.
- Completing an evaluation moves a `shortlisted` application to `evaluation_completed`; the score never approves or rejects anyone.
- Endpoints: `POST/GET /api/teacher-enquiries/:id/evaluations`, `GET/PATCH /api/teacher-enquiries/:id/evaluations/:evaluationId`.

### Phase 5 — Approval, profile and account (FR-D1–D3)
- `POST /api/teacher-enquiries/:id/approve` (atomic): requires status `evaluation_completed`, a completed evaluation and all required application fields including a valid email. Creates exactly one `teacher-profiles` record (with evaluation score, approver, timestamp) and links or creates the login account.
- Account rules: the `teacher` role is always set server-side (client role ignored); an existing teacher account with the same email is linked if safe; `super_admin`, blocked/suspended or already-linked accounts are refused (409); new accounts get a random password that is never returned or stored in plaintext, and the teacher activates through the existing OTP forgot-password flow. Duplicate or concurrent approval creates only one profile and account.
- `PATCH /api/teachers/:id/availability` (text availability and/or `free`/`allocated`) and `PATCH /api/teachers/:id/status` (`active`/`inactive`/`suspended`, suspension mirrored to the login account; blocked accounts are never unblocked).

### Phase 6 — Matching (FR-E1–E2)
- `GET /api/students/:id/matches` returns only approved, active teachers who satisfy: subject, class level, locality and availability (not marked `allocated`), ranked by evaluation score. An empty list is valid. It never allocates and does not need a physical test.
- `POST /api/students/:id/matches` saves a decision (`eligible`, `shortlisted`, `rejected`) with a criteria snapshot, notes and creator; history is append-only (`teacher-matches`).

### Phase 7 — Allocation (FR-F1–F2)
- `teacher-allocations` with `POST/GET /api/teacher-allocations`, `GET/PATCH /api/teacher-allocations/:id`, `PATCH /api/teacher-allocations/:id/status`, `GET /api/teacher-allocations/my`.
- Creation requires an active student, an approved active teacher, subject and class compatibility; a live allocation per student + teacher + subject is unique (database-enforced, safe under concurrency).
- Status flow: `assigned → accepted | rejected | cancelled`, `accepted → active | cancelled`, `active → completed | cancelled`; `rejected`, `completed`, `cancelled` are final; every change is logged in `statusHistory`.
- Teachers see only their own allocations (`/my` derives identity from the session; other teachers' records return 404) and may only accept/reject their own `assigned` allocation. Student contact numbers are never exposed.

### Phase 8 — Final integration
Full test run, type check, build, access-control review, docs-vs-routes comparison, and the final audit (`Audit-docs/FINAL-BACKEND-IMPLEMENTATION-AUDIT.md`).

## 5. Complete API surface

All custom routes return `{ success, message, data }` on success and `{ success: false, message, errors? }` on failure. `Admin` = active `super_admin`.

| Area | Endpoints | Access |
|---|---|---|
| Auth | `POST /api/auth/login`, `/logout`, `/forgot-password`, `/verify-otp`, `/reset-password`; `GET /api/auth/me` | Public / session |
| Users | `/api/auth/admin/users` (+ `/:id`, `block`, `unblock`, `suspend`, `reactivate`, `reset-password`) | Admin |
| Student enquiries | `POST/GET /api/student-enquiries`, `POST /api/admin/student-enquiries`, `POST /:id/convert`, `/:id/read`, `GET /api/inquiries/unread-counts` | Public submit; rest Admin |
| Students | `POST/GET /api/students`, `GET/PATCH /api/students/:id` | Admin |
| Assessments | `POST/GET /api/students/:id/assessments` | Admin |
| Physical tests | `/api/students/:id/tests`, `/api/student-tests/:id` (+ `payment`, `assign-tester`, `report`, `report/share`) | Admin; assigned tester for own test/report |
| Teacher applications | `POST/GET /api/teacher-enquiries`, `/:id/read` | Public submit; rest Admin |
| Evaluations | `/api/teacher-enquiries/:id/evaluations` (+ `/:evaluationId`) | Admin |
| Approval | `POST /api/teacher-enquiries/:id/approve` | Admin |
| Teachers | `GET/POST /api/teachers`, `GET/PATCH/DELETE /:id`, `PATCH /:id/availability`, `PATCH /:id/status` | Admin |
| Matching | `GET/POST /api/students/:id/matches` | Admin |
| Allocation | `/api/teacher-allocations` (+ `/:id`, `/:id/status`, `/my`) | Admin; teacher for own |

Exact request/response contracts: `API-DOC/` — `auth.md`, `users.md`, `student-enquiry.md`, `students.md`, `student-assessments.md`, `student-tests.md`, `teacher-enquiry.md`, `teacher-evaluations.md`, `teacher-approval.md`, `student-teacher-matching.md`, `teacher-allocations.md`.

## 6. Business rules coverage

| Rule | Implemented in |
|---|---|
| BR-01 enquiry sources | Phase 1 `enquirySource` |
| BR-02 admin offline enquiry | `POST /api/admin/student-enquiries` |
| BR-03 one student per enquiry | Conversion with unique link + transaction |
| BR-04 performance without physical test | Assessments independent of tests |
| BR-05 physical test optional | `parentSelected` skip path; matching/allocation never require it |
| BR-06 fee exactly ₹100 | Validation + stored fixed fee |
| BR-07 tester assigned before test | Assignment gate on test/report |
| BR-08 report linked to test and student | `student-test-reports` relations |
| BR-09 share actions recorded | `student-test-report-shares` |
| BR-10 / BR-11 written + interview feed quality score | Evaluation service and central weights |
| BR-12 approval before operational profile | `/approve` gating |
| BR-13 profile linked to teacher account | `teacher-profiles.user` (unique) |

## 7. Data model (collections)

Existing: `users`, `media`, `student-enquiries`, `teacher-enquiries`, `teacher-documents`, `teacher-profiles`, `enquiry-audit-log`.
Added: `students`, `student-assessments`, `student-tests`, `student-test-payments`, `student-test-reports`, `student-test-report-shares`, `teacher-evaluations`, `teacher-matches`, `teacher-allocations`, plus global `teacher-evaluation-config`.
Extended: `student-enquiries` (source, `converted`), `teacher-enquiries` (`evaluation_completed`), `teacher-profiles` (`user`, `evaluation`, `evaluationScore`, `availabilityStatus`, `approvedBy`, `approvedAt`), `enquiry-audit-log` (`evaluation` category).

Integrity mechanisms: indexed foreign keys, unique constraints that make duplicate conversion, duplicate paid payment, duplicate approval and duplicate live allocation impossible even under concurrent requests, and transactions around every multi-record operation.

## 8. Security and access control

- Every new route authenticates through shared helpers (`requireSuperAdmin`, `requireActiveUser`, `authorizeRouteWithId`): 401 when unauthenticated, 403 for non-admins and for blocked/suspended accounts.
- Roles are never taken from client input. Teacher identity on `/my` comes from the session.
- Private reports, KYC documents and student contact details are not exposed to unauthorized users; other teachers' records return 404.
- No passwords are returned or logged; generated passwords are random and unrecoverable.

## 9. Testing and verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Pass |
| `npm run test:int` (vitest, sequential) | **176/176 pass**, 14 suites |
| `npm run build` | Pass |
| `npm run lint` | Fails — pre-existing missing `@eslint/eslintrc` (not caused by this work) |
| Playwright E2E | Not run (backend-only scope) |

Suites: `auth`, `users`, `student-enquiries`, `teacher-enquiries`, `enquiry-audit-log`, `teachers-api`, `api`, and `phase1`–`phase7` (new). Tests run against the local PostgreSQL database configured in `.env`; `vitest.setup.ts` creates/resets the shared test admin (`427rohit@gmail.com`) before each suite, and `fileParallelism: false` avoids database collisions.

## 10. Running the project

```bash
pnpm install              # or npm install
# configure .env (see .env.example): DATABASE_URL, PAYLOAD_SECRET, email settings
npm run dev               # development server
npm run build && npm start
npm run test:int          # integration tests (needs the local PostgreSQL DB)
npm run generate:types    # regenerate payload-types.ts after schema changes
```

Helper scripts live in `scripts/` (admin seeding, sample enquiry/student/teacher data, schema checks).

## 11. Known limitations and decisions

1. **Legacy approval path:** setting an application to `approved` directly through the collection update still works (old tests rely on it) and skips the evaluation/account checks. Use `POST /api/teacher-enquiries/:id/approve` for real approvals.
2. **Matching is conservative:** class level, locality and availability are free-text fields, so matching uses text overlap and numeric class ranges (UKG = 0, `Class 8-10`, `All Levels`). Preferred timing is not compared. Up to 1000 teacher profiles are filtered in memory.
3. **Allocation side effects:** creating an allocation does not change the teacher's availability/summary fields or the student's status; admins use the existing availability endpoint.
4. **Teacher accept/reject of own allocations** is an interpretation of the PRD status list.
5. **No external providers:** no payment gateway, WhatsApp provider or notifications. Payment and sharing are record-only; the API never claims delivery.
6. **Test setup** resets the seeded test admin's password in the local database.
7. **Lint** is broken by a pre-existing missing dependency; Playwright E2E is out of scope.

## 12. Repository map (what was added)

```
src/collections/   Students, StudentAssessments, StudentTests, StudentTestPayments, StudentTestReports,
                   StudentTestReportShares, TeacherEvaluations, TeacherMatches, TeacherAllocations (+ extended existing)
src/globals/       TeacherEvaluationConfig
src/lib/           api.ts (envelopes, auth helpers), studentValidation, physicalTestValidation,
                   teacherEvaluationValidation, teacherMatching, teacherAllocation
src/services/      studentService, studentAssessmentService, physicalTestService, teacherEvaluationService,
                   teacherApprovalService, teacherMatchingService, teacherAllocationService
src/app/api/       all custom REST routes (see §5)
tests/int/         phase1–phase7 suites plus regression suites
API-DOC/           endpoint contracts          Audit-docs/   phase audits + final audit
```

## 13. Related documents

- `PRD/WELLFIND_BACKEND_API_PRD.md` — requirements
- `BACKEND_EXECUTION_PLAYBOOK.md` — execution rules
- `BACKEND_IMPLEMENTATION_PROGRESS.md` — phase tracker with test counts
- `Audit-docs/PHASE-00…07-*.md`, `Audit-docs/FINAL-BACKEND-IMPLEMENTATION-AUDIT.md` — audits
