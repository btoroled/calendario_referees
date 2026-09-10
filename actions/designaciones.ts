'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { ROLES } from '@/lib/auth/roles'
import { recomendarReferees } from '@/actions/recomendaciones'
import { obtenerTransport } from '@/lib/email/transport'
import { emailNuevaDesignacion } from '@/lib/email/mensajes'

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
