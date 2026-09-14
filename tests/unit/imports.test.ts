import { describe, it, expect } from 'vitest'
import { parseFixtureCsv } from '@/lib/fixture/parseFixtureCsv'
import { parseHistoricoCsv } from '@/lib/fixture/parseHistoricoCsv'

describe('tolerancia de encabezados — parseFixtureCsv', () => {
  it('acepta encabezados con mayúsculas, acentos y espacios', () => {
    const csv =
      'Fecha,Hora,Cancha,Categoría,Club Local,Club Visita,Jornada\n' +
      '2026-10-20,15:00,Cancha 1,Primera,ALU,LRC,10'
    const r = parseFixtureCsv(csv)
    expect(r.errores).toEqual([])
    expect(r.filas).toHaveLength(1)
    expect(r.filas[0].club_local_codigo).toBe('ALU')
  })

  it('reporta con fila 0 cuando falta una columna requerida', () => {
    const csv = 'fecha,hora,categoria,club_local\n2026-10-20,15:00,Primera,ALU'
    const r = parseFixtureCsv(csv)
    expect(r.filas).toEqual([])
    expect(r.errores[0].fila).toBe(0)
  })

  it('ignora líneas totalmente vacías al final del archivo', () => {
    const csv =
      'fecha,hora,cancha,categoria,club_local,club_visita,jornada\n' +
      '2026-10-20,15:00,C1,Primera,ALU,LRC,10\n\n\n'
    const r = parseFixtureCsv(csv)
    expect(r.errores).toEqual([])
    expect(r.filas).toHaveLength(1)
  })
})

describe('tolerancia de encabezados — parseHistoricoCsv', () => {
  it('acepta encabezados con mayúsculas y acentos', () => {
    const csv =
      'Fecha,Hora,Categoría,Club Local,Club Visita,Resultado Local,Resultado Visita,' +
      'Tarjetas Amarillas Local,Tarjetas Amarillas Visita,Tarjetas Rojas Local,Tarjetas Rojas Visita,Incidentes\n' +
      '2025-05-10,15:00,Primera,ALU,LRC,25,18,2,3,0,1,'
    const r = parseHistoricoCsv(csv)
    expect(r.errores).toEqual([])
    expect(r.filas[0].resultado_local).toBe(25)
    expect(r.filas[0].incidentes).toBeNull()
  })

  it('un BOM al principio del archivo no rompe el primer encabezado', () => {
    const csv =
      '﻿fecha,hora,categoria,club_local,club_visita,resultado_local,resultado_visita,' +
      'tarjetas_amarillas_local,tarjetas_amarillas_visita,tarjetas_rojas_local,tarjetas_rojas_visita,incidentes\n' +
      '2025-05-10,,Primera,ALU,LRC,25,18,,,,,'
    const r = parseHistoricoCsv(csv)
    expect(r.errores).toEqual([])
    expect(r.filas[0].hora).toBeNull()
  })
})
