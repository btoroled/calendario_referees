import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Rol } from './roles'

export type Perfil = {
  id: string
  nombre: string
  email: string
  rol: Rol
  pais_id: string | null
  region_id: string | null
  liga_id: string | null
}

export const getProfile = cache(async (): Promise<Perfil | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('perfil')
    .select('id, nombre, email, rol, pais_id, region_id, liga_id')
    .eq('id', user.id)
    .single()

  if (error || !data) return null
  return data as Perfil
})
