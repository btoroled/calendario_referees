export type TipoEvaluacion = 'performance' | 'fisico' | 'videoanalisis' | 'coaching'
export type EvaluacionInput = { tipo: TipoEvaluacion; valor: number; fecha: string } // fecha ISO 'YYYY-MM-DD'
export type ConfigScoring = {
  pesosNormal: Record<TipoEvaluacion, number>
  pesosAltaComplejidad: Record<TipoEvaluacion, number>
  umbralComplejidadAlta: number
  factorPenalizacionClub: number
  semividaDias: number
  scoreSinEvaluaciones: number
}
export type DesgloseScore = {
  pesosUsados: Record<TipoEvaluacion, number>       // pesos renormalizados sobre los tipos presentes
  aportePorTipo: Partial<Record<TipoEvaluacion, number>> // valorTipo * pesoRenorm, por tipo presente
  valorPorTipo: Partial<Record<TipoEvaluacion, number>>  // promedio ponderado por recencia, por tipo presente
  tiposExcluidos: TipoEvaluacion[]                  // tipos sin ninguna evaluación
  ajustePorComplejidad: boolean                     // true si se usó el set de pesos de alta complejidad
  penalizacionClub: boolean                         // true si se aplicó factorPenalizacionClub
  scoreBase: number                                 // antes de la penalización de club
}
export type ResultadoScore = { scoreFinal: number; desglose: DesgloseScore }
