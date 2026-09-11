import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { parseHistoricoCsv } from '../../lib/fixture/parseHistoricoCsv'
import { matchResultados, type PartidoExistente } from '../../lib/fixture/matchResultados'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function main() {
  const [, , rutaCsv, ligaId] = process.argv
  if (!rutaCsv || !ligaId) {
    console.error('Uso: npx tsx scripts/cargar-resultados/run.ts <ruta-al-csv> <liga_id>')
    process.exit(1)
  }

  const csvText = readFileSync(rutaCsv, 'utf-8')
  const { filas, errores } = parseHistoricoCsv(csvText)
  if (errores.length > 0) {
    console.error('Errores en el archivo:')
    errores.forEach((e) => console.error(`  Fila ${e.fila}: ${e.mensaje}`))
    process.exit(1)
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: clubes, error: clubesError } = await db.from('club').select('id, codigo')
  if (clubesError) throw new Error(clubesError.message)
  const codigoPorId = new Map((clubes ?? []).map((c) => [c.id, c.codigo]))

  const { data: partidos, error: partidosError } = await db
    .from('partido')
    .select('id, fecha, club_local_id, club_visita_id, es_historico')
    .eq('liga_id', ligaId)
  if (partidosError) throw new Error(partidosError.message)

  const partidosExistentes: PartidoExistente[] = (partidos ?? []).map((p) => ({
    id: p.id,
    fecha: p.fecha,
    club_local_codigo: codigoPorId.get(p.club_local_id) ?? '',
    club_visita_codigo: codigoPorId.get(p.club_visita_id) ?? '',
    es_historico: p.es_historico,
  }))

  const resultados = matchResultados({ filas, partidos: partidosExistentes })
  const erroresMatch = resultados.filter((r): r is { fila: number; error: string } => 'error' in r)
  if (erroresMatch.length > 0) {
    console.error('Errores de matching (no se actualizó nada):')
    erroresMatch.forEach((e) => console.error(`  Fila ${e.fila}: ${e.error}`))
    process.exit(1)
  }

  let actualizados = 0
  for (const r of resultados) {
    if (!('match' in r)) continue
    const { error } = await db.from('partido').update(r.match.update).eq('id', r.match.partidoId)
    if (error) {
      console.error(`  Fila ${r.fila}: error al actualizar ${r.match.partidoId}: ${error.message}`)
      process.exit(1)
    }
    actualizados++
  }

  console.log(`Se actualizaron ${actualizados} partidos con su resultado.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
