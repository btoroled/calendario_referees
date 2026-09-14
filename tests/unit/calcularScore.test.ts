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

describe('calcularScore — pulido (spec §14)', () => {
  it('el mismo referee puede ordenar distinto en normal vs alta complejidad', () => {
    // Referee fuerte en performance, débil en físico.
    const evaluaciones = [
      { tipo: 'performance' as const, valor: 9, fecha: '2026-09-10' },
      { tipo: 'fisico' as const, valor: 3, fecha: '2026-09-10' },
    ]
    const base = { evaluaciones, perteneceAClubDelPartido: false, config: CONFIG, hoy: '2026-09-10' }
    const normal = calcularScore({ ...base, complejidadPartido: 5 })
    const alta = calcularScore({ ...base, complejidadPartido: 9 })
    // En alta complejidad performance pesa más → score más alto para este perfil.
    expect(alta.scoreFinal).toBeGreaterThan(normal.scoreFinal)
    expect(alta.desglose.ajustePorComplejidad).toBe(true)
    expect(normal.desglose.ajustePorComplejidad).toBe(false)
  })

  it('dos referees con evaluaciones espejadas dan scores simétricos (orden determinístico)', () => {
    const a = calcularScore({
      evaluaciones: [{ tipo: 'performance', valor: 8, fecha: '2026-09-10' }],
      perteneceAClubDelPartido: false,
      complejidadPartido: 5,
      config: CONFIG,
      hoy: '2026-09-10',
    })
    const b = calcularScore({
      evaluaciones: [{ tipo: 'performance', valor: 6, fecha: '2026-09-10' }],
      perteneceAClubDelPartido: false,
      complejidadPartido: 5,
      config: CONFIG,
      hoy: '2026-09-10',
    })
    expect(a.scoreFinal).toBeGreaterThan(b.scoreFinal)
  })

  it('una evaluación futura (fecha > hoy) no infla su peso: edad se clampea a 0, no domina el promedio', () => {
    // Dos evaluaciones de 'performance': una futura con valor BAJO y otra de hoy con valor ALTO.
    // diasEntre('2027-01-01', '2026-09-10') = -113 días (fecha futura respecto de hoy).
    // Sin el clamp Math.max(0, edadDias) en calcularScore.ts, la evaluación futura tendría
    // edadDias = -113 → peso = 0.5^(-113/180) ≈ 1.5452, un peso INFLADO (>1) que la haría
    // dominar el promedio pese a su valor bajo:
    //   sin clamp → (2*1.5452 + 8*1) / (1.5452+1) ≈ 4.357
    // Con el clamp, edadDias = max(0, -113) = 0 → peso = 0.5^(0/180) = 1, igual al peso de
    // la evaluación de hoy (edadDias=0 → peso=1 también). Promedio simple, sin dominancia:
    //   valorPorTipo.performance = (2*1 + 8*1) / (1+1) = 10/2 = 5
    const r = calcularScore({
      evaluaciones: [
        { tipo: 'performance', valor: 2, fecha: '2027-01-01' }, // futura, valor bajo
        { tipo: 'performance', valor: 8, fecha: '2026-09-10' }, // hoy, valor alto
      ],
      perteneceAClubDelPartido: false,
      complejidadPartido: 5,
      config: CONFIG,
      hoy: '2026-09-10',
    })
    expect(r.desglose.valorPorTipo.performance).toBeCloseTo(5, 5)
    expect(r.scoreFinal).toBe(5)
  })

  it('config con semividaDias muy corta hace que solo pese la evaluación más reciente', () => {
    const r = calcularScore({
      evaluaciones: [
        { tipo: 'performance', valor: 10, fecha: '2026-09-10' },
        { tipo: 'performance', valor: 0, fecha: '2026-06-10' }, // 92 días
      ],
      perteneceAClubDelPartido: false,
      complejidadPartido: 5,
      config: { ...CONFIG, semividaDias: 1 },
      hoy: '2026-09-10',
    })
    expect(r.desglose.valorPorTipo.performance).toBeGreaterThan(9.9)
  })
})
