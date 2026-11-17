# Wellfind Academic — Backend REST API Development PRD

**Document ID:** WA-BE-PRD-001  
**Version:** 1.0  
**Status:** Approved scope for implementation planning  
**Product:** Wellfind Academic  
**Scope:** Backend REST APIs only  
**Existing backend documented:** Payload CMS 3.x + PostgreSQL  
**API style:** REST  
**Market context:** India; initial operational focus Bihar

---

## 1. Purpose

This PRD defines the backend capabilities required to complete the Wellfind Academic operational workflow using REST APIs.

The implementation must support:

1. Student enquiry capture and conversion.
2. Student capability assessment.
3. Optional physical student assessment for ₹100.
4. Tester assignment and test reporting.
5. Teacher application evaluation through written test and interview.
6. Approved teacher profile and user-account integration.
7. Student–teacher matching.
8. Final teacher allocation and teacher-side allocation retrieval.

This document is the source of truth for **what** must be built. The companion `BACKEND_EXECUTION_PLAYBOOK.md` defines **how** the coding agent must implement, test, audit, document and deliver it.

## 2. Scope boundaries

### In scope

- Backend collections/models and relationships.
- REST endpoints and request/response contracts.
- Server-side business logic and validation.
- Authentication and authorization.
- Database indexes and transactional integrity.
- API-level automated tests.
- Build, regression tests and API documentation.
- Phase-wise audit reports under the repository-root `Audit-docs/` folder.

### Explicitly out of scope

- CRM/admin dashboard UI.
- Teacher dashboard UI.
- Parent portal UI.
- Website/portfolio frontend changes.
- Mobile application or UI work.
- UI/browser testing.
- Online classes, attendance, scheduling, subscriptions, commissions or other features not specified here.
- AI-based matching.
- WhatsApp provider integration unless an existing provider is already configured and explicitly approved. This PRD requires recording sharing actions and truthful delivery status, not inventing a delivery integration.
- Payment gateway checkout/webhook integration until a provider is selected. This PRD requires recording and validating the ₹100 physical-test payment.

**No new product features may be added beyond this PRD.** Technical work strictly necessary for correctness, security, data integrity or testing is allowed and must be recorded in the relevant audit.

## 3. Existing backend — reuse first

The supplied API documentation describes these existing areas:

| Existing area | Existing documented routes/capability | Implementation direction |
|---|---|---|
| Authentication | `/api/auth/*` | Reuse existing JWT/authentication implementation |
| User management | `/api/users` and documented admin user routes | Reuse; first reconcile actual code and canonical roles/statuses |
| Student enquiries | `/api/student-enquiries` | Extend without breaking existing website form contract |
| Teacher enquiries | `/api/teacher-enquiries` | Extend without breaking existing application contract |
| Teacher private documents | `/api/teacher-documents/:filename` | Reuse existing private document access |

Do not recreate existing features. Before implementation, inspect the repository and compare the live code, collection schemas, migrations, tests and supplied API docs.

### Existing documentation discrepancies to resolve before dependent work

- `auth.md` and `users.md` describe different role/status models and admin user routes.
- Teacher enquiry documentation says application submission does not create a user account or assign the `teacher` role.
- Student and teacher enquiry documentation describes public create-only access and protected admin operations.
- Existing rate limiting is described as in-memory in some modules; assess whether this is acceptable for the current deployment, but do not introduce unrelated infrastructure work.

The agent must establish the actual source of truth from the current code and document any mismatch. Do not silently change existing roles or break existing clients.

## 4. End-to-end target workflow

### 4.1 Student flow

```text
Website form / Phone call / Email / Referral / Network
                         |
                         v
                 Student Enquiry
                         |
               Admin reviews enquiry
                         |
                         v
              Convert to Student Record
                         |
                         v
             Previous Performance Review
                         |
                         v
              Student Capability Assessment
                         |
             +-----------+-----------+
             |                       |
       Test not selected        Test selected
             |                       |
             |                ₹100 payment record
             |                       |
             |                Tester assignment
             |                       |
             |                Physical test
             |                       |
             |                Test report
             |                       |
             |                Report sharing record
             +-----------+-----------+
                         |
                         v
               Student matching criteria
                         |
                         v
                 Teacher matching
                         |
                         v
                 Admin allocation
                         |
                         v
              Teacher sees own allocation
                         |
                         v
                     Class starts
```

