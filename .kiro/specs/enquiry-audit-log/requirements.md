# Requirements Document

## Introduction

This feature hardens the existing status-change audit logging system for Student Enquiries and Teacher Enquiries in the wellfind-api backend. The system already has the core infrastructure (the `EnquiryAuditLog` collection, `afterChange` hooks, and integration tests), but contains three correctness gaps: `changedAt` is never explicitly set, hook errors are swallowed silently instead of propagating, and several test assertions are missing or incomplete. This work closes those gaps, adds the missing test coverage, and locks down the access control surface so that public callers cannot forge audit records.

No frontend changes, no status-transition rules, no mandatory reason enforcement, and no destructive database operations are in scope.

## Glossary

- **Audit_Log**: The `enquiry-audit-log` Payload CMS collection that stores immutable records of status-field changes on student and teacher enquiries.
- **AuditHook**: The Payload `afterChange` hook registered on the `StudentEnquiries` and `TeacherEnquiries` collections that writes to the Audit_Log when a status field changes.
- **Student_Enquiry**: A record in the `student-enquiries` collection. Its audited status field is `enquiryStatus`.
- **Teacher_Enquiry**: A record in the `teacher-enquiries` collection. Its audited status field is `applicationStatus`.
- **changedAt**: The explicitly server-generated `Date` timestamp recorded in each Audit_Log entry at the moment the AuditHook fires.
- **changedBy**: The `users` relationship on each Audit_Log entry, resolved exclusively from `req.user` in the server-side AuditHook — never from client-supplied payload data.
- **originalDoc**: The persisted version of the document as it existed before the current update, available in the Payload `afterChange` hook argument. It is the sole trusted source for the previous status value.
- **overrideAccess**: The Payload local-API flag that bypasses collection-level access control, used by the AuditHook to write to the Audit_Log while the collection's public `create` access is blocked.
- **super_admin**: The user role that has read access to the Audit_Log and write access to status fields on Student_Enquiry and Teacher_Enquiry records.

---

## Requirements

### Requirement 1: Audit Event Data Model

**User Story:** As a super_admin, I want every status change on a student or teacher enquiry to produce a complete, trustworthy audit record, so that I can reconstruct the full history of any enquiry's status lifecycle.

#### Acceptance Criteria

1. WHEN a status change is recorded, THE Audit_Log SHALL store `enquiryType` as either `"student"` or `"teacher"` identifying which collection the change originated from.
2. WHEN a status change is recorded for a Student_Enquiry, THE Audit_Log SHALL store a relationship to that Student_Enquiry in the `studentEnquiry` field.
3. WHEN a status change is recorded for a Teacher_Enquiry, THE Audit_Log SHALL store a relationship to that Teacher_Enquiry in the `teacherEnquiry` field.
4. WHEN a status change is recorded, THE Audit_Log SHALL store the name of the changed field in `fieldChanged` (`"enquiryStatus"` for student enquiries, `"applicationStatus"` for teacher enquiries).
5. WHEN a status change is recorded, THE Audit_Log SHALL store the status value read from `originalDoc` in the `previousStatus` field.
6. WHEN a status change is recorded, THE Audit_Log SHALL store the status value read from the persisted `doc` in the `newStatus` field.
7. WHEN a status change is recorded, THE Audit_Log SHALL store the ID of the authenticated user from `req.user` in the `changedBy` field.
8. WHEN a status change is recorded, THE AuditHook SHALL explicitly set `changedAt` to `new Date()` at the time the hook executes, and THE Audit_Log SHALL persist this value.
9. WHERE a `changeReason` is provided, THE Audit_Log SHALL store the reason text in the `changeReason` field.

---

### Requirement 2: Status Change Capture Rules

**User Story:** As a super_admin, I want the audit system to capture only genuine status transitions sourced from server-trusted data, so that the audit trail is accurate and free from spurious entries.

#### Acceptance Criteria

