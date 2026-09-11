export type DesignacionAceptada = {
  referee_id: string
  partido_id: string
  partido_fecha: string
  liga_id: string
}

export type EvaluacionRef = { referee_id: string; partido_id: string | null }

function clave(refereeId: string, partidoId: string): string {
  return `${refereeId}|${partidoId}`
}

export function partidosPendientesDeEvaluar(input: {
  designacionesAceptadas: DesignacionAceptada[]
  evaluaciones: EvaluacionRef[]
  hoy: string
}): DesignacionAceptada[] {
  const evaluados = new Set(
    input.evaluaciones
      .filter((e): e is { referee_id: string; partido_id: string } => e.partido_id !== null)
      .map((e) => clave(e.referee_id, e.partido_id))
  )
  return input.designacionesAceptadas.filter(
    (d) => d.partido_fecha <= input.hoy && !evaluados.has(clave(d.referee_id, d.partido_id))
  )
}

export function refereeTieneEvaluacionesPendientes(input: {
  refereeId: string
  ligaId: string
  designacionesAceptadas: DesignacionAceptada[]
  evaluaciones: EvaluacionRef[]
  hoy: string
}): boolean {
  const pendientes = partidosPendientesDeEvaluar({
    designacionesAceptadas: input.designacionesAceptadas,
    evaluaciones: input.evaluaciones,
    hoy: input.hoy,
  })
  return pendientes.some((d) => d.referee_id === input.refereeId && d.liga_id === input.ligaId)
}
