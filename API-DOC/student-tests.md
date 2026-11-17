# Optional Physical Student Test API (`FR-B2` – `FR-B6`)

API specification for Wellfind Academic's **Optional Physical Student Test** workflow (`Phase 3`), covering optional ₹100 test requests (`FR-B2`), fee payment validation (`FR-B3`), tester assignment & reassignment (`FR-B4`), 1:1 test report submission & privacy (`FR-B5`–`FR-B6`), and manual report-sharing logs (`FR-B6`).

---

## Key Business & Security Rules

1. **Optional by Design (`BR-04`, `BR-05`, `BR-18`):** Physical tests are **never required** for Phase 2 academic capability assessments (`/api/students/:studentId/assessments`) or tutor matching. Sending `parentSelected: false` to `POST /api/students/:studentId/tests` returns `200 OK` without creating any `student-tests` record.
2. **Fixed Fee (`BR-06`):** Every physical test carries a fixed fee of **`100` `INR`** (₹100). Payments with any other amount or currency are rejected (`400`).
3. **Payment Integrity (`BR-06`):** A physical test cannot be marked `paid` (even at the collection hook layer) without a valid persisted `student-test-payments` record (`paymentStatus: 'paid'`, `amount: 100`, `currency: 'INR'`). Only one confirmed `'paid'` payment is allowed per physical test (`409 Conflict` on sequential or concurrent duplicates via PostgreSQL unique constraint `successfulPaymentKey`), while multiple `'failed'` / `'pending'` attempt records are preserved.
4. **Tester Eligibility (Phase 0 Decision #2):** No separate `tester` user role is created. `testerUserId` must reference an existing **active** user with role `'teacher'` or `'super_admin'`. Global teacher permissions on `/api/students`, `/api/student-tests`, payments, and share logs remain restricted to `super_admin`.
5. **Tester-Scoped Privacy (`FR-B4`–`FR-B6`):**
   - Only active `super_admin` users or the **currently assigned active tester** may access `GET /api/student-tests/:testId`, `POST /api/student-tests/:testId/report`, and `GET /api/student-tests/:testId/report`.
   - Reassigning a test to a new tester immediately revokes the previous tester's access (`403 Forbidden`).
   - Suspending or blocking an assigned tester immediately revokes access (`403 Forbidden`).
6. **1:1 Test Report (`BR-07`, `BR-08`):** A test must have an assigned tester (`409` if missing) and confirmed payment (`409` if unpaid) before a report can be submitted. Only one report may exist per physical test (`409 Conflict` on sequential or concurrent duplicates via PostgreSQL unique constraint on `studentTest`).
7. **Truthful Sharing Logs (`FR-B6`):** Report sharing supports `whatsapp` and `phone_call` operational logging by `super_admin` only. Because no external WhatsApp/telephony provider is integrated, persisted logs always set `externalDeliveryConfirmed: false` and `providerIntegrated: false`, and requests claiming `'delivered'` or `'read'` are rejected with `400 Bad Request`.
8. **UTC Timestamps:** Date-time inputs such as `scheduledAt` must be ISO-8601 strings with an explicit timezone designator (`Z` or `±HH:MM`) and are converted to canonical UTC ISO strings without fixed timezone shifts.

---

## Lifecycle State Machine

```text
(requested) ──▶ payment_pending ──▶ paid ──▶ tester_assigned ──▶ scheduled ──▶ (completed) ──▶ report_available
```

- `POST /api/students/:studentId/tests` (`parentSelected: true`) → creates record in `payment_pending` (`paymentStatus: 'pending'`).
- `POST /api/student-tests/:testId/payment` (`paymentStatus: 'paid'`) → transitions test to `paid` (`paymentStatus: 'paid'`).
- `PATCH /api/student-tests/:testId/assign-tester` → transitions test to `scheduled` if `scheduledAt` is set (new or existing), otherwise `tester_assigned`. Reassignment is allowed until report submission/completion.
- `POST /api/student-tests/:testId/report` → atomically inserts 1:1 `student-test-reports` document and transitions test to `report_available` (with `completedAt`).

---

## Endpoints Summary

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/students/:studentId/tests` | Active `super_admin` | Request ₹100 physical test (`parentSelected: true`) or skip cleanly (`parentSelected: false`) |
| `GET` | `/api/students/:studentId/tests` | Active `super_admin` | List physical tests for a student (paginated & filterable) |
| `GET` | `/api/student-tests/:testId` | Active `super_admin` or currently assigned active tester | Get physical test details (`payments` array included for `super_admin` only) |
| `POST` | `/api/student-tests/:testId/payment` | Active `super_admin` | Record ₹100 INR payment attempt / confirmation (`pending`, `paid`, `failed`) |
| `PATCH` | `/api/student-tests/:testId/assign-tester` | Active `super_admin` | Assign or reassign an active `teacher` or `super_admin` tester |
| `POST` | `/api/student-tests/:testId/report` | Active `super_admin` or currently assigned active tester | Submit 1:1 physical test report & transition test to `report_available` |
| `GET` | `/api/student-tests/:testId/report` | Active `super_admin` or currently assigned active tester | Retrieve physical test report |
| `POST` | `/api/student-tests/:testId/report/share` | Active `super_admin` | Log manual `whatsapp` or `phone_call` report-sharing action |
| `GET` | `/api/student-tests/:testId/report/share` | Active `super_admin` | List report-sharing logs for a physical test |

---

## 1. Create or Skip Optional Physical Test (`FR-B2`)

### `POST /api/students/:studentId/tests`

- **Auth:** Bearer token / Payload session cookie for an active `super_admin`.
- **Path Parameters:** `studentId` (positive integer).

#### Case A: Parent Opts In (`parentSelected: true`)

- **Request Body:**
  ```json
  {
    "parentSelected": true,
    "testType": "diagnostic_physical_test",
    "feeAmount": 100,
    "currency": "INR",
    "location": "Boring Road Center, Patna",
    "scheduledAt": "2026-12-01T14:00:00+05:30",
    "notes": "Parent opted for baseline assessment."
  }
  ```
- **Field Constraints:**
  - `parentSelected` (boolean, required).
  - `location` (non-empty string, max 250 chars, **required when `parentSelected: true`**).
  - `testType` (optional string, defaults to `"physical_assessment"`, max 100 chars).
  - `feeAmount` (optional number; if provided MUST equal `100`).
  - `currency` (optional string; if provided MUST equal `"INR"`).
  - `scheduledAt` (optional ISO-8601 timestamp with timezone offset `Z` or `±HH:MM`, stored in UTC).
  - `notes` (optional string, max 2000 chars).
  - `student` / `studentId` (if supplied in body, MUST match `:studentId` URL parameter).
- **Success Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Physical test request created successfully.",
    "data": {
      "skipped": false,
      "studentId": 12,
      "parentSelected": true,
      "recordCreated": true,
      "test": {
        "id": 5,
        "student": 12,
        "parentSelected": true,
        "testType": "diagnostic_physical_test",
        "feeAmount": 100,
        "currency": "INR",
        "location": "Boring Road Center, Patna",
        "scheduledAt": "2026-12-01T08:30:00.000Z",
        "status": "payment_pending",
        "paymentStatus": "pending",
        "assignedTester": null,
        "assignedBy": null,
        "assignedAt": null,
        "assignmentHistory": [],
        "completedAt": null,
        "notes": "Parent opted for baseline assessment.",
        "createdBy": 1,
        "createdAt": "2026-11-11T15:54:00.000Z",
        "updatedAt": "2026-11-11T15:54:00.000Z"
      }
    }
  }
  ```

#### Case B: Parent Opts Out (`parentSelected: false`)

- **Request Body:**
  ```json
  {
    "parentSelected": false
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Physical test skipped per parent preference; no physical test record created.",
    "data": {
      "skipped": true,
      "studentId": 12,
      "parentSelected": false,
      "recordCreated": false,
      "test": null
    }
  }
  ```
- **Error Responses:** `400 Bad Request` (invalid input / fee ≠ 100 / currency ≠ `INR`), `401 Unauthorized`, `403 Forbidden`, `404 Not Found` (`studentId` not found — even on `parentSelected: false`).

---

## 2. List Student Physical Tests

### `GET /api/students/:studentId/tests`

- **Auth:** Active `super_admin`.
- **Query Parameters:**
  - `page` (positive integer, default `1`), `limit` (1–100, default `10`).
  - `status`: optional (`requested`, `payment_pending`, `paid`, `tester_assigned`, `scheduled`, `completed`, `report_available`).
  - `paymentStatus`: optional (`pending`, `paid`, `failed`, `refunded`).
  - `sort`: optional allowlisted field (`id`, `createdAt`, `updatedAt`, `scheduledAt`, `status`, `paymentStatus`, prefix `-` for descending; defaults to `-createdAt`).
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Student physical tests fetched successfully.",
    "data": {
      "docs": [],
      "totalDocs": 0,
      "totalPages": 1,
      "page": 1,
      "limit": 10,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
  ```

---

## 3. Record Physical Test Payment (`FR-B3`)

### `POST /api/student-tests/:testId/payment`

- **Auth:** Active `super_admin`.
- **Request Body:**
  ```json
  {
    "amount": 100,
    "currency": "INR",
    "paymentMethod": "upi",
    "paymentStatus": "paid",
    "transactionReference": "UPI-20261111-998877",
    "notes": "Collected via QR code."
  }
  ```
- **Field Constraints:**
  - `amount`: required, strictly `100`.
  - `currency`: optional (defaults to `"INR"`); if provided must strictly equal `"INR"`.
  - `paymentMethod`: required, one of `cash`, `upi`, `card`, `bank_transfer`, `online`, `other`.
  - `paymentStatus`: required for new records, one of `pending`, `paid`, `failed` (`refunded` or unknown values rejected with `400`).
  - `transactionReference`: required non-empty string (max 150 chars).
- **Success Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Physical test payment recorded successfully.",
    "data": {
      "payment": {
        "id": 9,
        "studentTest": 5,
        "student": 12,
        "amount": 100,
        "currency": "INR",
        "paymentMethod": "upi",
        "paymentStatus": "paid",
        "transactionReference": "UPI-20261111-998877",
        "recordedBy": 1,
        "paidAt": "2026-11-11T15:55:00.000Z",
        "notes": "Collected via QR code.",
        "createdAt": "2026-11-11T15:55:00.000Z",
        "updatedAt": "2026-11-11T15:55:00.000Z"
      },
      "test": {
        "id": 5,
        "status": "paid",
        "paymentStatus": "paid"
      }
    }
  }
  ```
- **Error Responses:** `400 Bad Request` (invalid amount/currency/method/status), `401 Unauthorized`, `403 Forbidden`, `404 Not Found` (test not found), `409 Conflict` (test already paid — both sequential and concurrent races).

---

## 4. Assign or Reassign Tester (`FR-B4`)

### `PATCH /api/student-tests/:testId/assign-tester`

- **Auth:** Active `super_admin`.
- **Preconditions:** Physical test must already have `paymentStatus === 'paid'` and must NOT be `completed` or `report_available` (`409 Conflict` otherwise).
- **Request Body:**
  ```json
  {
    "testerUserId": 7,
    "scheduledAt": "2026-12-02T11:00:00+05:30",
    "notes": "Assigned math specialist for morning slot."
  }
  ```
- **Field Constraints:**
  - `testerUserId`: required positive integer referencing an **active** user with `role: 'teacher'` or `'super_admin'` (`404` if missing, `400` if blocked/suspended or ineligible role).
  - `scheduledAt`: optional ISO-8601 timestamp with offset (`Z` or `±HH:MM`).
  - `notes`: optional string (max 2000 chars).
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Tester assigned to physical test successfully.",
    "data": {
      "test": {
        "id": 5,
        "status": "scheduled",
        "assignedTester": 7,
        "assignedBy": 1,
        "assignedAt": "2026-11-11T15:56:00.000Z",
        "scheduledAt": "2026-12-02T05:30:00.000Z",
        "assignmentHistory": [
          {
            "tester": 7,
            "assignedBy": 1,
            "assignedAt": "2026-11-11T15:56:00.000Z",
            "scheduledAt": "2026-12-02T05:30:00.000Z",
            "notes": "Assigned math specialist for morning slot."
          }
        ]
      },
      "assignedTester": {
        "id": 7,
        "email": "tester-teacher@example.com",
        "role": "teacher",
        "status": "active"
      }
    }
  }
  ```

---

## 5. Get Physical Test Details

### `GET /api/student-tests/:testId`

- **Auth:** Active `super_admin` OR the **currently assigned active tester**.
- **Privacy:** The `payments` array is returned ONLY to active `super_admin` callers and omitted for assigned testers. Unassigned, previously reassigned-away, or suspended teachers receive `403 Forbidden`.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Physical test fetched successfully.",
    "data": {
      "test": {
        "id": 5,
        "student": 12,
        "status": "scheduled",
        "paymentStatus": "paid",
        "assignedTester": 7
      },
      "hasReport": false,
      "reportId": null,
      "payments": []
    }
  }
  ```

---

## 6. Submit Physical Test Report (`FR-B5`)

### `POST /api/student-tests/:testId/report`

- **Auth:** Active `super_admin` OR **currently assigned active tester** (`403 Forbidden` for unassigned, reassigned-away, or suspended testers).
- **Preconditions:** Assigned tester present (`409` if unassigned, `BR-07`), confirmed payment (`409`), and no existing report (`409`, `BR-08`).
- **Request Body:**
  ```json
  {
    "marksObtained": 84,
    "totalMarks": 100,
    "capability": "good",
    "subjectResults": [
      { "subject": "Mathematics", "marksObtained": 44, "totalMarks": 50 },
      { "subject": "Science", "marksObtained": 40, "totalMarks": 50 }
    ],
    "remarks": "Strong analytical foundation; minor calculation speed practice needed."
  }
  ```
- **Validation Rules:**
  - `totalMarks > 0` and `0 <= marksObtained <= totalMarks`.
  - `capability` in `["excellent", "good", "average", "needs_improvement", "weak"]`.
  - `subjectResults`: non-empty array; every item requires non-empty `subject` (max 100 chars), `totalMarks > 0`, and `0 <= marksObtained <= totalMarks`.
  - `remarks`: optional string (max 5000 chars).
- **Success Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Physical test report submitted successfully.",
    "data": {
      "report": {
        "id": 4,
        "studentTest": 5,
        "student": 12,
        "marksObtained": 84,
        "totalMarks": 100,
        "capability": "good",
        "subjectResults": [
          { "subject": "Mathematics", "marksObtained": 44, "totalMarks": 50 },
          { "subject": "Science", "marksObtained": 40, "totalMarks": 50 }
        ],
        "remarks": "Strong analytical foundation; minor calculation speed practice needed.",
        "submittedBy": 7,
        "submittedAt": "2026-11-11T15:57:00.000Z"
      },
      "test": {
        "id": 5,
        "status": "report_available",
        "completedAt": "2026-11-11T15:57:00.000Z"
      }
    }
  }
  ```

---

## 7. Get Physical Test Report (`FR-B6`)

### `GET /api/student-tests/:testId/report`

- **Auth:** Active `super_admin` OR **currently assigned active tester** (`403 Forbidden` for unassigned, reassigned-away, or suspended testers).
- **Success Response (`200 OK`):** Returns `{ report, test }`.
- **Error Responses:** `401`, `403`, `404` (missing test or no report submitted yet).

---

## 8. Record & List Report Sharing Actions (`FR-B6`)

### `POST /api/student-tests/:testId/report/share`

- **Auth:** Active `super_admin` only (`403` for teachers, including assigned testers).
- **Preconditions:** A physical test report must already exist for `testId` (`404` otherwise).
- **Request Body:**
  ```json
  {
    "channel": "whatsapp",
    "recipient": "+91 98765 44100",
    "status": "sent",
    "notes": "Sent PDF summary manually via counselor WhatsApp."
  }
  ```
- **Field Constraints:**
  - `channel`: required, `"whatsapp"` or `"phone_call"`.
  - `recipient`: required valid phone number (7–15 digits, optional `+`), stored normalized.
  - `status`: optional (defaults to `"recorded"`), allowed values: `"recorded"`, `"sent"`, `"completed"`, `"failed"`, `"no_answer"`. **Explicitly rejects `"delivered"` and `"read"` with `400 Bad Request`** because no external provider delivery callback is integrated.
  - `notes`: optional string (max 2000 chars).
- **Success Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Report sharing action logged locally; external delivery is not integrated or confirmed.",
    "data": {
      "id": 3,
      "studentTest": 5,
      "report": 4,
      "student": 12,
      "channel": "whatsapp",
      "recipient": "+919876544100",
      "status": "sent",
      "externalDeliveryConfirmed": false,
      "providerIntegrated": false,
      "notes": "Sent PDF summary manually via counselor WhatsApp.",
      "sharedBy": 1,
      "sharedAt": "2026-11-11T15:58:00.000Z"
    }
  }
  ```

### `GET /api/student-tests/:testId/report/share`

- **Auth:** Active `super_admin` only (`403` for teachers).
- **Query Parameters:** `page`, `limit`, `sort` (`id`, `sharedAt`, `createdAt`, defaults `-sharedAt`).
- **Success Response (`200 OK`):** Paginated `{ docs, totalDocs, totalPages, page, limit, hasNextPage, hasPrevPage }`.
