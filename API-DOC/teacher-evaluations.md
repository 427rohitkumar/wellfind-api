# Wellfind Academic — Teacher Evaluations API Reference

API documentation for Teacher Evaluation management (`teacher-evaluations` collection and `teacher-evaluation-config` global, Phase 4 `FR-C1` to `FR-C3`, `BR-10`, `BR-11`).

**Base URLs:**
- Local development: `http://localhost:3000`
- Production: `https://your-domain.com`

---

## Access Control

| Operation | Endpoint | Auth | Role Required |
|---|---|---|---|
| Create evaluation | `POST /api/teacher-enquiries/:id/evaluations` | JWT Bearer | Active `super_admin` (`401` unauthenticated, `403` non-admin or blocked/suspended) |
| List evaluation history | `GET /api/teacher-enquiries/:id/evaluations` | JWT Bearer | Active `super_admin` |
| Get evaluation detail | `GET /api/teacher-enquiries/:id/evaluations/:evaluationId` | JWT Bearer | Active `super_admin` |
| Update / complete evaluation | `PATCH /api/teacher-enquiries/:id/evaluations/:evaluationId` | JWT Bearer | Active `super_admin` |
| Read/update weight settings | `GET`/`POST /api/globals/teacher-evaluation-config` | JWT Bearer | Active `super_admin` |

- Collection and global access control also enforce active `super_admin` only.
- Evaluators (`evaluator`, `writtenTest.recordedBy`, `interview.recordedBy`, `lastUpdatedBy`) and timestamps (`evaluatedAt`, `completedAt`, `recordedAt`, `lastUpdatedAt`) are derived strictly server-side from the authenticated admin user and UTC server clock; client-supplied `qualityScore`, `appliedWeights`, or actor IDs are ignored.

---

## Quality Score Calculation & Central Weights (`FR-C2`)

Default centrally configured weights stored in `teacher-evaluation-config`:
- **Written Test (`writtenTestWeight`):** `0.50` (50%)
- **Interview (`interviewWeight`):** `0.50` (50%)

Formula (computed only when **both** `writtenTest` and `interview` results are recorded):

```text
Written Percentage   = (writtenTest.marksObtained / writtenTest.totalMarks) × 100
Interview Percentage = (interview.marksObtained / interview.totalMarks) × 100

Quality Score = (Written Percentage × writtenTestWeight)
              + (Interview Percentage × interviewWeight)
```

- Example with default 50/50 weights: `75/100` written (`75%`) and `80/100` interview (`80%`) yields **`77.5`**.
- Both weights must be strictly between `0` and `1` and sum to `1.0` (`BR-11`).
- Calculated scores **never** automatically approve or reject a teacher application (`FR-C2`).
- When a `shortlisted` application receives a completed evaluation (`writtenTest` + `interview`), `applicationStatus` transitions automatically to `evaluation_completed` (audited to `enquiry-audit-log`). Applications already approved or rejected return `409 Conflict` for evaluation mutations.

---

## POST /api/teacher-enquiries/:id/evaluations — Create Evaluation (`FR-C1`)

Creates a new timestamped evaluation attempt (`attemptNumber` auto-incremented per enquiry) without overwriting prior evaluation records.

- Supplying both `writtenTest` and `interview` creates a `completed` evaluation with calculated `qualityScore` and `completedAt`.
- Supplying only one section (without completion flags) saves an `in_progress` evaluation (`qualityScore: null`, `completedAt: null`).
- Requesting completion (`evaluationStatus: "completed"`, `status: "completed"`, `markCompleted: true`, `complete: true`) when either section is missing is rejected with `400 Bad Request`.

### Request Body

| Field | Type | Required | Rules |
|---|---|---|---|
| `writtenTest` | object | Conditional | Object with `marksObtained` (`>= 0`, `<= totalMarks`), `totalMarks` (`> 0`), optional `remarks` (max 2,000 chars) |
| `interview` | object | Conditional | Object with `marksObtained` (`>= 0`, `<= totalMarks`), `totalMarks` (`> 0`), optional `remarks` (max 2,000 chars) |
| `overallRemarks` | string | No | Optional summary notes, max 3,000 chars |
| `evaluationStatus` / `status` | string | No | `in_progress` \| `completed` |
| `markCompleted` / `complete` | boolean | No | If `true`, requires both `writtenTest` and `interview` |

#### Example Request

```http
POST /api/teacher-enquiries/12/evaluations
Authorization: Bearer <admin-jwt-token>
Content-Type: application/json

{
  "writtenTest": {
    "marksObtained": 75,
    "totalMarks": 100,
    "remarks": "Good subject knowledge."
  },
  "interview": {
    "marksObtained": 80,
    "totalMarks": 100,
    "remarks": "Good communication and teaching approach."
  }
}
```