1. WHEN a Student_Enquiry is updated and `enquiryStatus` changes from its previous persisted value, THE AuditHook SHALL create exactly one Audit_Log entry for that transition.
2. WHEN a Teacher_Enquiry is updated and `applicationStatus` changes from its previous persisted value, THE AuditHook SHALL create exactly one Audit_Log entry for that transition.
3. WHEN a Student_Enquiry is updated and `enquiryStatus` is identical to the value in `originalDoc`, THE AuditHook SHALL create no Audit_Log entry.
4. WHEN a Teacher_Enquiry is updated and `applicationStatus` is identical to the value in `originalDoc`, THE AuditHook SHALL create no Audit_Log entry.
5. WHEN a new Student_Enquiry is created, THE AuditHook SHALL create no Audit_Log entry.
6. WHEN a new Teacher_Enquiry is created, THE AuditHook SHALL create no Audit_Log entry.
7. THE AuditHook SHALL read the previous status exclusively from `originalDoc`, never from client-supplied request data.
8. THE AuditHook SHALL read the new status exclusively from the validated, persisted `doc`, never from client-supplied request data.
9. THE AuditHook SHALL set `changedAt` to `new Date()` on every Audit_Log entry it creates.

---

### Requirement 3: Error Propagation

**User Story:** As a super_admin, I want a failed audit write to surface as an error rather than silently succeeding, so that I am never left with a status change that has no corresponding audit record.

#### Acceptance Criteria

1. WHEN the Audit_Log `create` call inside the AuditHook throws an error, THE AuditHook SHALL propagate that error and SHALL NOT catch or suppress it.
2. WHEN the AuditHook propagates an error, THE Payload afterChange pipeline SHALL surface the error to the caller so that the status-change operation is not reported as successful.
3. IF the Audit_Log write fails, THEN THE system SHALL NOT return a success response to the caller of the status-change operation.

---

### Requirement 4: Access Control

**User Story:** As a system operator, I want the Audit_Log to be write-protected from public REST callers and readable only by super_admin users, so that the audit trail cannot be forged, tampered with, or read by unauthorized parties.

#### Acceptance Criteria

1. THE Audit_Log SHALL deny `create` access to all REST callers (the collection `create` access function SHALL return `false`).
2. THE AuditHook SHALL pass `overrideAccess: true` when writing to the Audit_Log via the Payload local API, so that the server-side hook bypasses the blocked public `create` access.
3. THE Audit_Log SHALL grant `read` access only to users whose `role` equals `"super_admin"`.
4. THE Audit_Log SHALL deny `update` access to all callers (the collection `update` access function SHALL return `false`).
5. THE Audit_Log SHALL deny `delete` access to all callers (the collection `delete` access function SHALL return `false`).
6. THE AuditHook SHALL never read the `changedBy` actor from client-supplied request data; it SHALL always be resolved from `req.user`.
7. WHEN an unauthenticated or non-super_admin user attempts to read the Audit_Log via the local API, THE Audit_Log SHALL return no results (access denied).

---

### Requirement 5: Test Coverage

**User Story:** As a developer, I want comprehensive, passing automated tests for the audit logging system, so that regressions are caught before they reach production.

#### Acceptance Criteria

1. WHEN a Student_Enquiry status changes, THE test suite SHALL assert that the created Audit_Log entry has correct values for `enquiryType`, `studentEnquiry`, `fieldChanged`, `previousStatus`, and `newStatus`.
2. WHEN a Teacher_Enquiry status changes, THE test suite SHALL assert that the created Audit_Log entry has correct values for `enquiryType`, `teacherEnquiry`, `fieldChanged`, `previousStatus`, and `newStatus`.
3. WHEN a status change audit entry is created, THE test suite SHALL assert that `changedBy` is populated from the authenticated request context (not null).
4. WHEN a status change audit entry is created, THE test suite SHALL assert that `changedAt` is a non-null Date value.
5. WHEN a Student_Enquiry status is updated to the same value, THE test suite SHALL assert that no new Audit_Log entry is created.
6. WHEN a Student_Enquiry is created, THE test suite SHALL assert that no Audit_Log entry is created.
7. WHEN a non-super_admin caller attempts to create an Audit_Log entry via the local API, THE test suite SHALL assert that the operation is denied.
8. WHEN a non-super_admin caller attempts to read the Audit_Log via the local API, THE test suite SHALL assert that no records are returned.
9. WHEN the Audit_Log `create` call inside the AuditHook throws, THE test suite SHALL assert that the error propagates out of the hook instead of being swallowed.
10. WHEN a super_admin performs a REST PATCH on a Student_Enquiry that changes its status, THE test suite SHALL assert that a corresponding Audit_Log entry is created (end-to-end HTTP path).
11. THE test suite SHALL pass all pre-existing tests without modification to their assertions.
