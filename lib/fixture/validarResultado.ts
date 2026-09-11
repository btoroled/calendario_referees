export type ResultadoInput = {
  resultado_local: string
  resultado_visita: string
  tarjetas_amarillas_local: string
  tarjetas_amarillas_visita: string
  tarjetas_rojas_local: string
  tarjetas_rojas_visita: string
  incidentes: string
}

export type ResultadoNormalizado = {
  resultado_local: number
  resultado_visita: number
  tarjetas_amarillas_local: number
  tarjetas_amarillas_visita: number
  tarjetas_rojas_local: number
  tarjetas_rojas_visita: number
  incidentes: string | null
}

function enteroNoNegativo(texto: string): number | null {
  const t = texto.trim()
  if (t === '') return null
  const n = Number(t)
  if (!Number.isInteger(n) || n < 0) return NaN
  return n
}

export function validarResultado(
  input: ResultadoInput
):
  | { ok: true; valor: ResultadoNormalizado }
  | { ok: false; error: string } {
  const score = (etiqueta: string, texto: string): number | { error: string } => {
    const t = texto.trim()
    if (t === '') return { error: `El resultado ${etiqueta} es requerido.` }
    const n = Number(t)
    if (!Number.isInteger(n) || n < 0) {
      return { error: `El resultado ${etiqueta} debe ser un entero no negativo.` }
    }
    return n
  }

  const local = score('local', input.resultado_local)
  if (typeof local !== 'number') return { ok: false, error: local.error }
  const visita = score('visita', input.resultado_visita)
  if (typeof visita !== 'number') return { ok: false, error: visita.error }

  const tarjetas: Record<string, number> = {}
  const campos: [keyof ResultadoInput, string][] = [
    ['tarjetas_amarillas_local', 'tarjetas amarillas local'],
    ['tarjetas_amarillas_visita', 'tarjetas amarillas visita'],
    ['tarjetas_rojas_local', 'tarjetas rojas local'],
    ['tarjetas_rojas_visita', 'tarjetas rojas visita'],
  ]
  for (const [campo, etiqueta] of campos) {
    const n = enteroNoNegativo(input[campo])
    if (Number.isNaN(n)) {
      return { ok: false, error: `La cantidad de ${etiqueta} debe ser un entero no negativo.` }
    }
    tarjetas[campo] = n ?? 0
  }

  return {
    ok: true,
    valor: {
      resultado_local: local,
      resultado_visita: visita,
      tarjetas_amarillas_local: tarjetas.tarjetas_amarillas_local,
      tarjetas_amarillas_visita: tarjetas.tarjetas_amarillas_visita,
      tarjetas_rojas_local: tarjetas.tarjetas_rojas_local,
      tarjetas_rojas_visita: tarjetas.tarjetas_rojas_visita,
      incidentes: input.incidentes.trim() || null,
    },
  }
}
