import type { MensajeEmail } from './tipos'

export function emailNuevaDesignacion(p: {
  refereeEmail: string
  partidoLabel: string
  fechaPartido: string
  urlMisDesignaciones: string
}): MensajeEmail {
  return {
    to: p.refereeEmail,
    subject: `Nueva designación: ${p.partidoLabel}`,
    body:
      `Tenés una nueva designación para el partido ${p.partidoLabel} (${p.fechaPartido}).\n\n` +
      `Ingresá a "Mis designaciones" para aceptarla o rechazarla dentro de las próximas 48 horas:\n` +
      `${p.urlMisDesignaciones}\n`,
  }
}

export function emailRechazo(p: {
  designadorEmail: string
  refereeNombre: string
  partidoLabel: string
}): MensajeEmail {
  return {
    to: p.designadorEmail,
    subject: `Designación rechazada: ${p.partidoLabel}`,
    body:
      `${p.refereeNombre} rechazó la designación para el partido ${p.partidoLabel}.\n` +
      `El partido quedó marcado como "requiere atención".\n`,
  }
}

export function emailVencimiento(p: {
  designadorEmail: string
  refereeNombre: string
  partidoLabel: string
}): MensajeEmail {
  return {
    to: p.designadorEmail,
    subject: `Designación vencida (48 h sin respuesta): ${p.partidoLabel}`,
    body:
      `${p.refereeNombre} no respondió la designación para el partido ${p.partidoLabel} ` +
      `dentro de las 48 horas. La designación quedó "vencida" y el partido "requiere atención".\n`,
  }
}
