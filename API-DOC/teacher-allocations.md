# Teacher Allocation API (Phase 7 — FR-F1, FR-F2)

Envelope: `{ success, message, data }`; errors `{ success: false, message, errors? }`. Blocked/suspended accounts get 403.

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/teacher-allocations` | `super_admin` |
| GET | `/api/teacher-allocations` | `super_admin` |
| GET | `/api/teacher-allocations/my` | logged-in `teacher` |
| GET | `/api/teacher-allocations/:id` | `super_admin`, or the allocated teacher |
| PATCH | `/api/teacher-allocations/:id` | `super_admin` |
| PATCH | `/api/teacher-allocations/:id/status` | `super_admin`; teacher for own accept/reject |

## POST /api/teacher-allocations
Body: `studentId` (required int), `teacherId` (required int, teacher-profile id), `subject` (required, ≤100), `allocationNotes` (optional, ≤2000).

Validation (atomic, in a transaction):
- Student exists (404) and is `active` (409).
- Teacher profile exists (404), `approvalStatus = approved` and `account.status = active` (409).
- Compatibility (409): `subject` must be required by the student (subjects/customSubject) and taught by the teacher (`primarySubject`); student class must fall within teacher `classLevels`.
- Duplicate protection (409): one live (`assigned`/`accepted`/`active`) allocation per student + teacher + subject, enforced by a unique key in PostgreSQL (safe under concurrency). `rejected`/`completed`/`cancelled` free the slot.

Creates the allocation as `assigned`, recording `allocatedBy`, `allocatedAt` and the first `statusHistory` entry. 201 `data`: `{ id, studentId, teacherId, student{id,name,studentClass,locality,preferredTiming,subjects}, teacher{id,name,primarySubject}, subject, status, allocationNotes, allocatedBy, allocatedAt, statusHistory[], createdAt, updatedAt }`. Student phone/contact details are never included.

## GET /api/teacher-allocations
Query: `page`, `limit` (max 100), `sort` (`createdAt`, `updatedAt`, `allocatedAt`, `status`, `id`; prefix `-` for descending), `status`, `studentId`, `teacherId`. Invalid filters return 400.

## GET /api/teacher-allocations/my
Teacher identity is derived from the authenticated user (profile linked via `teacher-profiles.user`); any `teacherId` query value is ignored. 403 for non-teachers or teachers with no linked profile. Supports `status`, `page`, `limit`, `sort`.

## GET /api/teacher-allocations/:id
Admins see any allocation. A teacher sees only their own; others' allocations return 404.

## PATCH /api/teacher-allocations/:id
Only `allocationNotes` may be changed (400 for any other field or an empty body).

## PATCH /api/teacher-allocations/:id/status
Body: `status`, optional `reason` (≤2000). Every change is appended to `statusHistory`.

| From | Allowed to |
|---|---|
| assigned | accepted, rejected, cancelled |
| accepted | active, cancelled |
| active | completed, cancelled |
| rejected / completed / cancelled | none (terminal) |

Invalid transitions return 409. A teacher may only set `accepted` or `rejected` on their own allocation (403 for other statuses, 404 for others' allocations).

## Notes / not implemented
- Allocation does not change the teacher profile's `availabilityStatus` or `studentAllocation` summary fields, nor the student's status; admins manage availability via `PATCH /api/teachers/:id/availability`.
- No notifications are sent.

Verification: `tests/int/phase7-teacher-allocation.int.spec.ts` — 9/9 passing.
