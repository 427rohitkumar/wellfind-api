# Phase 7 — Teacher Allocation (FR-F1, FR-F2)

Date: 2026-11-17

## Delivered
Allocation model, admin-controlled creation with compatibility and duplicate protection, list/get/update/status endpoints, and the teacher's own `/my` endpoint.

## Files
Created: `src/lib/teacherAllocation.ts`, `src/collections/TeacherAllocations.ts`, `src/services/teacherAllocationService.ts`, routes `src/app/api/teacher-allocations/{route.ts,my/route.ts,[id]/route.ts,[id]/status/route.ts}`, `tests/int/phase7-teacher-allocation.int.spec.ts`, `API-DOC/teacher-allocations.md`.
Modified: `src/payload.config.ts` (register collection).

## Schema
New table `teacher_allocations` (student, teacher, subject, status, allocation_notes, allocated_by, allocated_at, unique nullable `active_key`) and `teacher_allocations_status_history`. Indexes on student, teacher, status and the unique active key.

## Endpoints
See `API-DOC/teacher-allocations.md`: POST/GET `/api/teacher-allocations`, GET `/my`, GET/PATCH `/:id`, PATCH `/:id/status`.

## Business rules and access
- Create/list/update: active `super_admin` only (401/403).
- Student must exist and be active; teacher approved + active; subject and class compatible.
- Duplicate live allocation per student+teacher+subject rejected by unique key (verified with concurrent requests); terminal statuses free the slot.
- Status machine enforced; every change recorded in history. Teachers may only accept/reject their own `assigned` allocation.
- Teacher identity on `/my` comes from the session, never the request; other teachers' allocations return 404.
- Student contact numbers are not exposed in responses.

## Tests
- `npx vitest run --config ./vitest.config.mts tests/int/phase7-teacher-allocation.int.spec.ts` — 9/9 PASS.
- `npx tsc --noEmit` — PASS.
- Full `vitest run` — 14 files, 176/176 PASS.
- `npm run build` — PASS (4 routes registered).

## Failures
None in this phase.

## Limitations
- Allocation does not update teacher availability/summary fields or student status (not required by PRD; manual via existing endpoints).
- Teacher accept/reject is an interpretation of the PRD status list (not explicitly specified); documented.
- `npm run lint` has the pre-existing `@eslint/eslintrc` failure.

## Status: PASS WITH DOCUMENTED LIMITATIONS
