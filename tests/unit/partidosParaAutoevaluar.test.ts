import { describe, it, expect } from 'vitest'
import { partidosParaAutoevaluar } from '@/lib/autoevaluacion/elegibles'

const HOY = '2026-09-16'

const D = (over: Partial<Parameters<typeof partidosParaAutoevaluar>[0]['designaciones'][number]> = {}) => ({
  partido_id: 'p1',
  partido_label: 'ALU vs LRC',
  partido_fecha: '2026-09-01',
  estado_aceptacion: 'aceptado',
  ...over,
})

describe('partidosParaAutoevaluar', () => {
  it('designación aceptada + partido jugado → elegible, sin autoevaluar', () => {
    const r = partidosParaAutoevaluar({ designaciones: [D()], autoevaluaciones: [], hoy: HOY })
    expect(r).toEqual([
      { partido_id: 'p1', partido_label: 'ALU vs LRC', partido_fecha: '2026-09-01', yaAutoevaluado: false },
    ])
  })

  it('si ya cargó su autoevaluación, sigue elegible pero con yaAutoevaluado = true', () => {
    const r = partidosParaAutoevaluar({
      designaciones: [D()],
      autoevaluaciones: [{ partido_id: 'p1' }],
      hoy: HOY,
    })
    expect(r[0].yaAutoevaluado).toBe(true)
  })

  it('designación no aceptada (pendiente / rechazada / vencida) → no elegible', () => {
    for (const estado of ['pendiente', 'rechazado', 'vencido']) {
      const r = partidosParaAutoevaluar({ designaciones: [D({ estado_aceptacion: estado })], autoevaluaciones: [], hoy: HOY })
      expect(r).toEqual([])
    }
  })

  it('partido futuro → no elegible todavía', () => {
    const r = partidosParaAutoevaluar({
      designaciones: [D({ partido_fecha: '2026-12-01' })],
      autoevaluaciones: [],
      hoy: HOY,
    })
    expect(r).toEqual([])
  })

  it('ordena por fecha descendente (más reciente primero)', () => {
    const r = partidosParaAutoevaluar({
      designaciones: [
        D({ partido_id: 'viejo', partido_fecha: '2026-08-01' }),
        D({ partido_id: 'nuevo', partido_fecha: '2026-09-10' }),
      ],
      autoevaluaciones: [],
      hoy: HOY,
    })
    expect(r.map((x) => x.partido_id)).toEqual(['nuevo', 'viejo'])
  })
})
