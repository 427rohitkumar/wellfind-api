# Investigation & Discrepancy Report: CRM Inquiries vs. PostgreSQL Database

**Date:** 2026-11-19  
**Database:** `wellfind-db` (PostgreSQL 17 on `127.0.0.1:5432`)  
**Backend:** `wellfind-api` (Payload CMS 3.92.1 on `http://localhost:3004`)  
**Frontend CRM:** `wellfind-crm` (Vite + React on `http://localhost:5173`)  
**Status:** Verification Complete — Zero Data Modified

---

## 1. Executive Summary

This investigation resolves the observed differences between:
- The database record counts (`COUNT(*)`)
- The CRM data table counts (`totalDocs`)
- The CRM tab and sidebar badge numbers

**Key Finding:** There is **no database discrepancy, caching anomaly, or mock data**. The CRM is consuming **100% live API data** from `wellfind-db`. The badge counts in the CRM UI are designed to display **actionable unread enquiries**, not total records:
- **Student Inquiries:** 11 Total Records in DB/API $\rightarrow$ 1 marked as read $\rightarrow$ **10 Unread Badge**
- **Teacher Inquiries:** 20 Total Records in DB/API $\rightarrow$ 7 approved (processed) $\rightarrow$ **13 Actionable Unread Badge**
- **Sidebar Badge:** $10 + 13 = \mathbf{23}$ **Total Unread**

---

## 2. Quantitative Comparison Table

| Metric | Student Enquiries | Teacher Inquiries |
|:---|:---:|:---:|
| **Direct Database Count (`psql`)** | **11** | **20** |
| **Backend REST API `totalDocs`** | **11** | **20** |
| **CRM Table Displayed Records** | **11** (10 on p.1, 1 on p.2) | **20** (10 on p.1, 10 on p.2) |
| **CRM Tab Badge Count** | **10** | **13** |
| **Read Records (`mark_as_read = true`)** | 1 (ID: 67) | 0 |
| **Processed Records (`status = 'approved'`)** | N/A | 7 (IDs: 2, 8, 9, 72, 101, 107, 108) |
| **Actionable / Unread Formula** | `total - read` ($11 - 1 = 10$) | `total - approved` ($20 - 7 = 13$) |

---

## 3. Detailed Root Cause Analysis for Badges

### A. Why the Student Inquiries Badge Shows 10 (Table Shows 11)
1. **Frontend Implementation:**  
   In `wellfind-crm/src/pages/inquiries/Inquiries.jsx` (lines 513–523):
   ```jsx
   <BookOpen className="w-4 h-4 shrink-0" aria-hidden="true" />
   <span>Student Inquiries</span>
   {studentUnreadCount !== null && studentUnreadCount > 0 && (
     <span className="badge ms-2" title={`${studentUnreadCount} unread student enquiries`}>
       {studentUnreadCount}
     </span>
   )}
   ```
   The badge explicitly renders `studentUnreadCount` provided by `EnquiryCountContext.jsx`.

2. **Backend Logic:**  
   In `wellfind-api/src/app/api/inquiries/unread-counts/route.ts` (lines 24–45):
   ```ts
   const unreadCondition = {
     or: [
       { markAsRead: { equals: false } },
       { markAsRead: { exists: false } },
     ],
   }
   const studentCountResult = await payload.count({
     collection: 'student-enquiries',
     where: unreadCondition,
     overrideAccess: true,
   })
   ```

3. **Database Records State (`student_enquiries`):**
   - Record **ID 67** (`Aarav Sharma`): `mark_as_read = true` (previously opened/marked read).
   - Records **IDs 68, 69, 70, 71, 72, 73, 74, 75, 76, 135**: `mark_as_read = false`.
   - Result: Exactly **10** unread records.

---

### B. Why the Teacher Inquiries Badge Shows 13 (Table Shows 20)
1. **Frontend Implementation:**  
   In `wellfind-crm/src/pages/inquiries/Inquiries.jsx` (lines 539–549):
   ```jsx
   <GraduationCap className="w-4 h-4 shrink-0" aria-hidden="true" />
   <span>Teacher Inquiries</span>
   {teacherUnreadCount !== null && teacherUnreadCount > 0 && (
     <span className="badge ms-2" title={`${teacherUnreadCount} unread teacher applications`}>
       {teacherUnreadCount}
     </span>
   )}
   ```
   The badge displays `teacherUnreadCount`.

