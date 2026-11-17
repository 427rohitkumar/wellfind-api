# Wellfind Academic — Student Enquiry API Reference

API documentation for the Student Enquiry module built on Payload CMS 3.x
(PostgreSQL). Enquiries are submitted by prospective students/parents through a
public form and managed by `super_admin` administrators.

**Base URLs:**

| Environment | Base URL | Notes |
|-------------|----------|-------|
| Local development | `http://localhost:3000` | Development server started with `pnpm dev` |
| Production | `https://your-domain.com` | Replace `your-domain.com` with your actual domain |

All endpoint paths documented below are appended to the base URL.

---

## Table of Contents

1. [Base URLs](#base-urls)
2. [Access Control](#access-control)
3. [Endpoint Overview](#endpoint-overview)
4. [POST /api/student-enquiries — Public submission](#post-apistudent-enquiries--public-submission)
5. [POST /api/admin/student-enquiries — Admin manual enquiry creation](#post-apiadminstudent-enquiries--admin-manual-enquiry-creation)
6. [GET /api/student-enquiries — List enquiries](#get-apistudent-enquiries--list-enquiries)
7. [GET /api/student-enquiries/:id — Get one enquiry](#get-apistudent-enquiriesid--get-one-enquiry)
8. [PATCH /api/student-enquiries/:id — Update an enquiry](#patch-apistudent-enquiriesid--update-an-enquiry)
9. [POST /api/student-enquiries/:id/convert — Convert enquiry to student](#post-apistudent-enquiriesidconvert--convert-enquiry-to-student)
10. [DELETE /api/student-enquiries/:id — Delete an enquiry](#delete-apistudent-enquiriesid--delete-an-enquiry)
11. [Authentication and JWT Guide](#authentication-and-jwt-guide)
12. [Validation Rules](#validation-rules)
13. [Enquiry Status Values & State Transitions](#enquiry-status-values--state-transitions)
14. [Error Reference](#error-reference)
15. [Security Notes](#security-notes)
16. [Implementation Notes](#implementation-notes)

---

## Access Control

| Operation | Endpoint | Authentication | Authorization |
|-----------|----------|----------------|---------------|
| Create enquiry (public) | `POST /api/student-enquiries` | None (public) | Open to unauthenticated visitors. Rate-limited by IP. Forces `enquirySource = 'website'`. |
| Create enquiry (admin manual) | `POST /api/admin/student-enquiries` | Required (JWT) | `super_admin` only (`401` unauthenticated, `403` non-admin). |
| List enquiries | `GET /api/student-enquiries` | Required (JWT) | `super_admin` only. |
| Get one enquiry | `GET /api/student-enquiries/:id` | Required (JWT) | `super_admin` only. |
| Update enquiry | `PATCH /api/student-enquiries/:id` | Required (JWT) | `super_admin` only. |
| Convert enquiry to student | `POST /api/student-enquiries/:id/convert` | Required (JWT) | `super_admin` only (`401` unauthenticated, `403` non-admin). |
| Delete enquiry | `DELETE /api/student-enquiries/:id` | Required (JWT) | `super_admin` only. |

- Public submission **only** allows creating enquiries. Public callers cannot
  list, read, update, convert, or delete any enquiry — this is enforced on the server.
- Internal management fields (`enquiryStatus`, `adminNotes`, `assignedTo`, `changeReason`, `markAsRead`) are
  never writable by public submissions and are never returned in public
  submission responses.
- Roles are never trusted from the client; authorization is always performed
  server-side against the authenticated user's record (`user.role === 'super_admin'`).
- Supported user roles: `super_admin`, `teacher`. Teachers cannot access
  admin-only enquiry operations.

---

## Endpoint Overview

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| `POST` | `/api/student-enquiries` | Public (rate-limited) | Submit a new website enquiry |
| `POST` | `/api/admin/student-enquiries` | `super_admin` | Manually create an offline/inbound enquiry with `enquirySource` |
| `GET` | `/api/student-enquiries` | `super_admin` | List enquiries with pagination and filtering |
| `GET` | `/api/student-enquiries/:id` | `super_admin` | Get a single enquiry |
| `PATCH` | `/api/student-enquiries/:id` | `super_admin` | Update an enquiry (admins may also set internal fields) |
| `POST` | `/api/student-enquiries/:id/convert` | `super_admin` | Atomically convert enquiry into an operational Student record (`students`) |
| `DELETE` | `/api/student-enquiries/:id` | `super_admin` | Delete an enquiry |

`GET /api/student-enquiries/:id`, `PATCH` and `DELETE` are Payload's built-in
REST endpoints for the `student-enquiries` collection; they are governed by the
collection's access control rules. No duplicate custom routes were created for
them.

---

## POST /api/student-enquiries — Public submission

Submits a new student enquiry. No authentication required. Rate-limited by IP
(15 requests per IP per 15-minute window, in-memory; use Redis for production
multi-instance deployments).

### Request

```http
POST /api/student-enquiries
Content-Type: application/json

{
  "studentClass": "Class 10",
  "subjects": ["Mathematics", "English"],
  "customSubject": "Vedic Maths",
  "preferredTiming": "Weekday evenings",
  "locality": "Central London",
  "customLocality": "Canary Wharf",
  "budgetRange": "GBP 30-50 per hour",
  "name": "Aanya Sharma",
  "phoneNumber": "+44 20 7946 0958",
  "additionalNotes": "Prefers evening slots.",
  "agreedToPolicy": true
}
```

`curl` example:

```bash
curl -X POST http://localhost:3000/api/student-enquiries \
  -H "Content-Type: application/json" \
  -d '{
    "studentClass": "Class 10",
    "subjects": ["Mathematics", "English"],
    "preferredTiming": "Weekday evenings",
    "locality": "Central London",
    "budgetRange": "GBP 30-50 per hour",
    "name": "Aanya Sharma",
    "phoneNumber": "+44 20 7946 0958",
    "agreedToPolicy": true
  }'
```

### Success response (201)

Only public form fields are returned — internal management fields are excluded.

```json
{
  "message": "Enquiry submitted successfully.",
  "enquiry": {
    "id": 7,
    "studentClass": "Class 10",
    "subjects": ["Mathematics", "English"],
    "customSubject": "Vedic Maths",
    "preferredTiming": "Weekday evenings",
    "locality": "Central London",
    "customLocality": "Canary Wharf",
    "budgetRange": "GBP 30-50 per hour",
    "name": "Aanya Sharma",
    "phoneNumber": "+442079460958",
    "additionalNotes": "Prefers evening slots.",
    "agreedToPolicy": true,
    "enquirySource": "website",
    "createdAt": "2026-10-28T14:30:00.000Z"
  }
}
```

Notes:

- `phoneNumber` is stored in a normalized form (formatting characters such as
  spaces, dashes and parentheses are removed). No country code is assumed — the
  validator accepts 7–15 digits with an optional leading `+`, for any country.
- `subjects` is accepted as an array of strings (matching the
  `TutorEnquiryFormData` interface) and stored using Payload's array field.
- `enquirySource` defaults to `'website'` for public submissions (spoofed non-website sources submitted by public visitors are sanitized to `'website'`; invalid enum values fail with `400`).
- `enquiryStatus` defaults to `new` and is managed by administrators only.

### Error responses

Missing required field (400):

```json
{ "error": "name is required." }
```

Policy not agreed (400):

```json
{ "error": "You must agree to the policy to submit an enquiry." }
```

Invalid phone number (400):

```json
{ "error": "Invalid phone number. Provide 7–15 digits with an optional leading +." }
```

Invalid enquirySource (400):

```json
{ "error": "Invalid enquirySource. Allowed values: website, phone_call, email, referral, network, other." }
```

Payload schema validation failure (400):

```json
{
  "error": "Validation failed.",
  "errors": [
    { "field": "phoneNumber", "message": "Enter a valid phone number...", "type": "validation" }
  ]
}
```

Rate limit exceeded (429):

```json
{ "error": "Too many enquiry submissions. Please try again later." }
```

---

## POST /api/admin/student-enquiries — Admin manual enquiry creation

`super_admin` only. Allows administrators to log offline or manually received enquiries (phone calls, emails, referrals, network leads, etc.). Returns `{ success, message, data }`.

### Request

```http
POST /api/admin/student-enquiries
Authorization: Bearer <admin-jwt-token>
Content-Type: application/json

{
  "name": "Amit Kumar",
  "phoneNumber": "+919876543210",
  "studentClass": "Class 8",
  "subjects": ["Mathematics", "Science"],
  "preferredTiming": "Evening",
  "locality": "Patna",
  "budgetRange": "3000-5000",
  "additionalNotes": "Needs additional academic support.",
  "enquirySource": "phone_call",
  "adminNotes": "Parent called in evening.",
  "assignedTo": 1
}
```

- Uses the same core field validation as `POST /api/student-enquiries`.
- `agreedToPolicy` is optional for manual admin creation (defaults to `true`; rejected with `400` if explicitly `false`).
- `enquirySource` is validated against `website`, `phone_call`, `email`, `referral`, `network`, `other` (defaults to `website` if omitted).
- Initial `enquiryStatus` is always set server-side to `'new'`.

### Success response (201)

```json
{
  "success": true,
  "message": "Student enquiry created successfully.",
  "data": {
    "id": 12,
    "studentClass": "Class 8",
    "subjects": ["Mathematics", "Science"],
    "preferredTiming": "Evening",
    "locality": "Patna",
    "budgetRange": "3000-5000",
    "name": "Amit Kumar",
    "phoneNumber": "+919876543210",
    "additionalNotes": "Needs additional academic support.",
    "agreedToPolicy": true,
    "enquirySource": "phone_call",
    "enquiryStatus": "new",
    "markAsRead": false,
    "adminNotes": "Parent called in evening.",
    "assignedTo": 1,
    "createdAt": "2026-11-11T14:30:00.000Z",
    "updatedAt": "2026-11-11T14:30:00.000Z"
  }
}
```

### Error responses

- `401` Unauthenticated: `{ "success": false, "message": "Authentication required." }`
- `403` Non-admin: `{ "success": false, "message": "Super admin access required." }`
- `400` Validation / invalid `enquirySource` / nonexistent `assignedTo`: `{ "success": false, "message": "...", "errors": [{ "field": "enquirySource", "message": "..." }] }`

---

## GET /api/student-enquiries — List enquiries

`super_admin` only. Returns a paginated list of enquiries. Supports Payload's
standard query parameters plus convenience `enquiryStatus`, `enquirySource`, and `unread=true` filters.

### Request

```http
GET /api/student-enquiries?limit=10&page=1&sort=-createdAt&enquiryStatus=new&enquirySource=phone_call
Authorization: Bearer <admin-jwt-token>
```

`curl` example:

```bash
curl -X GET "http://localhost:3000/api/student-enquiries?limit=5&page=2&sort=-createdAt" \
  -H "Authorization: Bearer <admin-jwt-token>"
```

Filter by status:

```bash
curl -X GET "http://localhost:3000/api/student-enquiries?enquiryStatus=contacted" \
  -H "Authorization: Bearer <admin-jwt-token>"
```

Arbitrary Payload `where` filter (JSON-encoded):

```bash
curl -X GET "http://localhost:3000/api/student-enquiries?where={\"locality\":{\"equals\":\"Central London\"}}" \
  -H "Authorization: Bearer <admin-jwt-token>"
```

### Success response (200)

```json
{
  "docs": [
    {
      "id": 7,
      "studentClass": "Class 10",
      "subjects": ["Mathematics", "English"],
      "customSubject": "Vedic Maths",
      "preferredTiming": "Weekday evenings",
      "locality": "Central London",
      "customLocality": "Canary Wharf",
      "budgetRange": "GBP 30-50 per hour",
      "name": "Aanya Sharma",
      "phoneNumber": "+442079460958",
      "additionalNotes": "Prefers evening slots.",
      "agreedToPolicy": true,
      "createdAt": "2026-10-28T14:30:00.000Z"
    }
  ],
  "totalDocs": 1,
  "totalPages": 1,
  "page": 1,
  "limit": 5,
  "hasNextPage": false,
  "hasPrevPage": false
}
```

### Access denied (403)

```http
GET /api/student-enquiries
# no Authorization header, or a teacher token
```

```json
{ "error": "Super admin access required." }
```

---

## GET /api/student-enquiries/:id — Get one enquiry

`super_admin` only. Payload's built-in REST endpoint.

### Request

```http
GET /api/student-enquiries/7
Authorization: Bearer <admin-jwt-token>
```

`curl` example:

```bash
curl -X GET http://localhost:3000/api/student-enquiries/7 \
  -H "Authorization: Bearer <admin-jwt-token>"
```

### Success response (200)

Returns the full enquiry document, including internal management fields
(`enquiryStatus`, `adminNotes`, `assignedTo`) for admins:

```json
{
  "id": 7,
  "studentClass": "Class 10",
  "subjects": [
    { "id": 1, "subject": "Mathematics" },
    { "id": 2, "subject": "English" }
  ],
  "customSubject": "Vedic Maths",
  "preferredTiming": "Weekday evenings",
  "locality": "Central London",
  "customLocality": "Canary Wharf",
  "budgetRange": "GBP 30-50 per hour",
  "name": "Aanya Sharma",
  "phoneNumber": "+442079460958",
  "additionalNotes": "Prefers evening slots.",
  "agreedToPolicy": true,
  "enquiryStatus": "contacted",
  "adminNotes": "Called parent on 28 Oct; follow up next week.",
  "assignedTo": 3,
  "createdAt": "2026-10-28T14:30:00.000Z",
  "updatedAt": "2026-10-29T09:15:00.000Z"
}
```

Note: `subjects` is returned in Payload's native array-field shape
(`[{ id, subject }]`) when read directly through Payload's built-in API.

### Error responses

Not authenticated (401):

```json
{ "error": "Not authenticated." }
```

Not authorized / not found (403 or 404):

```json
{ "error": "Super admin access required." }
```

---

## PATCH /api/student-enquiries/:id — Update an enquiry

`super_admin` only. Payload's built-in REST endpoint. Partial updates are
supported. Internal management fields (`enquiryStatus`, `adminNotes`,
`assignedTo`) may only be changed through authenticated admin requests.

### Request

```http
PATCH /api/student-enquiries/7
Authorization: Bearer <admin-jwt-token>
Content-Type: application/json

{
  "enquiryStatus": "contacted",
  "adminNotes": "Called parent; interested in trial class.",
  "assignedTo": 3
}
```

`curl` example:

```bash
curl -X PATCH http://localhost:3000/api/student-enquiries/7 \
  -H "Authorization: Bearer <admin-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "enquiryStatus": "contacted",
    "adminNotes": "Called parent; interested in trial class.",
    "assignedTo": 3
  }'
```

Public callers attempting `PATCH` receive `403 Super admin access required.`
(enforced by collection access control — `update` is `super_admin` only).

### Success response (200)

Returns the updated document (Payload's built-in response shape).

### Error responses

```json
{ "error": "Super admin access required." }          // 403
{ "error": "Not authenticated." }                    // 401
{ "error": "..." }                                   // 404 if the enquiry does not exist or is not accessible
```

---

## POST /api/student-enquiries/:id/convert — Convert enquiry to student

`super_admin` only. Atomically creates one operational student record in the `students` collection referencing this enquiry (`studentEnquiry`), transitions `enquiryStatus` to `converted`, and records an audit entry in `enquiry-audit-log`.

- **Eligible enquiry statuses:** `new`, `contacted`, `in_progress`.
- **Rejected enquiry statuses:** `converted` (`409 Conflict`), `closed` (`400 Bad Request`), `allocated` (`400 Bad Request`).
- Never auto-transitions the enquiry to `allocated`.
- Guards against sequential and concurrent duplicate conversions via database unique constraint (`students.student_enquiry_id`) inside a database transaction (`409 Conflict` if already converted).

### Request (body optional)

```http
POST /api/student-enquiries/12/convert
Authorization: Bearer <admin-jwt-token>
Content-Type: application/json

{
  "parentName": "Rajesh Kumar",
  "alternatePhoneNumber": "+919876500000",
  "parentEmail": "rajesh@example.com",
  "learningNotes": "Needs extra help in algebra."
}
```

### Success response (201)

```json
{
  "success": true,
  "message": "Student enquiry converted to student record successfully.",
  "data": {
    "student": {
      "id": 5,
      "name": "Amit Kumar",
      "parentName": "Rajesh Kumar",
      "phoneNumber": "+919876543210",
      "alternatePhoneNumber": "+919876500000",
      "parentEmail": "rajesh@example.com",
      "studentClass": "Class 8",
      "subjects": ["Mathematics", "Science"],
      "locality": "Patna",
      "preferredTiming": "Evening",
      "budgetRange": "3000-5000",
      "learningNotes": "Needs extra help in algebra.",
      "studentEnquiry": 12,
      "status": "active",
      "convertedAt": "2026-11-11T14:40:00.000Z",
      "convertedBy": 1
    },
    "enquiry": {
      "id": 12,
      "enquirySource": "phone_call",
      "enquiryStatus": "converted"
    }
  }
}
```

### Error responses

- `400` Invalid ID, malformed JSON/optional fields, or enquiry in `closed` / `allocated` status
- `401` Unauthenticated (`{ "success": false, "message": "Authentication required." }`)
- `403` Non-`super_admin` (`{ "success": false, "message": "Super admin access required." }`)
- `404` Enquiry not found
- `409` Duplicate/already converted (`{ "success": false, "message": "Enquiry has already been converted to a student." }`)

---

## DELETE /api/student-enquiries/:id — Delete an enquiry

`super_admin` only. Payload's built-in REST endpoint.

### Request

```http
DELETE /api/student-enquiries/7
Authorization: Bearer <admin-jwt-token>
```

`curl` example:

```bash
curl -X DELETE http://localhost:3000/api/student-enquiries/7 \
  -H "Authorization: Bearer <admin-jwt-token>"
```

Public callers attempting `DELETE` receive `403 Super admin access required.`

### Success response (200)

Returns the deleted document (Payload's built-in response shape).

---

## Authentication and JWT Guide

Admin-only endpoints require a valid Payload JWT obtained by authenticating a
`super_admin` user via the existing authentication API (e.g.
`POST /api/auth/login`, documented in `API-DOC/auth.md`).

```http
Authorization: Bearer <jwt-token>
```

- Tokens are signed with `PAYLOAD_SECRET`.
- `teacher` accounts are authenticated users but are **not** authorized for
  enquiry management operations.
- Do not send client-supplied roles or IDs; authorization is enforced
  server-side on the authenticated user's record.

---

## Validation Rules

| Field | Type | Required | Limits / Rules |
|-------|------|----------|----------------|
| `studentClass` | text | Yes | Max 50 characters |
| `subjects` | array of text | Yes | At least one subject; each max 100 characters |
| `customSubject` | text | No | Max 200 characters |
| `preferredTiming` | text | Yes | Max 100 characters |
| `locality` | text | Yes | Max 200 characters |
| `customLocality` | text | No | Max 200 characters |
| `budgetRange` | text | Yes | Max 100 characters |
| `name` | text | Yes | Max 200 characters |
| `phoneNumber` | text | Yes | Max 20 characters; 7–15 digits, optional leading `+`; formatting characters (spaces, dashes, parentheses) are allowed and stripped. No country code is assumed. |
| `additionalNotes` | textarea | No | Max 2,000 characters |
| `agreedToPolicy` | checkbox | Public: Yes / Admin: Optional | Public submissions require `true`. Admin manual creation defaults to `true` and rejects explicit `false`. |
| `enquirySource` | select | No (defaults to `website`) | Allowed: `website`, `phone_call`, `email`, `referral`, `network`, `other`. Public route enforces `website`. |

Field names match the `TutorEnquiryFormData` TypeScript interface so the public
API stays compatible with the form contract.

---

## Enquiry Status Values & State Transitions

`enquiryStatus` is an internal management field. Supported values:

| Value | Meaning |
|-------|---------|
| `new` | Freshly submitted enquiry, not yet triaged (default) |
| `contacted` | The family has been contacted |
| `in_progress` | Enquiry is being actively processed |
| `converted` | Enquiry converted to an operational Student record (`students`) |
| `allocated` | Teacher allocated to student (terminal status for enquiry) |
| `closed` | Enquiry closed (requires non-empty `changeReason`; reopenable to `contacted` or `in_progress` with `changeReason`) |

**Standard State Transition Flow:**
- `new` -> `contacted` | `closed`
- `contacted` -> `in_progress` | `closed`
- `in_progress` -> `converted` | `closed`
- `converted` -> `allocated` | `closed`
- `closed` -> `contacted` | `in_progress` (mandatory `changeReason`)
- `allocated` -> terminal (`[]`)
- Explicit conversion endpoint `POST /api/student-enquiries/:id/convert` transitions `new`, `contacted`, or `in_progress` directly to `converted` inside a database transaction.

Only `super_admin` administrators may read or modify `enquiryStatus`.

---

## Error Reference

| Status | Meaning | Endpoints | Example body |
|--------|---------|-----------|--------------|
| 400 | Validation / invalid request | `POST`, admin routes | `{ "error": "name is required." }` / `{ "success": false, "message": "...", "errors": [...] }` |
| 401 | Not authenticated | Admin routes (`401` on new Phase 1 endpoints) | `{ "success": false, "message": "Authentication required." }` |
| 403 | Insufficient permissions | Admin endpoints | `{ "error": "Super admin access required." }` / `{ "success": false, "message": "Super admin access required." }` |
| 404 | Enquiry not found (or not accessible) | `GET/:id`, `PATCH`, `DELETE`, `convert` | `{ "success": false, "message": "Student enquiry not found." }` |
| 409 | Duplicate conversion | `POST /:id/convert` | `{ "success": false, "message": "Enquiry has already been converted to a student." }` |
| 429 | Rate limit exceeded | `POST` | `{ "error": "Too many enquiry submissions. Please try again later." }` |
| 500 | Server error | All | `{ "error": "<message>" }` |

---

## Security Notes

- **Public submission is create-only.** Payload collection access control
  denies `read`, `update`, and `delete` to unauthenticated users, so public
  callers cannot list or read other people's enquiries.
- **Phone numbers, names, localities, and notes are personal data.** They are
  never returned to unauthenticated callers and are only visible to
  `super_admin` administrators through protected endpoints.
- **Internal fields are server-only.** `enquiryStatus`, `adminNotes`,
  `assignedTo`, `markAsRead`, `changeReason`, and non-website `enquirySource` values cannot be forged on public submissions.
- **No sensitive logging.** Enquiry payloads are not logged by submission or conversion handlers.
- **Rate limiting** is applied per IP on the public submission endpoint using
  an in-memory store (15 requests per 15-minute window). For production
  deployments with multiple instances, replace this with a distributed store
  such as Redis.
- Use **HTTPS in production** to protect enquiry data and admin JWTs in
  transit.

---

## Implementation Notes

- Collection slug: `student-enquiries` (`src/collections/StudentEnquiries.ts`),
  registered in `src/payload.config.ts`.
- Related student operational collection: `students` (`src/collections/Students.ts`), documented in `API-DOC/students.md`.
- Shared validation & domain logic live in `src/lib/studentValidation.ts`, `src/lib/api.ts`, and `src/services/studentService.ts`.
- Standard Payload metadata fields `id`, `createdAt`, and `updatedAt` are
  managed automatically by Payload (timestamps enabled).
- TypeScript types regenerated with `npm run generate:types` (`src/payload-types.ts`).
- Database-backed verification ran against live local PostgreSQL via Vitest (`tests/int/student-enquiries.int.spec.ts`, `tests/int/enquiry-audit-log.int.spec.ts`, and `tests/int/phase1-students.int.spec.ts`). Note: `POST/PATCH /api/student-enquiries/:id/read` and `GET /api/inquiries/unread-counts` also exist in the codebase (`src/app/api/student-enquiries/[id]/read/route.ts`, `src/app/api/inquiries/unread-counts/route.ts`).

---

**End of API Reference**