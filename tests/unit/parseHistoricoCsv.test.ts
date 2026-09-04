import { describe, it, expect } from 'vitest'
import { parseHistoricoCsv } from '@/lib/fixture/parseHistoricoCsv'

const ENCABEZADO =
  'fecha,hora,categoria,club_local,club_visita,resultado_local,resultado_visita,tarjetas_amarillas_local,tarjetas_amarillas_visita,tarjetas_rojas_local,tarjetas_rojas_visita,incidentes'

describe('parseHistoricoCsv', () => {
  it('parsea una fila válida completa', () => {
    const csv = `${ENCABEZADO}\n2025-05-10,15:00,Primera,ALU,LRC,25,18,2,3,0,1,Suspensión por 10 minutos`
    const resultado = parseHistoricoCsv(csv)
    expect(resultado.errores).toEqual([])
    expect(resultado.filas).toEqual([
      {
        fecha: '2025-05-10',
        hora: '15:00',
        categoria: 'Primera',
        club_local_codigo: 'ALU',
        club_visita_codigo: 'LRC',
        resultado_local: 25,
        resultado_visita: 18,
        tarjetas_amarillas_local: 2,
        tarjetas_amarillas_visita: 3,
        tarjetas_rojas_local: 0,
        tarjetas_rojas_visita: 1,
        incidentes: 'Suspensión por 10 minutos',
      },
    ])
  })

  it('permite hora, tarjetas e incidentes vacíos (defaults)', () => {
    const csv = `${ENCABEZADO}\n2025-05-10,,Primera,ALU,LRC,25,18,,,,,`
    const resultado = parseHistoricoCsv(csv)
    expect(resultado.errores).toEqual([])
    expect(resultado.filas[0]).toEqual({
      fecha: '2025-05-10',
      hora: null,
      categoria: 'Primera',
      club_local_codigo: 'ALU',
      club_visita_codigo: 'LRC',
      resultado_local: 25,
      resultado_visita: 18,
      tarjetas_amarillas_local: 0,
      tarjetas_amarillas_visita: 0,
      tarjetas_rojas_local: 0,
      tarjetas_rojas_visita: 0,
      incidentes: null,
    })
  })

  it('rechaza cuando falta una columna requerida', () => {
    const csv = 'fecha,categoria,club_local,club_visita,resultado_local\n2025-05-10,Primera,ALU,LRC,25'
    const resultado = parseHistoricoCsv(csv)
    expect(resultado.filas).toEqual([])
    expect(resultado.errores).toEqual([{ fila: 0, mensaje: 'Faltan columnas requeridas: resultado_visita' }])
  })

  it('rechaza resultado no numérico', () => {
    const csv = `${ENCABEZADO}\n2025-05-10,15:00,Primera,ALU,LRC,veinte,18,,,,,`
    const resultado = parseHistoricoCsv(csv)
    expect(resultado.errores).toEqual([{ fila: 2, mensaje: 'Resultado local inválido: "veinte"' }])
  })

  it('rechaza resultado negativo', () => {
    const csv = `${ENCABEZADO}\n2025-05-10,15:00,Primera,ALU,LRC,-5,18,,,,,`
    const resultado = parseHistoricoCsv(csv)
    expect(resultado.errores).toEqual([{ fila: 2, mensaje: 'Resultado local inválido: "-5"' }])
  })

  it('rechaza cuando club local y visita son el mismo código', () => {
    const csv = `${ENCABEZADO}\n2025-05-10,15:00,Primera,ALU,ALU,25,18,,,,,`
    const resultado = parseHistoricoCsv(csv)
    expect(resultado.errores).toEqual([{ fila: 2, mensaje: 'El club local y visita no pueden ser el mismo ("ALU")' }])
  })
})
