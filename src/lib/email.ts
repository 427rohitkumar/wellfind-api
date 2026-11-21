import nodemailer from 'nodemailer'
import type { EmailAdapter, SendEmailOptions } from 'payload'

let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter | null {
  const host = process.env.SMTP_HOST
  const port = process.env.SMTP_PORT
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASSWORD

  if (!host || !port || !user || !pass) {
    return null
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Number(port) === 465,
      auth: { user, pass },
    })
  }

  return transporter
}

const defaultFromAddress = process.env.SMTP_FROM_EMAIL || 'noreply@wellfind.academy'
const defaultFromName = process.env.SMTP_FROM_NAME || 'Wellfind Academic'

/**
 * Payload email adapter backed by nodemailer (SMTP).
 *
 * When SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASSWORD are configured, emails
 * are sent for real. Otherwise they are written to the console so they are not
 * silently dropped during development.
 */
export const emailAdapter: EmailAdapter<void> = () => ({
  defaultFromAddress,
  defaultFromName,
  name: 'nodemailer',
  async sendEmail(message: SendEmailOptions): Promise<void> {
    const transport = getTransporter()
    const from = message.from
      ? typeof message.from === 'string'
        ? message.from
        : `"${message.from.name ?? defaultFromName}" <${message.from.address}>`
      : `"${defaultFromName}" <${defaultFromAddress}>`

    if (!transport) {
      console.log('[Email] SMTP not configured. Would send email:', {
        from,
        to: message.to,
        subject: message.subject,
      })
      return
    }

    await transport.sendMail({
      ...message,
      from,
    })
  },
})

/**
 * Sends a password-reset OTP through the shared mail service (templated, logged).
 * Returns `success: false` instead of throwing, so the API can respond gracefully.
 */
export async function sendOTPEmail({
  to,
  otp,
  expiresInMinutes,
  name,
}: {
  to: string
  otp: string
  expiresInMinutes: number
  name?: string
}): Promise<{ success: boolean; error?: string }> {
  const { sendTemplatedEmail } = await import('@/services/mailService')
  const result = await sendTemplatedEmail({
    template: 'password_reset_otp',
    to,
    toName: name,
    data: { name: name || to.split('@')[0], otp, expiresInMinutes },
    relatedType: 'auth',
  })
  return { success: result.ok, error: result.error }
}
