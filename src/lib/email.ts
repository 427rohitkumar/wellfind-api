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
 * Sends an OTP email. Returns an object with `success` and optional `error`.
 * If SMTP is not configured, returns success=false with a clear error message
 * rather than throwing, so the API can respond gracefully.
 */
export async function sendOTPEmail({
  to,
  otp,
  expiresInMinutes,
}: {
  to: string
  otp: string
  expiresInMinutes: number
}): Promise<{ success: boolean; error?: string }> {
  const transport = getTransporter()

  if (!transport) {
    return {
      success: false,
      error: 'SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD.',
    }
  }

  const fromEmail = process.env.SMTP_FROM_EMAIL || 'noreply@wellfind.academy'
  const fromName = process.env.SMTP_FROM_NAME || 'Wellfind Academic'

  try {
    await transport.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject: 'Your Wellfind Academic Password Reset OTP',
      text: `Your one-time password (OTP) is ${otp}. It expires in ${expiresInMinutes} minutes. Do not share it with anyone.`,
      html: `
        <h2>Wellfind Academic — Password Reset OTP</h2>
        <p>Your one-time password (OTP) is <strong>${otp}</strong>.</p>
        <p>It expires in ${expiresInMinutes} minutes.</p>
        <p>Do not share this code with anyone.</p>
      `,
    })
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Failed to send email: ${message}` }
  }
}