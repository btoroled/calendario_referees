import { describe, it, expect } from 'vitest'
import { calcularScore } from '@/lib/scoring/calcularScore'
import type { ConfigScoring } from '@/lib/scoring/tipos'

const CONFIG: ConfigScoring = {
  pesosNormal: { performance: 0.4, fisico: 0.2, videoanalisis: 0.2, coaching: 0.2 },
  pesosAltaComplejidad: { performance: 0.5, fisico: 0.1, videoanalisis: 0.15, coaching: 0.25 },
  umbralComplejidadAlta: 7,
  factorPenalizacionClub: 0.8,
  semividaDias: 180,
  scoreSinEvaluaciones: 5,
}

describe('calcularScore', () => {
  it('sin evaluaciones, devuelve el score base neutro configurado', () => {
    const r = calcularScore({
      evaluaciones: [],
      perteneceAClubDelPartido: false,
      complejidadPartido: 5,
      config: CONFIG,
      hoy: '2026-09-10',
    })
    expect(r.scoreFinal).toBe(5)
    expect(r.desglose.tiposExcluidos).toEqual(['performance', 'fisico', 'videoanalisis', 'coaching'])
    expect(r.desglose.scoreBase).toBe(5)
  })

  it('una sola evaluación de hoy: el score base es ese valor, pesos renormalizados a 1', () => {
    const r = calcularScore({
      evaluaciones: [{ tipo: 'performance', valor: 8, fecha: '2026-09-10' }],
      perteneceAClubDelPartido: false,
      complejidadPartido: 5,
      config: CONFIG,
      hoy: '2026-09-10',
    })
    expect(r.scoreFinal).toBe(8)
    expect(r.desglose.pesosUsados.performance).toBe(1)
    expect(r.desglose.tiposExcluidos).toEqual(['fisico', 'videoanalisis', 'coaching'])
    expect(r.desglose.ajustePorComplejidad).toBe(false)
  })

  it('dos tipos presentes: promedio ponderado por los pesos renormalizados', () => {
    // performance=8 (peso normal 0.4), fisico=6 (peso normal 0.2) → renorm: 0.4/0.6, 0.2/0.6
    // score = 8*(0.6667) + 6*(0.3333) = 5.333 + 2.0 = 7.333 → 7.3
    const r = calcularScore({
      evaluaciones: [
        { tipo: 'performance', valor: 8, fecha: '2026-09-10' },
        { tipo: 'fisico', valor: 6, fecha: '2026-09-10' },
      ],
      perteneceAClubDelPartido: false,
      complejidadPartido: 5,
      config: CONFIG,
      hoy: '2026-09-10',
    })
    expect(r.scoreFinal).toBe(7.3)
  })

  it('decaimiento: una evaluación de hace una semivida pesa la mitad que una reciente', () => {
    // performance: valor 10 hoy, valor 4 hace 180 días (semivida) → decay 1.0 y 0.5
    // valorTipo = (10*1.0 + 4*0.5) / (1.0 + 0.5) = 12 / 1.5 = 8.0
    const r = calcularScore({
      evaluaciones: [
        { tipo: 'performance', valor: 10, fecha: '2026-09-10' },
        { tipo: 'performance', valor: 4, fecha: '2026-03-14' }, // 180 días antes
      ],
      perteneceAClubDelPartido: false,
      complejidadPartido: 5,
      config: CONFIG,
      hoy: '2026-09-10',
    })
    expect(r.desglose.valorPorTipo.performance).toBeCloseTo(8.0, 5)
    expect(r.scoreFinal).toBe(8)
  })

  it('complejidad por encima del umbral: usa el set de pesos de alta complejidad', () => {
    // performance=9, coaching=5. Pesos alta: perf 0.5, coaching 0.25 → renorm 0.6667 / 0.3333
    // score = 9*0.6667 + 5*0.3333 = 6.0 + 1.667 = 7.667 → 7.7
    const r = calcularScore({
      evaluaciones: [
        { tipo: 'performance', valor: 9, fecha: '2026-09-10' },
        { tipo: 'coaching', valor: 5, fecha: '2026-09-10' },
      ],
      perteneceAClubDelPartido: false,
      complejidadPartido: 8,
      config: CONFIG,
      hoy: '2026-09-10',
    })
    expect(r.desglose.ajustePorComplejidad).toBe(true)
    expect(r.scoreFinal).toBe(7.7)
  })

  it('penalización por club: multiplica el score base por el factor configurado', () => {
    // score base 8 (una perf de hoy) * 0.8 = 6.4
    const r = calcularScore({
      evaluaciones: [{ tipo: 'performance', valor: 8, fecha: '2026-09-10' }],
      perteneceAClubDelPartido: true,
      complejidadPartido: 5,
      config: CONFIG,
      hoy: '2026-09-10',
    })
    expect(r.desglose.scoreBase).toBe(8)
    expect(r.desglose.penalizacionClub).toBe(true)
    expect(r.scoreFinal).toBe(6.4)
  })

  it('el score final siempre queda entre 0 y 10 y redondeado a 1 decimal', () => {
    const r = calcularScore({
      evaluaciones: [
        { tipo: 'performance', valor: 10, fecha: '2026-09-10' },
        { tipo: 'fisico', valor: 10, fecha: '2026-09-10' },
        { tipo: 'videoanalisis', valor: 10, fecha: '2026-09-10' },
        { tipo: 'coaching', valor: 10, fecha: '2026-09-10' },
      ],
      perteneceAClubDelPartido: false,
      complejidadPartido: 5,
      config: CONFIG,
      hoy: '2026-09-10',
    })
    expect(r.scoreFinal).toBe(10)
    expect(Number.isInteger(r.scoreFinal * 10)).toBe(true)
  })
})
