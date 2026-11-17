import crypto from 'crypto'

/**
 * Generates a cryptographically secure 4-digit OTP (0000–9999).
 */
export function generateOTP(): string {
  // Generate a random integer between 0 and 9999, zero-padded to 4 digits
  const val = crypto.randomInt(0, 10000)
  return val.toString().padStart(4, '0')
}

/**
 * Hashes an OTP using SHA-256 with a salt derived from the user's email.
 * Never stores plaintext OTPs.
 */
export function hashOTP(otp: string, email: string): string {
  return crypto.createHash('sha256').update(`${email}:${otp}`).digest('hex')
}

/**
 * Compares a plaintext OTP against its stored hash.
 */
export function compareOTP(otp: string, email: string, otpHash: string): boolean {
  const expected = hashOTP(otp, email)
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(otpHash))
}