The physical test is optional. A student must be eligible for assessment, matching and allocation without selecting it.

### 4.2 Teacher flow

```text
Teacher portfolio/application form
               |
               v
       Teacher Enquiry Record
               |
               v
          Admin review
               |
               v
          Written test
               |
               v
           Interview
               |
               v
      Combined quality score
               |
               v
       Admin approves teacher
               |
               v
       Teacher profile created
               |
               v
       Teacher user linked/created
               |
               v
        Available teacher pool
               |
               v
         Student matching
               |
               v
         Teacher allocation
```

### 4.3 Matching and allocation

Matching returns eligible candidates. It must not automatically allocate a teacher. Final allocation remains an admin-controlled operation.

Matching criteria:
- Subject compatibility.
- Class-level compatibility.
- Locality.
- Availability.
- Teacher quality score.

Only approved, active and eligible teacher profiles may be returned.

## 5. Functional requirements and API contracts

All endpoint names below are proposed custom endpoints unless the existing Payload REST route already provides the required behavior. Inspect the code first. Reuse built-in Payload CRUD routes where suitable and do not create duplicate routes.

### Module A — Student enquiry and student records

#### FR-A1: Capture enquiry source

Extend student enquiry records with:

`enquirySource` allowed values:
- `website`
- `phone_call`
- `email`
- `referral`
- `network`
- `other`

Existing website form submission must remain backward compatible.

#### FR-A2: Admin manual enquiry creation

`POST /api/admin/student-enquiries`

Access: `super_admin`.

Accept the existing core student enquiry fields and `enquirySource`. Validate using the existing enquiry rules. Do not allow public callers to set internal fields such as status, assignment or admin-only notes.

Example:

```json
{
  "name": "Amit Kumar",
  "phoneNumber": "+919876543210",
  "studentClass": "Class 8",
  "subjects": ["Mathematics", "Science"],
  "preferredTiming": "Evening",
  "locality": "Patna",
  "budgetRange": "3000-5000",
  "additionalNotes": "Needs additional academic support.",
  "enquirySource": "phone_call"
}
```

#### FR-A3: Convert enquiry to student

`POST /api/student-enquiries/:id/convert`

Access: `super_admin`.

Requirements:
- Validate enquiry exists and is eligible for conversion.
- Create exactly one student record for the enquiry.
- Preserve enquiry reference.
- Set enquiry status to `converted`.
- Prevent duplicate conversion and concurrent duplicate creation.
- Return student record/reference.

#### FR-A4: Student CRUD

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/students` | Create student where operationally required |
| GET | `/api/students` | List students, paginated |
| GET | `/api/students/:id` | Get student |
| PATCH | `/api/students/:id` | Update student |

Student fields:
- Student name.
- Parent/guardian contact information.
- Class.
- Required subjects.
- Locality.
- Preferred timing.
- Budget.
- Learning requirements/notes.
- Original enquiry reference.
- Student status.

Avoid unnecessary duplication. Keep the enquiry as the original lead record and student as the operational record.

### Module B — Student capability assessment and optional physical test

#### FR-B1: Capability assessment

`POST /api/students/:studentId/assessments`

Access: `super_admin`.

Example:

```json
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

Allowed capability values:
- `excellent`
- `good`
- `average`
- `needs_improvement`
- `weak`

Requirements:
- Record previous performance.
- Record current capability.
- Record strengths and weaknesses.
- Link to student.
- Preserve assessment history.
- Support assessment without physical test.

#### FR-B2: Create optional physical test

`POST /api/students/:studentId/tests`

Access: authorized admin.

Example:

```json
{
  "testType": "physical_assessment",
  "parentSelected": true,
  "feeAmount": 100,
  "currency": "INR",
  "location": "Patna",
  "scheduledAt": "2026-11-20T10:00:00+05:30"
}
```

Requirements:
- Test is optional.
- Fixed test fee is ₹100.
- Store parent selection, location and scheduled time.
- If not selected, do not create a physical test.
- Do not block student matching when test is skipped.
- Validate that the requested fee is exactly ₹100.

