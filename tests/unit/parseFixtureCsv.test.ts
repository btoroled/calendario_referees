import { describe, it, expect } from 'vitest'
import { parseFixtureCsv } from '@/lib/fixture/parseFixtureCsv'

const ENCABEZADO = 'fecha,hora,cancha,categoria,club_local,club_visita,jornada'

describe('parseFixtureCsv', () => {
  it('parsea una fila válida', () => {
    const csv = `${ENCABEZADO}\n2026-10-10,15:00,Cancha 1,Primera,ALU,LRC,5`
    const resultado = parseFixtureCsv(csv)
    expect(resultado.errores).toEqual([])
    expect(resultado.filas).toEqual([
      { fecha: '2026-10-10', hora: '15:00', cancha: 'Cancha 1', categoria: 'Primera', club_local_codigo: 'ALU', club_visita_codigo: 'LRC', jornada: 5 },
    ])
  })

  it('parsea varias filas válidas', () => {
    const csv = `${ENCABEZADO}\n2026-10-10,15:00,Cancha 1,Primera,ALU,LRC,5\n2026-10-11,12:30,Cancha 2,Intermedia,FLL,UNI,5`
    const resultado = parseFixtureCsv(csv)
    expect(resultado.errores).toEqual([])
    expect(resultado.filas).toHaveLength(2)
  })

  it('tolera variaciones de encabezado (mayúsculas, tildes, espacios)', () => {
    const csv = 'Fecha,Hora,Cancha,Categoría,Club Local,Club Visita,Jornada\n2026-10-10,15:00,Cancha 1,Primera,ALU,LRC,5'
    const resultado = parseFixtureCsv(csv)
    expect(resultado.errores).toEqual([])
    expect(resultado.filas[0].club_local_codigo).toBe('ALU')
  })

  it('rechaza cuando falta una columna requerida', () => {
    const csv = 'fecha,hora,categoria,club_local,club_visita\n2026-10-10,15:00,Primera,ALU,LRC'
    const resultado = parseFixtureCsv(csv)
    expect(resultado.filas).toEqual([])
    expect(resultado.errores).toEqual([{ fila: 0, mensaje: 'Faltan columnas requeridas: cancha' }])
  })

  it('rechaza fecha con formato inválido', () => {
    const csv = `${ENCABEZADO}\n10/10/2026,15:00,Cancha 1,Primera,ALU,LRC,5`
    const resultado = parseFixtureCsv(csv)
    expect(resultado.filas).toEqual([])
    expect(resultado.errores).toEqual([{ fila: 2, mensaje: 'Fecha inválida: "10/10/2026" (formato esperado AAAA-MM-DD)' }])
  })

  it('rechaza hora con formato inválido', () => {
    const csv = `${ENCABEZADO}\n2026-10-10,3pm,Cancha 1,Primera,ALU,LRC,5`
    const resultado = parseFixtureCsv(csv)
    expect(resultado.errores).toEqual([{ fila: 2, mensaje: 'Hora inválida: "3pm" (formato esperado HH:MM)' }])
  })

  it('rechaza cuando club local y visita son el mismo código', () => {
    const csv = `${ENCABEZADO}\n2026-10-10,15:00,Cancha 1,Primera,ALU,ALU,5`
    const resultado = parseFixtureCsv(csv)
    expect(resultado.errores).toEqual([{ fila: 2, mensaje: 'El club local y visita no pueden ser el mismo ("ALU")' }])
  })

  it('rechaza jornada no numérica', () => {
    const csv = `${ENCABEZADO}\n2026-10-10,15:00,Cancha 1,Primera,ALU,LRC,cinco`
    const resultado = parseFixtureCsv(csv)
    expect(resultado.errores).toEqual([{ fila: 2, mensaje: 'Jornada inválida: "cinco"' }])
  })

  it('permite jornada vacía (null)', () => {
    const csv = `${ENCABEZADO}\n2026-10-10,15:00,Cancha 1,Primera,ALU,LRC,`
    const resultado = parseFixtureCsv(csv)
    expect(resultado.errores).toEqual([])
    expect(resultado.filas[0].jornada).toBeNull()
  })

  it('acumula errores de varias filas sin abortar en la primera', () => {
    const csv = `${ENCABEZADO}\n10/10/2026,15:00,Cancha 1,Primera,ALU,LRC,5\n2026-10-11,3pm,Cancha 2,Intermedia,FLL,UNI,5`
    const resultado = parseFixtureCsv(csv)
    expect(resultado.errores).toHaveLength(2)
    expect(resultado.errores[0].fila).toBe(2)
    expect(resultado.errores[1].fila).toBe(3)
  })
})
