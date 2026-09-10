'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { ROLES } from '@/lib/auth/roles'
import { recomendarReferees } from '@/actions/recomendaciones'
import { obtenerTransport } from '@/lib/email/transport'
import { emailNuevaDesignacion, emailRechazo } from '@/lib/email/mensajes'

function servicio() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export type DesignacionVigente = {
  id: string
  referee_id: string
  referee_nombre: string
  estado_aceptacion: 'pendiente' | 'aceptado' | 'rechazado' | 'vencido'
  fecha_confirmacion: string | null
}

async function exigirDesignador() {
  const perfil = await getProfile()
  if (
    !perfil ||
    (perfil.rol !== ROLES.DESIGNADOR &&
      perfil.rol !== ROLES.ADMIN_REGIONAL &&
      perfil.rol !== ROLES.ADMIN_NACIONAL)
  ) {
    throw new Error('No autorizado para gestionar designaciones.')
  }
  return perfil
}

export async function obtenerDesignacionVigente(partidoId: string): Promise<DesignacionVigente | null> {
  await exigirDesignador()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('designacion')
    .select('id, referee_id, estado_aceptacion, fecha_confirmacion, referee:referee_id(nombre)')
    .eq('partido_id', partidoId)
    .eq('puesto', 'R1')
    .neq('estado', 'reemplazado')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    id: data.id,
    referee_id: data.referee_id,
    referee_nombre: (data.referee as unknown as { nombre: string } | null)?.nombre ?? '',
    estado_aceptacion: data.estado_aceptacion,
    fecha_confirmacion: data.fecha_confirmacion,
  }
}

