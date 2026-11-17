# Wellfind Academic — Teacher Enquiry API Reference

API documentation for the Teacher Enquiry module built on Payload CMS 3.x
(PostgreSQL). Teachers submit applications through a public profile form
including private KYC/qualification documents. Applications are reviewed and
managed by `super_admin` administrators.

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
4. [POST /api/teacher-enquiries — Public application submission](#post-apiteacher-enquiries--public-application-submission)
5. [GET /api/teacher-enquiries — List applications](#get-apiteacher-enquiries--list-applications)
6. [GET /api/teacher-enquiries/:id — Get one application](#get-apiteacher-enquiriesid--get-one-application)
7. [PATCH /api/teacher-enquiries/:id — Update an application](#patch-apiteacher-enquiriesid--update-an-application)
8. [DELETE /api/teacher-enquiries/:id — Delete an application](#delete-apiteacher-enquiriesid--delete-an-application)
9. [Private document access](#private-document-access)
10. [Authentication and JWT Guide](#authentication-and-jwt-guide)
11. [Validation Rules](#validation-rules)
12. [Application Status Values](#application-status-values)
13. [Document Restrictions](#document-restrictions)
14. [Error Reference](#error-reference)
15. [Security Notes](#security-notes)
16. [Implementation Notes](#implementation-notes)

---

## Access Control

| Operation | Endpoint | Authentication | Authorization |
|-----------|----------|----------------|---------------|
| Submit application | `POST /api/teacher-enquiries` | None (public) | Open to unauthenticated visitors. Rate-limited by IP. |
| List applications | `GET /api/teacher-enquiries` | Required (JWT) | `super_admin` only. |
| Get one application | `GET /api/teacher-enquiries/:id` | Required (JWT) | `super_admin` only. |
| Update application | `PATCH /api/teacher-enquiries/:id` | Required (JWT) | `super_admin` only. |
| Delete application | `DELETE /api/teacher-enquiries/:id` | Required (JWT) | `super_admin` only. |
| Download private document | `GET /api/teacher-documents/:filename` | Required (JWT) | `super_admin` only. |

- Public submission **only** allows creating applications. Public callers cannot
  list, read, update, or delete any application, and cannot access private
  documents — this is enforced by Payload collection access control on the
  server.
- Internal management fields (`applicationStatus`, `adminNotes`, `reviewedBy`,
  `reviewedAt`) are never writable by public submissions and are never returned
  in the public submission response.
- Roles are never trusted from the client; authorization is always performed
  server-side against the authenticated user's record (`user.role === 'super_admin'`).
- Supported user roles: `super_admin`, `teacher`. Teachers cannot access
  admin-only application operations.
- Submitting an application does **not** create a login account or assign the
  `teacher` role.

---

## Endpoint Overview

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| `POST` | `/api/teacher-enquiries` | Public (rate-limited) | Submit a new teacher application (multipart/form-data) |
| `GET` | `/api/teacher-enquiries` | `super_admin` | List applications with pagination and filtering |
| `GET` | `/api/teacher-enquiries/:id` | `super_admin` | Get a single application |
| `PATCH` | `/api/teacher-enquiries/:id` | `super_admin` | Update an application (incl. internal fields) |
| `DELETE` | `/api/teacher-enquiries/:id` | `super_admin` | Delete an application |
| `GET` | `/api/teacher-documents/:filename` | `super_admin` | Download a private KYC/qualification document |

`GET /api/teacher-enquiries/:id`, `PATCH` and `DELETE` are Payload's built-in
REST endpoints for the `teacher-enquiries` collection; they are governed by the
collection's access control rules. No duplicate custom routes were created for
them. A custom route only shadows the exact `/api/teacher-enquiries` path.


---

## POST /api/teacher-enquiries — Public application submission

Submits a new teacher application. No authentication required. Rate-limited by IP
(10 requests per IP per 15-minute window, in-memory; use Redis for production
multi-instance deployments).

**Content-Type:** `multipart/form-data` (file uploads cannot be sent as JSON).

### Request

```http
POST /api/teacher-enquiries
Content-Type: multipart/form-data
```

Form fields:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `fullName` | text | Yes | Max 200 characters |
| `mobileNumber` | text | Yes | 7–15 digits, optional leading `+`; formatting chars stripped |
| `email` | text | No | Max 200 characters |
| `highestQualification` | text | Yes | Max 200 characters |
| `teachingExperience` | text | Yes | Max 200 characters |
| `primarySubject` | text | Yes | Max 200 characters |
| `classLevel` | text | Yes | UKG to Class 10, max 50 characters |
| `teachingLocality` | text | Yes | Max 200 characters |
| `preferredAvailability` | text | Yes | Max 200 characters |
| `additionalNotes` | text | No | Max 2,000 characters |
| `agreedToPolicy` | checkbox | Yes | Must be `true` or `on` |
| `aadhaarDocument` | file | No | PDF/JPG/PNG, max 5 MB |
| `qualificationDocument` | file | No | PDF/JPG/PNG, max 5 MB |

`curl` example:

```bash
curl -X POST http://localhost:3000/api/teacher-enquiries \
  -F "fullName=Ravi Kumar" \
  -F "mobileNumber=+91 98765 43210" \
  -F "email=ravi@example.com" \
  -F "highestQualification=M.Sc" \
  -F "teachingExperience=3 years" \
  -F "primarySubject=Mathematics" \
  -F "classLevel=Class 10" \
  -F "teachingLocality=Dwarka, Delhi" \
  -F "preferredAvailability=Weekday evenings" \
  -F "additionalNotes=Can travel within South Delhi." \
  -F "agreedToPolicy=true" \
  -F "aadhaarDocument=@/path/to/aadhaar.pdf" \
  -F "qualificationDocument=@/path/to/degree.pdf"
```

### Success response (201)

Only public form fields are returned — private document references and internal
management fields are excluded.

```json
{
  "message": "Application submitted successfully.",
  "application": {
    "id": 11,
    "fullName": "Ravi Kumar",
    "mobileNumber": "+919876543210",
    "email": "ravi@example.com",
    "highestQualification": "M.Sc",
    "teachingExperience": "3 years",
    "primarySubject": "Mathematics",
    "classLevel": "Class 10",
    "teachingLocality": "Dwarka, Delhi",
    "preferredAvailability": "Weekday evenings",
    "additionalNotes": "Can travel within South Delhi.",
    "agreedToPolicy": true,
    "createdAt": "2026-10-28T15:30:00.000Z"
  }
}
```

Notes:

- `mobileNumber` is stored normalized (formatting characters removed). No
  country code is assumed.
- `aadhaarDocument` and `qualificationDocument` are uploaded server-side and
  stored as private documents linked to the application. Their IDs/URLs are NOT
  returned in the public response.
- `applicationStatus` defaults to `new` and is managed by administrators only.
- Submitting an application does not create a user account or assign a role.

### Error responses

Missing required field (400):

```json
{ "error": "fullName is required." }
```

Policy not agreed (400):

```json
{ "error": "You must agree to the policy to submit an application." }
```

Invalid mobile number (400):

```json
{ "error": "Invalid mobile number. Provide 7–15 digits with an optional leading +." }
```

Invalid document type (400):

```json
{ "error": "Invalid file type for aadhaarDocument. Allowed types: PDF, JPG, PNG." }
```

Oversized document (400):

```json
{ "error": "File too large for qualificationDocument. Maximum size is 5 MB." }
```

Rate limit exceeded (429):

```json
{ "error": "Too many application submissions. Please try again later." }
```

---
---

## GET /api/teacher-enquiries — List applications

`super_admin` only. Returns a paginated list of applications. Supports Payload's
standard query parameters plus a convenience `applicationStatus` filter.

### Request

```http
GET /api/teacher-enquiries?limit=10&page=1&sort=-createdAt&applicationStatus=new
Authorization: Bearer <admin-jwt-token>
```

`curl` example:

```bash
curl -X GET "http://localhost:3000/api/teacher-enquiries?limit=5&page=2&sort=-createdAt" \
  -H "Authorization: Bearer <admin-jwt-token>"
```

Filter by status:

```bash
curl -X GET "http://localhost:3000/api/teacher-enquiries?applicationStatus=shortlisted" \
  -H "Authorization: Bearer <admin-jwt-token>"
```

Arbitrary Payload `where` filter (JSON-encoded):

```bash
curl -X GET "http://localhost:3000/api/teacher-enquiries?where={\"primarySubject\":{\"equals\":\"Mathematics\"}}" \
  -H "Authorization: Bearer <admin-jwt-token>"
```

### Success response (200)

```json
{
  "docs": [
    {
      "id": 11,
      "fullName": "Ravi Kumar",
      "mobileNumber": "+919876543210",
      "email": "ravi@example.com",
      "highestQualification": "M.Sc",
      "teachingExperience": "3 years",
      "primarySubject": "Mathematics",
      "classLevel": "Class 10",
      "teachingLocality": "Dwarka, Delhi",
      "preferredAvailability": "Weekday evenings",
      "additionalNotes": "Can travel within South Delhi.",
      "agreedToPolicy": true,
      "createdAt": "2026-10-28T15:30:00.000Z"
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

```json
{ "error": "Super admin access required." }
```

---

## GET /api/teacher-enquiries/:id — Get one application

`super_admin` only. Payload's built-in REST endpoint.

### Request

```http
GET /api/teacher-enquiries/11
Authorization: Bearer <admin-jwt-token>
```

`curl` example:

```bash
curl -X GET http://localhost:3000/api/teacher-enquiries/11 \
  -H "Authorization: Bearer <admin-jwt-token>"
```

### Success response (200)

Returns the full application document, including private document references
and internal management fields for admins:

```json
{
  "id": 11,
  "fullName": "Ravi Kumar",
  "mobileNumber": "+919876543210",
  "email": "ravi@example.com",
  "highestQualification": "M.Sc",
  "teachingExperience": "3 years",
  "primarySubject": "Mathematics",
  "classLevel": "Class 10",
  "teachingLocality": "Dwarka, Delhi",
  "preferredAvailability": "Weekday evenings",
  "additionalNotes": "Can travel within South Delhi.",
  "agreedToPolicy": true,
  "aadhaarDocument": 7,
  "qualificationDocument": 8,
  "applicationStatus": "under_review",
  "adminNotes": "Documents verified; scheduled interview.",
  "reviewedBy": 3,
  "reviewedAt": "2026-10-29T09:15:00.000Z",
  "createdAt": "2026-10-28T15:30:00.000Z",
  "updatedAt": "2026-10-29T09:15:00.000Z"
}
```

`aadhaarDocument` and `qualificationDocument` are IDs referencing private
documents in the `teacher-documents` collection. Download those documents via
`GET /api/teacher-documents/:filename` (super_admin only).

### Error responses

Not authenticated (401):

```json
{ "error": "Not authenticated." }
```

Not authorized / not found (403 or 404):

```json
{ "error": "Super admin access required." }
Not authorized / not found (403 or 404):

```json
{ "error": "Super admin access required." }
```

---

## PATCH /api/teacher-enquiries/:id — Update an application

`super_admin` only. Payload's built-in REST endpoint. Partial updates are
supported. Internal management fields (`applicationStatus`, `adminNotes`,
`reviewedBy`, `reviewedAt`) may only be changed through authenticated admin
requests.

### Request

```http
PATCH /api/teacher-enquiries/11
Authorization: Bearer <admin-jwt-token>
Content-Type: application/json

{
  "applicationStatus": "under_review",
  "adminNotes": "Documents verified; scheduled interview.",
  "reviewedBy": 3,
  "reviewedAt": "2026-10-29T09:15:00.000Z"
}
```

`curl` example:

```bash
curl -X PATCH http://localhost:3000/api/teacher-enquiries/11 \
  -H "Authorization: Bearer <admin-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "applicationStatus": "under_review",
    "adminNotes": "Documents verified; scheduled interview.",
    "reviewedBy": 3,
    "reviewedAt": "2026-10-29T09:15:00.000Z"
  }'
```

Public callers attempting `PATCH` receive `403 Super admin access required.`

### Success response (200)

Returns the updated document (Payload's built-in response shape).

### Error responses

```json
{ "error": "Super admin access required." }          // 403
{ "error": "Not authenticated." }                    // 401
{ "error": "..." }                                   // 404 if the application does not exist or is not accessible
```

---

## DELETE /api/teacher-enquiries/:id — Delete an application

`super_admin` only. Payload's built-in REST endpoint.

### Request

```http
DELETE /api/teacher-enquiries/11
Authorization: Bearer <admin-jwt-token>
```

`curl` example:

```bash
curl -X DELETE http://localhost:3000/api/teacher-enquiries/11 \
  -H "Authorization: Bearer <admin-jwt-token>"
```

Public callers attempting `DELETE` receive `403 Super admin access required.`

### Success response (200)

Returns the deleted document (Payload's built-in response shape).

---

## Private document access

KYC/qualification documents are stored in the dedicated private
`teacher-documents` collection (separate from the public `Media` collection).
Document downloads are served through Payload's file endpoint and are governed
by the `teacher-documents` collection's `read` access rule — `super_admin` only.

### Download a document

Each document has a filename. A super_admin can download it via:

```http
GET /api/teacher-documents/<filename>
Authorization: Bearer <admin-jwt-token>
```

`curl` example:

```bash
curl -X GET "http://localhost:3000/api/teacher-documents/aadhaar_<id>.pdf" \
  -H "Authorization: Bearer <admin-jwt-token>" \
  --output aadhaar.pdf
```

The exact filename is returned in the document metadata when listing or reading
the `teacher-documents` collection as `super_admin`.

### Access denied

Unauthenticated or non-`super_admin` requests to document endpoints receive:

```json
{ "error": "Not authenticated." }                          // 401
{ "error": "Super admin access required." }                // 403
```

Document URLs are never included in public application responses, and the
`teacher-documents` collection does not allow public create/read/update/delete.

Document URLs are never included in public application responses, and the
`teacher-documents` collection does not allow public create/read/update/delete.

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
| `fullName` | text | Yes | Max 200 characters |
| `mobileNumber` | text | Yes | Max 20 characters; 7–15 digits, optional leading `+`; formatting characters (spaces, dashes, parentheses) are stripped. No country code is assumed. |
| `email` | email | No | Max 200 characters |
| `highestQualification` | text | Yes | Max 200 characters |
| `teachingExperience` | text | Yes | Max 200 characters |
| `primarySubject` | text | Yes | Max 200 characters |
| `classLevel` | text | Yes | UKG to Class 10, max 50 characters |
| `teachingLocality` | text | Yes | Max 200 characters |
| `preferredAvailability` | text | Yes | Max 200 characters |
| `additionalNotes` | textarea | No | Max 2,000 characters |
| `agreedToPolicy` | checkbox | Yes | Must be `true` (or `on` from a form checkbox) |

Field names follow the supplied teacher profile form so the public API stays
compatible with the form contract.

---

## Application Status Values

`applicationStatus` is an internal management field. Supported values:

| Value | Meaning |
|-------|---------|
| `new` | Freshly submitted application, not yet reviewed (default) |
| `under_review` | Application is being actively reviewed |
| `shortlisted` | Candidate shortlisted for evaluation / next stage |
| `evaluation_completed` | Teacher written test and interview evaluation completed (not yet approved/rejected) |
| `approved` | Application approved |
| `rejected` | Application rejected |

Only `super_admin` administrators may read or modify `applicationStatus`. For Teacher Evaluation APIs (`FR-C1`–`FR-C3`), see [teacher-evaluations.md](file:///d:/Dev-2026/Builder-Studio/wellfind-api/API-DOC/teacher-evaluations.md).

---

## Document Restrictions

| Rule | Value |
|------|-------|
| Allowed MIME types | `application/pdf`, `image/jpeg`, `image/png` |
| Maximum file size | 5 MB per document |
| Collections | Dedicated `teacher-documents` (private), NOT the public `Media` collection |
| Public access | None — documents are never returned to unauthenticated callers |
| Admin access | `super_admin` only |

- File type and size are validated on the server before storage.
- SVG/XML and other disallowed types are rejected.
- Aadhaar numbers and document contents are never stored in ordinary logs.

---

---

## Error Reference

| Status | Meaning | Endpoints | Example body |
|--------|---------|-----------|--------------|
| 400 | Validation / invalid request | `POST` | `{ "error": "fullName is required." }` |
| 401 | Not authenticated | Admin endpoints | `{ "error": "Not authenticated." }` |
| 403 | Insufficient permissions | Admin endpoints | `{ "error": "Super admin access required." }` |
| 404 | Application not found | `GET/:id`, `PATCH`, `DELETE` | `{ "error": "..." }` |
| 429 | Rate limit exceeded | `POST` | `{ "error": "Too many application submissions. Please try again later." }` |
| 500 | Server error | All | `{ "error": "<message>" }` |

---

## Security Notes

- **Public submission is create-only.** Payload collection access control
  denies `read`, `update`, and `delete` to unauthenticated users, so public
  callers cannot list or read other people's applications.
- **KYC documents are private.** `teacher-documents` is a dedicated collection
  separate from the public `Media` collection, so documents are never publicly
  accessible merely because Media allows public reads. Document downloads are
  governed by `teacher-documents.read` (`super_admin` only).
- **Internal fields are server-only.** `applicationStatus`, `adminNotes`,
  `reviewedBy`, and `reviewedAt` are stripped from public submissions and
  protected by field-level access control; they are never included in the
  `POST` response.
- **No account creation.** Submitting an application does not create a user
  account or assign the `teacher` role.
- **No sensitive logging.** Application payloads and document contents are not
  logged by the submission endpoint.
- **Rate limiting** is applied per IP on the public submission endpoint using
  an in-memory store (10 requests per 15-minute window). For production
  deployments with multiple instances, replace this with a distributed store
  such as Redis.
- Use **HTTPS in production** to protect application data, documents, and admin
  JWTs in transit.

---

## Implementation Notes

- Collection slugs: `teacher-enquiries` (`src/collections/TeacherEnquiries.ts`)
  and `teacher-documents` (`src/collections/TeacherDocuments.ts`), both
  registered in `src/payload.config.ts`.
- Standard Payload metadata fields `id`, `createdAt`, and `updatedAt` are
  managed automatically by Payload (timestamps enabled).
- `POST /api/teacher-enquiries` is handled by a custom route handler
  (`src/app/api/teacher-enquiries/route.ts`) so that rate limiting, multipart
  parsing, request validation, sanitization, server-side document upload, and a
  trimmed public response can be enforced. `GET` (list), `GET/:id`, `PATCH`,
  and `DELETE` use Payload's built-in REST endpoints governed by the same
  collection access control. A static Next.js route only shadows the exact
  `/api/teacher-enquiries` path; `/api/teacher-enquiries/:id` is still served
  by Payload's built-in API routes.
- Public submission access: `create: () => true`; `read`/`update`/`delete`:
  `super_admin` only.
- `teacher-documents` access: all operations `super_admin` only. Documents are
  uploaded server-side via Payload's local API during application submission,
  so no orphan public uploads are possible.
- Field-level access control on `aadhaarDocument`/`qualificationDocument`
  (create public, update admin only) and on all internal management fields
  (`create`/`update`: `super_admin` only).
- `reviewedBy` references the existing `users` collection; no new collections
  beyond `teacher-documents` and `teacher-enquiries`, and no new user roles,
  were created.
- Database migrations: Payload manages the PostgreSQL schema automatically
  from the collection config; no separate migration scripts were added.
- TypeScript types were regenerated with `pnpm run generate:types`
  (`src/payload-types.ts`).
- Media collection access rules were left unchanged to avoid breaking existing
  media functionality.

**Test environment note:** PostgreSQL was not available in this environment
(`connect ECONNREFUSED 127.0.0.1:5432`), so database-backed API tests could
not be executed against a live database. Access-control rules, phone/mime
validation, and normalization were unit-tested and passed; database-backed
tests are written to skip (not fail) when the database is unavailable.

---

**End of API Reference**
---
---