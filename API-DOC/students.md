# Wellfind Academic — Students API Reference

API documentation for operational Student records (`students` collection) built on Payload CMS 3.x + PostgreSQL.

**Base URLs:**
- Local development: `http://localhost:3000`
- Production: `https://your-domain.com`

---

## Access Control

| Operation | Endpoint | Auth | Role Required |
|---|---|---|---|
| Create student | `POST /api/students` | JWT Bearer | `super_admin` (`401` unauthenticated, `403` non-admin) |
| List students | `GET /api/students` | JWT Bearer | `super_admin` (`401` unauthenticated, `403` non-admin) |
| Retrieve student | `GET /api/students/:id` | JWT Bearer | `super_admin` (`401` unauthenticated, `403` non-admin) |
| Update student | `PATCH /api/students/:id` | JWT Bearer | `super_admin` (`401` unauthenticated, `403` non-admin) |
| Create student assessment | `POST /api/students/:id/assessments` | JWT Bearer | Active `super_admin` (see `API-DOC/student-assessments.md`) |
| List student assessments | `GET /api/students/:id/assessments` | JWT Bearer | Active `super_admin` (see `API-DOC/student-assessments.md`) |

- Collection-level access (`src/collections/Students.ts`) also restricts `create`, `read`, `update`, and `delete` strictly to active `super_admin` users.
- Converted enquiries should be created via `POST /api/student-enquiries/:id/convert` (see `API-DOC/student-enquiry.md`); direct creation on `POST /api/students` rejects client-supplied `studentEnquiry` links to preserve 1:1 enquiry state integrity.

---

## POST /api/students — Create Student Record

Creates a student record directly when operationally required without a prior enquiry conversion.

### Request Body

| Field | Type | Required | Rules |
|---|---|---|---|
| `name` | string | Yes | 1–200 chars |
| `phoneNumber` | string | Yes | 7–15 digits, optional leading `+` (normalized by stripping spaces, dashes, parentheses) |
| `studentClass` | string | Yes | 1–50 chars |
| `subjects` | `string[]` | Yes | Non-empty array; each item 1–100 chars |
| `locality` | string | Yes | 1–200 chars |
| `preferredTiming` | string | Yes | 1–100 chars |
| `parentName` | string | No | Max 200 chars |
| `alternatePhoneNumber` | string | No | 7–15 digits, optional leading `+` |
| `parentEmail` | string | No | Valid email, max 254 chars |
| `customSubject` | string | No | Max 200 chars |
| `customLocality` | string | No | Max 200 chars |
| `budgetRange` | string | No | Max 100 chars |
| `learningNotes` | string | No | Max 5,000 chars |
| `status` | string | No | `active` (default), `inactive`, `paused`, `completed` |

#### Example Request

```json
{
  "name": "Riya Verma",
  "parentName": "Suresh Verma",
  "phoneNumber": "+91 98765-33333",
  "alternatePhoneNumber": "+91 98765 33334",
  "parentEmail": "suresh.verma@example.com",
  "studentClass": "Class 10",
  "subjects": ["Mathematics", "Chemistry"],
  "locality": "Boring Road, Patna",
  "preferredTiming": "Weekday evenings",
  "budgetRange": "4000-6000",
  "learningNotes": "Preparing for board exams."
}
```

#### Success Response (`201 Created`)

```json
{
  "success": true,
  "message": "Student record created successfully.",
  "data": {
    "id": 1,
    "name": "Riya Verma",
    "parentName": "Suresh Verma",
    "phoneNumber": "+919876533333",
    "alternatePhoneNumber": "+919876533334",
    "parentEmail": "suresh.verma@example.com",
    "studentClass": "Class 10",
    "subjects": ["Mathematics", "Chemistry"],
    "customSubject": null,
    "locality": "Boring Road, Patna",
    "customLocality": null,
    "preferredTiming": "Weekday evenings",
    "budgetRange": "4000-6000",
    "learningNotes": "Preparing for board exams.",
    "studentEnquiry": null,
    "status": "active",
    "convertedAt": null,
    "convertedBy": null,
    "createdAt": "2026-11-11T14:40:00.000Z",
    "updatedAt": "2026-11-11T14:40:00.000Z"
  }
}
```

