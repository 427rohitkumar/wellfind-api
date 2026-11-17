

# Wellfind Academic

# Backend REST API Development — Product Requirements Document (PRD)

**Document Version:** 1.0  
**Status:** Proposed — Ready for Technical Planning  
**Product:** Wellfind Academic  
**Backend Scope:** REST API Development Only  
**Existing Backend:** Payload CMS 3.x + PostgreSQL  
**API Style:** REST / JSON  
**Primary Market:** Bihar, India

---

## 1. Product Overview

Wellfind Academic is an education service platform that connects students and parents with suitable teachers based on academic requirements, student capability, teacher qualifications, teaching experience, subject expertise, location and availability.

The current backend already provides the foundation for:

- Authentication and authorization.
    
- User management.
    
- Student enquiry collection and management.
    
- Teacher application collection and management.
    
- Private teacher document storage.
    

However, the complete business workflow is not yet supported by the existing documented APIs.

This development phase will introduce the missing backend APIs and business logic required to complete the student assessment, teacher evaluation, matching and allocation workflows.

## 2. Project Objective

Develop the missing REST APIs to support the complete business process:

**Student Enquiry → Student Assessment → Optional Physical Test → Teacher Matching → Teacher Allocation → Class Start**

And:

**Teacher Application → Written Test → Interview → Evaluation → Teacher Profile → Teacher Matching**

The backend must allow authorized administrators to manage these operations through APIs. Frontend and dashboard development will be handled separately.

## 3. Scope

### 3.1 In Scope

1. Student enquiry source management.
    
2. Admin-created student enquiries.
    
3. Student record creation and management.
    
4. Student capability assessment.
    
5. Optional physical student test.
    
6. ₹100 physical test fee record.
    
7. Tester assignment.
    
8. Student test result and report management.
    
9. Teacher written test evaluation.
    
10. Teacher interview evaluation.
    
11. Teacher quality score calculation.
    
12. Approved teacher profile creation.
    
13. Teacher user account integration.
    
14. Student-teacher matching.
    
15. Final teacher allocation.
    
16. Teacher allocation retrieval API.
    
17. Required validations, authorization, database models and REST API documentation.
    

### 3.2 Out of Scope

The following are explicitly excluded:

- Admin dashboard or CRM UI.
    
- Teacher dashboard UI.
    
- Parent portal UI.
    
- Website or portfolio redesign.
    
- Frontend form development.
    
- Mobile application development.
    
- Automated AI-based teacher matching.
    
- Online examination platform.
    
- Class scheduling and attendance management.
    
- Online class/video calling functionality.
    
- Subscription or commission management.
    
- Additional business modules not mentioned in this PRD.
    

**Important:** WhatsApp report sharing and call communication are part of the operational requirement. This PRD includes APIs to prepare and record report-sharing actions, but does not include building a WhatsApp application, communication dashboard or frontend.

---

# 4. Existing Backend — Reuse Strategy

Existing documented APIs must be reused wherever possible. Do not create duplicate functionality.

|Existing Module|Existing API / Collection|Required Action|
|---|---|---|
|Authentication|`/api/auth/*`|Reuse|
|User Management|`/api/users` and documented admin user routes|Reuse and align|
|Student Enquiry|`/api/student-enquiries`|Extend where required|
|Teacher Enquiry|`/api/teacher-enquiries`|Extend where required|
|Teacher Documents|`/api/teacher-documents/:filename`|Reuse|

### Existing API functionality

**Student Enquiry**

- Public enquiry submission.
    
- Admin enquiry listing.
    
- Individual enquiry retrieval.
    
- Enquiry update and status management.
    
- Internal admin notes and assignment fields.
    

**Teacher Enquiry**

- Public teacher application submission.
    
- Qualification and KYC document upload.
    
- Admin application listing and review.
    
- Application status management.
    
- Private document retrieval.
    

**Authentication and User Management**

- Login and logout.
    
