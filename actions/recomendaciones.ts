'use server'

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getProfile } from '@/lib/auth/getProfile'
import { ROLES } from '@/lib/auth/roles'
import { calcularScore } from '@/lib/scoring/calcularScore'
import type { ConfigScoring, EvaluacionInput, ResultadoScore, TipoEvaluacion } from '@/lib/scoring/tipos'

export type RecomendacionReferee = {
  referee_id: string
  nombre: string
  club_nombre: string | null
  categoria: string
  disponible: boolean
  alertaCategoria: boolean
  perteneceAClub: boolean
  score: ResultadoScore
  designacionesAceptadasEnTemporada: number
}

export type ResultadoRecomendaciones = {
  partido: {
    id: string
    fecha: string
    hora: string | null
    categoria: string
    categoria_minima_referee: string
    categoria_minima_mapeada: boolean
    complejidad: number | null
    club_local: string
    club_visita: string
  }
  recomendaciones: RecomendacionReferee[]
  noDisponibles: RecomendacionReferee[]
}

function servicio() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function configDesdeFila(fila: Record<string, number>): ConfigScoring {
  return {
    pesosNormal: {
      performance: Number(fila.peso_performance_normal),
      fisico: Number(fila.peso_fisico_normal),
      videoanalisis: Number(fila.peso_videoanalisis_normal),
      coaching: Number(fila.peso_coaching_normal),
    },
    pesosAltaComplejidad: {
      performance: Number(fila.peso_performance_alta),
      fisico: Number(fila.peso_fisico_alta),
      videoanalisis: Number(fila.peso_videoanalisis_alta),
      coaching: Number(fila.peso_coaching_alta),
    },
    umbralComplejidadAlta: Number(fila.umbral_complejidad_alta),
    factorPenalizacionClub: Number(fila.factor_penalizacion_club),
    semividaDias: Number(fila.semivida_dias),
    scoreSinEvaluaciones: Number(fila.score_sin_evaluaciones),
  }
}

const CONFIG_POR_DEFECTO: ConfigScoring = {
  pesosNormal: { performance: 0.4, fisico: 0.2, videoanalisis: 0.2, coaching: 0.2 },
  pesosAltaComplejidad: { performance: 0.5, fisico: 0.1, videoanalisis: 0.15, coaching: 0.25 },
  umbralComplejidadAlta: 7,
  factorPenalizacionClub: 0.8,
  semividaDias: 180,
  scoreSinEvaluaciones: 5,
}

