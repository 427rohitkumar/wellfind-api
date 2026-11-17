# Implementation Plan: Enquiry Audit Log Hardening

## Overview

Three targeted changes across two collection files and one test file. The core infrastructure already exists — this closes the `changedAt` timestamp gap in both `afterChange` hooks and completes the integration test suite with missing assertions and new test cases.

## Tasks

- [ ] 1. Add `changedAt` timestamp to StudentEnquiries `afterChange` hook
  - In `src/collections/StudentEnquiries.ts`, add `changedAt: new Date()` to the `data` object passed to `req.payload.create` inside the `afterChange` hook
  - The `changedAt` field already exists on the `enquiry-audit-log` schema — only the hook population is missing
  - _Requirements: 1.8, 2.9_

- [ ] 2. Add `changedAt` timestamp to TeacherEnquiries `afterChange` hook
  - In `src/collections/TeacherEnquiries.ts`, add `changedAt: new Date()` to the `data` object passed to `req.payload.create` inside the `afterChange` hook
  - Mirrors the exact same change in Task 1
  - _Requirements: 1.8, 2.9_

- [ ] 3. Complete integration test assertions and add new test cases
  - [ ] 3.1 Complete student test assertions in `tests/int/enquiry-audit-log.int.spec.ts`
    - After the existing `expect(audit.newStatus).toBe('contacted')` line in the student status-change test, add assertions for `changedBy` and `changedAt`
    - Assert `expect(audit.changedBy).toBeDefined()` and `expect(audit.changedAt).toBeDefined()` and `expect(audit.changedAt).not.toBeNull()`
    - _Requirements: 5.3, 5.4_

  - [ ] 3.2 Complete teacher test assertions
    - After the `expect(audits.docs.length).toBe(1)` line in the teacher status-change test, add assertions for `fieldChanged`, `previousStatus`, `newStatus`, `changedBy`, and `changedAt`
    - Assert: `fieldChanged === 'applicationStatus'`, `previousStatus === 'new'`, `newStatus === 'under_review'`, `changedBy` defined, `changedAt` defined and not null
    - _Requirements: 5.2, 5.3, 5.4_

  - [ ] 3.3 Add test: public caller cannot create via local API (`overrideAccess: false`)
    - Add a new `it` block that calls `payload.create` on `'enquiry-audit-log'` with `overrideAccess: false` and asserts the promise rejects
    - _Requirements: 4.1, 5.7_

  - [ ] 3.4 Add test: unauthorized user cannot read via local API (`overrideAccess: false`)
    - Add a new `it` block that calls `payload.find` on `'enquiry-audit-log'` with `overrideAccess: false` and asserts the promise rejects
    - _Requirements: 4.7, 5.8_

  - [ ] 3.5 Add test: error propagation via `payload.create` stub
    - Add a test that creates a student enquiry, temporarily replaces `payload.create` with a stub that throws on `'enquiry-audit-log'`, then asserts that `payload.update` on that enquiry rejects with the stub error
    - Restore the original `payload.create` in a `finally` block; clean up the test enquiry
    - _Requirements: 3.1, 3.2, 3.3, 5.9_

  - [ ] 3.6 Add test: end-to-end REST PATCH creates audit entry
    - Import `REST_PATCH` from `@payloadcms/next/routes` at the top of the test file (already imported in `student-enquiries.int.spec.ts` — follow the same pattern)
    - Add a test that creates a student enquiry, fires a REST PATCH via `REST_PATCH(config)` authenticated as `super_admin`, and asserts the audit log count for that enquiry increases by 1
    - Clean up both the enquiry and audit entries in a `finally`-style block
    - _Requirements: 5.10_

- [ ] 4. Checkpoint — run `pnpm test:int` and ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- No new files, no schema migrations, no new dependencies — all changes are in-place edits
- Task 1 and Task 2 are independent of each other and of Task 3; Tasks 3.1–3.6 depend on Tasks 1 and 2 being complete so `changedAt` is populated
- Error propagation (Task 3.5) requires no `try/catch` changes to the hooks — both already use bare `await` with no wrapping `try/catch`, so rejection propagates naturally
- `REST_PATCH` is already used in `tests/int/student-enquiries.int.spec.ts`; follow that import and invocation pattern exactly

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6"] }
  ]
}
```