2. **Backend Logic:**  
   In `wellfind-api/src/app/api/inquiries/unread-counts/route.ts` (lines 31–51):
   ```ts
   const teacherUnreadCondition = {
     and: [
       unreadCondition,
       {
         applicationStatus: { not_equals: 'approved' },
       },
     ],
   }
   ```
   The endpoint excludes applications that have reached the `'approved'` terminal state because approved candidates have already been processed and converted into full teacher profiles.

3. **Database Records Breakdown (`teacher_enquiries`):**
   - Total rows: **20**
   - Approved rows (**7**): IDs 2, 8, 9, 72, 101, 107, 108
   - Unapproved & Unread rows (**13**):
     - `new` (7): IDs 37, 68, 70, 71, 76, 77, 151, 156
     - `under_review` (2): IDs 67, 75
     - `shortlisted` (2): IDs 69, 73
     - `rejected` (1): ID 74
   - Result: Exactly $20 - 7 = \mathbf{13}$ unread/actionable applications.

---

## 4. Verification of Recent Integration Test Records

The records submitted through the client website forms during the integration testing were located in both the database and the API responses:

### Student Enquiry ID 135:
- **Found in Database:** Yes (`student_enquiries`, row ID 135)
- **Found in REST API:** Yes (`GET /api/student-enquiries/135`)
- **Parent Name:** `Aarav Verma`
- **Phone:** `9876543210`
- **Class:** `Class 8`
- **Locality:** `South Extension`
- **Status:** `new`
- **`mark_as_read`:** `false`
- **Created At:** `2026-11-19T09:20:31.935Z`

### Teacher Enquiry ID 156:
- **Found in Database:** Yes (`teacher_enquiries`, row ID 156)
- **Found in REST API:** Yes (`GET /api/teacher-enquiries/156`)
- **Applicant Name:** `Priya Singh`
- **Mobile Number:** `9812345678`
- **Primary Subject:** `Mathematics`
- **Highest Qualification:** `M.Sc Mathematics, B.Ed`
- **Status:** `new`
- **`mark_as_read`:** `false`
- **Created At:** `2026-11-19T09:20:32.151Z`

---

## 5. Live vs. Mock / Cached Data Verification

| Check | Result | Verification Proof |
|:---|:---:|:---|
| **API Target** | Live | `apiClient.js` configures `http://localhost:3004` (port 3004 verified active). |
| **Authentication** | Live JWT | Uses Bearer tokens issued by `POST /api/auth/login`. |
| **Database Connection** | Live PostgreSQL | `wellfind-api` connects to `postgres://postgres:admin@127.0.0.1:5432/wellfind-db`. |
| **Mock Fallback on Inquiries** | None | No mock/demo fallback is present in `studentEnquiryService.js` or `teacherEnquiryService.js`. |
| **Data Consistency** | 100% Match | Adding enquiry #135 and #156 incremented `totalDocs` and appeared immediately in the table. |

---

## 6. Complete Inventory of Current Enquiry IDs in Database

### Student Enquiries (11 Total):
- **ID 67:** Aarav Sharma (`new`, `mark_as_read: true`)
- **ID 68:** Priya Patel (`contacted`, `mark_as_read: false`)
- **ID 69:** Rohan Verma (`in_progress`, `mark_as_read: false`)
- **ID 70:** Ananya Reddy (`new`, `mark_as_read: false`)
- **ID 71:** Kabir Singh (`contacted`, `mark_as_read: false`)
- **ID 72:** Sneha Nair (`new`, `mark_as_read: false`)
- **ID 73:** Vikram Joshi (`allocated`, `mark_as_read: false`)
- **ID 74:** Diya Mehta (`closed`, `mark_as_read: false`)
- **ID 75:** Arjun Malhotra (`new`, `mark_as_read: false`)
- **ID 76:** Ira Kapoor (`contacted`, `mark_as_read: false`)
- **ID 135:** Aarav Verma (`new`, `mark_as_read: false`) — *Integration test record*

### Teacher Enquiries (20 Total):
- **Approved (7):** IDs 2, 8, 9, 72, 101, 107, 108
- **New / Pending (8):** IDs 37, 68, 70, 71, 76, 77, 151, 156 (*Priya Singh, integration test record*)
- **Under Review (2):** IDs 67, 75
- **Shortlisted (2):** IDs 69, 73
- **Rejected (1):** ID 74
