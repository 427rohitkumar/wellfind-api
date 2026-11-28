# Teacher payouts API

All routes need `payments` write access (`super_admin`, `finance_manager`). Service: `src/services/payoutService.ts`.

## Manual record

`POST /api/admin/payments/payouts` `{ allocationId, month, amount?, paidAt?, reference?, note?, paymentMethod?, utr? }` -> `201`. Marks the student-month paid on the finance user's word. `409` when already paid. Undo: `DELETE /api/admin/payments/payouts/:id`.

## Automatic UPI payout (RazorpayX)

`POST /api/admin/payments/payouts/razorpay` `{ allocationId, month, amount, upiId, teacherName? }`

Needs `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_ACCOUNT_NUMBER`.

The month is recorded as paid **only when Razorpay reports the payout `processed`**. Calling again for the same month looks up the existing payout (`reference_id` = `PO_<allocationId>_<YYYYMM>`) and records it once processed, without sending again.

`200` with `data`:

| Result | `success` | `pending` | `fallbackToManual` | Meaning |
|---|---|---|---|---|
| Paid | true | false | false | Processed and recorded (`record`, `payout`) |
| Waiting | false | true | false | In progress or unconfirmed (`payoutStatus`, `razorpayPayoutId`). Do not pay manually |
| Refused | false | false | true | Razorpay refused, or the payout failed, was rejected, cancelled or reversed (`upiUri`). Manual payment is safe |

| Status | When (nothing was sent) |
|---|---|
| 400 | Missing or invalid field |
| 404 / 409 | Unknown allocation, month not taught, or already paid |
| 503 | Razorpay keys or account number not set |
| 409 | `amount` is not the allocation's `teacherPayout` (or none is set), or `upiId` is not saved in the teacher's payout settings |

`upiId` and `amount` confirm what the finance user saw. New money goes only to the saved UPI ID (any of the teacher's saved methods, letter case ignored) for exactly the amount due; any other amount is recorded manually. These two checks run after the lookup, so a payout already sent can still be recorded after the details change.

## Limits

- No payout webhook yet: a waiting payout is recorded only when this endpoint is called again.
- A payout reversed after it was recorded is not undone automatically.
- The manual record (`POST /api/admin/payments/payouts`) accepts any amount from the finance user.