- JWT authentication.
    
- Password reset through OTP.
    
- Admin user creation and management.
    
- Role and account status management.
    

### Important existing-system issue

The supplied `auth.md` and `users.md` documents describe different role and status definitions.

Before implementing the new modules, establish one canonical role/status definition based on the actual current `users` collection and access-control implementation.

The teacher application must not automatically create a teacher account until the application has been approved.

---

# 5. Functional Requirements

## Module 1 — Student Enquiry Management

### Objective

Support student requirements received through different channels:

- Website / Portfolio Form.
    
- Direct Phone Call.
    
- Email.
    
- Sharing / Referral / Network.
    

All enquiries must be stored in the existing Student Enquiry system.

### FR-01: Enquiry Source Management

Add a source field to identify where the enquiry originated.

**Proposed field:**

`enquirySource`

Allowed values:

- `website`
    
- `phone_call`
    
- `email`
    
- `referral`
    
- `network`
    
- `other`
    

The source must be stored with every enquiry.

### FR-02: Admin Manual Enquiry Creation

Existing public enquiry submission is designed around the website form contract. Add an authenticated admin endpoint for enquiries received through calls, emails or other offline channels.

**Endpoint**

`POST /api/admin/student-enquiries`

Access: `super_admin`

Example request:

```
{
  "name": "Amit Kumar",
  "phoneNumber": "+919876543210",
  "studentClass": "Class 8",
  "subjects": ["Mathematics", "Science"],
  "preferredTiming": "Evening",
  "locality": "Patna",
  "budgetRange": "3000-5000",
  "additionalNotes": "Student needs additional academic support.",
  "enquirySource": "phone_call"
}
```

The endpoint must validate the same core student enquiry fields as the existing student enquiry API.

The existing website form endpoint must continue working.

### FR-03: Enquiry-to-Student Conversion

When an enquiry is accepted and converted, create a structured student record linked to the original enquiry.

**Endpoint**

`POST /api/student-enquiries/:id/convert`

Access: `super_admin`

Requirements:

- Verify that the enquiry exists.
    
- Prevent duplicate conversion.
    
- Create the student record.
    
- Preserve the original enquiry reference.
    
- Return the created student ID and record.
    
- Update the enquiry status to `converted`.
    

### FR-04: Student Record Management

Required endpoints:

|Method|Endpoint|Purpose|
|---|---|---|
|POST|`/api/students`|Create student record where needed|
|GET|`/api/students`|List students|
|GET|`/api/students/:id`|Retrieve student details|
|PATCH|`/api/students/:id`|Update student details|

Student record must support:

- Student name.
    
- Parent/guardian contact information.
    
- Class.
    
- Required subjects.
    
- Locality.
    
- Preferred timing.
    
- Budget.
    
- Learning requirements.
    
- Original enquiry reference.
    
- Student status.
    

Avoid duplicating enquiry information unnecessarily. Maintain a clear relationship between enquiry and student.

---

## Module 2 — Student Capability Assessment

### Objective

Before assigning a teacher, maintain a record of the student's current academic capability.

Assessment must support two sources:

1. Previous academic performance.
    
2. Optional physical assessment conducted by an assigned tester.
    

### FR-05: Student Assessment Record

**Endpoint**

`POST /api/students/:studentId/assessments`

Access: `super_admin`

Example request:

```
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

- Store previous academic performance.
    
- Store current capability.
    
- Record strengths and weaknesses.
    
- Maintain assessment history.
    
- Link assessment to the student.
    

### FR-06: Optional Physical Test Selection

The physical test is optional and must not be mandatory for teacher allocation.

**Test fee:** ₹100 per physical assessment.

**Endpoint**

`POST /api/students/:studentId/tests`

Access: Authorized admin.

Example request:

```
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

- Store whether the parent selected the test.
    
- Store the fixed fee of ₹100.
    
- Store test location and scheduled time.
    
- Generate a test record.
    
