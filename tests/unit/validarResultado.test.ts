import { describe, it, expect } from 'vitest'
import { validarResultado } from '@/lib/fixture/validarResultado'

const BASE = {
  resultado_local: '20',
  resultado_visita: '18',
  tarjetas_amarillas_local: '',
  tarjetas_amarillas_visita: '',
  tarjetas_rojas_local: '',
  tarjetas_rojas_visita: '',
  incidentes: '',
}

describe('validarResultado', () => {
  it('acepta un resultado válido con tarjetas vacías (default 0) e incidentes vacío (null)', () => {
    const r = validarResultado(BASE)
    expect(r).toEqual({
      ok: true,
      valor: {
        resultado_local: 20,
        resultado_visita: 18,
        tarjetas_amarillas_local: 0,
        tarjetas_amarillas_visita: 0,
        tarjetas_rojas_local: 0,
        tarjetas_rojas_visita: 0,
        incidentes: null,
      },
    })
  })

  it('conserva incidentes con texto y parsea tarjetas provistas', () => {
    const r = validarResultado({
      ...BASE,
      tarjetas_amarillas_local: '2',
      tarjetas_rojas_visita: '1',
      incidentes: '  Roce entre capitanes  ',
    })
    expect(r).toEqual({
      ok: true,
      valor: {
        resultado_local: 20,
        resultado_visita: 18,
        tarjetas_amarillas_local: 2,
        tarjetas_amarillas_visita: 0,
        tarjetas_rojas_local: 0,
        tarjetas_rojas_visita: 1,
        incidentes: 'Roce entre capitanes',
      },
    })
  })

  it('rechaza score local vacío', () => {
    const r = validarResultado({ ...BASE, resultado_local: '' })
    expect(r).toEqual({ ok: false, error: 'El resultado local es requerido.' })
  })

  it('rechaza score no numérico', () => {
    const r = validarResultado({ ...BASE, resultado_visita: 'diez' })
    expect(r).toEqual({ ok: false, error: 'El resultado visita debe ser un entero no negativo.' })
  })

  it('rechaza score negativo', () => {
    const r = validarResultado({ ...BASE, resultado_local: '-3' })
    expect(r).toEqual({ ok: false, error: 'El resultado local debe ser un entero no negativo.' })
  })

  it('rechaza tarjetas negativas', () => {
    const r = validarResultado({ ...BASE, tarjetas_amarillas_visita: '-1' })
    expect(r).toEqual({
      ok: false,
      error: 'La cantidad de tarjetas amarillas visita debe ser un entero no negativo.',
    })
  })
})