#### FR-B3: Record test payment

`POST /api/student-tests/:testId/payment`

Access: authorized admin or trusted payment integration.

Example:

```json
{
  "amount": 100,
  "currency": "INR",
  "paymentMethod": "cash",
  "paymentStatus": "paid",
  "transactionReference": "TEST-PAY-001"
}
```

Requirements:
- Validate amount as ₹100.
- Record payment status, method and reference.
- Prevent duplicate successful payment records.
- Do not mark a test paid without a valid payment record.

Payment gateway checkout and webhook integration are not in scope until a provider is selected.

#### FR-B4: Assign tester

`PATCH /api/student-tests/:testId/assign-tester`

Access: `super_admin`.

Example:

```json
{
  "testerUserId": "USER_ID",
  "scheduledAt": "2026-11-20T10:00:00+05:30"
}
```

Requirements:
- Tester must be an existing eligible user.
- Record tester, assigning admin and assignment time.
- Prevent assignment to invalid/inactive users.
- Support authorized reassignment.
- Enforce tester-only access to assigned test operations.

#### FR-B5: Submit test report

`POST /api/student-tests/:testId/report`

Access: `super_admin` or the assigned tester, with server-side ownership/assignment validation.

Example:

```json
{
  "marksObtained": 65,
  "totalMarks": 100,
  "capability": "average",
  "subjectResults": [
    {
      "subject": "Mathematics",
      "marksObtained": 25,
      "totalMarks": 50
    },
    {
      "subject": "Science",
      "marksObtained": 40,
      "totalMarks": 50
    }
  ],
  "remarks": "Basic concepts need improvement."
}
```

Requirements:
- Store marks, total marks and subject-wise results.
- Store tester remarks and overall capability.
- Link report to test and student.
- Validate non-negative marks and obtained marks not exceeding total marks.
- Protect reports from public access.

#### FR-B6: Retrieve and record report sharing

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/student-tests/:testId/report` | Retrieve report |
| POST | `/api/student-tests/:testId/report/share` | Record communication/share action |

Example:

```json
{
  "channel": "whatsapp",
  "recipient": "+919876543210",
  "status": "sent"
}
```

Allowed channels:
- `whatsapp`
- `phone_call`

Requirements:
- Record channel, recipient, actor, timestamp and outcome.
- Do not expose report publicly.
- Do not claim actual WhatsApp delivery unless an integrated provider confirms it.
- A call record represents an admin communication record, not a telephony integration.

### Module C — Teacher evaluation

#### FR-C1: Written test and interview evaluation

`POST /api/teacher-enquiries/:id/evaluations`

Access: `super_admin`.

Example:

```json
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

Requirements:
- Written test and interview results are independently stored.
- Both are required for a completed evaluation.
- Record evaluator and timestamps.
- Validate marks and totals.
- Preserve evaluation history.

#### FR-C2: Calculate teacher quality score

Default weights:
- Written test: 50%.
- Interview: 50%.

Formula:

```text
Written Percentage = (Written Marks / Written Total) × 100
Interview Percentage = (Interview Marks / Interview Total) × 100

Quality Score =
(Written Percentage × 0.50) +
(Interview Percentage × 0.50)
```

Example: 75/100 written and 80/100 interview gives 77.5/100.

Requirements:
- Weights must be centrally configurable.
- Store component marks and calculated score.
- Score must not automatically approve/reject a teacher.
- Recalculate consistently if an authorized evaluation update is allowed.

#### FR-C3: Evaluation retrieval and update

| Method | Endpoint |
|---|---|
| GET | `/api/teacher-enquiries/:id/evaluations` |
| GET | `/api/teacher-enquiries/:id/evaluations/:evaluationId` |
| PATCH | `/api/teacher-enquiries/:id/evaluations/:evaluationId` |

Only authorized admins may access these records.

### Module D — Teacher approval, profile and account integration

#### FR-D1: Approve teacher and create profile

`POST /api/teacher-enquiries/:id/approve`

Access: `super_admin`.

Requirements:
- Application exists and is eligible.
- Evaluation is complete.
- Required teacher information exists.
- Create one teacher profile linked to the application.
- Prevent duplicate approval/profile creation.
- Record approving admin and timestamp.

