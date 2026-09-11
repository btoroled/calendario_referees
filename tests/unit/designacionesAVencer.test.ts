import { describe, it, expect } from 'vitest'
import { designacionesAVencer } from '@/lib/designacion/vencimiento'

describe('designacionesAVencer', () => {
  const ahora = '2026-10-10T12:00:00.000Z'

  it('marca las que llevan más de 48 h desde la confirmación', () => {
    const ids = designacionesAVencer({
      pendientes: [
        { id: 'vieja', fecha_confirmacion: '2026-10-08T11:00:00.000Z' }, // 49 h
        { id: 'justo', fecha_confirmacion: '2026-10-08T12:00:01.000Z' }, // 47:59:59
        { id: 'reciente', fecha_confirmacion: '2026-10-10T09:00:00.000Z' }, // 3 h
      ],
      ahora,
    })
    expect(ids).toEqual(['vieja'])
  })

  it('exactamente 48 h no vence todavía (el límite es estricto)', () => {
    const ids = designacionesAVencer({
      pendientes: [{ id: 'x', fecha_confirmacion: '2026-10-08T12:00:00.000Z' }],
      ahora,
    })
    expect(ids).toEqual([])
  })

  it('ignora las que no tienen fecha_confirmacion', () => {
    const ids = designacionesAVencer({
      pendientes: [{ id: 'sinfecha', fecha_confirmacion: null }],
      ahora,
    })
    expect(ids).toEqual([])
  })

  it('respeta un horasLimite personalizado', () => {
    const ids = designacionesAVencer({
      pendientes: [{ id: 'a', fecha_confirmacion: '2026-10-10T09:00:00.000Z' }], // 3 h
      ahora,
      horasLimite: 2,
    })
    expect(ids).toEqual(['a'])
  })
})
