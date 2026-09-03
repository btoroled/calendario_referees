'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { ROLES } from '@/lib/auth/roles'
import { validarVentana } from '@/lib/disponibilidad/validacion'

export type Disponibilidad = {
  id: string
  fecha_inicio: string
  fecha_fin: string
  disponible: boolean
}

async function obtenerRefereeIdPropio(
  supabase: Awaited<ReturnType<typeof createClient>>,
  perfilId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('referee')
    .select('id')
    .eq('usuario_id', perfilId)
    .single()
  if (error || !data) {
    throw new Error('No tienes un perfil de referee vinculado a tu cuenta.')
  }
  return data.id
}

export async function listMiDisponibilidad(): Promise<Disponibilidad[]> {
  const perfil = await getProfile()
  if (!perfil || perfil.rol !== ROLES.REFEREE) {
    throw new Error('No autorizado para ver disponibilidad.')
  }

  const supabase = await createClient()
  const refereeId = await obtenerRefereeIdPropio(supabase, perfil.id)

  const { data, error } = await supabase
    .from('disponibilidad')
    .select('id, fecha_inicio, fecha_fin, disponible')
    .eq('referee_id', refereeId)
    .order('fecha_inicio')
  if (error) throw new Error(error.message)
  return data
}

export async function crearDisponibilidad(input: {
  fecha_inicio: string
  fecha_fin: string
  disponible: boolean
}): Promise<void> {
  const perfil = await getProfile()
  if (!perfil || perfil.rol !== ROLES.REFEREE) {
    throw new Error('No autorizado para cargar disponibilidad.')
  }

  const errorValidacion = validarVentana(input)
  if (errorValidacion) throw new Error(errorValidacion)

  const supabase = await createClient()
  const refereeId = await obtenerRefereeIdPropio(supabase, perfil.id)

  const { error } = await supabase.from('disponibilidad').insert({
    referee_id: refereeId,
    fecha_inicio: input.fecha_inicio,
    fecha_fin: input.fecha_fin,
    disponible: input.disponible,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/disponibilidad')
}

export async function eliminarDisponibilidad(id: string): Promise<void> {
  const perfil = await getProfile()
  if (!perfil || perfil.rol !== ROLES.REFEREE) {
    throw new Error('No autorizado para eliminar disponibilidad.')
  }

  const supabase = await createClient()
  const { error } = await supabase.from('disponibilidad').delete().eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/disponibilidad')
}