Teacher profile fields:
- Full name.
- Mobile number.
- Email.
- Highest qualification.
- Teaching experience.
- Primary subject.
- Class level.
- Teaching locality.
- Preferred availability.
- Evaluation score.
- Teacher status.
- Original application reference.

#### FR-D2: Link/create teacher user account

Use the existing User Management implementation; do not create a second account system.

Requirements:
- Assign the existing `teacher` role server-side.
- Never trust a role supplied by the client.
- Prevent duplicate accounts.
- Link profile to user.
- Use existing password policy and account activation/reset mechanism.
- Do not store plaintext passwords.
- Handle existing matching accounts safely.

#### FR-D3: Teacher profile endpoints

| Method | Endpoint |
|---|---|
| GET | `/api/teachers` |
| GET | `/api/teachers/:id` |
| PATCH | `/api/teachers/:id` |
| PATCH | `/api/teachers/:id/availability` |
| PATCH | `/api/teachers/:id/status` |

The teacher profile is the operational matching record; the original application remains the application record.

### Module E — Student–teacher matching

#### FR-E1: Retrieve matching teachers

`GET /api/students/:studentId/matches`

Access: `super_admin`.

Matching criteria:
1. Subject compatibility.
2. Class-level compatibility.
3. Locality.
4. Availability.
5. Teacher quality score.

Requirements:
- Only approved, active and eligible teachers.
- Return candidate teachers and relevant match information.
- Do not automatically allocate.
- Do not guarantee a match if no eligible teacher exists.
- Physical test is not mandatory.
- Matching must use persisted student and teacher records.

Example response:

```json
{
  "studentId": "STUDENT_ID",
  "matches": [
    {
      "teacherId": "TEACHER_ID",
      "name": "Ravi Kumar",
      "primarySubject": "Mathematics",
      "classLevel": "Class 8",
      "locality": "Patna",
      "qualityScore": 77.5,
      "availability": "Weekday evenings",
      "matchStatus": "eligible"
    }
  ]
}
```

#### FR-E2: Save matching decision

`POST /api/students/:studentId/matches`

Access: `super_admin`.

Store:
- Student reference.
- Candidate teacher reference.
- Criteria/snapshot used.
- Match status.
- Admin notes.
- Created timestamp.

### Module F — Teacher allocation

#### FR-F1: Create final allocation

`POST /api/teacher-allocations`

Access: `super_admin`.

Example:

```json
{
  "studentId": "STUDENT_ID",
  "teacherId": "TEACHER_ID",
  "subject": "Mathematics",
  "allocationNotes": "Teacher selected based on student requirements."
}
```

Requirements:
- Student exists and is active.
- Teacher exists, approved and active.
- Teacher is compatible with subject and class.
- Record admin, timestamp and status.
- Prevent duplicate active allocation for same student, teacher and subject.
- Use a transaction or equivalent atomic operation.