- If the parent does not select the test, no physical test should be created.
    
- Student assessment and matching must remain possible without this test.
    

The ₹100 fee is specifically for the physical test arrangement described in the business requirement.

### FR-07: Test Payment Record

**Endpoint**

`POST /api/student-tests/:testId/payment`

Access: Authorized admin or trusted payment integration.

Example request:

```
{
  "amount": 100,
  "currency": "INR",
  "paymentMethod": "cash",
  "paymentStatus": "paid",
  "transactionReference": "TEST-PAY-001"
}
```

Requirements:

- The payable amount must be ₹100.
    
- Store payment status.
    
- Store payment method and transaction reference where available.
    
- Prevent duplicate successful payment records.
    
- Do not allow a test to be marked paid without a valid payment record.
    

**Payment integration clarification:** No payment gateway has been specified. This requirement covers payment recording and validation. Gateway checkout and gateway webhook integration are not included until a provider is selected.

### FR-08: Tester Assignment

**Endpoint**

`PATCH /api/student-tests/:testId/assign-tester`

Access: `super_admin`

Example request:

```
{
  "testerUserId": "USER_ID",
  "scheduledAt": "2026-11-20T10:00:00+05:30"
}
```

Requirements:

- Assign an existing authorized user as tester.
    
- Store the tester reference.
    
- Store assignment timestamp.
    
- Allow authorized admin reassignment.
    
- Prevent assignment to invalid or inactive users.
    
- Track test assignment status.
    

The assigned tester must be identifiable in the test record.

### FR-09: Physical Test Result

**Endpoint**

`POST /api/student-tests/:testId/report`

Access: `super_admin` or assigned tester, subject to authorization.

Example request:

```
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

- Store test marks and total marks.
    
- Store subject-wise performance where applicable.
    
- Store tester remarks.
    
- Store overall capability.
    
- Link the report to the student and test.
    
- Maintain report creation and update timestamps.
    
- Prevent invalid marks, such as obtained marks exceeding total marks.
    

### FR-10: Test Report Retrieval and Sharing Record

**Endpoints**

|Method|Endpoint|Purpose|
|---|---|---|
|GET|`/api/student-tests/:testId/report`|Retrieve test report|
|POST|`/api/student-tests/:testId/report/share`|Record report-sharing action|

The report-sharing endpoint must support:

- WhatsApp sharing record.
    
- Phone-call communication record.
    
- Recipient reference.
    
- Sharing status.
    
- Timestamp.
    
- Admin reference.
    

Example request:

```
{
  "channel": "whatsapp",
  "recipient": "+919876543210",
  "status": "sent"
}
```

Allowed channels:

- `whatsapp`
    
- `phone_call`
    

The API must not expose private student reports publicly.

Actual WhatsApp delivery requires a configured provider or authorized external integration. The API must not claim successful delivery merely because a share request was created.

---

## Module 3 — Teacher Evaluation

### Objective

Evaluate teacher applicants through two assessment methods:

1. Written Test.
    
2. Personal Interview.
    

Both results must contribute to the teacher's quality evaluation.

### FR-11: Teacher Evaluation Record

**Endpoint**

`POST /api/teacher-enquiries/:id/evaluations`

Access: `super_admin`

Example request:

```
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

- Written test marks are required.
    
- Interview marks are required.
    
- Both results must be stored independently.
    
- Store evaluation date and evaluator.
    
- Maintain evaluation history.
    
- Validate marks and total marks.
    

### FR-12: Teacher Quality Score

Calculate the overall teacher quality score from written test and interview results.

**Proposed default formula:**

Written Test Weight: 50%

Interview Weight: 50%

```
Written Percentage = (Written Marks / Written Total) × 100

Interview Percentage = (Interview Marks / Interview Total) × 100

Teacher Quality Score =
(Written Percentage × 0.50)
+
(Interview Percentage × 0.50)
```

Example:

- Written Test: 75/100.
    
