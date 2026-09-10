import type {
  ConfigScoring,
  DesgloseScore,
  EvaluacionInput,
  ResultadoScore,
  TipoEvaluacion,
} from './tipos'

const TODOS_LOS_TIPOS: TipoEvaluacion[] = ['performance', 'fisico', 'videoanalisis', 'coaching']

function diasEntre(desde: string, hasta: string): number {
  const ms = new Date(hasta + 'T00:00:00Z').getTime() - new Date(desde + 'T00:00:00Z').getTime()
  return ms / (1000 * 60 * 60 * 24)
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function redondear1(n: number): number {
  return Math.round(n * 10) / 10
}

export function calcularScore(input: {
  evaluaciones: EvaluacionInput[]
  perteneceAClubDelPartido: boolean
  complejidadPartido: number
  config: ConfigScoring
  hoy: string
}): ResultadoScore {
  const { evaluaciones, perteneceAClubDelPartido, complejidadPartido, config, hoy } = input

  const ajustePorComplejidad = complejidadPartido > config.umbralComplejidadAlta
  const pesosConfig = ajustePorComplejidad ? config.pesosAltaComplejidad : config.pesosNormal

  // 1. Promedio ponderado por recencia dentro de cada tipo.
  const valorPorTipo: Partial<Record<TipoEvaluacion, number>> = {}
  for (const tipo of TODOS_LOS_TIPOS) {
    const delTipo = evaluaciones.filter((e) => e.tipo === tipo)
    if (delTipo.length === 0) continue
    let sumaPesada = 0
    let sumaPesos = 0
    for (const e of delTipo) {
      const edadDias = Math.max(0, diasEntre(e.fecha, hoy))
      const peso = Math.pow(0.5, edadDias / config.semividaDias)
      sumaPesada += e.valor * peso
      sumaPesos += peso
    }
    valorPorTipo[tipo] = sumaPesada / sumaPesos
  }

  const tiposPresentes = TODOS_LOS_TIPOS.filter((t) => valorPorTipo[t] !== undefined)
  const tiposExcluidos = TODOS_LOS_TIPOS.filter((t) => valorPorTipo[t] === undefined)

  // 2. Renormalizar los pesos de config sobre los tipos presentes.
  const pesosUsados: Record<TipoEvaluacion, number> = {
    performance: 0,
    fisico: 0,
    videoanalisis: 0,
    coaching: 0,
  }
  const sumaPesosPresentes = tiposPresentes.reduce((acc, t) => acc + pesosConfig[t], 0)
  for (const t of tiposPresentes) {
    pesosUsados[t] = sumaPesosPresentes > 0 ? pesosConfig[t] / sumaPesosPresentes : 0
  }

  // 3. Score base.
  let scoreBase: number
  const aportePorTipo: Partial<Record<TipoEvaluacion, number>> = {}
  if (tiposPresentes.length === 0) {
    scoreBase = config.scoreSinEvaluaciones
  } else {
    scoreBase = 0
    for (const t of tiposPresentes) {
      const aporte = (valorPorTipo[t] as number) * pesosUsados[t]
      aportePorTipo[t] = aporte
      scoreBase += aporte
    }
  }
  scoreBase = clamp(scoreBase, 0, 10)

  // 4. Penalización por club (sobre el score base).
  const penalizacionClub = perteneceAClubDelPartido
  const scoreFinal = redondear1(
    clamp(penalizacionClub ? scoreBase * config.factorPenalizacionClub : scoreBase, 0, 10)
  )

  const desglose: DesgloseScore = {
    pesosUsados,
    aportePorTipo,
    valorPorTipo,
    tiposExcluidos,
    ajustePorComplejidad,
    penalizacionClub,
    scoreBase: redondear1(scoreBase),
  }

  return { scoreFinal, desglose }
}
