'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { ROLES } from '@/lib/auth/roles'
import { partidosParaAutoevaluar, type DesignacionRefereePropia } from '@/lib/autoevaluacion/elegibles'

export type PartidoAutoevaluableUI = {
  partido_id: string
  partido_label: string
  fecha: string
  yaAutoevaluado: boolean
}

export type AutoevaluacionValores = {
  autocalificacion_general: string
  comentario_autoevaluacion: string
  incidentes_reportados: string
  condiciones_cancha: string
  condiciones_clima: string
  comportamiento_equipos: string
}

async function refereeIdDelUsuario() {
  const perfil = await getProfile()
  if (!perfil || perfil.rol !== ROLES.REFEREE) throw new Error('No autorizado.')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('referee')
    .select('id')
    .eq('usuario_id', perfil.id)
    .single()
  if (error || !data) throw new Error('No tenés un perfil de referee vinculado a tu cuenta.')
  return { refereeId: data.id, supabase }
}

export async function listMisPartidosParaAutoevaluar(): Promise<PartidoAutoevaluableUI[]> {
  const { refereeId, supabase } = await refereeIdDelUsuario()

  const { data: designaciones, error: dError } = await supabase
    .from('designacion')
    .select(
      'partido_id, estado_aceptacion, partido:partido_id(fecha, club_local:club_local_id(nombre), club_visita:club_visita_id(nombre))'
    )
    .eq('referee_id', refereeId)
    .eq('estado', 'confirmado')
  if (dError) throw new Error(dError.message)

  const { data: autoevals, error: aError } = await supabase
    .from('autoevaluacion_partido')
    .select('partido_id')
    .eq('referee_id', refereeId)
  if (aError) throw new Error(aError.message)

  const paraFuncion: DesignacionRefereePropia[] = (designaciones ?? []).map((d) => {
    const p = d.partido as unknown as {
      fecha: string
      club_local: { nombre: string } | null
      club_visita: { nombre: string } | null
    } | null
    return {
      partido_id: d.partido_id,
      partido_label: `${p?.club_local?.nombre ?? '?'} vs ${p?.club_visita?.nombre ?? '?'}`,
      partido_fecha: p?.fecha ?? '9999-12-31',
      estado_aceptacion: d.estado_aceptacion,
    }
  })

  const hoy = new Date().toISOString().slice(0, 10)
  return partidosParaAutoevaluar({
    designaciones: paraFuncion,
    autoevaluaciones: autoevals ?? [],
    hoy,
  }).map((p) => ({
    partido_id: p.partido_id,
    partido_label: p.partido_label,
    fecha: p.partido_fecha,
    yaAutoevaluado: p.yaAutoevaluado,
  }))
}

export async function obtenerMiAutoevaluacion(
  partidoId: string
): Promise<AutoevaluacionValores | null> {
  const { refereeId, supabase } = await refereeIdDelUsuario()
  const { data, error } = await supabase
    .from('autoevaluacion_partido')
    .select(
      'autocalificacion_general, comentario_autoevaluacion, incidentes_reportados, condiciones_cancha, condiciones_clima, comportamiento_equipos'
    )
    .eq('partido_id', partidoId)
    .eq('referee_id', refereeId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    autocalificacion_general:
      data.autocalificacion_general === null ? '' : String(data.autocalificacion_general),
    comentario_autoevaluacion: data.comentario_autoevaluacion ?? '',
    incidentes_reportados: data.incidentes_reportados ?? '',
    condiciones_cancha: data.condiciones_cancha ?? '',
    condiciones_clima: data.condiciones_clima ?? '',
    comportamiento_equipos: data.comportamiento_equipos ?? '',
  }
}

export async function guardarAutoevaluacion(
  input: { partidoId: string } & AutoevaluacionValores
): Promise<void> {
  const { refereeId, supabase } = await refereeIdDelUsuario()

  let autocalificacion: number | null = null
  if (input.autocalificacion_general.trim() !== '') {
    const n = Number(input.autocalificacion_general)
    if (!Number.isFinite(n) || n < 0 || n > 10) {
      throw new Error('La autocalificación general debe estar entre 0 y 10.')
    }
    autocalificacion = n
  }

  const fila = {
    partido_id: input.partidoId,
    referee_id: refereeId,
    autocalificacion_general: autocalificacion,
    comentario_autoevaluacion: input.comentario_autoevaluacion.trim() || null,
    incidentes_reportados: input.incidentes_reportados.trim() || null,
    condiciones_cancha: input.condiciones_cancha.trim() || null,
    condiciones_clima: input.condiciones_clima.trim() || null,
    comportamiento_equipos: input.comportamiento_equipos.trim() || null,
    updated_at: new Date().toISOString(),
  }

  // upsert por la clave única (partido_id, referee_id). RLS de INSERT valida elegibilidad.
  const { error } = await supabase
    .from('autoevaluacion_partido')
    .upsert(fila, { onConflict: 'partido_id,referee_id' })
  if (error) throw new Error(error.message)

  revalidatePath('/mi-autoevaluacion')
}