- Interview: 80/100.
    
- Overall Quality Score: 77.5/100.
    

The weights must be configurable at backend configuration level, not hardcoded across the application.

The score is an evaluation indicator. It must not automatically approve or reject a teacher.

### FR-13: Teacher Evaluation Retrieval

|Method|Endpoint|Purpose|
|---|---|---|
|GET|`/api/teacher-enquiries/:id/evaluations`|Retrieve evaluation history|
|GET|`/api/teacher-enquiries/:id/evaluations/:evaluationId`|Retrieve a specific evaluation|
|PATCH|`/api/teacher-enquiries/:id/evaluations/:evaluationId`|Update evaluation|

Requirements:

- Only authorized administrators can manage evaluations.
    
- Preserve evaluator identity.
    
- Maintain evaluation timestamps.
    
- Do not expose internal evaluation records publicly.
    

---

## Module 4 — Approved Teacher Profile & Account Integration

### Objective

After teacher application review and evaluation, an approved teacher must become part of the available teacher pool.

### FR-14: Teacher Approval and Profile Creation

**Endpoint**

`POST /api/teacher-enquiries/:id/approve`

Access: `super_admin`

Requirements:

- Verify teacher application exists.
    
- Verify application is eligible for approval.
    
- Verify required teacher information is available.
    
- Verify evaluation exists and is complete.
    
- Create a structured teacher profile.
    
- Link the profile to the original teacher enquiry.
    
- Prevent duplicate teacher profile creation.
    

Teacher profile must contain:

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
    

### FR-15: Teacher User Account Integration

On approval, create or link the teacher's account using the existing User Management functionality.

Requirements:

- Assign the existing `teacher` role.
    
- Never accept the role from an untrusted client request.
    
- Do not store plaintext passwords.
    
- Prevent duplicate user accounts.
    
- Handle duplicate email or mobile information safely.
    
- Link the teacher profile with the corresponding user record.
    

Account creation must follow the existing authentication and password-management policy.

### FR-16: Teacher Profile APIs

|Method|Endpoint|Purpose|
|---|---|---|
|GET|`/api/teachers`|List approved teachers|
|GET|`/api/teachers/:id`|Retrieve teacher profile|
|PATCH|`/api/teachers/:id`|Update teacher information|
|PATCH|`/api/teachers/:id/availability`|Update availability|
|PATCH|`/api/teachers/:id/status`|Update teacher availability/status|

Teacher profile and teacher application must remain separate records.

The teacher profile is the operational record used for matching and allocation. The original application remains available for reference.

---

## Module 5 — Student–Teacher Matching

### Objective

Find suitable teachers based on student requirements and teacher records.

Matching must use the available records maintained in the backend.

### FR-17: Teacher Matching API

**Endpoint**

`GET /api/students/:studentId/matches`

Access: `super_admin`

Matching must consider:

1. Subject compatibility.
    
2. Class-level compatibility.
    
3. Teaching locality.
    
4. Teacher availability.
    
5. Teacher quality score.
    

The endpoint must return suitable teacher records and their matching information.

Example response:

