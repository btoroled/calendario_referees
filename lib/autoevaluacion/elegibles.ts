export type DesignacionRefereePropia = {
  partido_id: string
  partido_label: string
  partido_fecha: string
  estado_aceptacion: string
}

export type AutoevaluacionRef = { partido_id: string }

export type PartidoAutoevaluable = {
  partido_id: string
  partido_label: string
  partido_fecha: string
  yaAutoevaluado: boolean
}

export function partidosParaAutoevaluar(input: {
  designaciones: DesignacionRefereePropia[]
  autoevaluaciones: AutoevaluacionRef[]
  hoy: string
}): PartidoAutoevaluable[] {
  const autoevaluados = new Set(input.autoevaluaciones.map((a) => a.partido_id))
  return input.designaciones
    .filter((d) => d.estado_aceptacion === 'aceptado' && d.partido_fecha <= input.hoy)
    .sort((a, b) => (a.partido_fecha < b.partido_fecha ? 1 : a.partido_fecha > b.partido_fecha ? -1 : 0))
    .map((d) => ({
      partido_id: d.partido_id,
      partido_label: d.partido_label,
      partido_fecha: d.partido_fecha,
      yaAutoevaluado: autoevaluados.has(d.partido_id),
    }))
}