#### Error Responses
- `400` Validation error (missing required field, invalid phone/email, invalid `status`, or attempt to pass `studentEnquiry` directly)
- `401` Unauthenticated
- `403` Non-`super_admin`

---

## GET /api/students — List Students

Paginated listing of operational student records.

### Query Parameters
- `page`: integer `>= 1` (default `1`)
- `limit`: integer `1..100` (default `10`)
- `sort`: allowed fields `id`, `name`, `studentClass`, `locality`, `status`, `createdAt`, `updatedAt` (optional `-` prefix; default `-createdAt`)
- `status`: filter by `active`, `inactive`, `paused`, `completed`
- `studentClass`: exact match filter
- `locality`: exact match filter
- `studentEnquiry`: positive integer enquiry ID filter
- `search`: substring search across `name`, `phoneNumber`, and `parentName`
- `where`: optional JSON-encoded Payload `where` object

### Success Response (`200 OK`)

```json
{
  "success": true,
  "message": "Students retrieved successfully.",
  "data": {
    "docs": [],
    "totalDocs": 1,
    "totalPages": 1,
    "page": 1,
    "limit": 10,
    "hasNextPage": false,
    "hasPrevPage": false
  }
}
```

---

## GET /api/students/:id — Retrieve Student

Retrieves a single student record by numeric ID.

- `200 OK`: `{ "success": true, "message": "Student retrieved successfully.", "data": { ... } }`
- `400 Bad Request`: Invalid non-positive/non-numeric ID
- `401 Unauthorized` / `403 Forbidden`
- `404 Not Found`: `{ "success": false, "message": "Student not found." }`

---

## PATCH /api/students/:id — Update Student

Updates permitted operational fields on an existing student record.

- Mutable fields: `name`, `parentName`, `phoneNumber`, `alternatePhoneNumber`, `parentEmail`, `studentClass`, `subjects`, `customSubject`, `locality`, `customLocality`, `preferredTiming`, `budgetRange`, `learningNotes`, `status`.
- Immutable/server-controlled metadata (`studentEnquiry`, `convertedAt`, `convertedBy`) cannot be changed (`400 Bad Request`).
- Nullable optional fields (`parentName`, `alternatePhoneNumber`, `parentEmail`, `customSubject`, `customLocality`, `budgetRange`, `learningNotes`) accept `null` or `""` to clear values.

### Success Response (`200 OK`)

```json
{
  "success": true,
  "message": "Student updated successfully.",
  "data": {
    "id": 1,
    "name": "Riya Verma",
    "status": "paused"
  }
}
```

---

## Business Rules & Relationships
- **One-to-One Conversion Link:** When created via `POST /api/student-enquiries/:id/convert`, `studentEnquiry` references the originating `student-enquiries` row with a PostgreSQL unique constraint (`students.student_enquiry_id`).
- **Operational Status Values (`status`):** `active` (default), `inactive`, `paused`, `completed`.
- **Capability Assessments (`FR-B1`):** Multiple `student-assessments` records link many-to-one to `students.id` and do not require any physical test (`API-DOC/student-assessments.md`).
- **Verification Status:** Tested and verified against PostgreSQL via `tests/int/phase1-students.int.spec.ts` and `tests/int/phase2-student-assessments.int.spec.ts`.

---

## Related Optional Physical Tests (`FR-B2` – `FR-B6`)

Parents may optionally request an offline physical assessment test (fixed ₹100 `INR` fee) for a converted student record. Physical tests are **never required** for Phase 2 capability assessments (`/api/students/:studentId/assessments`) or student matching.

- Request or explicitly skip a physical test: `POST /api/students/:studentId/tests`
- List physical tests for a student: `GET /api/students/:studentId/tests`
- Payment, tester assignment, report submission/retrieval, and sharing logs: see [student-tests.md](./student-tests.md)