```
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

Requirements:

- Only approved and active teachers can be considered.
    
- Teachers must match the student's required subject.
    
- Teachers must support the required class level.
    
- Location and availability must be considered.
    
- Return only eligible teachers.
    
- Do not guarantee a match when no suitable teacher is available.
    
- Optional student physical test results may be used as additional student capability information, but must not be mandatory.
    

Matching should return candidate teachers. It must not automatically allocate a teacher.

### FR-18: Matching Record

**Endpoint**

`POST /api/students/:studentId/matches`

Access: `super_admin`

Purpose:

Save a matching decision for later review and allocation.

The record must preserve:

- Student reference.
    
- Candidate teacher reference.
    
- Matching criteria.
    
- Match status.
    
- Admin notes.
    
- Creation timestamp.
    

---

## Module 6 — Teacher Allocation

### Objective

Allow an authorized administrator to assign a suitable teacher to a student.

### FR-19: Final Teacher Allocation

**Endpoint**

`POST /api/teacher-allocations`

Access: `super_admin`

Example request:

```
{
  "studentId": "STUDENT_ID",
  "teacherId": "TEACHER_ID",
  "subject": "Mathematics",
  "allocationNotes": "Teacher selected based on student requirements."
}
```

Requirements:

- Student must exist and be active.
    
- Teacher must exist and be approved.
    
- Teacher must be active and eligible.
    
- Teacher must support the required subject and class level.
    
- Allocation must be linked to both student and teacher.
    
- Duplicate active allocations for the same student, teacher and subject must be prevented.
    
- Record the administrator who created the allocation.
    
- Record allocation date and status.
    

### FR-20: Allocation Management

|Method|Endpoint|Purpose|
|---|---|---|
|GET|`/api/teacher-allocations`|List allocations|
|GET|`/api/teacher-allocations/:id`|Retrieve allocation|
|PATCH|`/api/teacher-allocations/:id`|Update allocation|
|PATCH|`/api/teacher-allocations/:id/status`|Update allocation status|
|GET|`/api/teacher-allocations/my`|Retrieve allocations for logged-in teacher|

Suggested allocation statuses:

- `assigned`
    
- `accepted`
    
- `rejected`
    
- `active`
    
- `completed`
    
- `cancelled`
    

The teacher retrieval endpoint must identify the teacher through the authenticated user account. It must never trust a client-provided teacher ID.

The API must expose only allocations belonging to the authenticated teacher.

---

# 6. Proposed Data Models

The implementation must use normalized relationships and avoid unnecessary duplication.

|Collection / Model|Purpose|
|---|---|
|`student-enquiries`|Existing student enquiry records|
|`students`|Structured student records|
|`student-assessments`|Previous performance and capability records|
|`student-tests`|Optional physical test requests and assignments|
|`student-test-payments`|₹100 test payment records|
|`student-test-reports`|Physical test results|
|`teacher-enquiries`|Existing teacher applications|
|`teacher-evaluations`|Written test and interview evaluation|
|`teachers`|Approved teacher profiles|
|`teacher-matches`|Student-teacher matching records|
|`teacher-allocations`|Final teacher assignments|

### Important Relationships

```
student-enquiries
       |
       | converted from
       v
    students
       |
       +------ student-assessments
       |
       +------ student-tests
       |             |
       |             +---- student-test-payments
       |             |
       |             +---- student-test-reports
       |
       +------ teacher-matches
                       |
                       v
                teacher-allocations
                       |
                       v
                    teachers
                       ^
                       |
              teacher-enquiries
                       |
                       +---- teacher-evaluations
