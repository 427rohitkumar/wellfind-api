# Mobile push notifications (Firebase Cloud Messaging)

Android push for the Wellfind app (teachers and staff), on top of the existing CRM notification code.
No new service, queue or Redis. Browser push (web push / VAPID) for the CRM is unchanged.

## How it fits together

```
business operation succeeds (collection hook / service)
  -> services/pushEvents.ts            (one function per event; unchanged entry points)
       -> services/pushService.ts      pushToUsers / pushToStaff
            1. services/notificationService.ts  notifyUsers
                 a. save notification row (dedupe by `userId:key`)         <- source of truth, never rolled back
                 b. FCM to the user's active devices of THIS environment   (lib/firebaseAdmin.ts, delivery log)
            2. web push to the user's CRM browsers (existing, only if VAPID is configured)
```

* Recipients: staff events use the existing role model (`ROLE_DEFINITIONS` grants per module, active users + `super_admin`);
  teacher events go to the teacher's own user. The client never sends a recipient.
* FCM failures never affect the business operation: they are logged in `notification-deliveries`, the in-app notification stays.
* Transient FCM errors are retried up to 3 times (0.4 s, 0.8 s backoff). Dead tokens (`registration-token-not-registered`, ...) deactivate the device.
* Idempotency: `notifications.dedupeKey` is unique (`<userId>:<event key>`), e.g. `registration-paid:<enquiryId>:<gateway payment id>`,
  `allocation:<id>:created`. Webhook + checkout both settling a payment, or a retried hook, notify once.

## Collections (migration `20261122_131531_mobile_notifications`)

| Collection | Purpose |
|---|---|
| `notifications` | user, type, title, body, entityType, entityId, screen, readAt, dedupeKey (unique) |
| `user-devices` | user, fcmToken (unique), platform, environment, active, lastSeen, appVersion, deviceName |
| `notification-deliveries` | notification, device, status (`sent`/`failed`/`invalid_token`), attempts, errorCode, messageId (no tokens, no secrets) |

All three are API-written only (Payload access: read/delete for super admin, create/update closed).
Deleting a user (or a notification / device) removes dependent rows through `beforeDelete` hooks.
Apply on every environment with `pnpm migrate`.

## APIs (all authenticated, user-scoped, envelope `{ success, message, data }`)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/notifications/devices/register` | `{ fcmToken, platform: android|ios, environment, appVersion?, deviceName? }`. User comes from the auth token. Same token = update (moves to the current user). `409` if `environment` differs from the server's. Returns `{ id }` |
| DELETE | `/api/notifications/devices/:id` | own device only (404 otherwise) |
| GET | `/api/notifications?page=&limit=&unread=true` | newest first, max 50 per page |
| GET | `/api/notifications/unread-count` | `{ count }` |
| PATCH | `/api/notifications/:id/read` | own only |
| PATCH | `/api/notifications/read-all` | |
| DELETE | `/api/notifications/:id` | own only |

## Environment isolation

* Backend env: `NOTIFICATION_ENV` (or `APP_ENV`) = `development | preview | production`; default `production` when `NODE_ENV=production`, else `development`.
* Each device row stores its environment. A backend only sends to devices whose environment equals its own and refuses registration of any other.
* Each environment must also have its own database, so tokens never cross environments in the first place.
* The three Android apps (`com.wellfind.academic`, `.preview`, `.development`) belong to one Firebase project; a token is only delivered to the app it was issued for.

## Backend configuration

| Variable | Notes |
|---|---|
| `NOTIFICATION_ENV` | see above |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | from the Admin SDK service-account JSON. Private key keeps `\n` escapes. |

Inject them through the deployment secret manager (Docker/compose secrets, Vercel/host environment variables, ...), never commit them, never put them in the app.
They are read only in `src/lib/firebaseAdmin.ts`; the code never logs or returns them. Without them FCM is skipped and in-app notifications still work.
Rotate the key in Google Cloud (service account > Keys) and redeploy the new values.

## Event mapping

Triggered only after the business operation succeeded. Payloads: `{ notificationId, type, entityType, entityId, screen }` (no sensitive data).

| Audience | Event | type | screen (app route) |
|---|---|---|---|
| Staff `student_inquiries` | new student enquiry | `student_inquiry_created` | `/admin/enquiry/:id` |
| Staff `teacher_inquiries` | new teacher application (= teacher registration) | `teacher_application_created` | `/admin/application/:id` |
| Staff `payments` | registration fee paid (checkout, webhook, manual, yearly renewal) | `payment_received` | `/admin/teacher-payments` |
| Staff `allocation` | teacher accepted / rejected an allocation | `allocation_accepted` / `allocation_rejected` | `/admin/allocations` |
| Teacher | application under review / shortlisted / approved / rejected | `application_status` | `/application` |
| Teacher | registration fee confirmed (real amount) | `payment_confirmed` | `/fees` |
| Teacher | new student allocated | `allocation_created` | `/teacher-student/:id` |
| Teacher | allocation cancelled / completed | `allocation_cancelled` / `allocation_completed` | `/history` |
| Teacher | payout credited (real amount) | `payout_credited` | `/fees` |
| Any user | account blocked / suspended / restored | `account_status` | `/profile` |

Pending or failed payments never notify (hooks run only on `paid`).

## Known limitations

* Students and parents have no accounts or login in this system, so there are no student devices: student-facing events
  (inquiry submitted, teacher assigned, ...) cannot be pushed. The mechanism (`notifyUsers`) works for any user with an account.
* Student test payments (`student-test-payments`) and "teacher changes required" have no hook/status in the backend today, so they send nothing.
* iOS is not set up (no APNs / `GoogleService-Info.plist`); Android only.
* The delivery log grows with every push; prune it periodically (not automated).
* When a session is force-signed-out by a 401, the device row stays until the next user registers the same token or FCM reports it invalid.
