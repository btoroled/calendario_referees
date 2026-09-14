import { describe, it, expect } from 'vitest'
import { matchResultados } from '@/lib/fixture/matchResultados'
import type { FilaHistorico } from '@/lib/fixture/parseHistoricoCsv'

function fila(over: Partial<FilaHistorico> = {}): FilaHistorico {
  return {
    fecha: '2026-09-01',
    hora: '15:00',
    categoria: 'Regional',
    club_local_codigo: 'ALU',
    club_visita_codigo: 'LRC',
    resultado_local: 25,
    resultado_visita: 18,
    tarjetas_amarillas_local: 2,
    tarjetas_amarillas_visita: 1,
    tarjetas_rojas_local: 0,
    tarjetas_rojas_visita: 0,
    incidentes: 'Roce',
    ...over,
  }
}

const PARTIDOS = [
  { id: 'p1', fecha: '2026-09-01', club_local_codigo: 'ALU', club_visita_codigo: 'LRC', es_historico: false },
  { id: 'p2', fecha: '2026-09-08', club_local_codigo: 'BLU', club_visita_codigo: 'NAV', es_historico: false },
  { id: 'ph', fecha: '2025-04-05', club_local_codigo: 'ALU', club_visita_codigo: 'LRC', es_historico: true },
]

describe('matchResultados', () => {
  it('matchea por (fecha, club_local, club_visita) y arma el update', () => {
    const r = matchResultados({ filas: [fila()], partidos: PARTIDOS })
    expect(r).toEqual([
      {
        fila: 2,
        match: {
          partidoId: 'p1',
          update: {
            resultado_local: 25,
            resultado_visita: 18,
            tarjetas_amarillas_local: 2,
            tarjetas_amarillas_visita: 1,
            tarjetas_rojas_local: 0,
            tarjetas_rojas_visita: 0,
            incidentes: 'Roce',
          },
        },
      },
    ])
  })

  it('reporta error si no hay partido del fixture que matchee', () => {
    const r = matchResultados({ filas: [fila({ fecha: '2026-12-25' })], partidos: PARTIDOS })
    expect(r).toEqual([{ fila: 2, error: 'No hay partido del fixture para 2026-12-25 ALU vs LRC.' }])
  })

  it('no matchea contra un partido histórico', () => {
    const r = matchResultados({ filas: [fila({ fecha: '2025-04-05' })], partidos: PARTIDOS })
    expect(r).toEqual([{ fila: 2, error: 'No hay partido del fixture para 2025-04-05 ALU vs LRC.' }])
  })

  it('numera las filas empezando en 2 (fila 1 = encabezado del CSV)', () => {
    const r = matchResultados({
      filas: [fila(), fila({ fecha: '2026-09-08', club_local_codigo: 'BLU', club_visita_codigo: 'NAV' })],
      partidos: PARTIDOS,
    })
    expect(r.map((x) => x.fila)).toEqual([2, 3])
    expect('match' in r[1] && r[1].match.partidoId).toBe('p2')
  })
})