```

### Data Integrity Requirements

- Every student must have a valid source enquiry reference when created through conversion.
    
- Every physical test must reference an existing student.
    
- Every test payment must reference an existing test.
    
- Every test report must reference its corresponding test.
    
- Every evaluation must reference an existing teacher enquiry.
    
- Every approved teacher profile must reference its original application.
    
- Every teacher profile must be linked to a valid teacher user account.
    
- Every allocation must reference an existing student and teacher.
    

Use database relationships and indexes for frequently queried references.

---

# 7. API Access Control

All new endpoints must follow server-side authentication and authorization.

|User Type|Permissions|
|---|---|
|Public Visitor|Submit student enquiry and teacher application|
|`super_admin`|Full administrative management of enquiries, assessments, tests, evaluations, matching and allocations|
|`teacher`|View only their own allocations|
|Assigned Tester|Submit/update only the test records assigned to them, subject to configured permissions|

### Security Requirements

1. Use the existing JWT authentication.
    
2. Verify permissions on the server.
    
3. Never trust user role, teacher ID or tester ID supplied by clients.
    
4. Protect student and parent contact information.
    
5. Keep teacher KYC and qualification documents private.
    
6. Prevent public access to assessment reports.
    
7. Validate all request bodies.
    
8. Sanitize user input.
    
9. Apply rate limits to public endpoints.
    
10. Avoid logging sensitive student, parent or teacher information.
    
11. Use HTTPS in production.
    
12. Ensure teacher users cannot access another teacher's allocation.
    

Because student information may relate to minors, only collect the information necessary for the stated workflow and enforce appropriate access controls.

---

# 8. Business Rules

|ID|Business Rule|
|---|---|
|BR-01|Student enquiry can originate from website, phone, email, referral or network.|
|BR-02|Admin can manually create enquiries received outside the website.|
|BR-03|Student enquiry must be converted into a structured student record before operational assessment and allocation.|
|BR-04|Previous academic performance must be recordable without a physical test.|
|BR-05|Physical student assessment is optional.|
|BR-06|Physical test fee is ₹100.|
|BR-07|Physical test requires an assigned tester.|
|BR-08|Physical test report must be linked to the student and test.|
|BR-09|Parent report sharing must be recordable through WhatsApp or phone call.|
|BR-10|Teacher evaluation consists of written test and interview.|
|BR-11|Both evaluation results contribute to teacher quality score.|
|BR-12|Teacher application approval is required before creating an approved teacher profile.|
|BR-13|Approved teacher must have a linked teacher account.|
|BR-14|Only eligible teachers can appear in matching results.|
|BR-15|Matching does not automatically allocate a teacher.|
|BR-16|Final teacher allocation is an admin-controlled operation.|
|BR-17|Teacher can retrieve only their own allocations.|
|BR-18|A student can proceed through matching even if the optional physical test was not selected.|

---

# 9. API Response Standards

All new custom endpoints should use a consistent response format.

### Success Response

```
{
  "success": true,
  "message": "Record created successfully.",
  "data": {
    "id": "RECORD_ID"
  }
}
```

### Error Response

```
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

### HTTP Status Codes

|Status|Usage|
|---|---|
|200|Successful retrieval or update|
|201|Successful record creation|
|400|Invalid request or business-rule violation|
|401|Authentication required|
|403|Insufficient permissions|
|404|Record not found|
|409|Duplicate record or conflicting state|
|422|Valid request structure but invalid business data, where applicable|
|429|Rate limit exceeded|
|500|Internal server error|

Use pagination for list endpoints and consistent filtering/sorting conventions.

All date-time values must be stored in UTC and returned in ISO 8601 format. The API may accept an explicit timezone offset from the caller. Do not apply a manual fixed timezone adjustment to stored timestamps.

---

# 10. State Management

The backend must validate allowed state transitions instead of allowing arbitrary status changes.

### Student Enquiry

```
new
 |
 v
contacted
 |
 v
in_progress
 |
 +-------> converted
 |
 +-------> closed
```

### Physical Test

```
requested
    |
    v
payment_pending
    |
    v
paid
    |
    v
tester_assigned
    |
    v
scheduled
    |
    v
completed
    |
    v
report_available
```

The physical test flow is optional. Students without a test must not be blocked from assessment or matching.

### Teacher Application

```
new
 |
 v
under_review
 |
 v
shortlisted
 |
 v
evaluation_completed
 |
 +-------> approved
 |
 +-------> rejected
```

The existing application statuses must be extended carefully without breaking existing records.

### Teacher Allocation

```
assigned
   |
   +------> accepted
   |           |
   |           v
   |         active
   |           |
   |           v
   |        completed
   |
   +------> rejected
   |
   +------> cancelled
```

---

# 11. Non-Functional Requirements

### Performance

- Use indexed queries for student, teacher, enquiry and allocation references.
    
- Apply pagination to list endpoints.
    
- Avoid unnecessary population of large related documents.
    
- Keep API responses limited to the fields required by the caller.
    

### Reliability

- Use database transactions for operations involving multiple related records.
    
