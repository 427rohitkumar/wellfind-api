# Wellfind Academic — Backend Execution Playbook

**Document ID:** WA-BE-EXEC-001  
**Version:** 1.0  
**Companion PRD:** `WELLFIND_BACKEND_API_PRD.md`  
**Purpose:** Mandatory execution instructions for Antigravity or another coding agent.

---

# 1. Your role

You are the backend implementation agent for Wellfind Academic.

You must implement the requirements defined in `WELLFIND_BACKEND_API_PRD.md`. The PRD defines WHAT is required. This playbook defines HOW you must execute the work.

Your job is not to generate a large amount of code quickly. Your job is to deliver each backend feature correctly, verify it through API tests, fix failures, document the result and create an audit before proceeding.

**Do not attempt to implement the entire PRD in one coding pass.**

Work sequentially, phase by phase, with a verification gate at the end of every phase.

# 2. Non-negotiable rules

1. Read both this playbook and the complete PRD before changing code.
2. Inspect the existing repository before proposing or creating files.
3. Implement one phase at a time.
4. Do not start the next phase until the current phase has passed its completion gate.
5. Do not implement unrelated features or expand the product scope.
6. Do not rebuild existing functionality that already works.
7. Preserve existing API contracts and backward compatibility.
8. Do not perform UI, browser, visual or frontend testing. This is a backend-only task.
9. Test APIs using the repository's existing test framework and/or HTTP integration tests.
10. After each phase, generate a detailed audit report in the root `Audit-docs/` directory.
11. After each phase, update the API documentation with the endpoints actually implemented and verified.
12. Never claim a test passed unless it was actually executed and its result was checked.
13. Never claim an endpoint is implemented merely because a route or schema exists.
14. If a test fails, diagnose the root cause, fix it, rebuild and rerun the relevant tests.
15. Do not hide, skip or weaken a failing test to make a phase appear complete.
16. If blocked by missing credentials, unavailable database, unclear business rule or external provider, document the blocker and stop that dependent work. Do not invent credentials, providers or behavior.
17. Keep secrets and personal data out of audit reports, test fixtures and logs.
18. Keep implementation changes focused and reviewable.

# 3. Mandatory first action — repository reconnaissance

Before implementation:

1. Identify the repository root.
2. Read `package.json`, lockfile, scripts, Payload config, TypeScript config and environment examples.
3. Inspect existing collections, custom routes, hooks, access-control functions, services, utilities, migrations and tests.
4. Locate the existing API documentation for:
   - Authentication.
   - User management.
   - Student enquiries.
   - Teacher enquiries.
   - Private teacher documents.
5. Identify the actual database schema and current role/status values from code, not just documentation.
6. Identify how tests and builds are run.
7. Check whether the PostgreSQL database is available in the local test environment.
8. Check whether the root `Audit-docs/` folder already exists. Reuse it. Do not create a second audit folder with a different spelling or casing.
9. Identify the existing API documentation directory and naming conventions. Reuse them.

Create or update the following root-level tracking file:

`BACKEND_IMPLEMENTATION_PROGRESS.md`

It must contain:
- PRD and playbook versions.
- Current phase.
- Phase status.
- Files/modules inspected.
- Commands used for build and tests.
- Passing/failing test counts.
- Known blockers.
- Links/paths to phase audit reports.
- Links/paths to updated API documentation.
- Last updated timestamp.

Do not start Phase 1 until reconnaissance is complete and Phase 0 audit is written.

## 3.1 Resolve existing inconsistencies before dependent implementation

The supplied `auth.md` and `users.md` do not describe identical roles, statuses and route patterns.

Inspect actual code and decide the canonical behavior based on the live implementation. Do not silently:
- Add a new role.
- Rename existing roles.
- Change status enums.
- Replace existing user routes.
- Change authentication behavior.

Document any necessary compatibility adjustment and its impact in the Phase 0 audit. If a decision requires product-owner clarification, stop and ask rather than guessing.

# 4. Looping engineering protocol