export async function confirmarDesignacion(input: {
  partidoId: string
  refereeId: string
}): Promise<void> {
  const perfil = await exigirDesignador()
  const db = servicio()

  // Snapshot del score desde el motor de recomendación (reusa la Fase 6).
  const reco = await recomendarReferees(input.partidoId)
  const fila = [...reco.recomendaciones, ...reco.noDisponibles].find(
    (r) => r.referee_id === input.refereeId
  )
  const scoreSnapshot = fila?.score ?? null

  // Reasignar: la designación vigente previa (si hay) pasa a 'reemplazado'.
  const { data: previa } = await db
    .from('designacion')
    .select('id')
    .eq('partido_id', input.partidoId)
    .eq('puesto', 'R1')
    .neq('estado', 'reemplazado')
    .maybeSingle()
  if (previa) {
    const { error: reemplazoError } = await db
      .from('designacion')
      .update({ estado: 'reemplazado' })
      .eq('id', previa.id)
    if (reemplazoError) throw new Error(reemplazoError.message)
  }

  const ahora = new Date().toISOString()
  const { error: insertError } = await db.from('designacion').insert({
    partido_id: input.partidoId,
    referee_id: input.refereeId,
    puesto: 'R1',
    estado: 'confirmado',
    estado_aceptacion: 'pendiente',
    designado_por: perfil.id,
    fecha: ahora,
    fecha_confirmacion: ahora,
    score_snapshot: scoreSnapshot,
  })
  if (insertError) throw new Error(insertError.message)

  // Reasignar deja el partido "resuelto" de nuevo hasta que el referee responda.
  await db.from('partido').update({ requiere_atencion: false }).eq('id', input.partidoId)

  // Email best-effort al referee.
  try {
    const { data: ref } = await db
      .from('referee')
      .select('nombre, usuario_id')
      .eq('id', input.refereeId)
      .single()
    let refereeEmail: string | null = null
    if (ref?.usuario_id) {
      const { data: perfilRef } = await db
        .from('perfil')
        .select('email')
        .eq('id', ref.usuario_id)
        .single()
      refereeEmail = perfilRef?.email ?? null
    }
    if (refereeEmail) {
      const label = `${reco.partido.club_local} vs ${reco.partido.club_visita}`
      await obtenerTransport().send(
        emailNuevaDesignacion({
          refereeEmail,
          partidoLabel: label,
          fechaPartido: `${reco.partido.fecha} ${reco.partido.hora ?? ''}`.trim(),
          urlMisDesignaciones: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/mis-designaciones`,
        })
      )
    }
  } catch (err) {
    console.error('[confirmarDesignacion] email falló (best-effort):', err)
  }

  revalidatePath(`/fixture/${input.partidoId}`)
  revalidatePath('/fixture')
}

export type MiDesignacion = {
  id: string
  partido_label: string
  fecha: string
  hora: string | null
  categoria: string
  estado_aceptacion: 'pendiente' | 'aceptado' | 'rechazado' | 'vencido'
  fecha_confirmacion: string | null
}

async function exigirRefereeYSuId() {
  const perfil = await getProfile()
  if (!perfil || perfil.rol !== ROLES.REFEREE) {
    throw new Error('No autorizado.')
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('referee')
    .select('id')
    .eq('usuario_id', perfil.id)
    .single()
  if (error || !data) throw new Error('No tenés un perfil de referee vinculado a tu cuenta.')
  return { perfil, refereeId: data.id }
}

export async function listMisDesignaciones(): Promise<MiDesignacion[]> {
  await exigirRefereeYSuId()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('designacion')
    .select(
      'id, estado_aceptacion, fecha_confirmacion, partido:partido_id(fecha, hora, categoria, club_local:club_local_id(nombre), club_visita:club_visita_id(nombre))'
    )
    .eq('estado', 'confirmado')
    .order('fecha_confirmacion', { ascending: false })
  if (error) throw new Error(error.message)

  return (data ?? []).map((d) => {
    const p = d.partido as unknown as {
      fecha: string
      hora: string | null
      categoria: string
      club_local: { nombre: string } | null
      club_visita: { nombre: string } | null
    } | null
    return {
      id: d.id,
      partido_label: `${p?.club_local?.nombre ?? '?'} vs ${p?.club_visita?.nombre ?? '?'}`,
      fecha: p?.fecha ?? '',
      hora: p?.hora ?? null,
      categoria: p?.categoria ?? '',
      estado_aceptacion: d.estado_aceptacion,
      fecha_confirmacion: d.fecha_confirmacion,
    }
  })
}

async function cambiarEstadoAceptacion(
  designacionId: string,
  nuevoEstado: 'aceptado' | 'rechazado'
): Promise<void> {
  const { refereeId } = await exigirRefereeYSuId()
  const supabase = await createClient()

  // Verifica pertenencia y estado actual (RLS ya restringe, pero damos mensaje legible).
  const { data: actual, error: actualError } = await supabase
    .from('designacion')
    .select('id, referee_id, estado_aceptacion')
    .eq('id', designacionId)
    .single()
  if (actualError || !actual) throw new Error('Designación no encontrada.')
  if (actual.referee_id !== refereeId) throw new Error('Esa designación no es tuya.')
  if (actual.estado_aceptacion !== 'pendiente') {
    throw new Error('Esta designación ya fue respondida o venció.')
  }

  const { error } = await supabase
    .from('designacion')
    .update({ estado_aceptacion: nuevoEstado, fecha_respuesta: new Date().toISOString() })
    .eq('id', designacionId)
  if (error) throw new Error(error.message)

  if (nuevoEstado === 'rechazado') {
    // Marca el partido y avisa al designador (best-effort). Usa service-role para leer emails.
    const db = servicio()
    const { data: d } = await db
      .from('designacion')
      .select(
        'partido_id, designado_por, referee:referee_id(nombre), partido:partido_id(club_local:club_local_id(nombre), club_visita:club_visita_id(nombre))'
      )
      .eq('id', designacionId)
      .single()
    if (d) {
      await db.from('partido').update({ requiere_atencion: true }).eq('id', d.partido_id)
      try {
        let designadorEmail: string | null = null
        if (d.designado_por) {
          const { data: pd } = await db.from('perfil').select('email').eq('id', d.designado_por).single()
          designadorEmail = pd?.email ?? null
        }
        const p = d.partido as unknown as {
          club_local: { nombre: string } | null
          club_visita: { nombre: string } | null
        } | null
        if (designadorEmail) {
          await obtenerTransport().send(
            emailRechazo({
              designadorEmail,
              refereeNombre: (d.referee as unknown as { nombre: string } | null)?.nombre ?? 'El referee',
              partidoLabel: `${p?.club_local?.nombre ?? '?'} vs ${p?.club_visita?.nombre ?? '?'}`,
            })
          )
        }
      } catch (err) {
        console.error('[rechazarDesignacion] email falló (best-effort):', err)
      }
    }
  }

  revalidatePath('/mis-designaciones')
}

export async function aceptarDesignacion(designacionId: string): Promise<void> {
  await cambiarEstadoAceptacion(designacionId, 'aceptado')
}

export async function rechazarDesignacion(designacionId: string): Promise<void> {
  await cambiarEstadoAceptacion(designacionId, 'rechazado')
}
