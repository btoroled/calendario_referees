import { parse } from 'csv-parse/sync'

export type FilaFixture = {
  fecha: string
  hora: string
  cancha: string
  categoria: string
  club_local_codigo: string
  club_visita_codigo: string
  jornada: number | null
}

export type ErrorFila = { fila: number; mensaje: string }

export type ResultadoParseoFixture = {
  filas: FilaFixture[]
  errores: ErrorFila[]
}

const ALIAS_ENCABEZADOS: Record<string, string> = {
  fecha: 'fecha',
  hora: 'hora',
  cancha: 'cancha',
  sede: 'cancha',
  estadio: 'cancha',
  categoria: 'categoria',
  club_local: 'club_local',
  clublocal: 'club_local',
  local: 'club_local',
  club_visita: 'club_visita',
  clubvisita: 'club_visita',
  visita: 'club_visita',
  visitante: 'club_visita',
  jornada: 'jornada',
}

const CAMPOS_REQUERIDOS = ['fecha', 'hora', 'cancha', 'categoria', 'club_local', 'club_visita']

function normalizarEncabezado(encabezado: string): string {
  return encabezado
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_')
}

export function parseFixtureCsv(csvText: string): ResultadoParseoFixture {
  let filasCrudas: Record<string, string>[]
  try {
    filasCrudas = parse(csvText, {
      columns: (encabezados: string[]) =>
        encabezados.map((e) => {
          const normalizado = normalizarEncabezado(e)
          return ALIAS_ENCABEZADOS[normalizado] ?? normalizado
        }),
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

  const filas: FilaFixture[] = []
  const errores: ErrorFila[] = []

  filasCrudas.forEach((fila, index) => {
    const numeroFila = index + 2
    const fecha = fila.fecha?.trim()
    const hora = fila.hora?.trim()
    const categoria = fila.categoria?.trim()
    const clubLocal = fila.club_local?.trim()
    const clubVisita = fila.club_visita?.trim()
    const jornadaTexto = fila.jornada?.trim()

    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      errores.push({ fila: numeroFila, mensaje: `Fecha inválida: "${fila.fecha ?? ''}" (formato esperado AAAA-MM-DD)` })
      return
    }
    if (!hora || !/^\d{2}:\d{2}$/.test(hora)) {
      errores.push({ fila: numeroFila, mensaje: `Hora inválida: "${fila.hora ?? ''}" (formato esperado HH:MM)` })
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

    let jornada: number | null = null
    if (jornadaTexto) {
      const jornadaNum = Number(jornadaTexto)
      if (!Number.isInteger(jornadaNum) || jornadaNum < 1) {
        errores.push({ fila: numeroFila, mensaje: `Jornada inválida: "${jornadaTexto}"` })
        return
      }
      jornada = jornadaNum
    }

    filas.push({
      fecha,
      hora,
      cancha: fila.cancha?.trim() ?? '',
      categoria,
      club_local_codigo: clubLocal,
      club_visita_codigo: clubVisita,
      jornada,
    })
  })

  return { filas, errores }
}