- Prevent duplicate student conversion.
    
- Prevent duplicate teacher profile creation.
    
- Prevent duplicate successful test payments.
    
- Ensure teacher approval and account linking do not create inconsistent records.
    
- Ensure allocation creation is atomic.
    

### Security

- Use existing Payload access control.
    
- Add field-level restrictions for internal fields.
    
- Protect private documents and test reports.
    
- Enforce role-based access at every protected endpoint.
    

### Maintainability

- Follow the existing project folder structure.
    
- Reuse existing collections and utilities where possible.
    
- Keep business logic separate from route handlers.
    
- Generate/update Payload TypeScript types after collection changes.
    
- Maintain API documentation for all new endpoints.
    

---

# 12. Testing Requirements

All new APIs must include appropriate unit and integration tests.

### Student Module

- Public enquiry submission still works.
    
- Admin can create an enquiry manually.
    
- Enquiry conversion creates one student record.
    
- Duplicate conversion is prevented.
    
- Assessment can be saved without a physical test.
    
- Parent can choose or skip the physical test.
    
- Physical test fee is validated at ₹100.
    
- Tester assignment works.
    
- Test report is saved and retrieved correctly.
    
- Unauthorized users cannot access reports.
    

### Teacher Module

- Existing teacher application submission still works.
    
- Written test evaluation is saved.
    
- Interview evaluation is saved.
    
- Overall score is calculated correctly.
    
- Incomplete evaluation cannot be used for approval.
    
- Approved application creates one teacher profile.
    
- Teacher account is created or linked correctly.
    
- Duplicate teacher profile creation is prevented.
    

### Matching and Allocation

- Matching returns only eligible teachers.
    
- Subject and class compatibility are validated.
    
- Location and availability are considered.
    
- Matching does not automatically allocate teachers.
    
- Admin can create a valid allocation.
    
- Invalid teacher allocation is rejected.
    
- Teacher can retrieve their own allocations.
    
- Teacher cannot retrieve another teacher's allocations.
    

### Regression Testing

All existing authentication, user management, student enquiry and teacher enquiry APIs must continue working after implementation.

---

# 13. Development Phases

The following sequence is recommended to reduce dependency issues.

|Phase|Development Scope|Deliverable|
|---|---|---|
|Phase 1|Existing schema review, role alignment, student enquiry extension|Enquiry and student foundation|
|Phase 2|Student record, capability assessment, optional test|Student assessment APIs|
|Phase 3|Test payment record, tester assignment and report|Physical assessment APIs|
|Phase 4|Teacher evaluation and score calculation|Teacher evaluation APIs|
|Phase 5|Teacher approval, profile and user integration|Approved teacher records|
|Phase 6|Teacher matching|Matching API|
|Phase 7|Teacher allocation and teacher retrieval|Allocation APIs|
|Phase 8|Security, integration and regression testing|Backend API release|

---

# 14. Acceptance Criteria

The backend development will be considered complete when:

1. Student requirements can be received from all specified sources.
    
2. Admin can create enquiries received through offline channels.
    
3. Student enquiries can be converted into structured student records.
    
4. Student capability and previous performance can be recorded.
    
5. Parents can opt in or opt out of the ₹100 physical assessment.
    
6. Physical tests can be assigned to testers.
    
7. Test results and reports can be stored and retrieved securely.
    
8. Report-sharing actions can be recorded for WhatsApp and phone calls.
    
9. Teacher written tests and interviews can be evaluated.
    
10. Overall teacher quality score is calculated.
    
11. Approved teacher applications create or link to teacher profiles and user accounts.
    
12. Suitable teachers can be retrieved using student requirements.
    
13. Admin can allocate a teacher to a student.
    
14. Teachers can retrieve their own allocations.
    
15. All new APIs enforce authentication, authorization and validation.
    
16. Existing APIs continue to work without regression.
    
17. API documentation and automated tests are available for the new endpoints.
    

---

