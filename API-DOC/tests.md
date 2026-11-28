# Tests API

Two separate kinds of test.

| Kind | What | Data | Who enters the result |
|---|---|---|---|
| Entry (capability) test | Before teaching starts: mental ability, creativity, academic level and other scores | `enquiry-tests` | The allocated teacher (physical). Digital: staff for now |
| Academic test | Weekly, monthly or other test while teaching | `allocation-work` with `kind: "test"` | The teaching teacher |

The online test portal is not built.

## Entry tests: staff

Needs `tests` access. Service `services/enquiryTestService.ts`.

| Route | Use |
|---|---|
| `GET, POST /api/admin/enquiry-tests` | List; request `{ studentEnquiryId, mode }` |
| `GET, PATCH /api/admin/enquiry-tests/:id` | Payment, tester, schedule, venue, status |
| `GET /api/admin/enquiry-tests/testers` | Active teacher accounts |

For `mode: "physical"`: the tester must be an active teacher (`400` otherwise), and `report` or `status: "report_ready"` in a staff `PATCH` returns `409`.

## Entry tests: allocated teacher

Active `teacher` account. Only physical tests allocated to the caller with status `scheduled`, `conducted` or `report_ready`; anything else is `404`. No payment or fee fields. `student.phoneNumber` is `null` once the result is submitted.

| Route | Use |
|---|---|
| `GET /api/teachers/me/tests` | `{ docs: [...] }` |
| `GET /api/teachers/me/tests/:id` | One test |
| `PATCH /api/teachers/me/tests/:id` | `{ report?, submit? }` |

`report`: `iqScore`, `creativityScore`, `academicScore` (0-100), `extraScores: [{ label (max 60), score (0-100) }]` (max 10), `strengths`, `improvementAreas`, `recommendation`, `testerNotes` (max 2000), `hoursPerWeek` (0-40 or null). Only the fields sent are changed.

Saving makes the test `conducted`. `submit: true` needs the three main scores and `recommendation`, makes it `report_ready`, and locks it (`409` afterwards).

## Academic tests

Teacher: `GET, POST /api/teacher-allocations/:id/work`, `PATCH, DELETE .../work/:wid`. For tests send `kind: "test"`, `period: "weekly" | "monthly" | "other"` (reads as `other` when unset), `title`, `description` (chapters or topics), `dueDate` (test date), `maxMarks`; grade with `status: "graded"`, `marks`, `feedback`.

Staff (read only, `tests` access): `GET /api/admin/academic-tests?period=&status=&page=&limit=` returns paginated `docs` with `student`, `teacher`, `subject`, `period`, `testDate`, `status`, `marks`, `maxMarks`, `percentage`, `feedback`.

## Database

Migration `20261128_063005_test_flow` adds `allocation_work.period` and the entry-test other scores table.
