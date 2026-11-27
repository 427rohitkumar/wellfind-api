import type { MailConfig } from '@/lib/mail/config'

export const esc = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export interface Block {
  html: string
  text: string
}

export const p = (text: string): Block => ({
  html: `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#344054;">${esc(text)}</p>`,
  text,
})

export const heading = (text: string): Block => ({
  html: `<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#101D36;">${esc(text)}</h1>`,
  text: text.toUpperCase(),
})

export const note = (text: string): Block => ({
  html: `<p style="margin:0 0 16px;padding:12px 14px;font-size:13px;line-height:1.55;color:#53647D;background:#F4F8FC;border-left:3px solid #35D0BA;border-radius:6px;">${esc(text)}</p>`,
  text,
})

export const button = (label: string, url: string): Block => ({
  html: `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 22px;"><tr><td style="border-radius:10px;background:#35D0BA;"><a href="${esc(url)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#101D36;text-decoration:none;border-radius:10px;">${esc(label)}</a></td></tr></table>`,
  text: `${label}: ${url}`,
})

export const warningBox = (title: string, lines: string[] | string): Block => {
  const lineArray = Array.isArray(lines) ? lines : [lines]
  return {
    html: `<div style="margin:16px 0 22px;padding:16px 18px;background:#FFFBEB;border:1.5px solid #FCD34D;border-left:5px solid #F59E0B;border-radius:8px;">
      <div style="font-size:14px;font-weight:700;color:#92400E;margin-bottom:8px;">⚠️ ${esc(title)}</div>
      ${lineArray.map((l) => `<p style="margin:0 0 6px;font-size:13px;line-height:1.55;color:#78350F;">${esc(l)}</p>`).join('')}
    </div>`,
    text: `[IMPORTANT WARNING]\n${title}\n${lineArray.join('\n')}`,
  }
}

export const actionButtons = (buttons: Array<{ label: string; url: string; primary?: boolean }>): Block => ({
  html: `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:14px 0 22px;">
    <tr>
      ${buttons
        .map((b) => {
          const bg = b.primary ? '#35D0BA' : '#101D36'
          const fg = b.primary ? '#101D36' : '#FFFFFF'
          return `<td style="border-radius:10px;background:${bg};padding:0;margin-right:12px;display:inline-block;">
            <a href="${esc(b.url)}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:700;color:${fg};text-decoration:none;border-radius:10px;">${esc(b.label)}</a>
          </td>`
        })
        .join('<td style="width:12px;display:inline-block;"></td>')}
    </tr>
  </table>`,
  text: buttons.map((b) => `${b.label}: ${b.url}`).join('\n'),
})

/** Key/value rows, e.g. credentials or allocation details. */
export const details = (rows: Array<[string, string]>, opts: { mono?: boolean } = {}): Block => ({
  html: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;border:1px solid #D7E2EE;border-radius:10px;border-collapse:separate;">${rows
    .map(
      ([k, v], i) =>
        `<tr><td style="padding:10px 14px;font-size:13px;color:#53647D;width:38%;${i ? 'border-top:1px solid #E6EDF5;' : ''}">${esc(k)}</td><td style="padding:10px 14px;font-size:14px;font-weight:600;color:#101D36;${opts.mono ? 'font-family:Consolas,Menlo,monospace;' : ''}${i ? 'border-top:1px solid #E6EDF5;' : ''}">${esc(v)}</td></tr>`,
    )
    .join('')}</table>`,
  text: rows.map(([k, v]) => `${k}: ${v}`).join('\n'),
})

export const bigCode = (code: string): Block => ({
  html: `<p style="margin:6px 0 22px;text-align:center;font-size:34px;letter-spacing:10px;font-weight:800;color:#101D36;background:#F4F8FC;border:1px dashed #B8CCE0;border-radius:12px;padding:16px 0;font-family:Consolas,Menlo,monospace;">${esc(code)}</p>`,
  text: `Your code: ${code}`,
})

export const table = (head: string[], rows: string[][]): Block => ({
  html: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;border:1px solid #D7E2EE;border-radius:10px;border-collapse:separate;"><tr>${head
    .map((h) => `<th align="left" style="padding:10px 14px;font-size:12px;color:#53647D;background:#F4F8FC;">${esc(h)}</th>`)
    .join('')}</tr>${rows
    .map(
      (r) =>
        `<tr>${r.map((c) => `<td style="padding:10px 14px;font-size:14px;color:#101D36;border-top:1px solid #E6EDF5;">${esc(c)}</td>`).join('')}</tr>`,
    )
    .join('')}</table>`,
  text: [head.join(' | '), ...rows.map((r) => r.join(' | '))].join('\n'),
})

/** Wraps blocks in the branded shell and returns html + plain-text bodies. */
export function renderLayout(
  cfg: MailConfig,
  blocks: Block[],
  opts: { preheader?: string } = {},
): { html: string; text: string } {
  const support = cfg.supportEmail
    ? `Questions? Reply to this email or write to ${esc(cfg.supportEmail)}.`
    : 'Questions? Reply to this email.'
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(cfg.brandName)}</title></head>
<body style="margin:0;padding:0;background:#EAF0F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(opts.preheader || '')}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#EAF0F8;padding:28px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;">
<tr><td style="background:#101D36;border-radius:14px 14px 0 0;padding:22px 28px;"><span style="font-size:19px;font-weight:800;color:#ffffff;letter-spacing:.2px;">${esc(cfg.brandName)}</span><span style="display:inline-block;width:8px;height:8px;margin-left:8px;border-radius:50%;background:#35D0BA;"></span></td></tr>
<tr><td style="background:#ffffff;padding:30px 28px 10px;">${blocks.map((b) => b.html).join('')}</td></tr>
<tr><td style="background:#ffffff;border-radius:0 0 14px 14px;padding:4px 28px 26px;"><p style="margin:0;padding-top:16px;border-top:1px solid #E6EDF5;font-size:12px;line-height:1.6;color:#8A9EB8;">${support}<br>This is an automated message from ${esc(cfg.brandName)}.</p></td></tr>
</table></td></tr></table></body></html>`
  const text = [...blocks.map((b) => b.text), '', '--', `${cfg.brandName}`, cfg.supportEmail ? `Support: ${cfg.supportEmail}` : '']
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n\n')
  return { html, text }
}
