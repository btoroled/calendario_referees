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
  const configurado = process.env.EMAIL_TRANSPORT

  if (configurado === 'resend') {
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.EMAIL_FROM
    if (!apiKey || !from) {
      throw new Error('EMAIL_TRANSPORT=resend requiere RESEND_API_KEY y EMAIL_FROM.')
    }
    return new ResendTransport(apiKey, from)
  }

  // En producción, caer al transporte de log significa que NADIE recibe los correos de
  // designación/rechazo/vencimiento y nada falla ruidosamente. No lanzamos (el envío es
  // best-effort y no debe tumbar la designación), pero sí dejamos una línea ruidosa.
  if (process.env.NODE_ENV === 'production' && configurado !== 'log') {
    console.warn(
      `[email] EMAIL_TRANSPORT=${configurado ? JSON.stringify(configurado) : '(sin definir)'} en producción: ` +
        'no hay transporte real configurado, los correos SOLO se escriben al log y ningún destinatario los recibe. ' +
        'Definí EMAIL_TRANSPORT=resend (con RESEND_API_KEY y EMAIL_FROM) o EMAIL_TRANSPORT=log para silenciar este aviso.'
    )
  }

  return new LogTransport()
}
