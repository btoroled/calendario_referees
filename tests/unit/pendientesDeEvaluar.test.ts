import { describe, it, expect } from 'vitest'
import {
  partidosPendientesDeEvaluar,
  refereeTieneEvaluacionesPendientes,
} from '@/lib/evaluacion/pendientes'

const HOY = '2026-09-15'

const D = (over: Partial<Parameters<typeof partidosPendientesDeEvaluar>[0]['designacionesAceptadas'][number]> = {}) => ({
  referee_id: 'r1',
  partido_id: 'p1',
  partido_fecha: '2026-09-01',
  liga_id: 'ligaA',
  ...over,
})

describe('partidosPendientesDeEvaluar', () => {
  it('un partido jugado, aceptado y sin evaluación → pendiente', () => {
    const r = partidosPendientesDeEvaluar({
      designacionesAceptadas: [D()],
      evaluaciones: [],
      hoy: HOY,
    })
    expect(r).toEqual([D()])
  })

  it('con al menos una evaluación de cualquier tipo para ese (referee, partido) → deja de ser pendiente', () => {
    const r = partidosPendientesDeEvaluar({
      designacionesAceptadas: [D()],
      evaluaciones: [{ referee_id: 'r1', partido_id: 'p1' }],
      hoy: HOY,
    })
    expect(r).toEqual([])
  })

  it('partido cuya fecha todavía no pasó → no es pendiente', () => {
    const r = partidosPendientesDeEvaluar({
      designacionesAceptadas: [D({ partido_fecha: '2026-12-01' })],
      evaluaciones: [],
      hoy: HOY,
    })
    expect(r).toEqual([])
  })

  it('una evaluación periódica (partido_id null) no cancela un pendiente concreto', () => {
    const r = partidosPendientesDeEvaluar({
      designacionesAceptadas: [D()],
      evaluaciones: [{ referee_id: 'r1', partido_id: null }],
      hoy: HOY,
    })
    expect(r).toEqual([D()])
  })

  it('la evaluación de otro referee para el mismo partido no cancela el pendiente', () => {
    const r = partidosPendientesDeEvaluar({
      designacionesAceptadas: [D()],
      evaluaciones: [{ referee_id: 'r2', partido_id: 'p1' }],
      hoy: HOY,
    })
    expect(r).toEqual([D()])
  })
})

describe('refereeTieneEvaluacionesPendientes', () => {
  it('true si el referee tiene un pendiente en esa liga', () => {
    const r = refereeTieneEvaluacionesPendientes({
      refereeId: 'r1',
      ligaId: 'ligaA',
      designacionesAceptadas: [D()],
      evaluaciones: [],
      hoy: HOY,
    })
    expect(r).toBe(true)
  })

  it('false si el pendiente es de OTRA liga', () => {
    const r = refereeTieneEvaluacionesPendientes({
      refereeId: 'r1',
      ligaId: 'ligaB',
      designacionesAceptadas: [D({ liga_id: 'ligaA' })],
      evaluaciones: [],
      hoy: HOY,
    })
    expect(r).toBe(false)
  })

  it('false si todos sus partidos jugados ya tienen evaluación', () => {
    const r = refereeTieneEvaluacionesPendientes({
      refereeId: 'r1',
      ligaId: 'ligaA',
      designacionesAceptadas: [D()],
      evaluaciones: [{ referee_id: 'r1', partido_id: 'p1' }],
      hoy: HOY,
    })
    expect(r).toBe(false)
  })
})
