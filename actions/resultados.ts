'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { ROLES } from '@/lib/auth/roles'
import { validarResultado, type ResultadoInput } from '@/lib/fixture/validarResultado'

export type PartidoParaResultado = {
  id: string
  fecha: string
  hora: string | null
  categoria: string
  club_local: string
  club_visita: string
  ya_jugado: boolean
  es_historico: boolean
  resultado_local: number | null
  resultado_visita: number | null
  tarjetas_amarillas_local: number | null
  tarjetas_amarillas_visita: number | null
  tarjetas_rojas_local: number | null
  tarjetas_rojas_visita: number | null
  incidentes: string | null
}

function exigirDesignador(rol: string | undefined): void {
  if (rol !== ROLES.DESIGNADOR && rol !== ROLES.ADMIN_REGIONAL && rol !== ROLES.ADMIN_NACIONAL) {
    throw new Error('No autorizado para cargar resultados.')
  }
}

export async function obtenerPartidoParaResultado(partidoId: string): Promise<PartidoParaResultado> {
  const perfil = await getProfile()
  exigirDesignador(perfil?.rol)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('partido')
    .select(
      'id, fecha, hora, categoria, es_historico, resultado_local, resultado_visita, tarjetas_amarillas_local, tarjetas_amarillas_visita, tarjetas_rojas_local, tarjetas_rojas_visita, incidentes, club_local:club_local_id(nombre), club_visita:club_visita_id(nombre)'
    )
    .eq('id', partidoId)
    .single()
  if (error || !data) throw new Error('Partido no encontrado.')

  const hoy = new Date().toISOString().slice(0, 10)
  return {
    id: data.id,
    fecha: data.fecha,
    hora: data.hora,
    categoria: data.categoria,
    club_local: (data.club_local as unknown as { nombre: string } | null)?.nombre ?? '',
    club_visita: (data.club_visita as unknown as { nombre: string } | null)?.nombre ?? '',
    ya_jugado: data.fecha <= hoy,
    es_historico: data.es_historico,
    resultado_local: data.resultado_local,
    resultado_visita: data.resultado_visita,
    tarjetas_amarillas_local: data.tarjetas_amarillas_local,
    tarjetas_amarillas_visita: data.tarjetas_amarillas_visita,
    tarjetas_rojas_local: data.tarjetas_rojas_local,
    tarjetas_rojas_visita: data.tarjetas_rojas_visita,
    incidentes: data.incidentes,
  }
}

export async function guardarResultado(
  input: { partidoId: string } & ResultadoInput
): Promise<void> {
  const perfil = await getProfile()
  exigirDesignador(perfil?.rol)

  const validacion = validarResultado(input)
  if (!validacion.ok) throw new Error(validacion.error)

  const supabase = await createClient()

  // Guardas de estado: solo partidos del fixture ya jugados.
  const { data: partido, error: partidoError } = await supabase
    .from('partido')
    .select('fecha, es_historico')
    .eq('id', input.partidoId)
    .single()
  if (partidoError || !partido) throw new Error('Partido no encontrado.')
  if (partido.es_historico) throw new Error('Este partido es histórico; su resultado se carga por el script de importación.')
  const hoy = new Date().toISOString().slice(0, 10)
  if (partido.fecha > hoy) throw new Error('No se puede cargar el resultado de un partido que todavía no se jugó.')

  const { error } = await supabase
    .from('partido')
    .update(validacion.valor)
    .eq('id', input.partidoId)
  if (error) throw new Error(error.message)

  revalidatePath(`/fixture/${input.partidoId}/resultado`)
  revalidatePath(`/fixture/${input.partidoId}`)
  revalidatePath('/fixture')
}
