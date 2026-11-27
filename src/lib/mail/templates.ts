import type { MailConfig } from '@/lib/mail/config'
import {
  actionButtons,
  bigCode,
  button,
  details,
  heading,
  note,
  p,
  renderLayout,
  table,
  warningBox,
  type Block,
} from '@/lib/mail/layout'

export interface RenderedMail {
  subject: string
  html: string
  text: string
}

export interface MailTemplate<D = Record<string, any>> {
  key: string
  label: string
  /** Who normally receives it, shown in the admin Mail tab. */
  audience: 'teacher' | 'staff' | 'any'
  /** Data keys that carry secrets; removed before the log row is stored. Such mails cannot be retried. */
  sensitiveKeys?: string[]
  build(data: D, cfg: MailConfig): { subject: string; preheader?: string; blocks: Block[] }
}

const inr = (n: unknown) => `₹${Number(n ?? 0).toLocaleString('en-IN')}`
const greet = (name?: string) => p(`Hello ${name?.trim() || 'there'},`)
const fmtDate = (v: unknown) =>
  v ? new Date(String(v)).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }) : ''
const fmtDateTime = (v: unknown) =>
  v
    ? `${new Date(String(v)).toLocaleString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })} IST`
    : ''
const methodLabel = (m: unknown) =>
  ({ razorpay: 'Online (Razorpay)', upi: 'UPI', card: 'Card', netbanking: 'Net banking', bank_transfer: 'Bank transfer' } as Record<string, string>)[String(m)] || String(m)

export const STATUS_COPY: Record<string, { label: string; subject: string; lines: string[]; cta?: string }> = {
  under_review: {
    label: 'Under review',
    subject: 'Your application is now under review',
    lines: [
      'Our team has started reviewing your teacher application.',
      'We may call you to discuss your profile. We will keep you updated by email at every step.',
    ],
  },
  shortlisted: {
    label: 'Shortlisted',
    subject: '🎉 Congratulations: You have been shortlisted',
    lines: [
      'Congratulations! You have been shortlisted for the next stage of our teacher selection.',
      'Your teacher account has been created. Your login email and temporary password have been sent to your email address.',
      'Important Security Note: Please reset your temporary password via the "Forgot Password" option on the sign-in page before logging in.',
      'The next step is the yearly registration fee and profile verification, which you can complete directly in your portal.',
    ],
    cta: 'Open Teacher Portal',
  },
  approved: {
    label: 'Approved',
    subject: 'Welcome aboard: your application is approved',
    lines: [
      'Your application has been approved and your teacher profile is now active.',
      'We will email you as soon as a student matching your subject, class and locality is allocated to you.',
    ],
    cta: 'Open your teacher portal',
  },
  rejected: {
    label: 'Not taken forward',
    subject: 'An update on your teacher application',
    lines: [
      'Thank you for the time you invested in applying to teach with us.',
      'After careful review we are unable to take your application forward at this time. You are welcome to reach out to us if you would like to know more.',
    ],
  },
}

