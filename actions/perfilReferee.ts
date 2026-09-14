'use server'

import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { ROLES } from '@/lib/auth/roles'

export type EntradaTimelinePartido = {
  partido_id: string
  fecha: string
  rival_label: string
  complejidad: number | null
  estado_aceptacion: string
  evaluaciones: { tipo: string; valor: number; fecha: string }[]
  autoevaluacion: {
    autocalificacion_general: number | null
    comentario_autoevaluacion: string | null
    incidentes_reportados: string | null
    condiciones_cancha: string | null
    condiciones_clima: string | null
    comportamiento_equipos: string | null
  } | null
}

export type PerfilReferee = {
  id: string
  nombre: string
  club_nombre: string | null
  categoria: string
  region_id: string
  designacionesAceptadasEnTemporada: number
  timeline: EntradaTimelinePartido[]
}

export async function obtenerMiRefereeId(): Promise<string> {
  const perfil = await getProfile()
  if (!perfil) throw new Error('No autorizado.')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('referee')
    .select('id')
    .eq('usuario_id', perfil.id)
    .single()
  if (error || !data) throw new Error('No tenés un perfil de referee vinculado a tu cuenta.')
  return data.id
}

export async function obtenerPerfilReferee(refereeId: string): Promise<PerfilReferee> {
  const perfil = await getProfile()
  if (!perfil) throw new Error('No autorizado.')
  const supabase = await createClient()

  // RLS de `referee_select` no tiene predicado de rol en su rama de scope por región: un
  // referee cualquiera de la misma región podría, solo vía RLS, ver el perfil de OTRO
  // referee (con datos reales pero engañosos, ya que designacion/evaluacion/autoevaluacion
  // sí gatean por usuario_id y devolverían todo en cero). El modelo de acceso del plan es
  // "el propio referee, designador, evaluador y admin del mismo scope" — no cualquier referee.
  if (perfil.rol === ROLES.REFEREE) {
    const miRefereeId = await obtenerMiRefereeId()
    if (miRefereeId !== refereeId) {
      throw new Error('Referee no encontrado o fuera de tu alcance.')
    }
  }

  // RLS de referee/designacion/evaluacion/autoevaluacion limita todo esto al scope permitido.
  const { data: ref, error: refError } = await supabase
    .from('referee')
    .select('id, nombre, categoria, region_id, club:club_id(nombre)')
    .eq('id', refereeId)
    .single()
  if (refError || !ref) throw new Error('Referee no encontrado o fuera de tu alcance.')

  const { data: designaciones } = await supabase
    .from('designacion')
    .select(
      'partido_id, estado_aceptacion, partido:partido_id(fecha, complejidad, temporada_id, club_local_id, club_visita_id, club_local:club_local_id(nombre), club_visita:club_visita_id(nombre))'
    )
    .eq('referee_id', refereeId)
    .eq('estado', 'confirmado')

  const { data: evaluaciones } = await supabase
    .from('evaluacion')
    .select('partido_id, tipo, valor, fecha')
    .eq('referee_id', refereeId)

  const { data: autoevals } = await supabase
    .from('autoevaluacion_partido')
    .select(
      'partido_id, autocalificacion_general, comentario_autoevaluacion, incidentes_reportados, condiciones_cancha, condiciones_clima, comportamiento_equipos'
    )
    .eq('referee_id', refereeId)

  const evalsPorPartido = new Map<string, { tipo: string; valor: number; fecha: string }[]>()
  for (const e of evaluaciones ?? []) {
    if (!e.partido_id) continue
    const arr = evalsPorPartido.get(e.partido_id) ?? []
    arr.push({ tipo: e.tipo, valor: Number(e.valor), fecha: e.fecha })
    evalsPorPartido.set(e.partido_id, arr)
  }
  const autoevalPorPartido = new Map((autoevals ?? []).map((a) => [a.partido_id, a]))

  // Temporada(s) activa(s) para el conteo: las de las ligas de la región del referee
  // (una región puede tener varias ligas, cada una con su propia temporada activa),
  // no "la primera que aparezca" en las designaciones.
  const { data: temporadasActivas } = await supabase
    .from('temporada')
    .select('id, liga:liga_id!inner(region_id)')
    .eq('activa', true)
    .eq('liga.region_id', ref.region_id)
  const idsTemporadaActiva = new Set((temporadasActivas ?? []).map((t) => t.id))

  let designacionesAceptadasEnTemporada = 0
  const timeline: EntradaTimelinePartido[] = (designaciones ?? []).map((d) => {
    const p = d.partido as unknown as {
      fecha: string
      complejidad: number | null
      temporada_id: string
      club_local: { nombre: string } | null
      club_visita: { nombre: string } | null
    } | null
    if (d.estado_aceptacion === 'aceptado' && p?.temporada_id && idsTemporadaActiva.has(p.temporada_id)) {
      designacionesAceptadasEnTemporada++
    }
    const a = autoevalPorPartido.get(d.partido_id)
    return {
      partido_id: d.partido_id,
      fecha: p?.fecha ?? '',
      rival_label: `${p?.club_local?.nombre ?? '?'} vs ${p?.club_visita?.nombre ?? '?'}`,
      complejidad: p?.complejidad ?? null,
      estado_aceptacion: d.estado_aceptacion,
      evaluaciones: evalsPorPartido.get(d.partido_id) ?? [],
      autoevaluacion: a
        ? {
            autocalificacion_general:
              a.autocalificacion_general === null ? null : Number(a.autocalificacion_general),
            comentario_autoevaluacion: a.comentario_autoevaluacion,
            incidentes_reportados: a.incidentes_reportados,
            condiciones_cancha: a.condiciones_cancha,
            condiciones_clima: a.condiciones_clima,
            comportamiento_equipos: a.comportamiento_equipos,
          }
        : null,
    }
  })

  timeline.sort((x, y) => (x.fecha < y.fecha ? 1 : x.fecha > y.fecha ? -1 : 0))

  return {
    id: ref.id,
    nombre: ref.nombre,
    club_nombre: (ref.club as unknown as { nombre: string } | null)?.nombre ?? null,
    categoria: ref.categoria,
    region_id: ref.region_id,
    designacionesAceptadasEnTemporada,
    timeline,
  }
}