Use this exact loop for every phase and every feature-sized unit of work.

```text
READ REQUIREMENT
      |
      v
INSPECT EXISTING CODE
      |
      v
PLAN THE SMALLEST CHANGE
      |
      v
IMPLEMENT
      |
      v
RUN FORMAT / TYPE CHECK (if configured)
      |
      v
RUN TARGETED API TESTS
      |
      +---- FAIL ----> READ FAILURE
      |                    |
      |                    v
      |               FIND ROOT CAUSE
      |                    |
      |                    v
      |                  FIX
      |                    |
      |                    v
      |             REBUILD / RETEST
      |                    |
      |                    +---- repeat until pass
      |
      +---- PASS ----> RUN REGRESSION TESTS
                            |
                            v
                       REVIEW DIFF
                            |
                            v
                      UPDATE API DOCS
                            |
                            v
                      GENERATE AUDIT
                            |
                            v
                   UPDATE PROGRESS FILE
                            |
                            v
                    PHASE GATE REVIEW
                            |
                   +--------+--------+
                   |                 |
                  PASS             BLOCKED/FAIL
                   |                 |
                   v                 v
             NEXT PHASE        STOP AND REPORT
```

This is an iterative engineering loop, not a one-shot code-generation task.

## 4.1 Failure handling

When any command or test fails:

1. Capture the exact command and complete relevant error.
2. Determine whether the failure is caused by code, test setup, environment, database or external dependency.
3. Identify the root cause.
4. Make the smallest correct fix.
5. Run the failed test again.
6. Run the full targeted test suite for the current phase.
7. Run relevant regression tests.
8. Rebuild.
9. Record the original failure and final resolution in the audit.

Do not:
- Delete the failing test.
- Change assertions merely to force green.
- Mock away the core behavior under test.
- Mark skipped tests as passed.
- Suppress build/type errors without justification.

If an environment dependency prevents execution, mark it `BLOCKED` or `NOT RUN`, explain why and do not pass the phase gate.

# 5. Phase execution strategy

Each phase is a separate implementation unit. Complete all its tasks, tests, documentation and audit before moving to the next phase.

## Phase 0 — Reconnaissance and baseline

**Objective:** Understand the real current backend and avoid duplicating or breaking existing features.

Tasks:
- Inspect repository structure and implementation.
- Verify existing route behavior against supplied API docs.
- Identify existing collection schemas and relationships.
- Verify actual role/status values and access rules.
- Identify test/build commands.
- Confirm database test setup.
- Identify existing API documentation locations.
- Confirm root `Audit-docs/` folder.

Verification:
- Run baseline build.
- Run existing backend test suite.
- Run existing API tests if available.
- Record failures that existed before changes.

Deliverables:
- `BACKEND_IMPLEMENTATION_PROGRESS.md`
- `Audit-docs/PHASE-00-RECONNAISSANCE-AUDIT.md`
- Baseline notes in the existing API documentation location, only if necessary.

**Gate:** Do not start Phase 1 until repository structure, actual role model, existing APIs and test commands are understood. Any unresolved product decision must be raised.

## Phase 1 — Student enquiry extension and conversion

PRD references: FR-A1 to FR-A4.

Tasks:
- Add enquiry source field while preserving existing public form compatibility.
- Implement admin-only manual enquiry creation.
- Implement safe enquiry-to-student conversion.
- Implement required student CRUD behavior.
- Add relationships, validation, indexes and duplicate-conversion protection.

API tests:
- Existing website enquiry submission still works.
- Admin manual enquiry succeeds for valid data.
- Public user cannot create admin-only enquiry.
- Invalid source is rejected.
- Conversion creates one student.
- Repeated/concurrent conversion does not create duplicates.
- Unauthorized access is rejected.
- List/read/update permissions are enforced.

Deliverables:
- Working backend changes.
- Tests.
- Updated student enquiry/student API documentation.
- `Audit-docs/PHASE-01-STUDENT-ENQUIRY-AND-RECORD-AUDIT.md`

