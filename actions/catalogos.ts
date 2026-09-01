'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { ROLES } from '@/lib/auth/roles'

export type Region = {
  id: string
  nombre: string
  codigo: string
  pais_id: string
}

export async function listRegiones(): Promise<Region[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('region')
    .select('id, nombre, codigo, pais_id')
    .order('nombre')
  if (error) throw new Error(error.message)
  return data
}

export async function crearRegion(input: { nombre: string; codigo: string }): Promise<void> {
  const perfil = await getProfile()
  if (!perfil || perfil.rol !== ROLES.ADMIN_NACIONAL) {
    throw new Error('No autorizado para crear regiones.')
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('region')
    .insert({ nombre: input.nombre, codigo: input.codigo, pais_id: perfil.pais_id })
  if (error) throw new Error(error.message)

  revalidatePath('/admin/catalogos/regiones')
}

export type Liga = {
  id: string
  nombre: string
  codigo: string
  region_id: string
  region: { nombre: string } | null
}

export async function listLigas(): Promise<Liga[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('liga')
    .select('id, nombre, codigo, region_id, region:region(nombre)')
    .order('nombre')
  if (error) throw new Error(error.message)
  return data as unknown as Liga[]
}

export async function crearLiga(input: { nombre: string; codigo: string; region_id: string }): Promise<void> {
  const perfil = await getProfile()
  if (!perfil || (perfil.rol !== ROLES.ADMIN_NACIONAL && perfil.rol !== ROLES.ADMIN_REGIONAL)) {
    throw new Error('No autorizado para crear ligas.')
  }

  const supabase = await createClient()
  const { error } = await supabase.from('liga').insert(input)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/catalogos/ligas')
}
