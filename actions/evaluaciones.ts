'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { ROLES } from '@/lib/auth/roles'
import { partidosPendientesDeEvaluar, type DesignacionAceptada } from '@/lib/evaluacion/pendientes'

export type PartidoPendiente = {
  designacion_id: string
  partido_id: string
  referee_id: string
  referee_nombre: string
  partido_label: string
  fecha: string
  categoria: string
  liga_id: string
}

export type EvaluacionCargada = {
  id: string
  tipo: 'performance' | 'fisico' | 'videoanalisis' | 'coaching'
  valor: number
  fecha: string
  partido_label: string | null
}

function exigirEvaluador(rol: string | undefined): void {
  if (rol !== ROLES.EVALUADOR && rol !== ROLES.ADMIN_REGIONAL && rol !== ROLES.ADMIN_NACIONAL) {
    throw new Error('No autorizado para gestionar evaluaciones.')
  }
}

export async function listPendientesDeEvaluar(): Promise<PartidoPendiente[]> {
  const perfil = await getProfile()
  exigirEvaluador(perfil?.rol)
  const supabase = await createClient()

  // RLS ya limita designacion/evaluacion al scope del evaluador.
  const { data: designaciones, error: dError } = await supabase
    .from('designacion')
    .select(
      'id, referee_id, partido_id, referee:referee_id(nombre), partido:partido_id(fecha, categoria, liga_id, club_local:club_local_id(nombre), club_visita:club_visita_id(nombre))'
    )
    .eq('estado', 'confirmado')
    .eq('estado_aceptacion', 'aceptado')
  if (dError) throw new Error(dError.message)

  const { data: evaluaciones, error: eError } = await supabase
    .from('evaluacion')
    .select('referee_id, partido_id')
  if (eError) throw new Error(eError.message)

  const aceptadas: DesignacionAceptada[] = (designaciones ?? []).map((d) => {
    const p = d.partido as unknown as { fecha: string; liga_id: string } | null
    return {
      referee_id: d.referee_id,
      partido_id: d.partido_id,
      partido_fecha: p?.fecha ?? '9999-12-31',
      liga_id: p?.liga_id ?? '',
    }
  })

  const hoy = new Date().toISOString().slice(0, 10)
  const pendientesClaves = new Set(
    partidosPendientesDeEvaluar({ designacionesAceptadas: aceptadas, evaluaciones: evaluaciones ?? [], hoy }).map(
      (d) => `${d.referee_id}|${d.partido_id}`
    )
  )

  return (designaciones ?? [])
    .filter((d) => pendientesClaves.has(`${d.referee_id}|${d.partido_id}`))
    .map((d) => {
      const p = d.partido as unknown as {
        fecha: string
        categoria: string
        liga_id: string
        club_local: { nombre: string } | null
        club_visita: { nombre: string } | null
      } | null
      return {
        designacion_id: d.id,
        partido_id: d.partido_id,
        referee_id: d.referee_id,
        referee_nombre: (d.referee as unknown as { nombre: string } | null)?.nombre ?? '',
        partido_label: `${p?.club_local?.nombre ?? '?'} vs ${p?.club_visita?.nombre ?? '?'}`,
        fecha: p?.fecha ?? '',
        categoria: p?.categoria ?? '',
        liga_id: p?.liga_id ?? '',
      }
    })
}

export async function crearEvaluacion(input: {
  referee_id: string
  partido_id: string
  tipo: 'performance' | 'fisico' | 'videoanalisis' | 'coaching'
  valor: number
}): Promise<void> {
  const perfil = await getProfile()
  exigirEvaluador(perfil?.rol)

  if (!Number.isFinite(input.valor) || input.valor < 0 || input.valor > 10) {
    throw new Error('El valor de la evaluación debe estar entre 0 y 10.')
  }

  const supabase = await createClient()

  const { data: designacionValida } = await supabase
    .from('designacion')
    .select('id')
    .eq('referee_id', input.referee_id)
    .eq('partido_id', input.partido_id)
    .eq('estado', 'confirmado')
    .eq('estado_aceptacion', 'aceptado')
    .maybeSingle()
  if (!designacionValida) {
    throw new Error('No existe una designación confirmada y aceptada para ese referee en ese partido.')
  }

  const { error } = await supabase.from('evaluacion').insert({
    referee_id: input.referee_id,
    partido_id: input.partido_id,
    tipo: input.tipo,
    valor: input.valor,
    fecha: new Date().toISOString().slice(0, 10),
    evaluador_id: perfil!.id,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/evaluaciones')
}

export async function listEvaluacionesDeReferee(refereeId: string): Promise<EvaluacionCargada[]> {
  const perfil = await getProfile()
  if (!perfil) throw new Error('No autorizado.')
  const supabase = await createClient()

  // RLS: el propio referee ve las suyas; evaluador/designador/admin ven las de su scope.
  const { data, error } = await supabase
    .from('evaluacion')
    .select(
      'id, tipo, valor, fecha, partido:partido_id(club_local:club_local_id(nombre), club_visita:club_visita_id(nombre))'
    )
    .eq('referee_id', refereeId)
    .order('fecha', { ascending: false })
  if (error) throw new Error(error.message)

  return (data ?? []).map((e) => {
    const p = e.partido as unknown as {
      club_local: { nombre: string } | null
      club_visita: { nombre: string } | null
    } | null
    return {
      id: e.id,
      tipo: e.tipo,
      valor: Number(e.valor),
      fecha: e.fecha,
      partido_label: p ? `${p.club_local?.nombre ?? '?'} vs ${p.club_visita?.nombre ?? '?'}` : null,
    }
  })
}