**Gate:** Build, targeted API tests and relevant existing enquiry regression tests pass.

## Phase 2 — Student capability assessment

PRD reference: FR-B1.

Tasks:
- Implement assessment data model.
- Implement create and required retrieval/list behavior if required by the API contract.
- Store previous performance, capability, strengths, weaknesses and notes.
- Link assessment to student.
- Preserve assessment history.

API tests:
- Valid assessment can be created.
- Invalid student reference is rejected.
- Invalid capability value is rejected.
- Missing required fields are rejected.
- Unauthorized users cannot create/read assessments.
- Multiple assessments preserve history.

Deliverables:
- Working APIs and tests.
- Updated assessment API documentation.
- `Audit-docs/PHASE-02-STUDENT-CAPABILITY-ASSESSMENT-AUDIT.md`

**Gate:** Build and targeted API tests pass.

## Phase 3 — Optional physical test

PRD references: FR-B2 to FR-B6.

Tasks:
- Implement optional physical test request.
- Validate fixed fee of ₹100.
- Implement payment record without inventing a gateway.
- Implement tester assignment and reassignment rules.
- Implement test report submission and retrieval.
- Implement WhatsApp/phone-call sharing action records.
- Enforce assigned tester permissions and report privacy.

API tests:
- Test can be created when selected.
- Test is not created when skipped.
- Student can proceed without physical test.
- Any amount other than ₹100 is rejected.
- Duplicate successful payment is prevented.
- Invalid/inactive tester cannot be assigned.
- Only assigned tester/admin can submit report.
- Obtained marks cannot exceed total marks.
- Report is private.
- Sharing action is recorded.
- API does not falsely claim external delivery.

Deliverables:
- Working APIs and tests.
- Updated physical test API documentation.
- `Audit-docs/PHASE-03-OPTIONAL-PHYSICAL-TEST-AUDIT.md`

**Gate:** Build and targeted API tests pass. If payment gateway or WhatsApp delivery is not configured, clearly document that only records/status handling is implemented.

## Phase 4 — Teacher evaluation

PRD references: FR-C1 to FR-C3.

Tasks:
- Implement evaluation model.
- Store written test and interview results separately.
- Calculate quality score using centrally configurable 50/50 defaults.
- Store evaluator and timestamps.
- Implement retrieval and permitted update.
- Preserve evaluation history.

API tests:
- Valid evaluation is stored.
- Missing written or interview result is rejected for completion.
- Invalid marks are rejected.
- Score calculation is mathematically correct.
- Configured weights are applied.
- Unauthorized users cannot access or modify evaluation.
- Update behavior is audited and consistent.

Deliverables:
- Working APIs and tests.
- Updated teacher evaluation API documentation.
- `Audit-docs/PHASE-04-TEACHER-EVALUATION-AUDIT.md`

**Gate:** Build and targeted API tests pass.

## Phase 5 — Teacher approval, profile and account integration

PRD references: FR-D1 to FR-D3.

Tasks:
- Implement teacher profile model.
- Implement approval endpoint.
- Require complete evaluation and required application data.
- Link profile to original application.
- Reuse existing user creation/account logic.
- Assign existing teacher role server-side.
- Prevent duplicate profile/account creation.
- Implement teacher profile and availability/status APIs.

API tests:
- Incomplete application cannot be approved.
- Incomplete evaluation cannot be approved.
- Valid application creates one profile.
- Teacher account is created or linked according to existing auth rules.
- Duplicate approval does not duplicate profile/account.
- Client cannot escalate role.
- Private application documents remain private.
- Existing teacher application submission remains compatible.

Deliverables:
- Working APIs and tests.
- Updated teacher profile/approval API documentation.
- `Audit-docs/PHASE-05-TEACHER-APPROVAL-AND-PROFILE-AUDIT.md`

**Gate:** Build and targeted API tests pass.

## Phase 6 — Student–teacher matching

PRD references: FR-E1 and FR-E2.

