import { randomInt } from 'node:crypto'

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const DIGITS = '23456789'
const ALL = UPPER + LOWER + DIGITS

const pick = (chars: string) => chars[randomInt(chars.length)]!

/**
 * Generates a random alphanumeric password (no look-alike characters such as
 * 0/O or 1/l/I) that always contains an upper-case letter, a lower-case letter and a digit.
 */
export function generateTemporaryPassword(length = 12): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)]
  while (chars.length < length) chars.push(pick(ALL))
  // Fisher-Yates shuffle with a CSPRNG so the guaranteed characters are not predictable.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j]!, chars[i]!]
  }
  return chars.join('')
}

export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 128
