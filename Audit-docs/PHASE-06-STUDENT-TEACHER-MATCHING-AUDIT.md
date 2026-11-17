# Phase 6 — Student–Teacher Matching (FR-E1, FR-E2)

Date: 2026-11-17

## Delivered
- `GET /api/students/:id/matches` and `POST /api/students/:id/matches` (super_admin only).
- New collection `teacher-matches` (append-only decisions with criteria snapshot).
- Pure matching helpers in `src/lib/teacherMatching.ts`; service in `src/services/teacherMatchingService.ts`.

## Files
Created: `src/lib/teacherMatching.ts`, `src/collections/TeacherMatches.ts`, `src/services/teacherMatchingService.ts`, `src/app/api/students/[id]/matches/route.ts`, `tests/int/phase6-teacher-matching.int.spec.ts`, `API-DOC/student-teacher-matching.md`.
Modified: `src/payload.config.ts` (register collection).

## Schema
New table `teacher_matches` with indexed `student`, `teacher`, `match_status`; FKs to students, teacher-profiles, users.

## Business rules and access
Only approved + active teachers; subject, class level, locality and availability criteria applied; ranked by evaluation score; never allocates; physical test not required. Admin only (401/403); updates disabled on the collection.

## Tests
- `npx vitest run --config ./vitest.config.mts tests/int/phase6-teacher-matching.int.spec.ts` — 7/7 PASS (class-range helpers; auth/ids; empty result; compatible teacher ranked while subject, class, locality, unapproved, inactive, suspended and fully-booked teachers are excluded; no allocation side effects; decision saving + history; input/eligibility validation).
- `npx tsc --noEmit` — PASS (after typing fix: teacher input fields made optional).
- Full `vitest run` — 13 files, 167/167 PASS. `npm run build` — PASS (route registered).

## Failures and fixes
- First `tsc` run failed: `Record<string, any>` not assignable to a required-field input type; fixed by making `TeacherMatchInput` fields optional.

## Limitations
- Free-text class level / availability fields, so matching is conservative text and numeric-range overlap; preferred timing not compared.
- In-memory filtering over up to 1000 approved profiles.
- `npm run lint` pre-existing failure (`@eslint/eslintrc` missing).

## Status: PASS WITH DOCUMENTED LIMITATIONS
