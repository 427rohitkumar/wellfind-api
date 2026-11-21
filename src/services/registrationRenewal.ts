import { getMailConfig } from '@/lib/mail/config'

const DAY = 86_400_000

export interface RegistrationState {
  validUntil: string | null
  daysLeft: number | null
  /** active: valid and not near expiry; expiring: inside the renewal window; expired: past the date. */
  state: 'active' | 'expiring' | 'expired' | null
  canRenew: boolean
  windowDays: number
}

/**
 * Registration is yearly. Once a teacher is approved it stays valid until `registrationFee.expiresAt`;
 * inside the renewal window (default 30 days before) or after expiry the fee can be paid again.
 * Teachers who are teaching must renew too: expiry never silently drops the fee.
 */
export function registrationState(enquiry: Record<string, any>): RegistrationState {
  const windowDays = Math.max(...getMailConfig().expiryReminderDays, 30)
  const fee = (enquiry.registrationFee ?? {}) as Record<string, any>
  const validUntil = fee.expiresAt ? String(fee.expiresAt) : null
  if (enquiry.applicationStatus !== 'approved' || !validUntil) {
    return { validUntil, daysLeft: null, state: null, canRenew: false, windowDays }
  }
  const msLeft = new Date(validUntil).getTime() - Date.now()
  const daysLeft = Math.ceil(msLeft / DAY)
  const state = msLeft <= 0 ? 'expired' : daysLeft <= windowDays ? 'expiring' : 'active'
  return { validUntil, daysLeft, state, canRenew: state !== 'active', windowDays }
}

/** New expiry after a payment: extends from the current expiry when renewing early, else from now. */
export function nextExpiry(currentExpiry: string | null | undefined, validityDays: number): string {
  const current = currentExpiry ? new Date(currentExpiry).getTime() : 0
  return new Date(Math.max(Date.now(), current) + validityDays * DAY).toISOString()
}
