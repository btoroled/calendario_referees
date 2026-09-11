import type { FilaHistorico } from './parseHistoricoCsv'

export type PartidoExistente = {
  id: string
  fecha: string
  club_local_codigo: string
  club_visita_codigo: string
  es_historico: boolean
}

export type MatchResultado =
  | { fila: number; match: { partidoId: string; update: Record<string, number | string | null> } }
  | { fila: number; error: string }

export function matchResultados(input: {
  filas: FilaHistorico[]
  partidos: PartidoExistente[]
}): MatchResultado[] {
  const indice = new Map<string, PartidoExistente>()
  for (const p of input.partidos) {
    if (p.es_historico) continue
    indice.set(`${p.fecha}|${p.club_local_codigo}|${p.club_visita_codigo}`, p)
  }

  return input.filas.map((f, i) => {
    const numeroFila = i + 2
    const clave = `${f.fecha}|${f.club_local_codigo}|${f.club_visita_codigo}`
    const partido = indice.get(clave)
    if (!partido) {
      return {
        fila: numeroFila,
        error: `No hay partido del fixture para ${f.fecha} ${f.club_local_codigo} vs ${f.club_visita_codigo}.`,
      }
    }
    return {
      fila: numeroFila,
      match: {
        partidoId: partido.id,
        update: {
          resultado_local: f.resultado_local,
          resultado_visita: f.resultado_visita,
          tarjetas_amarillas_local: f.tarjetas_amarillas_local,
          tarjetas_amarillas_visita: f.tarjetas_amarillas_visita,
          tarjetas_rojas_local: f.tarjetas_rojas_local,
          tarjetas_rojas_visita: f.tarjetas_rojas_visita,
          incidentes: f.incidentes,
        },
      },
    }
  })
}
