# Teacher Approval, Profile & Account API (Phase 5 — FR-D1 to FR-D3)

All endpoints require an active `super_admin` (401 unauthenticated, 403 otherwise). Success envelope: `{ success, message, data }`; errors: `{ success: false, message, errors? }`.

## POST /api/teacher-enquiries/:id/approve
Approves an evaluated application. No request body is used; any client-supplied role is ignored.

Rules (all atomic in one transaction):
- Application must exist (404) and be `evaluation_completed` (409 otherwise; 409 if already approved).
- A `completed` teacher evaluation must exist (409).
- Required application fields: fullName, mobileNumber, email (valid), highestQualification, teachingExperience, primarySubject, classLevel, teachingLocality, preferredAvailability (400 with per-field errors).
- Account: existing user with same email is linked only if role is `teacher`, not blocked/suspended and not already linked to another profile (else 409). Otherwise a `teacher` user is created server-side with a random password that is never returned; the teacher activates via the existing OTP forgot-password flow.
- Creates exactly one `teacher-profiles` record (unique `user` index, one profile per application) with `evaluationScore`, `evaluation`, `approvedBy`, `approvedAt`; application status becomes `approved` and an audit entry is written.

201 response `data`: `{ profile, user: { id, email, role, created }, evaluationId, qualityScore }`.

## PATCH /api/teachers/:id/availability
Body: `availability` (string, 1–200) and/or `availabilityStatus` (`free` | `allocated`). At least one is required (400). 404 if the profile is missing.

## PATCH /api/teachers/:id/status
Body: `status` (`active` | `inactive` | `suspended`). `suspended`/`active` are mirrored to the linked login account (a blocked account is never unblocked). `inactive` only affects operational matching.

## Existing endpoints
`GET/POST /api/teachers`, `GET/PATCH/DELETE /api/teachers/:id` are unchanged.

## Known limitation
Directly PATCHing a teacher application to `approved` via the collection API is still allowed for backward compatibility (legacy tests rely on it) and does not enforce evaluation or account linking. Use `/approve`.

Verification: `tests/int/phase5-teacher-approval.int.spec.ts` — 10/10 passing.