Tasks:
- Implement matching service using persisted student and teacher data.
- Apply subject, class, locality, availability and quality criteria.
- Return only eligible approved active teachers.
- Save matching decisions.
- Do not auto-allocate a teacher.

API tests:
- Matching returns compatible teacher.
- Subject mismatch is excluded.
- Class mismatch is excluded.
- Inactive/unapproved teacher is excluded.
- Location and availability filters are applied.
- Empty result is handled correctly.
- Matching does not create allocation.
- Unauthorized caller is rejected.

Deliverables:
- Working APIs and tests.
- Updated matching API documentation.
- `Audit-docs/PHASE-06-STUDENT-TEACHER-MATCHING-AUDIT.md`

**Gate:** Build and targeted API tests pass.

## Phase 7 — Teacher allocation

PRD references: FR-F1 and FR-F2.

Tasks:
- Implement allocation model and relationships.
- Implement admin-controlled allocation creation.
- Validate student/teacher eligibility and compatibility.
- Prevent duplicate active allocation.
- Implement allocation listing/retrieval/update/status.
- Implement teacher's own allocation endpoint using authenticated user identity.

API tests:
- Valid allocation succeeds.
- Invalid student or teacher is rejected.
- Inactive/unapproved teacher is rejected.
- Incompatible subject/class is rejected.
- Duplicate active allocation is rejected.
- Only admin can create allocation.
- Teacher can see own allocation.
- Teacher cannot see another teacher's allocation.
- Invalid status transitions are rejected.

Deliverables:
- Working APIs and tests.
- Updated allocation API documentation.
- `Audit-docs/PHASE-07-TEACHER-ALLOCATION-AUDIT.md`

**Gate:** Build and targeted API tests pass.

## Phase 8 — Final integration and regression

Tasks:
- Run all backend tests.
- Run all new API integration tests.
- Run existing API regression tests.
- Run type generation/checks as used by the repository.
- Run production build.
- Review changed files and migrations.
- Check access-control paths.
- Check API documentation against actual routes and schemas.
- Check all phase audit reports.
- Confirm no UI/frontend work was introduced.
- Confirm no out-of-scope features were added.

Deliverables:
- `Audit-docs/FINAL-BACKEND-IMPLEMENTATION-AUDIT.md`
- Final API documentation.
- Updated `BACKEND_IMPLEMENTATION_PROGRESS.md`
- Final implementation summary with completed, blocked and not-run items clearly separated.

**Gate:** Release is complete only if build and required tests pass, documentation matches code, and all phase audits exist.

# 6. Audit document requirements

After each phase, create one Markdown audit in the repository-root `Audit-docs/` folder.

Use the exact filenames defined in the phase plan.

Every audit must include:

1. Phase name and PRD references.
2. Date/time.
3. Summary of delivered functionality.
4. Files created.
5. Files modified.
6. Database/schema changes.
7. Endpoints implemented (method, path, access).
8. Request/response contract summary.
9. Validation and business rules implemented.
10. Authorization/access-control behavior.
11. Tests executed, exact commands and results.
12. Build/type-check result.
13. Failures encountered and root-cause fixes.
14. Regression tests executed.
15. Known limitations, blockers and not-run tests.
16. API documentation path updated.
17. Acceptance criteria checklist.
18. Final phase status: `PASS`, `FAIL` or `BLOCKED`.

Never write `PASS` if any required test was skipped, blocked or failed. A phase can be `PASS WITH DOCUMENTED LIMITATIONS` only when the limitation does not violate a required acceptance criterion. Otherwise use `BLOCKED`.

Do not include secrets, raw credentials, real student personal data, Aadhaar data or private document contents in audits.

# 7. API documentation requirements

After each phase:
- Update the existing API documentation directory; inspect and follow its current naming convention.
- Document only endpoints actually implemented.
- Include HTTP method and exact route.
- Include authentication and role requirements.
- Include request fields, types, required/optional status and validation.
- Include example request and response.
- Include error responses.
- Include state-transition/business rules.
- Include relationships and side effects.
- Include test verification status.
- Clearly label any behavior not implemented or not verified.

