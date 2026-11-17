# Student–Teacher Matching API (Phase 6 — FR-E1, FR-E2)

Both endpoints require an active `super_admin` (401 unauthenticated, 403 otherwise, 400 invalid id, 404 unknown student). Envelope: `{ success, message, data }`.

## GET /api/students/:id/matches
Returns eligible teachers for a persisted student. Never allocates a teacher and does not require a physical test.

A teacher is returned only if ALL hold:
- Profile `approvalStatus = approved` and `account.status = active`.
- **Subject:** student `subjects` (+ `customSubject`) overlaps teacher `primarySubject` (case-insensitive equal/contains).
- **Class level:** student `studentClass` falls within teacher `classLevels`. Free text is parsed conservatively: `UKG` = 0, `Class N` = N, ranges (`Class 8-10`, `UKG to 5`), `All Levels`. Unparseable text never matches.
- **Locality:** student `locality`/`customLocality` overlaps teacher `locality` (case-insensitive equal/contains).
- **Availability:** teacher `availabilityStatus` is not `allocated` (see PATCH /api/teachers/:id/availability).

Results are sorted by `qualityScore` (evaluation score) descending, then name. An empty list is a valid result (`total: 0`).

`data`: `{ studentId, total, matches: [{ teacherId, name, primarySubject, classLevel, locality, qualityScore, availability, availabilityStatus, matchStatus: "eligible", criteria }] }`

## POST /api/students/:id/matches
Saves a matching decision (append-only history; multiple decisions per student/teacher are kept).

Body: `teacherId` (required, positive integer), `matchStatus` (`eligible` | `shortlisted` | `rejected`, default `shortlisted`), `adminNotes` (optional, ≤2000).

Rules: teacher must exist (404) and be approved+active (409). For `eligible`/`shortlisted` the teacher must currently satisfy all criteria (409); `rejected` may be recorded for any approved active teacher. The server stores a `criteriaSnapshot` (student inputs, teacher values, per-criterion result), the teacher's quality score and the acting admin. Saving never allocates.

201 `data`: `{ id, studentId, teacherId, matchStatus, criteriaSnapshot, qualityScore, adminNotes, createdBy, createdAt }`.

## Data model
`teacher-matches` (student, teacher, matchStatus, criteriaSnapshot, qualityScore, adminNotes, createdBy). Admin read/create/delete only; no updates.

## Known limitations
- Matching is done in application code over free-text fields (up to 1000 teacher profiles). The PRD's "class level" and "availability" fields are free text, so matching is conservative (text overlap and numeric class ranges); preferred timing text is not compared.
- Allocation is Phase 7 and not implemented here.

Verification: `tests/int/phase6-teacher-matching.int.spec.ts` — 7/7 passing.
