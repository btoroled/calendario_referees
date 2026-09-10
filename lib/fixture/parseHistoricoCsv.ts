import { parse } from 'csv-parse/sync'
import type { ErrorFila } from './parseFixtureCsv'

export type { ErrorFila } from './parseFixtureCsv'

export type FilaHistorico = {
  fecha: string
  hora: string | null
  categoria: string
  club_local_codigo: string
  club_visita_codigo: string
  resultado_local: number
  resultado_visita: number
  tarjetas_amarillas_local: number
  tarjetas_amarillas_visita: number
  tarjetas_rojas_local: number
  tarjetas_rojas_visita: number
  incidentes: string | null
}

export type ResultadoParseoHistorico = {
  filas: FilaHistorico[]
  errores: ErrorFila[]
}

const CAMPOS_REQUERIDOS = [
  'fecha',
  'categoria',
  'club_local',
  'club_visita',
  'resultado_local',
  'resultado_visita',
]

function normalizarEncabezado(encabezado: string): string {
  return encabezado
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
}

function parsearEnteroNoNegativo(texto: string | undefined): number | null {
  if (!texto || texto.trim() === '') return 0
  const n = Number(texto.trim())
  if (!Number.isInteger(n) || n < 0) return null
  return n
}

export function parseHistoricoCsv(csvText: string): ResultadoParseoHistorico {
  let filasCrudas: Record<string, string>[]
  try {
    filasCrudas = parse(csvText, {
      columns: (encabezados: string[]) => encabezados.map((e) => normalizarEncabezado(e)),
      skip_empty_lines: true,
      trim: true,
    })
  } catch (err) {
    return {
      filas: [],
      errores: [{ fila: 0, mensaje: 'No se pudo leer el archivo CSV: ' + (err instanceof Error ? err.message : 'formato inválido') }],
    }
  }

  const columnasEncontradas = filasCrudas.length > 0 ? Object.keys(filasCrudas[0]) : []
  const columnasFaltantes = CAMPOS_REQUERIDOS.filter((c) => !columnasEncontradas.includes(c))
  if (columnasFaltantes.length > 0) {
    return { filas: [], errores: [{ fila: 0, mensaje: `Faltan columnas requeridas: ${columnasFaltantes.join(', ')}` }] }
  }

  const filas: FilaHistorico[] = []
  const errores: ErrorFila[] = []

  filasCrudas.forEach((fila, index) => {
    const numeroFila = index + 2
    const fecha = fila.fecha?.trim()
    const categoria = fila.categoria?.trim()
    const clubLocal = fila.club_local?.trim()
    const clubVisita = fila.club_visita?.trim()

    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      errores.push({ fila: numeroFila, mensaje: `Fecha inválida: "${fila.fecha ?? ''}" (formato esperado AAAA-MM-DD)` })
      return
    }
    if (!categoria) {
      errores.push({ fila: numeroFila, mensaje: 'Categoría vacía' })
      return
    }
    if (!clubLocal) {
      errores.push({ fila: numeroFila, mensaje: 'Club local vacío' })
      return
    }
    if (!clubVisita) {
      errores.push({ fila: numeroFila, mensaje: 'Club visita vacío' })
      return
    }
    if (clubLocal === clubVisita) {
      errores.push({ fila: numeroFila, mensaje: `El club local y visita no pueden ser el mismo ("${clubLocal}")` })
      return
    }

    const resultadoLocal = parsearEnteroNoNegativo(fila.resultado_local)
    if (resultadoLocal === null || !fila.resultado_local?.trim()) {
      errores.push({ fila: numeroFila, mensaje: `Resultado local inválido: "${fila.resultado_local ?? ''}"` })
      return
    }
    const resultadoVisita = parsearEnteroNoNegativo(fila.resultado_visita)
    if (resultadoVisita === null || !fila.resultado_visita?.trim()) {
      errores.push({ fila: numeroFila, mensaje: `Resultado visita inválido: "${fila.resultado_visita ?? ''}"` })
      return
    }

    const tarjetasAmarillasLocal = parsearEnteroNoNegativo(fila.tarjetas_amarillas_local)
    const tarjetasAmarillasVisita = parsearEnteroNoNegativo(fila.tarjetas_amarillas_visita)
    const tarjetasRojasLocal = parsearEnteroNoNegativo(fila.tarjetas_rojas_local)
    const tarjetasRojasVisita = parsearEnteroNoNegativo(fila.tarjetas_rojas_visita)
    if (
      tarjetasAmarillasLocal === null ||
      tarjetasAmarillasVisita === null ||
      tarjetasRojasLocal === null ||
      tarjetasRojasVisita === null
    ) {
      errores.push({ fila: numeroFila, mensaje: 'Cantidad de tarjetas inválida (debe ser un entero no negativo o estar vacía)' })
      return
    }

    filas.push({
      fecha,
      hora: fila.hora?.trim() || null,
      categoria,
      club_local_codigo: clubLocal,
      club_visita_codigo: clubVisita,
      resultado_local: resultadoLocal,
      resultado_visita: resultadoVisita,
      tarjetas_amarillas_local: tarjetasAmarillasLocal,
      tarjetas_amarillas_visita: tarjetasAmarillasVisita,
      tarjetas_rojas_local: tarjetasRojasLocal,
      tarjetas_rojas_visita: tarjetasRojasVisita,
      incidentes: fila.incidentes?.trim() || null,
    })
  })

  return { filas, errores }
}