# 15. Final Endpoint Inventory

This is the consolidated proposed endpoint list. Existing APIs should be reused rather than duplicated.

|Module|Method|Endpoint|
|---|---|---|
|Student Enquiry|POST|`/api/admin/student-enquiries`|
|Student Conversion|POST|`/api/student-enquiries/:id/convert`|
|Student|POST|`/api/students`|
|Student|GET|`/api/students`|
|Student|GET|`/api/students/:id`|
|Student|PATCH|`/api/students/:id`|
|Assessment|POST|`/api/students/:studentId/assessments`|
|Physical Test|POST|`/api/students/:studentId/tests`|
|Test Payment|POST|`/api/student-tests/:testId/payment`|
|Tester Assignment|PATCH|`/api/student-tests/:testId/assign-tester`|
|Test Report|POST|`/api/student-tests/:testId/report`|
|Test Report|GET|`/api/student-tests/:testId/report`|
|Report Sharing|POST|`/api/student-tests/:testId/report/share`|
|Teacher Evaluation|POST|`/api/teacher-enquiries/:id/evaluations`|
|Teacher Evaluation|GET|`/api/teacher-enquiries/:id/evaluations`|
|Teacher Evaluation|GET|`/api/teacher-enquiries/:id/evaluations/:evaluationId`|
|Teacher Evaluation|PATCH|`/api/teacher-enquiries/:id/evaluations/:evaluationId`|
|Teacher Approval|POST|`/api/teacher-enquiries/:id/approve`|
|Teacher Profile|GET|`/api/teachers`|
|Teacher Profile|GET|`/api/teachers/:id`|
|Teacher Profile|PATCH|`/api/teachers/:id`|
|Teacher Availability|PATCH|`/api/teachers/:id/availability`|
|Teacher Status|PATCH|`/api/teachers/:id/status`|
|Matching|GET|`/api/students/:studentId/matches`|
|Matching|POST|`/api/students/:studentId/matches`|
|Allocation|POST|`/api/teacher-allocations`|
|Allocation|GET|`/api/teacher-allocations`|
|Allocation|GET|`/api/teacher-allocations/:id`|
|Allocation|PATCH|`/api/teacher-allocations/:id`|
|Allocation Status|PATCH|`/api/teacher-allocations/:id/status`|
|Teacher Allocation|GET|`/api/teacher-allocations/my`|

**Note:** This inventory contains proposed custom endpoints. Standard Payload collection REST routes may be used for CRUD operations where their access-control and validation behavior satisfies the requirement.

---

# 16. Final Product Scope Confirmation

The final backend should support the following complete workflow:

```
                  WELLFIND ACADEMIC
                          |
             +------------+------------+
             |                         |
             v                         v
       STUDENT PROCESS           TEACHER PROCESS
             |                         |
       Student Enquiry            Teacher Application
             |                         |
       Student Record             Admin Review
             |                         |
       Capability Check           Written Test
             |                    + Interview
       Optional Physical Test          |
             |                    Evaluation Score
       Tester Assignment               |
             |                    Teacher Approval
       Test Report                     |
             |                    Teacher Profile
             |                    + User Account
             |                         |
             +------------+------------+
                          |
                          v
                  TEACHER MATCHING
                          |
                          v
                  ADMIN ALLOCATION
                          |
                          v
                  TEACHER ALLOCATION
                          |
                          v
                      CLASS START
```

## Final Scope Statement

This project phase is strictly for **Backend REST API Development**.

The development team must implement the missing data models, relationships, validation rules, business logic, authorization and API endpoints described in this PRD.

Existing authentication, user management, student enquiry and teacher enquiry functionality must be reused wherever possible.

No dashboard, CRM interface, frontend, website or mobile UI development is part of this requirement.

**Expected outcome:** A backend API system capable of supporting the complete Wellfind Academic student enquiry, student assessment, teacher evaluation, teacher matching and teacher allocation workflow.