#### FR-F2: Allocation management and teacher retrieval

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/teacher-allocations` | List allocations |
| GET | `/api/teacher-allocations/:id` | Get allocation |
| PATCH | `/api/teacher-allocations/:id` | Update permitted allocation fields |
| PATCH | `/api/teacher-allocations/:id/status` | Update status |
| GET | `/api/teacher-allocations/my` | Get logged-in teacher's allocations |

Suggested statuses:
- `assigned`
- `accepted`
- `rejected`
- `active`
- `completed`
- `cancelled`

The `/my` endpoint must derive the teacher identity from the authenticated user. Never trust a teacher ID from the request.

## 6. Proposed data models

Reuse existing collections where applicable. Create only the missing models.

| Collection/model | Purpose |
|---|---|
| `student-enquiries` | Existing enquiry records |
| `students` | Operational student records |
| `student-assessments` | Previous performance and capability |
| `student-tests` | Optional physical test and assignment |
| `student-test-payments` | ₹100 test payment records |
| `student-test-reports` | Physical test results |
| `teacher-enquiries` | Existing teacher applications |
| `teacher-evaluations` | Written test and interview results |
| `teachers` | Approved teacher profiles |
| `teacher-matches` | Matching decisions |
| `teacher-allocations` | Final assignments |

Required relationships:
- Student references original enquiry.
- Assessment references student.
- Test references student.
- Payment references test.
- Test report references test and student.
- Evaluation references teacher enquiry.
- Teacher profile references original application and user.
- Match references student and candidate teacher.
- Allocation references student and teacher.

Use appropriate indexes on foreign keys and frequently filtered fields. Use database transactions for multi-record operations.

## 7. Business rules

| ID | Rule |
|---|---|
| BR-01 | Enquiries can originate from website, phone, email, referral, network or other. |
| BR-02 | Admin can manually create offline enquiries. |
| BR-03 | Conversion creates one operational student record per enquiry. |
| BR-04 | Previous performance can be recorded without a physical test. |
| BR-05 | Physical student test is optional. |
| BR-06 | Physical test fee is exactly ₹100. |
| BR-07 | Physical test must have an assigned tester before execution. |
| BR-08 | Test report links to the relevant test and student. |
| BR-09 | Report sharing actions can be recorded for WhatsApp and phone calls. |
| BR-10 | Teacher evaluation contains written test and interview. |
| BR-11 | Both scores contribute to quality score. |
| BR-12 | Teacher approval is required before operational profile creation. |
| BR-13 | Approved teacher profile links to a teacher user account. |
| BR-14 | Only approved active teachers are eligible for matching. |
| BR-15 | Matching does not automatically allocate. |
| BR-16 | Final allocation is admin-controlled. |
| BR-17 | Teachers can retrieve only their own allocations. |
| BR-18 | Skipping physical test never blocks matching or allocation. |

## 8. Access control

| Actor | Allowed operations |
|---|---|
| Public | Submit student enquiry and teacher application only |
| `super_admin` | Administer enquiries, students, assessments, tests, evaluations, teacher profiles, matching and allocations |
| `teacher` | Retrieve own allocations only |
| Assigned tester | Work only on test records assigned to them, with server-side assignment checks |

Reuse existing JWT authentication and Payload access control. Establish the actual canonical roles from the repository before coding because supplied auth/user docs differ.

Security requirements:
- Server-side authorization on every protected route.
- Never trust client-supplied role, evaluator, tester or teacher identity.
- Protect student/parent personal data.
- Keep KYC and reports private.
- Validate and sanitize all input.
- Avoid sensitive data in logs.
- Apply rate limits to public endpoints.
- Enforce teacher ownership on `/api/teacher-allocations/my`.

## 9. State transitions

### Student enquiry

```text
new -> contacted -> in_progress -> converted
                            \-----> closed
```

### Physical test

```text
requested -> payment_pending -> paid -> tester_assigned
                                      -> scheduled
                                      -> completed
                                      -> report_available
```

A skipped optional test does not block the student workflow.

### Teacher application

```text
new -> under_review -> shortlisted -> evaluation_completed
                                      |               |
                                      v               v
                                   approved        rejected
```

Extend existing statuses carefully and preserve compatibility with existing records.

### Allocation

```text
assigned -> accepted -> active -> completed
    |          |
    v          v
 rejected   cancelled