Do not write documentation for hypothetical endpoints as if they already exist. Keep the PRD as the requirement source and API docs as the implementation reference.

# 8. API test requirements

This is a backend-only project. Use API-level verification.

Preferred order:
1. Existing unit test framework.
2. Service/domain unit tests.
3. API route/integration tests against a real test database.
4. HTTP-level tests using the repository's configured test tools.
5. Regression tests for existing routes.

Do not perform:
- Browser tests.
- UI tests.
- Screenshot tests.
- Frontend interaction tests.

Use isolated test records and clean up test data. Do not test against production data.

Where the database is unavailable:
- Do not pretend integration tests passed.
- Report exact connection/setup issue.
- Run tests that can safely run.
- Mark database-backed tests `BLOCKED` or `NOT RUN`.
- Do not pass the phase if database-backed verification is a required acceptance condition.

# 9. Build and quality gates

Use the actual scripts discovered in `package.json`; do not assume script names.

At minimum, run the repository-equivalent of:
- Formatting/lint, if configured.
- TypeScript/type checks, if configured.
- Targeted unit tests.
- Targeted API integration tests.
- Relevant regression tests.
- Production build.

After fixes, rerun the failing test and the full relevant phase suite. Before phase sign-off, rerun the build and regression suite.

# 10. Progress tracking format

Keep `BACKEND_IMPLEMENTATION_PROGRESS.md` current.

Use this table:

| Phase | Status | Build | API tests | Regression | Audit | API docs |
|---|---|---|---|---|---|---|
| 0 | NOT STARTED | — | — | — | — | — |
| 1 | NOT STARTED | — | — | — | — | — |
| 2 | NOT STARTED | — | — | — | — | — |
| 3 | NOT STARTED | — | — | — | — | — |
| 4 | NOT STARTED | — | — | — | — | — |
| 5 | NOT STARTED | — | — | — | — | — |
| 6 | NOT STARTED | — | — | — | — | — |
| 7 | NOT STARTED | — | — | — | — | — |
| 8 | NOT STARTED | — | — | — | — | — |

Allowed statuses:
- `NOT STARTED`
- `IN PROGRESS`
- `PASS`
- `BLOCKED`
- `FAIL`

Update the file immediately after each phase gate.

# 11. Scope control and ambiguity handling

If implementation reveals a missing decision:
1. Check the PRD.
2. Check existing code and API contracts.
3. Check existing project conventions.
4. If still ambiguous and it changes business behavior, stop and ask the product owner.
5. Record the question and affected phase in progress tracking.

Do not invent:
- A payment gateway.
- WhatsApp provider credentials or delivery behavior.
- New user roles.
- Additional business workflows.
- New dashboard/UI features.
- Additional matching criteria beyond those specified without approval.

Small technical decisions that do not change product behavior may follow existing repository conventions and must be documented.

# 12. Final delivery requirements

At completion, provide a concise final report containing:

- Phases completed.
- APIs implemented.
- Collections/models created or changed.
- Build result.
- API test results.
- Regression test results.
- Audit document paths.
- API documentation paths.
- Known limitations and blocked items.
- Explicit confirmation that no UI/frontend work was performed.

The final report must distinguish:
- Implemented and verified.
- Implemented but not fully verified.
- Not implemented / blocked.

Do not claim the PRD is complete if required phases remain blocked or unverified.

# 13. Start instruction

Begin with **Phase 0 — Repository Reconnaissance and Baseline** only.

Do not immediately start implementing all phases. First inspect the repository, identify the real existing implementation, run the baseline checks, establish the canonical role model, confirm test commands and database availability, then create the Phase 0 audit and progress file.

After Phase 0 passes, proceed sequentially through Phase 1, Phase 2 and so on. Apply the complete implementation → API test → fix → rebuild → retest → regression → API documentation → audit loop to every phase.

**The PRD and this playbook must always be followed together.**
