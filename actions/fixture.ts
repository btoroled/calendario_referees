'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { ROLES } from '@/lib/auth/roles'
import { parseFixtureCsv } from '@/lib/fixture/parseFixtureCsv'
import { calcularComplejidad, type PartidoClubHistorico, type PartidoDirectoHistorico } from '@/lib/fixture/calcularComplejidad'

export type Partido = {
  id: string
  fecha: string
  hora: string
  cancha: string | null
  categoria: string
  jornada: number | null
  club_local: { nombre: string } | null
  club_visita: { nombre: string } | null
}

export async function listPartidos(input: { liga_id: string; temporada_id: string }): Promise<Partido[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('partido')
    .select('id, fecha, hora, cancha, categoria, jornada, club_local:club_local_id(nombre), club_visita:club_visita_id(nombre)')
    .eq('liga_id', input.liga_id)
    .eq('temporada_id', input.temporada_id)
    .order('fecha')
    .order('hora')
  if (error) throw new Error(error.message)
  return data as unknown as Partido[]
}

const LIMITE_PARTIDOS_TENDENCIA = 10

async function obtenerTendenciaClub(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clubId: string
): Promise<PartidoClubHistorico[]> {
  const { data } = await supabase
    .from('partido')
    .select('club_local_id, tarjetas_amarillas_local, tarjetas_amarillas_visita, tarjetas_rojas_local, tarjetas_rojas_visita')
    .not('resultado_local', 'is', null)
    .or(`club_local_id.eq.${clubId},club_visita_id.eq.${clubId}`)
    .order('fecha', { ascending: false })
    .limit(LIMITE_PARTIDOS_TENDENCIA)

  return (data ?? []).map((p) => ({
    tarjetas_amarillas: p.club_local_id === clubId ? (p.tarjetas_amarillas_local ?? 0) : (p.tarjetas_amarillas_visita ?? 0),
    tarjetas_rojas: p.club_local_id === clubId ? (p.tarjetas_rojas_local ?? 0) : (p.tarjetas_rojas_visita ?? 0),
  }))
}

async function obtenerComplejidad(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clubLocalId: string,
  clubVisitaId: string
): Promise<number> {
  const { data: directos } = await supabase
    .from('partido')
    .select('resultado_local, resultado_visita, tarjetas_amarillas_local, tarjetas_amarillas_visita, tarjetas_rojas_local, tarjetas_rojas_visita')
    .not('resultado_local', 'is', null)
    .or(
      `and(club_local_id.eq.${clubLocalId},club_visita_id.eq.${clubVisitaId}),and(club_local_id.eq.${clubVisitaId},club_visita_id.eq.${clubLocalId})`
    )

  const partidosDirectos: PartidoDirectoHistorico[] = (directos ?? []).map((p) => ({
    resultado_local: p.resultado_local!,
    resultado_visita: p.resultado_visita!,
    tarjetas_amarillas_local: p.tarjetas_amarillas_local ?? 0,
    tarjetas_amarillas_visita: p.tarjetas_amarillas_visita ?? 0,
    tarjetas_rojas_local: p.tarjetas_rojas_local ?? 0,
    tarjetas_rojas_visita: p.tarjetas_rojas_visita ?? 0,
  }))

  const [partidosClubLocal, partidosClubVisita] = await Promise.all([
    obtenerTendenciaClub(supabase, clubLocalId),
    obtenerTendenciaClub(supabase, clubVisitaId),
  ])

  return calcularComplejidad({ partidosDirectos, partidosClubLocal, partidosClubVisita })
}

export async function importarFixture(input: {
  liga_id: string
  temporada_id: string
  csvText: string
}): Promise<{ importados: number }> {
  const perfil = await getProfile()
  if (
    !perfil ||
    (perfil.rol !== ROLES.ADMIN_NACIONAL && perfil.rol !== ROLES.ADMIN_REGIONAL && perfil.rol !== ROLES.DESIGNADOR)
  ) {
    throw new Error('No autorizado para importar fixture.')
  }

  const { filas, errores: erroresParseo } = parseFixtureCsv(input.csvText)
  if (erroresParseo.length > 0) {
    throw new Error('Errores en el archivo:\n' + erroresParseo.map((e) => `Fila ${e.fila}: ${e.mensaje}`).join('\n'))
  }

  const supabase = await createClient()

  const { data: clubes, error: clubesError } = await supabase.from('club').select('id, codigo')
  if (clubesError) throw new Error(clubesError.message)
  const clubesPorCodigo = new Map((clubes ?? []).map((c) => [c.codigo, c.id]))

  const { data: mapa, error: mapaError } = await supabase
    .from('categoria_minima_mapa')
    .select('categoria, categoria_minima_referee')
    .eq('liga_id', input.liga_id)
  if (mapaError) throw new Error(mapaError.message)
  const minimaPorCategoria = new Map((mapa ?? []).map((m) => [m.categoria, m.categoria_minima_referee]))

  const erroresClubes: string[] = []
  const filasParaInsertar: Record<string, unknown>[] = []

  for (let index = 0; index < filas.length; index++) {
    const fila = filas[index]
    const numeroFila = index + 2
    const clubLocalId = clubesPorCodigo.get(fila.club_local_codigo)
    const clubVisitaId = clubesPorCodigo.get(fila.club_visita_codigo)
    if (!clubLocalId) erroresClubes.push(`Fila ${numeroFila}: club local "${fila.club_local_codigo}" no existe`)
    if (!clubVisitaId) erroresClubes.push(`Fila ${numeroFila}: club visita "${fila.club_visita_codigo}" no existe`)

    const complejidad = clubLocalId && clubVisitaId ? await obtenerComplejidad(supabase, clubLocalId, clubVisitaId) : null

    filasParaInsertar.push({
      liga_id: input.liga_id,
      temporada_id: input.temporada_id,
      fecha: fila.fecha,
      hora: fila.hora,
      cancha: fila.cancha || null,
      categoria: fila.categoria,
      club_local_id: clubLocalId ?? null,
      club_visita_id: clubVisitaId ?? null,
      jornada: fila.jornada,
      categoria_minima_referee: minimaPorCategoria.get(fila.categoria) ?? fila.categoria,
      es_historico: false,
      complejidad,
    })
  }

  if (erroresClubes.length > 0) {
    throw new Error('Errores en el archivo:\n' + erroresClubes.join('\n'))
  }

  const { error: insertError } = await supabase.from('partido').insert(filasParaInsertar)
  if (insertError) throw new Error(insertError.message)

  revalidatePath('/fixture')
  return { importados: filasParaInsertar.length }
}
