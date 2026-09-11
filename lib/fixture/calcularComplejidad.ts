export type PartidoDirectoHistorico = {
  resultado_local: number
  resultado_visita: number
  tarjetas_amarillas_local: number
  tarjetas_amarillas_visita: number
  tarjetas_rojas_local: number
  tarjetas_rojas_visita: number
}

export type PartidoClubHistorico = {
  tarjetas_amarillas: number
  tarjetas_rojas: number
}

export type InputComplejidad = {
  partidosDirectos: PartidoDirectoHistorico[]
  partidosClubLocal: PartidoClubHistorico[]
  partidosClubVisita: PartidoClubHistorico[]
}

// Constantes de normalización — decisión de esta fase (no del spec), ajustables sin
// tocar la forma de la función. DIFERENCIA_MAXIMA_PUNTOS: diferencia de puntos a partir
// de la cual un partido se considera una goleada total (score de paridad = 0).
// INCIDENTES_MAXIMOS_POR_PARTIDO: suma de tarjetas (amarilla=1, roja=2) a partir de la
// cual un partido/tendencia se considera al máximo de incidentes (score = 10).
const DIFERENCIA_MAXIMA_PUNTOS = 30
const INCIDENTES_MAXIMOS_POR_PARTIDO = 6

function puntajeIncidentesDirecto(p: PartidoDirectoHistorico): number {
  return (
    p.tarjetas_amarillas_local +
    p.tarjetas_amarillas_visita +
    (p.tarjetas_rojas_local + p.tarjetas_rojas_visita) * 2
  )
}

function puntajeIncidentesClub(p: PartidoClubHistorico): number {
  return p.tarjetas_amarillas + p.tarjetas_rojas * 2
}

function promedio(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function calcularComplejidad(input: InputComplejidad): number {
  if (input.partidosDirectos.length === 0) return 5

  const diferenciaPromedio = promedio(
    input.partidosDirectos.map((p) => Math.abs(p.resultado_local - p.resultado_visita))
  )
  const scoreParidad = clamp(10 - (diferenciaPromedio / DIFERENCIA_MAXIMA_PUNTOS) * 10, 0, 10)

  const incidentesPromedioDirectos = promedio(input.partidosDirectos.map(puntajeIncidentesDirecto))
  const scoreIncidentesDirectos = clamp((incidentesPromedioDirectos / INCIDENTES_MAXIMOS_POR_PARTIDO) * 10, 0, 10)

  const incidentesClubLocal = promedio(input.partidosClubLocal.map(puntajeIncidentesClub))
  const incidentesClubVisita = promedio(input.partidosClubVisita.map(puntajeIncidentesClub))
  const scoreTendencia = clamp(
    ((incidentesClubLocal + incidentesClubVisita) / 2 / INCIDENTES_MAXIMOS_POR_PARTIDO) * 10,
    0,
    10
  )

  const puntajeFinal = 0.4 * scoreParidad + 0.3 * scoreIncidentesDirectos + 0.3 * scoreTendencia
  return clamp(Math.round(puntajeFinal), 1, 10)
}
