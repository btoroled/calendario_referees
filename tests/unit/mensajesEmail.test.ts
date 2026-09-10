import { describe, it, expect } from 'vitest'
import { emailNuevaDesignacion, emailRechazo, emailVencimiento } from '@/lib/email/mensajes'

describe('plantillas de email', () => {
  it('emailNuevaDesignacion va al referee y linkea a Mis designaciones', () => {
    const m = emailNuevaDesignacion({
      refereeEmail: 'ref@x.com',
      partidoLabel: 'Alumni vs Lima RC',
      fechaPartido: '2026-10-20 15:00',
      urlMisDesignaciones: 'https://app.test/mis-designaciones',
    })
    expect(m.to).toBe('ref@x.com')
    expect(m.subject).toContain('designación')
    expect(m.body).toContain('Alumni vs Lima RC')
    expect(m.body).toContain('2026-10-20 15:00')
    expect(m.body).toContain('https://app.test/mis-designaciones')
  })

  it('emailRechazo va al designador y nombra al referee y el partido', () => {
    const m = emailRechazo({ designadorEmail: 'des@x.com', refereeNombre: 'Juan Perez', partidoLabel: 'A vs B' })
    expect(m.to).toBe('des@x.com')
    expect(m.subject.toLowerCase()).toContain('rechaz')
    expect(m.body).toContain('Juan Perez')
    expect(m.body).toContain('A vs B')
  })

  it('emailVencimiento va al designador y menciona las 48 horas', () => {
    const m = emailVencimiento({ designadorEmail: 'des@x.com', refereeNombre: 'Juan Perez', partidoLabel: 'A vs B' })
    expect(m.to).toBe('des@x.com')
    expect(m.subject.toLowerCase()).toContain('venc')
    expect(m.body).toContain('48')
    expect(m.body).toContain('Juan Perez')
  })
})
