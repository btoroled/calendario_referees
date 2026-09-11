'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { ROLES } from '@/lib/auth/roles'

export type ConfiguracionScoringFila = {
  liga_id: string
  liga_nombre: string
  peso_performance_normal: number
  peso_fisico_normal: number
  peso_videoanalisis_normal: number
  peso_coaching_normal: number
  peso_performance_alta: number
  peso_fisico_alta: number
  peso_videoanalisis_alta: number
  peso_coaching_alta: number
  umbral_complejidad_alta: number
  factor_penalizacion_club: number
  semivida_dias: number
  score_sin_evaluaciones: number
  evaluacion_bloqueante: boolean
}

function exigirAdmin(rol: string | undefined): void {
  if (rol !== ROLES.ADMIN_REGIONAL && rol !== ROLES.ADMIN_NACIONAL) {
    throw new Error('No autorizado para editar la configuración de scoring.')
  }
}

export async function listConfiguracionesScoring(): Promise<ConfiguracionScoringFila[]> {
  const perfil = await getProfile()
  exigirAdmin(perfil?.rol)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('configuracion_scoring')
    .select('*, liga:liga_id(nombre)')
  if (error) throw new Error(error.message)
  return (data ?? []).map((c) => ({
    liga_id: c.liga_id,
    liga_nombre: (c.liga as { nombre: string } | null)?.nombre ?? c.liga_id,
    peso_performance_normal: Number(c.peso_performance_normal),
    peso_fisico_normal: Number(c.peso_fisico_normal),
    peso_videoanalisis_normal: Number(c.peso_videoanalisis_normal),
    peso_coaching_normal: Number(c.peso_coaching_normal),
    peso_performance_alta: Number(c.peso_performance_alta),
    peso_fisico_alta: Number(c.peso_fisico_alta),
    peso_videoanalisis_alta: Number(c.peso_videoanalisis_alta),
    peso_coaching_alta: Number(c.peso_coaching_alta),
    umbral_complejidad_alta: Number(c.umbral_complejidad_alta),
    factor_penalizacion_club: Number(c.factor_penalizacion_club),
    semivida_dias: Number(c.semivida_dias),
    score_sin_evaluaciones: Number(c.score_sin_evaluaciones),
    evaluacion_bloqueante: Boolean(c.evaluacion_bloqueante),
  }))
}

const REDONDEO = 1e-3

export async function actualizarConfiguracionScoring(input: ConfiguracionScoringFila): Promise<void> {
  const perfil = await getProfile()
  exigirAdmin(perfil?.rol)

  const sumaNormal =
    input.peso_performance_normal +
    input.peso_fisico_normal +
    input.peso_videoanalisis_normal +
    input.peso_coaching_normal
  const sumaAlta =
    input.peso_performance_alta +
    input.peso_fisico_alta +
    input.peso_videoanalisis_alta +
    input.peso_coaching_alta
  if (Math.abs(sumaNormal - 1) > REDONDEO) throw new Error('Los pesos normales deben sumar 1.000.')
  if (Math.abs(sumaAlta - 1) > REDONDEO) throw new Error('Los pesos de alta complejidad deben sumar 1.000.')
  if (input.umbral_complejidad_alta < 1 || input.umbral_complejidad_alta > 10) {
    throw new Error('El umbral de complejidad alta debe estar entre 1 y 10.')
  }
  if (input.factor_penalizacion_club < 0 || input.factor_penalizacion_club > 1) {
    throw new Error('El factor de penalización por club debe estar entre 0 y 1.')
  }
  if (input.semivida_dias <= 0) throw new Error('La semivida en días debe ser positiva.')

  const supabase = await createClient()
  const { liga_id, liga_nombre: _omit, ...campos } = input
  void _omit
  // El `.select('liga_id')` no es cosmético: un UPDATE que RLS deja sin filas vuelve con
  // `error === null`, así que sin contar las filas devueltas un usuario fuera de alcance
  // (p. ej. admin_nacional con region_id pero sin pais_id, que igual puede LEER la
  // configuración) vería "Configuración guardada." sin que se haya persistido nada.
  const { data: actualizados, error } = await supabase
    .from('configuracion_scoring')
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq('liga_id', liga_id)
    .select('liga_id')
  if (error) throw new Error(error.message)
  if ((actualizados ?? []).length === 0) {
    throw new Error('No se pudo guardar la configuración (la liga no está en tu alcance).')
  }

  revalidatePath('/admin/configuracion-scoring')
}