export async function recomendarReferees(partidoId: string): Promise<ResultadoRecomendaciones> {
  const perfil = await getProfile()
  if (
    !perfil ||
    (perfil.rol !== ROLES.DESIGNADOR &&
      perfil.rol !== ROLES.ADMIN_REGIONAL &&
      perfil.rol !== ROLES.ADMIN_NACIONAL)
  ) {
    throw new Error('No autorizado para ver recomendaciones.')
  }

  const db = servicio()

  const { data: partido, error: partidoError } = await db
    .from('partido')
    .select(
      'id, fecha, hora, categoria, categoria_minima_referee, complejidad, liga_id, temporada_id, club_local_id, club_visita_id, club_local:club_local_id(nombre), club_visita:club_visita_id(nombre)'
    )
    .eq('id', partidoId)
    .single()
  if (partidoError || !partido) throw new Error('Partido no encontrado.')

  // Liga del partido: región + país. Sirve para (a) acotar la búsqueda de referees
  // a la región y (b) verificar que el llamador administra esta región/país antes de
  // usar el service client. Spec §11: el bypass de RLS solo se permite "con
  // autorización explícita verificada en código" — eso es rol Y alcance.
  const { data: ligaRow, error: ligaError } = await db
    .from('liga')
    .select('region_id, region:region_id(pais_id)')
    .eq('id', partido.liga_id)
    .single()
  if (ligaError || !ligaRow) throw new Error('Liga del partido no encontrada.')
  const regionId = ligaRow.region_id
  const paisId = (ligaRow.region as unknown as { pais_id: string } | null)?.pais_id ?? null

  const enAlcance =
    perfil.rol === ROLES.ADMIN_NACIONAL
      ? paisId !== null && paisId === perfil.pais_id
      : ligaRow.region_id === perfil.region_id
  if (!enAlcance) {
    throw new Error('No autorizado para ver recomendaciones de este partido.')
  }

  // El partido es a `fecha` `hora`. partido.hora es un `time` de Postgres
  // serializado "HH:MM:SS" (o null). disponibilidad.fecha_inicio/fin son hora
  // local de Lima "disfrazada" de UTC (migración 0013): se comparan por dígitos
  // crudos, sin conversión de zona.
  const instante = `${partido.fecha}T${(partido.hora ?? '00:00:00').slice(0, 8)}` // "YYYY-MM-DDTHH:MM:SS", 19 chars

  // Evaluaciones más antiguas que ~5 semividas (semividaDias por defecto 180)
  // pesan <3% tras el decaimiento exponencial — despreciable. Acota el select
  // para que no lo trunque el max_rows de PostgREST.
  const fechaEvalDesde = new Date(Date.now() - 900 * 864e5).toISOString().slice(0, 10)

  const [{ data: cfgFila }, { data: escalafon }, { data: referees }] = await Promise.all([
    db.from('configuracion_scoring').select('*').eq('liga_id', partido.liga_id).maybeSingle(),
    db.from('categoria_referee').select('nombre, orden'),
    db
      .from('referee')
      .select('id, nombre, categoria, club_id, region_id, activo, club:club_id(nombre)')
      .eq('activo', true)
      .eq('region_id', regionId),
  ])

  const config = cfgFila ? configDesdeFila(cfgFila as Record<string, number>) : CONFIG_POR_DEFECTO
  const ordenPorCategoria = new Map((escalafon ?? []).map((c) => [c.nombre, c.orden]))
  const ordenMinimaRaw = ordenPorCategoria.get(partido.categoria_minima_referee)
  const categoriaMinimaMapeada = ordenMinimaRaw !== undefined
  const ordenMinima = ordenMinimaRaw ?? 0

  // El select ya viene acotado por región; este filtro queda como no-op defensivo.
  const refsRegion = (referees ?? []).filter((r) => r.region_id === regionId)
  const refIds = refsRegion.map((r) => r.id)

  const refIdsAcotados = refIds.length > 0 ? refIds : ['00000000-0000-0000-0000-000000000000']

  // Los tres selects dependientes de `refIds` van en paralelo y TODOS acotados por
  // `refIdsAcotados`, para que el max_rows de PostgREST no los trunque en silencio.
  const [{ data: evaluaciones }, { data: ventanas }, { data: aceptadasTemporada }] =
    await Promise.all([
      db
        .from('evaluacion')
        .select('referee_id, tipo, valor, fecha')
        .in('referee_id', refIdsAcotados)
        .gte('fecha', fechaEvalDesde),
      // Disponibilidad: el referee está disponible si tiene una ventana `disponible=true`
      // que cubre `instante` y ninguna `disponible=false` que lo pise. El filtro SQL es
      // seguro bajo la convención de 0013: PostgREST parsea el literal
      // "YYYY-MM-DDTHH:MM:SS" en la TZ de sesión (UTC) — la misma semántica de dígitos
      // crudos que implementa `norm()` — así que el filtro SQL y la comparación JS
      // coinciden. El paso JS (`estaDisponible`) solo resuelve el override `disponible=false`.
      db
        .from('disponibilidad')
        .select('referee_id, fecha_inicio, fecha_fin, disponible')
        .in('referee_id', refIdsAcotados)
        .lte('fecha_inicio', instante)
        .gte('fecha_fin', instante),
      // Designaciones aceptadas por referee EN ESTA temporada — dato informativo para
      // que el designador equilibre la carga. El `!inner` sobre el partido embebido hace
      // que `partido.temporada_id` filtre de verdad (sin él el embed es un left join y
      // las filas de otras temporadas vuelven con `partido: null` en vez de excluirse).
      db
        .from('designacion')
        .select('referee_id, partido:partido_id!inner(temporada_id)')
        .eq('estado', 'confirmado')
        .eq('estado_aceptacion', 'aceptado')
        .in('referee_id', refIdsAcotados)
        .eq('partido.temporada_id', partido.temporada_id),
    ])

  const evalsPorReferee = new Map<string, EvaluacionInput[]>()
  for (const e of evaluaciones ?? []) {
    const arr = evalsPorReferee.get(e.referee_id) ?? []
    arr.push({ tipo: e.tipo as TipoEvaluacion, valor: Number(e.valor), fecha: e.fecha })
    evalsPorReferee.set(e.referee_id, arr)
  }

  function estaDisponible(refereeId: string): boolean {
    const propias = (ventanas ?? []).filter((v) => v.referee_id === refereeId)
    const norm = (s: string | null) => (s ?? '').slice(0, 19).replace(' ', 'T')
    const cubren = propias.filter(
      (v) => norm(v.fecha_inicio) <= instante && norm(v.fecha_fin) >= instante
    )
    if (cubren.length === 0) return false
    // Si alguna ventana que cubre el instante es disponible=false, gana la excepción.
    return !cubren.some((v) => v.disponible === false) && cubren.some((v) => v.disponible === true)
  }

  const conteoPorReferee = new Map<string, number>()
  for (const d of aceptadasTemporada ?? []) {
    conteoPorReferee.set(d.referee_id, (conteoPorReferee.get(d.referee_id) ?? 0) + 1)
  }

  const filas: RecomendacionReferee[] = refsRegion.map((r) => {
    const perteneceAClub =
      r.club_id === partido.club_local_id || r.club_id === partido.club_visita_id
    const score = calcularScore({
      evaluaciones: evalsPorReferee.get(r.id) ?? [],
      perteneceAClubDelPartido: perteneceAClub,
      complejidadPartido: partido.complejidad ?? 5,
      config,
      hoy: new Date().toISOString().slice(0, 10),
    })
    const ordenRef = ordenPorCategoria.get(r.categoria) ?? 0
    return {
      referee_id: r.id,
      nombre: r.nombre,
      club_nombre: (r.club as unknown as { nombre: string } | null)?.nombre ?? null,
      categoria: r.categoria,
      disponible: estaDisponible(r.id),
      alertaCategoria: ordenRef < ordenMinima,
      perteneceAClub,
      score,
      designacionesAceptadasEnTemporada: conteoPorReferee.get(r.id) ?? 0,
    }
  })

  const recomendaciones = filas
    .filter((f) => f.disponible)
    .sort((a, b) => b.score.scoreFinal - a.score.scoreFinal)
  const noDisponibles = filas.filter((f) => !f.disponible)

  return {
    partido: {
      id: partido.id,
      fecha: partido.fecha,
      hora: partido.hora,
      categoria: partido.categoria,
      categoria_minima_referee: partido.categoria_minima_referee,
      categoria_minima_mapeada: categoriaMinimaMapeada,
      complejidad: partido.complejidad,
      club_local: (partido.club_local as unknown as { nombre: string } | null)?.nombre ?? '',
      club_visita: (partido.club_visita as unknown as { nombre: string } | null)?.nombre ?? '',
    },
    recomendaciones,
    noDisponibles,
  }
}
