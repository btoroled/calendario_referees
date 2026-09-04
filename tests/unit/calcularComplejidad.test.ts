import { describe, it, expect } from 'vitest'
import { calcularComplejidad } from '@/lib/fixture/calcularComplejidad'

describe('calcularComplejidad', () => {
  it('sin historial directo, cae al valor neutro 5', () => {
    const resultado = calcularComplejidad({ partidosDirectos: [], partidosClubLocal: [], partidosClubVisita: [] })
    expect(resultado).toBe(5)
  })

  it('partidos parejos con muchos incidentes → complejidad alta', () => {
    const partidoParejo = {
      resultado_local: 20,
      resultado_visita: 18,
      tarjetas_amarillas_local: 3,
      tarjetas_amarillas_visita: 3,
      tarjetas_rojas_local: 1,
      tarjetas_rojas_visita: 0,
    }
    const tendenciaAlta = { tarjetas_amarillas: 4, tarjetas_rojas: 1 }
    const resultado = calcularComplejidad({
      partidosDirectos: [partidoParejo, partidoParejo],
      partidosClubLocal: [tendenciaAlta, tendenciaAlta],
      partidosClubVisita: [tendenciaAlta, tendenciaAlta],
    })
    expect(resultado).toBe(10)
  })

  it('goleada sin incidentes → complejidad baja (mínimo 1)', () => {
    const goleada = {
      resultado_local: 45,
      resultado_visita: 5,
      tarjetas_amarillas_local: 0,
      tarjetas_amarillas_visita: 0,
      tarjetas_rojas_local: 0,
      tarjetas_rojas_visita: 0,
    }
    const sinIncidentes = { tarjetas_amarillas: 0, tarjetas_rojas: 0 }
    const resultado = calcularComplejidad({
      partidosDirectos: [goleada, goleada],
      partidosClubLocal: [sinIncidentes],
      partidosClubVisita: [sinIncidentes],
    })
    expect(resultado).toBe(1)
  })

  it('caso intermedio: diferencia de puntos media, sin incidentes', () => {
    const partidoMedio = {
      resultado_local: 25,
      resultado_visita: 10,
      tarjetas_amarillas_local: 0,
      tarjetas_amarillas_visita: 0,
      tarjetas_rojas_local: 0,
      tarjetas_rojas_visita: 0,
    }
    const sinIncidentes = { tarjetas_amarillas: 0, tarjetas_rojas: 0 }
    const resultado = calcularComplejidad({
      partidosDirectos: [partidoMedio],
      partidosClubLocal: [sinIncidentes],
      partidosClubVisita: [sinIncidentes],
    })
    expect(resultado).toBe(2)
  })

  it('el resultado siempre está entre 1 y 10', () => {
    const partidoExtremo = {
      resultado_local: 100,
      resultado_visita: 0,
      tarjetas_amarillas_local: 10,
      tarjetas_amarillas_visita: 10,
      tarjetas_rojas_local: 5,
      tarjetas_rojas_visita: 5,
    }
    const resultado = calcularComplejidad({
      partidosDirectos: [partidoExtremo],
      partidosClubLocal: [],
      partidosClubVisita: [],
    })
    expect(resultado).toBeGreaterThanOrEqual(1)
    expect(resultado).toBeLessThanOrEqual(10)
  })
})
