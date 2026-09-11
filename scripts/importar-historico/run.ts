import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { parseHistoricoCsv } from '../../lib/fixture/parseHistoricoCsv'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function main() {
  const [, , rutaCsv, ligaId, temporadaId] = process.argv
  if (!rutaCsv || !ligaId || !temporadaId) {
    console.error('Uso: npx tsx scripts/importar-historico/run.ts <ruta-al-csv> <liga_id> <temporada_id>')
    process.exit(1)
  }

  const csvText = readFileSync(rutaCsv, 'utf-8')
  const { filas, errores: erroresParseo } = parseHistoricoCsv(csvText)
  if (erroresParseo.length > 0) {
    console.error('Errores en el archivo:')
    erroresParseo.forEach((e) => console.error(`  Fila ${e.fila}: ${e.mensaje}`))
    process.exit(1)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data: clubes, error: clubesError } = await admin.from('club').select('id, codigo')
  if (clubesError) throw new Error(clubesError.message)
  const clubesPorCodigo = new Map((clubes ?? []).map((c) => [c.codigo, c.id]))

  const { data: mapa, error: mapaError } = await admin
    .from('categoria_minima_mapa')
    .select('categoria, categoria_minima_referee')
    .eq('liga_id', ligaId)
  if (mapaError) throw new Error(mapaError.message)
  const minimaPorCategoria = new Map((mapa ?? []).map((m) => [m.categoria, m.categoria_minima_referee]))

  const erroresClubes: string[] = []
  const filasParaInsertar = filas.map((fila, index) => {
    const numeroFila = index + 2
    const clubLocalId = clubesPorCodigo.get(fila.club_local_codigo)
    const clubVisitaId = clubesPorCodigo.get(fila.club_visita_codigo)
    if (!clubLocalId) erroresClubes.push(`Fila ${numeroFila}: club local "${fila.club_local_codigo}" no existe`)
    if (!clubVisitaId) erroresClubes.push(`Fila ${numeroFila}: club visita "${fila.club_visita_codigo}" no existe`)
    return {
      liga_id: ligaId,
      temporada_id: temporadaId,
      fecha: fila.fecha,
      hora: fila.hora,
      categoria: fila.categoria,
      club_local_id: clubLocalId ?? null,
      club_visita_id: clubVisitaId ?? null,
      resultado_local: fila.resultado_local,
      resultado_visita: fila.resultado_visita,
      tarjetas_amarillas_local: fila.tarjetas_amarillas_local,
      tarjetas_amarillas_visita: fila.tarjetas_amarillas_visita,
      tarjetas_rojas_local: fila.tarjetas_rojas_local,
      tarjetas_rojas_visita: fila.tarjetas_rojas_visita,
      incidentes: fila.incidentes,
      categoria_minima_referee: minimaPorCategoria.get(fila.categoria) ?? fila.categoria,
      es_historico: true,
    }
  })

  if (erroresClubes.length > 0) {
    console.error('Errores en el archivo:')
    erroresClubes.forEach((e) => console.error(`  ${e}`))
    process.exit(1)
  }

  const { error: insertError, data: insertados } = await admin.from('partido').insert(filasParaInsertar).select('id')
  if (insertError) {
    console.error('Error al insertar:', insertError.message)
    process.exit(1)
  }

  console.log(`Se importaron ${insertados?.length ?? 0} partidos históricos.`)
}

main()
