export type MensajeEmail = { to: string; subject: string; body: string }

export interface EmailTransport {
  send(msg: MensajeEmail): Promise<void>
}