#### Success Response (`201 Created`)

```json
{
  "success": true,
  "message": "Teacher evaluation recorded successfully.",
  "data": {
    "id": 1,
    "teacherEnquiry": 12,
    "attemptNumber": 1,
    "evaluationStatus": "completed",
    "writtenTest": {
      "marksObtained": 75,
      "totalMarks": 100,
      "percentage": 75,
      "remarks": "Good subject knowledge.",
      "recordedBy": 1,
      "recordedAt": "2026-11-11T16:40:00.000Z"
    },
    "interview": {
      "marksObtained": 80,
      "totalMarks": 100,
      "percentage": 80,
      "remarks": "Good communication and teaching approach.",
      "recordedBy": 1,
      "recordedAt": "2026-11-11T16:40:00.000Z"
    },
    "appliedWeights": {
      "writtenTestWeight": 0.5,
      "interviewWeight": 0.5
    },
    "qualityScore": 77.5,
    "overallRemarks": null,
    "evaluator": 1,
    "evaluatedAt": "2026-11-11T16:40:00.000Z",
    "completedAt": "2026-11-11T16:40:00.000Z",
    "lastUpdatedBy": null,
    "lastUpdatedAt": null,
    "revisionCount": 0,
    "revisionHistory": [],
    "createdAt": "2026-11-11T16:40:00.000Z",
    "updatedAt": "2026-11-11T16:40:00.000Z"
  }
}
```

---

## GET /api/teacher-enquiries/:id/evaluations — List Evaluation History (`FR-C3`)

Returns paginated evaluation history for a teacher enquiry.

### Query Parameters

| Parameter | Default | Allowed / Rules |
|---|---|---|
| `page` | `1` | Positive integer `>= 1` |
| `limit` | `10` | Clamped between `1` and `100` |
| `sort` | `-attemptNumber` | `attemptNumber`, `-attemptNumber`, `qualityScore`, `-qualityScore`, `evaluatedAt`, `-evaluatedAt`, `completedAt`, `-completedAt`, `createdAt`, `-createdAt`, `evaluationStatus`, `id` |
| `evaluationStatus` | — | Optional filter: `in_progress` \| `completed` |

#### Success Response (`200 OK`)

Returns `data` with `docs`, `totalDocs`, `totalPages`, `page`, `limit`, `hasNextPage`, `hasPrevPage`.

---

## GET /api/teacher-enquiries/:id/evaluations/:evaluationId — Retrieve Evaluation (`FR-C3`)

Retrieves a single evaluation record scoped to `:id`. Returns `404` if either the teacher enquiry does not exist or `:evaluationId` does not belong to `:id`.

---

## PATCH /api/teacher-enquiries/:id/evaluations/:evaluationId — Update / Complete Evaluation (`FR-C2`, `FR-C3`)

Authorized update endpoint for finishing an `in_progress` evaluation or performing an audited moderation/recalculation on a `completed` evaluation.

- When modifying an already **`completed`** evaluation, `changeReason` is **mandatory** (non-empty string, max 1,000 chars); silent overwrites are rejected (`400 Bad Request`).
- Every update appends a full immutable snapshot (`previousStatus`, `newStatus`, `previousWrittenTest`, `previousInterview`, `previousAppliedWeights`, `previousQualityScore`, `newQualityScore`, `changeReason`, `changedBy`, `changedAt`) to `revisionHistory`, writes an audit entry (`fieldChanged: "evaluation"`) to `enquiry-audit-log`, and recalculates `qualityScore` consistently using the current central weights in `teacher-evaluation-config`.
- Completed evaluations cannot be reverted to `in_progress` and previously recorded sections cannot be cleared (`null`).

### Request Body

| Field | Type | Required | Rules |
|---|---|---|---|
| `writtenTest` | object | No | Updated written test marks/total/remarks (`null` rejected) |
| `interview` | object | No | Updated interview marks/total/remarks (`null` rejected) |
| `overallRemarks` | string \| null | No | Max 3,000 chars |
| `recalculate` | boolean | No | Forces score recalculation using current central weights without changing marks |
| `changeReason` | string | Required when `evaluationStatus === "completed"` | Non-empty reason, max 1,000 chars |

---

## Global Weights Endpoint (`teacher-evaluation-config`)

Payload's built-in global REST endpoints allow active `super_admin` callers to inspect or adjust central evaluation weights:

- `GET /api/globals/teacher-evaluation-config`
- `POST /api/globals/teacher-evaluation-config`

Body example:

```json
{
  "writtenTestWeight": 0.6,
  "interviewWeight": 0.4
}
```