export const templates: Record<string, MailTemplate<any>> = {
  teacher_application_received: {
    key: 'teacher_application_received',
    label: 'Application received (thank you)',
    audience: 'teacher',
    build: (d, cfg) => ({
      subject: `Thank you for applying to teach with ${cfg.brandName}`,
      preheader: 'We have received your application and will contact you soon',
      blocks: [
        heading('Thank you for applying'),
        greet(d.name),
        p(`Thank you for your interest in teaching with ${cfg.brandName}. We have received your application and our team will contact you soon.`),
        details([
          ['Application', `#${d.applicationId}`],
          ['Subject', d.subject || ''],
          ['Class level', d.classLevel || ''],
          ['Locality', d.locality || ''],
        ]),
        p('What happens next:'),
        p('1. Our team reviews your profile and calls you to understand your experience.'),
        p('2. If you are shortlisted, we will email you with the next steps.'),
        p('3. After the registration steps are complete, we match you with students in your area.'),
        note('There is nothing you need to do right now. Please keep your phone handy, as we will call you from our team number.'),
      ],
    }),
  },

  teacher_welcome: {
    key: 'teacher_welcome',
    label: 'Shortlisted + teacher login details',
    audience: 'teacher',
    sensitiveKeys: ['password'],
    build: (d, cfg) => {
      const portalUrl = (d.loginUrl || cfg.teacherPortalUrl || '').replace(/\/+$/, '')
      const forgotPasswordUrl = `${portalUrl}/forgot-password`

      return {
        subject: `🎉 Congratulations! You are shortlisted - Your ${cfg.brandName} Teacher Login Details`,
        preheader: `Congratulations! Your login details for ${cfg.brandName} are ready. Please reset your temporary password before signing in.`,
        blocks: [
          heading('🎉 Congratulations, You Are Shortlisted!'),
          greet(d.name),
          p(
            `We are delighted to inform you that your teacher application has been shortlisted for the next stage of teacher selection at ${cfg.brandName}.`,
          ),
          p('Your official Teacher Partner dashboard account has been created. Please find your login credentials below:'),
          details(
            [
              ['Teacher Portal URL', portalUrl],
              ['Registered Login Email', d.email],
              ['Temporary Password', d.password],
              ['Account Role', 'Teacher Partner'],
            ],
            { mono: true },
          ),
          warningBox('Important Security Step: Reset Temporary Password (पासवर्ड रीसेट निर्देश)', [
            '1. The password above is a system-generated TEMPORARY password.',
            '2. For your account security, please RESET your password before logging in for the first time.',
            '3. Click the "Reset Temporary Password (Forgot Password)" button below, enter your registered email (' +
              d.email +
              ') to receive an OTP verification code, set your new permanent password, and then sign in.',
            'यह एक अस्थायी (Temporary) पासवर्ड है। सुरक्षा कारणों से कृपया लॉगिन करने से पहले "Forgot Password" पर क्लिक करके OTP द्वारा अपना नया स्थायी पासवर्ड बनाएं, फिर नए पासवर्ड से लॉगिन करें।',
          ]),
          actionButtons([
            { label: '🔑 Reset Temporary Password (Forgot Password)', url: forgotPasswordUrl, primary: true },
            { label: 'Sign In to Portal', url: portalUrl, primary: false },
          ]),
          p('Next Steps in the Selection Process:'),
          p('1. Click "Reset Temporary Password" and set your own secure password via OTP verification.'),
          p('2. Log in to your Teacher Dashboard to verify your profile details and upload required documents.'),
          p('3. Complete the registration step to begin receiving student home-tuition allocations in your locality.'),
          note(
            `Need assistance? Reply directly to this email or contact our support team at ${cfg.supportEmail || cfg.fromEmail}. We are always happy to help!`,
          ),
        ],
      }
    },
  },

  password_reset_otp: {
    key: 'password_reset_otp',
    label: 'Password reset OTP',
    audience: 'any',
    sensitiveKeys: ['otp'],
    build: (d, cfg) => ({
      subject: `${d.otp} is your ${cfg.brandName} verification code`,
      preheader: 'Use this code to reset your password',
      blocks: [
        heading('Reset your password'),
        greet(d.name),
        p(`Use this one-time code to reset your password. It expires in ${d.expiresInMinutes} minutes.`),
        bigCode(d.otp),
        note('If you did not ask for this, you can ignore this email. Your password will not change. Never share this code with anyone.'),
      ],
    }),
  },

  teacher_status_update: {
    key: 'teacher_status_update',
    label: 'Application status update',
    audience: 'teacher',
    build: (d, cfg) => {
      const copy = STATUS_COPY[d.status] || {
        label: d.statusLabel || d.status,
        subject: 'An update on your application',
        lines: ['The status of your application has changed.'],
      }
      return {
        subject: copy.subject,
        preheader: `Status: ${copy.label}`,
        blocks: [
          heading(`Application ${copy.label.toLowerCase()}`),
          greet(d.name),
          ...copy.lines.map((l) => p(l)),
          details([['Application', `#${d.applicationId}`], ['Status', copy.label]]),
          // Only offer the portal when the teacher already has a login.
          ...(copy.cta && d.hasPortal ? [button(copy.cta, cfg.teacherPortalUrl)] : []),
        ],
      }
    },
  },

  teacher_payment_due: {
    key: 'teacher_payment_due',
    label: 'Registration payment due',
    audience: 'teacher',
    build: (d, cfg) => ({
      subject: `Action needed: pay your ${inr(d.amount)} registration fee`,
      preheader: 'One more step to complete your registration',
      blocks: [
        heading('Complete your registration'),
        greet(d.name),
        p(`To move your application towards approval, please pay the registration fee of ${inr(d.amount)}. Registration is valid for one year and is renewed every year.`),
        details(
          [
            ['Amount', inr(d.amount)],
            ...(!d.online && d.upiId ? ([['Pay to UPI ID', d.upiId], ['Payee', d.payeeName || cfg.brandName]] as Array<[string, string]>) : []),
          ],
          { mono: true },
        ),
        ...(d.online
          ? [p('You can pay securely online with UPI, card or net banking. Your status updates automatically as soon as the payment is complete.')]
          : d.upiId
            ? [p('After paying, open your portal and enter the transaction / UTR reference so we can verify it.')]
            : [p('Our team will share the payment details with you shortly.')]),
        button(d.online ? 'Pay now' : 'Open payment page', cfg.teacherPortalUrl),
      ],
    }),
  },

  teacher_payment_received: {
    key: 'teacher_payment_received',
    label: 'Registration payment received',
    audience: 'teacher',
    build: (d, cfg) => ({
      subject: d.waived
        ? 'Your registration fee has been waived'
        : d.renewal
          ? `Registration renewed until ${fmtDate(d.validUntil)}`
          : `Payment received: registration valid until ${fmtDate(d.validUntil)}`,
      preheader: d.waived ? 'No payment is due' : `Thank you. Your registration is valid until ${fmtDate(d.validUntil)}`,
      blocks: [
        heading(d.waived ? 'Registration fee waived' : d.renewal ? 'Registration renewed' : 'Payment received'),
        greet(d.name),
        p(
          d.waived
            ? 'The registration fee has been waived for your application, so no payment is due.'
            : d.renewal
              ? `Thank you. We have received your payment of ${inr(d.amount)} and renewed your registration for another year.`
              : `Thank you. We have received your registration payment of ${inr(d.amount)}.`,
        ),
        ...(d.waived
          ? []
          : [
              details(
                [
                  ['Amount paid', inr(d.amount)],
                  ['Paid on', fmtDateTime(d.paidAt)],
                  ...(d.reference ? ([['Payment ID', d.reference]] as Array<[string, string]>) : []),
                  ...(d.method ? ([['Method', methodLabel(d.method)]] as Array<[string, string]>) : []),
                ],
                { mono: false },
              ),
            ]),
        ...(d.validUntil
          ? [
              details([
                ['Registration valid from', fmtDate(d.paidAt)],
                ['Registration valid until', fmtDate(d.validUntil)],
              ]),
              p(`Registration is renewed every year. Your next renewal is due by ${fmtDate(d.validUntil)}, and we will remind you before then.`),
            ]
          : []),
        ...(d.renewal ? [] : [p('Our team will complete the final approval and let you know.')]),
        button('Open your portal', cfg.teacherPortalUrl),
      ],
    }),
  },

  teacher_registration_expiry: {
    key: 'teacher_registration_expiry',
    label: 'Registration expiry reminder',
    audience: 'teacher',
    build: (d, cfg) => ({
      subject: d.expired
        ? 'Your teacher registration has expired'
        : `Your teacher registration expires in ${d.daysLeft} day${d.daysLeft === 1 ? '' : 's'}`,
      preheader: d.expired ? 'Renew to keep receiving students' : 'Renew on time to avoid a break',
      blocks: [
        heading(d.expired ? 'Registration expired' : 'Registration expiring soon'),
        greet(d.name),
        p(
          d.expired
            ? `Your yearly registration with ${cfg.brandName} expired on ${fmtDate(d.expiresAt)}. Please renew it now to keep your registration active. Renewal is required every year, including while you are teaching.`
            : `Your yearly registration with ${cfg.brandName} is valid until ${fmtDate(d.expiresAt)}. Please renew before then. Renewal is required every year, including while you are teaching.`,
        ),
        details([['Valid until', fmtDate(d.expiresAt)], ['Renewal fee', inr(d.renewalAmount)]]),
        button('Renew in your portal', cfg.teacherPortalUrl),
      ],
    }),
  },

  teacher_allocated: {
    key: 'teacher_allocated',
    label: 'New student allocated',
    audience: 'teacher',
    build: (d, cfg) => ({
      subject: `New student allocated: ${d.subject} (${d.studentClass})`,
      preheader: 'Please accept or reject in your portal',
      blocks: [
        heading('A new student is allocated to you'),
        greet(d.name),
        p('A student matching your subject, class level and locality has been allocated to you. Please review the details and respond in your portal.'),
        details([
          ['Student', d.studentName],
          ['Class', d.studentClass],
          ['Subject', d.subject],
          ['Locality', d.locality],
          ['Preferred timing', d.timing],
          ...(d.monthlyPayout != null ? ([['Your monthly payout', inr(d.monthlyPayout)]] as Array<[string, string]>) : []),
        ]),
        button('Accept or reject', cfg.teacherPortalUrl),
        note('Please respond promptly so the family can be informed.'),
      ],
    }),
  },

  teacher_monthly_payment: {
    key: 'teacher_monthly_payment',
    label: 'Monthly payout summary',
    audience: 'teacher',
    build: (d, cfg) => ({
      subject: `Your payout summary for ${d.monthLabel}`,
      preheader: `${inr(d.total)} for ${d.lines.length} student${d.lines.length === 1 ? '' : 's'}`,
      blocks: [
        heading(`Payout for ${d.monthLabel}`),
        greet(d.name),
        p(`Here is your teaching payout summary for ${d.monthLabel}.`),
        table(['Student', 'Subject', 'Amount'], d.lines.map((l: any) => [l.student, l.subject, inr(l.amount)])),
        details([['Total payout', inr(d.total)]]),
        p('If something does not look right, reply to this email and our team will help.'),
        button('View fees and history', cfg.teacherPortalUrl),
      ],
    }),
  },

  account_created: {
    key: 'account_created',
    label: 'Account created (staff / user)',
    audience: 'staff',
    build: (d, cfg) => ({
      subject: `Your ${cfg.brandName} account has been created`,
      preheader: 'Sign in to get started',
      blocks: [
        heading(`Welcome to ${cfg.brandName}`),
        greet(d.name),
        p(`An account has been created for you as ${d.roleLabel}.`),
        details([['Login email', d.email], ['Role', d.roleLabel]]),
        p('Ask your administrator for your temporary password, or choose “Forgot password” on the sign-in page to set one with a one-time code.'),
        button('Go to sign in', d.loginUrl || cfg.adminPortalUrl),
      ],
    }),
  },

  account_blocked: {
    key: 'account_blocked',
    label: 'Account blocked',
    audience: 'any',
    build: (d, cfg) => ({
      subject: `Your ${cfg.brandName} account has been blocked`,
      blocks: [
        heading('Account blocked'),
        greet(d.name),
        p(`Your ${cfg.brandName} account (${d.email}) has been blocked, so you can no longer sign in.`),
        p('If you think this is a mistake, please contact the administrator.'),
      ],
    }),
  },

  account_suspended: {
    key: 'account_suspended',
    label: 'Account suspended',
    audience: 'any',
    build: (d, cfg) => ({
      subject: `Your ${cfg.brandName} account has been suspended`,
      blocks: [
        heading('Account suspended'),
        greet(d.name),
        p(`Your ${cfg.brandName} account (${d.email}) has been suspended. You cannot sign in while it is suspended.`),
        p('Please contact the administrator to find out more or to have it reviewed.'),
      ],
    }),
  },

  account_restored: {
    key: 'account_restored',
    label: 'Account restored',
    audience: 'any',
    build: (d, cfg) => ({
      subject: `Your ${cfg.brandName} account is active again`,
      blocks: [
        heading('Account restored'),
        greet(d.name),
        p(`Good news: your account (${d.email}) is active again and you can sign in as usual.`),
        button('Sign in', d.loginUrl || cfg.teacherPortalUrl),
      ],
    }),
  },

  test_email: {
    key: 'test_email',
    label: 'Test email',
    audience: 'staff',
    build: (d, cfg) => ({
      subject: `Test email from ${cfg.brandName}`,
      blocks: [
        heading('Mail is working'),
        p(`This is a test email sent from the ${cfg.brandName} admin panel${d.sentBy ? ` by ${d.sentBy}` : ''}.`),
        details([['SMTP host', d.host || ''], ['From', d.from || '']]),
        p('If you can read this, your SMTP settings are correct.'),
      ],
    }),
  },
}

export type TemplateKey = keyof typeof templates

export function renderTemplate(key: string, data: Record<string, any>, cfg: MailConfig): RenderedMail {
  const tpl = templates[key]
  if (!tpl) throw new Error(`Unknown mail template "${key}".`)
  const { subject, preheader, blocks } = tpl.build(data, cfg)
  const { html, text } = renderLayout(cfg, blocks, { preheader })
  return { subject, html, text }
}

export function listTemplates() {
  return Object.values(templates).map((t) => ({ key: t.key, label: t.label, audience: t.audience, retryable: !t.sensitiveKeys?.length }))
}
