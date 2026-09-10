import type { EmailTransport, MensajeEmail } from './tipos'

class LogTransport implements EmailTransport {
  async send(msg: MensajeEmail): Promise<void> {
    console.log(`[email:log] to=${msg.to} subject=${JSON.stringify(msg.subject)}\n${msg.body}`)
  }
}

class ResendTransport implements EmailTransport {
  constructor(
    private readonly apiKey: string,
    private readonly from: string
  ) {}

  async send(msg: MensajeEmail): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: this.from, to: msg.to, subject: msg.subject, text: msg.body }),
    })
    if (!res.ok) {
      throw new Error(`Resend respondió ${res.status}: ${await res.text()}`)
    }
  }
}

export function obtenerTransport(): EmailTransport {
  if (process.env.EMAIL_TRANSPORT === 'resend') {
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.EMAIL_FROM
    if (!apiKey || !from) {
      throw new Error('EMAIL_TRANSPORT=resend requiere RESEND_API_KEY y EMAIL_FROM.')
    }
    return new ResendTransport(apiKey, from)
  }
  return new LogTransport()
}