```

Validate allowed transitions server-side.

## 10. API standards

Use a consistent custom API response shape where appropriate:

Success:

```json
{
  "success": true,
  "message": "Record created successfully.",
  "data": {
    "id": "RECORD_ID"
  }
}
```

Error:

```json
{
  "success": false,
  "message": "Validation failed.",
  "errors": [
    {
      "field": "studentId",
      "message": "Student does not exist."
    }
  ]
}
```

HTTP status conventions:
- `200` successful retrieval/update.
- `201` successful creation.
- `400` invalid request/business rule.
- `401` unauthenticated.
- `403` unauthorized.
- `404` not found.
- `409` duplicate/conflict.
- `422` semantically invalid data, where applicable.
- `429` rate limit.
- `500` internal error.

Use pagination for list endpoints. Store timestamps in UTC and return ISO 8601. Preserve explicit timezone offsets when parsing input; do not manually apply a fixed timezone correction.

## 11. Non-functional requirements

- Follow existing repository architecture and conventions.
- Reuse existing Payload collections, access functions and utilities.
- Keep route handlers thin; put business logic in service/domain layers consistent with the codebase.
- Use transactions for multi-record operations.
- Add indexes for references and common filters.
- Prevent duplicate conversions, profiles, successful payments and active allocations.
- Update Payload-generated TypeScript types after schema changes.
- Add API-level unit/integration tests.
- Maintain backward compatibility for existing APIs.
- Document every endpoint, access rule, request, response and error.

## 12. Testing and acceptance criteria

All phases require API-level tests. No UI/browser tests are required.

Student:
- Website enquiry remains compatible.
- Admin can create offline enquiry.
- Conversion creates exactly one student.
- Assessment works without physical test.
- Test can be selected or skipped.
- ₹100 fee validation works.
- Tester assignment is protected.
- Report validation and retrieval work.
- Sharing action is recorded truthfully.

Teacher:
- Existing application submission remains compatible.
- Written and interview marks are stored.
- Quality score is calculated correctly.
- Incomplete evaluation cannot be approved.
- Approval creates one profile and links/creates one teacher account.
- Duplicate profile/account creation is prevented.

Matching/allocation:
- Only eligible teachers are returned.
- Subject/class/location/availability are considered.
- Matching does not auto-allocate.
- Invalid allocation is rejected.
- Duplicate active allocation is prevented.
- Teacher sees only own allocations.

Regression:
- Existing auth, user, student enquiry and teacher enquiry APIs continue to work.
- Build succeeds.
- All relevant automated tests pass.

## 13. Phase plan

| Phase | Module | Deliverable |
|---|---|---|
| 0 | Repository reconnaissance and contract baseline | Verified current implementation and role/schema decisions |
| 1 | Student enquiry extension and conversion | Enquiry source, admin creation, student record |
| 2 | Student capability assessment | Assessment APIs |
| 3 | Optional physical test | Test, payment record, tester assignment, report and sharing record |
| 4 | Teacher evaluation | Written/interview evaluation and quality score |
| 5 | Teacher approval/profile/account integration | Approved operational teacher |
| 6 | Matching | Candidate matching API and saved decision |
| 7 | Allocation | Admin allocation and teacher's own allocation API |
| 8 | Final regression and documentation audit | Verified backend release |

## 14. Final endpoint inventory

Proposed custom endpoints (reuse built-in Payload routes where they already meet the requirement):

| Method | Endpoint |
|---|---|
| POST | `/api/admin/student-enquiries` |
| POST | `/api/student-enquiries/:id/convert` |
| POST | `/api/students` |
| GET | `/api/students` |
| GET | `/api/students/:id` |
| PATCH | `/api/students/:id` |
| POST | `/api/students/:studentId/assessments` |
| POST | `/api/students/:studentId/tests` |
| POST | `/api/student-tests/:testId/payment` |
| PATCH | `/api/student-tests/:testId/assign-tester` |
| POST | `/api/student-tests/:testId/report` |
| GET | `/api/student-tests/:testId/report` |
| POST | `/api/student-tests/:testId/report/share` |
| POST | `/api/teacher-enquiries/:id/evaluations` |
| GET | `/api/teacher-enquiries/:id/evaluations` |
| GET | `/api/teacher-enquiries/:id/evaluations/:evaluationId` |
| PATCH | `/api/teacher-enquiries/:id/evaluations/:evaluationId` |
| POST | `/api/teacher-enquiries/:id/approve` |
| GET | `/api/teachers` |
| GET | `/api/teachers/:id` |
| PATCH | `/api/teachers/:id` |
| PATCH | `/api/teachers/:id/availability` |
| PATCH | `/api/teachers/:id/status` |
| GET | `/api/students/:studentId/matches` |
| POST | `/api/students/:studentId/matches` |
| POST | `/api/teacher-allocations` |
| GET | `/api/teacher-allocations` |
| GET | `/api/teacher-allocations/:id` |
| PATCH | `/api/teacher-allocations/:id` |
| PATCH | `/api/teacher-allocations/:id/status` |
| GET | `/api/teacher-allocations/my` |

## 15. Definition of done

The backend scope is complete only when all phases pass their acceptance criteria, all required API tests pass, build and regression checks pass, endpoint documentation is updated, and the phase/final audit reports are present under the repository-root `Audit-docs/` directory.

A documented endpoint is not proof of implementation. A passing build alone is not proof of correct API behavior. Both API tests and code review/audit are required.
