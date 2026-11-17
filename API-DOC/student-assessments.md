# Wellfind Academic — Student Capability Assessments API Reference

API documentation for Student Capability Assessments (`student-assessments` collection, `FR-B1`) built on Payload CMS 3.x + PostgreSQL.

**Base URLs:**
- Local development: `http://localhost:3000`
- Production: `https://your-domain.com`

---

## Access Control

| Operation | Endpoint | Auth | Role Required |
|---|---|---|---|
| Create capability assessment | `POST /api/students/:studentId/assessments` | JWT Bearer | Active `super_admin` (`401` unauthenticated, `403` non-admin or blocked/suspended) |
| List student assessment history | `GET /api/students/:studentId/assessments` | JWT Bearer | Active `super_admin` (`401` unauthenticated, `403` non-admin or blocked/suspended) |

- Collection-level access (`src/collections/StudentAssessments.ts`) restricts `create`, `read`, `update`, and `delete` strictly to active `super_admin` users.
- The `assessedBy` actor is derived strictly server-side from the authenticated admin user (`req.user.id`); client-supplied `assessedBy` values are ignored.

---

## POST /api/students/:studentId/assessments — Create Capability Assessment

Records a capability assessment and previous performance review linked to an existing operational Student record (`students`). Does **not** require a physical student test (`BR-04`). Creating additional assessments appends new timestamped history records without overwriting earlier assessments.

### Path Parameters

| Parameter | Type | Rules |
|---|---|---|
| `studentId` | integer | Required. Positive integer matching an existing `students` record (`400` invalid format, `404` not found). |

### Request Body

| Field | Type | Required | Rules |
|---|---|---|---|
| `assessmentType` | string | No (default `initial_review`) | If provided, non-empty trimmed string, max 100 chars |
| `previousPerformance` | object | Yes | Plain JSON object with `summary` (required) and optional `details` |
| `previousPerformance.summary` | string | Yes | Non-empty trimmed string, max 500 chars |
| `previousPerformance.details` | string \| null | No | Max 5,000 chars |
| `currentCapability` | string | Yes | One of: `excellent`, `good`, `average`, `needs_improvement`, `weak` |
| `strengths` | `string[]` | Yes | JSON array (may be `[]`); every element must be a non-empty trimmed string, max 150 chars |
| `weaknesses` | `string[]` | Yes | JSON array (may be `[]`); every element must be a non-empty trimmed string, max 150 chars |
| `adminNotes` | string \| null | No | Max 5,000 chars |

*(Optional guard: if `student` or `studentId` is supplied in the JSON body, it must equal the `:studentId` URL parameter or `400` is returned.)*

#### Example Request

```http
POST /api/students/1/assessments
Authorization: Bearer <admin-jwt-token>
Content-Type: application/json

{
  "assessmentType": "initial_review",
  "previousPerformance": {
    "summary": "Average academic performance",
    "details": "Needs improvement in Mathematics."
  },
  "currentCapability": "needs_improvement",
  "strengths": ["English"],
  "weaknesses": ["Mathematics", "Science"],
  "adminNotes": "Requires individual attention."
}
```

#### Success Response (`201 Created`)

```json
{
  "success": true,
  "message": "Student capability assessment recorded successfully.",
  "data": {
    "id": 1,
    "student": 1,
    "assessmentType": "initial_review",
    "previousPerformance": {
      "summary": "Average academic performance",
      "details": "Needs improvement in Mathematics."
    },
    "currentCapability": "needs_improvement",
    "strengths": ["English"],
    "weaknesses": ["Mathematics", "Science"],
    "adminNotes": "Requires individual attention.",
    "assessedBy": 1,
    "assessedAt": "2026-11-11T15:15:00.000Z",
    "createdAt": "2026-11-11T15:15:00.000Z",
    "updatedAt": "2026-11-11T15:15:00.000Z"
  }
}
```

#### Error Responses
- `400 Bad Request`: Invalid `:studentId` format, malformed JSON, missing required field, invalid `currentCapability` enum value, invalid array entries in `strengths`/`weaknesses`, or mismatched body student ID (`{ "success": false, "message": "...", "errors": [{ "field": "...", "message": "..." }] }`).
- `401 Unauthorized`: `{ "success": false, "message": "Authentication required." }`
- `403 Forbidden`: `{ "success": false, "message": "Super admin access required." }`
- `404 Not Found`: `{ "success": false, "message": "Student does not exist.", "errors": [{ "field": "studentId", "message": "Student does not exist." }] }`

---

## GET /api/students/:studentId/assessments — List Student Assessment History

Retrieves paginated capability assessment records strictly scoped to `:studentId`.

### Query Parameters
- `page`: integer `>= 1` (default `1`)
- `limit`: integer `1..100` (default `10`)
- `sort`: allowed fields `id`, `assessedAt`, `createdAt`, `updatedAt`, `currentCapability`, `assessmentType` (optional `-` prefix; default `-assessedAt`)
- `currentCapability`: filter by `excellent`, `good`, `average`, `needs_improvement`, `weak` (`400` if invalid value)
- `assessmentType`: exact match filter on trimmed assessment type string

#### Success Response (`200 OK`)

```json
{
  "success": true,
  "message": "Student capability assessments retrieved successfully.",
  "data": {
    "docs": [
      {
        "id": 2,
        "student": 1,
        "assessmentType": "periodic_review",
        "previousPerformance": {
          "summary": "Improved class scores",
          "details": null
        },
        "currentCapability": "good",
        "strengths": ["English", "Mathematics"],
        "weaknesses": ["Science"],
        "adminNotes": null,
        "assessedBy": 1,
        "assessedAt": "2026-11-11T15:20:00.000Z",
        "createdAt": "2026-11-11T15:20:00.000Z",
        "updatedAt": "2026-11-11T15:20:00.000Z"
      }
    ],
    "totalDocs": 2,
    "totalPages": 1,
    "page": 1,
    "limit": 10,
    "hasNextPage": false,
    "hasPrevPage": false
  }
}
```

#### Error Responses
- `400 Bad Request`: Invalid `:studentId` or invalid `currentCapability` filter
- `401 Unauthorized` / `403 Forbidden`
- `404 Not Found`: Student does not exist

---

## Business Rules, Relationships & Notes
- **Many-to-One History:** `student-assessments.student` references `students` (`hasMany: false`, indexed, non-unique), preserving multiple historical assessments per student.
- **No Physical Test Dependency (`BR-04`):** Capability assessments can be created and retrieved independently without selecting or completing an optional physical student test.
- **Immutability:** Once persisted, `student` and `assessedBy` cannot be reassigned to another student or user via collection updates.
- **Timestamps:** All timestamps are stored and returned in UTC ISO 8601 format (`Z`).
- **Verification Status:** Verified against PostgreSQL via `tests/int/phase2-student-assessments.int.spec.ts` (validation, RBAC `401`/`403`, missing student `404`, history preservation, filtering/pagination, collection immutability, and Phase 1 conversion-to-assessment flow).
