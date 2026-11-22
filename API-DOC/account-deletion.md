# Account and data deletion

Required by Google Play (in-app deletion + a public "Delete data URL").

* Public page for the Play Console "Delete data URL": `https://www.wellfindacademic.com/delete-account` (wellfind-client, `app/delete-account`).
* Migration: `20261122_195151_account_deletion` (adds `users.deletedAt` and the `data-deletion-requests` collection). Run `pnpm migrate` on every deployment.

## What "safe delete" does

| Removed | Anonymised (row stays) | Retained |
|---|---|---|
| login, avatar, uploaded documents (`teacher-documents`, `user-files`), notifications, FCM devices, web-push subscriptions | name / phone / e-mail on `teacher-profiles`, `teacher-enquiries`, `students`, `student-enquiries`, payer details on `payments`, `email-logs`, report-share recipients | payment amounts, receipts, gateway ids, payouts, allocation history (no personal details) |

The user row is kept as `deleted-user-<id>@deleted.invalid`, `status: blocked`, random password, `deletedAt` set, so foreign keys and audit trails keep working and the person can never sign in again.
The account is locked first; if a later step fails the request answers 500 and the account stays locked (safe to retry).

## Endpoints

| Method + path | Auth | Purpose |
|---|---|---|
| `POST /api/account/delete` `{ password, confirm: "DELETE" }` | signed-in teacher or staff | Delete own account. 401 wrong password, 409 teacher still has active/pending students, 403 super admin (cannot self-delete), 429 rate limited. |
| `POST /api/data-deletion-requests` `{ requesterType, email?, phone?, fullName?, message?, website? }` | public | Request for students, parents and anyone without the app. Needs an e-mail or a 10 digit phone. `website` is a honeypot. 5 requests / 15 min / IP. Staff with the `users` module get an in-app notification. |
| `GET /api/admin/data-deletion-requests?status=pending` | super admin | List requests. |
| `POST /api/admin/data-deletion-requests/:id/process` | super admin | After verifying the requester, anonymise their records (and delete a matching teacher/staff account), then scrub the request. |
| `POST /api/admin/data-deletion-requests/:id/reject` `{ reason }` | super admin | Close a request that could not be verified. |

Requests are also visible in the Payload admin under **Data Deletion Requests**. Contact details on a request are erased once it is completed or rejected.

## Operating procedure (web requests, within 30 days)

1. Check the list (`pending`). Verify the requester owns the e-mail / phone (reply to the e-mail, or call the number).
2. Verified: `POST .../process`. Not verifiable: `POST .../reject` with a reason.

## Known limitations

* Students and parents have no accounts, so their requests are processed by a super admin, not automatically.
* Matching is by exact e-mail or the last 10 digits of a phone number; records stored with a different number or spelling are not found.
* No CRM screen yet for these requests (API and Payload admin only).
* A teacher with active students must finish or hand over those classes (support) before deleting.
