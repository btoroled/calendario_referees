import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const LIGA = '33333333-3333-3333-3333-333333333333'
const TEMPORADA = '44444444-4444-4444-4444-444444444444'
const LIMA = '22222222-2222-2222-2222-222222222222'

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

let fallos = 0
function check(cond: boolean, msg: string) {
  console.log(`${cond ? '  OK  ' : '  FAIL'} ${msg}`)
  if (!cond) fallos++
}

async function crearUsuario(rol: string, regionId: string | null) {
  const email = `smoke-${rol}-${randomUUID().slice(0, 8)}@test.local`
  const password = 'SmokeTest123!'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`no se pudo crear ${email}: ${error?.message}`)
  await admin.from('perfil').insert({
    id: data.user.id,
    nombre: email,
    email,
    rol,
    pais_id: rol === 'admin_nacional' ? '11111111-1111-1111-1111-111111111111' : null,
    region_id: rol === 'admin_nacional' ? null : regionId,
  })
  return { email, password, userId: data.user.id }
}

async function sesion(email: string, password: string) {
  const c = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return c
}

async function main() {
  const suf = randomUUID().slice(0, 8)

  // --- Setup: usuarios + un referee vinculado + disponibilidad + un partido jugado ---
  const designador = await crearUsuario('designador', LIMA)
  const evaluador = await crearUsuario('evaluador', LIMA)
  const refereeUser = await crearUsuario('referee', LIMA)

  const { data: club } = await admin.from('club').select('id, codigo').in('codigo', ['ALU', 'LRC'])
  const alu = club!.find((c) => c.codigo === 'ALU')!.id
  const lrc = club!.find((c) => c.codigo === 'LRC')!.id

  const { data: referee } = await admin
    .from('referee')
    .insert({ nombre: `smoke-ref-${suf}`, categoria: 'Regional', region_id: LIMA, usuario_id: refereeUser.userId, club_id: null })
    .select('id')
    .single()

  await admin.from('disponibilidad').insert({
    referee_id: referee!.id,
    fecha_inicio: '2026-01-01T00:00:00Z',
    fecha_fin: '2026-12-31T23:59:59Z',
    disponible: true,
  })

  const { data: partido } = await admin
    .from('partido')
    .insert({
      liga_id: LIGA,
      temporada_id: TEMPORADA,
      fecha: '2026-09-01',
      hora: '15:00',
      categoria: 'Regional',
      club_local_id: alu,
      club_visita_id: lrc,
      categoria_minima_referee: 'Regional',
      es_historico: false,
    })
    .select('id')
    .single()

  // --- 1. El designador crea la designación (RLS: insert scope) ---
  const cDes = await sesion(designador.email, designador.password)
  const { error: eDesig } = await cDes.from('designacion').insert({
    partido_id: partido!.id,
    referee_id: referee!.id,
    puesto: 'R1',
    estado: 'confirmado',
    estado_aceptacion: 'pendiente',
    designado_por: designador.userId,
    fecha_confirmacion: new Date().toISOString(),
  })
  check(eDesig === null, '1. designador inserta la designación')

  // --- 2. El referee ve SOLO su designación confirmada y la acepta ---
  const cRef = await sesion(refereeUser.email, refereeUser.password)
  const { data: misDesig } = await cRef.from('designacion').select('id, partido_id')
  check(
    (misDesig ?? []).length === 1 && misDesig![0].partido_id === partido!.id,
    '2a. el referee ve exactamente su designación confirmada'
  )
  // El `.select()` es parte de la aserción: un UPDATE bloqueado por RLS no devuelve
  // error, solo cero filas, así que sin contar las filas devueltas el caso pasaría
  // igual aunque la policy no otorgara el permiso (ver run-rls-tests.ts:680-682).
  const { data: aceptarData, error: eAceptar } = await cRef
    .from('designacion')
    .update({ estado_aceptacion: 'aceptado', fecha_respuesta: new Date().toISOString() })
    .eq('id', misDesig![0].id)
    .select('id, estado_aceptacion')
  check(
    eAceptar === null && (aceptarData ?? []).length === 1 && aceptarData![0].estado_aceptacion === 'aceptado',
    '2b. el referee acepta su designación'
  )

  // --- 3. El designador carga el resultado del partido (RLS: partido_update_resultado) ---
  const { data: resultadoData, error: eResultado } = await cDes
    .from('partido')
    .update({ resultado_local: 24, resultado_visita: 20, tarjetas_amarillas_local: 2, tarjetas_amarillas_visita: 1, tarjetas_rojas_local: 0, tarjetas_rojas_visita: 0 })
    .eq('id', partido!.id)
    .select('id, resultado_local')
  check(
    eResultado === null && (resultadoData ?? []).length === 1 && resultadoData![0].resultado_local === 24,
    '3. designador carga el resultado del partido jugado'
  )

  // --- 4. El evaluador carga una evaluación (RLS: evaluacion_insert scope) ---
  const cEval = await sesion(evaluador.email, evaluador.password)
  const { error: eEval } = await cEval.from('evaluacion').insert({
    referee_id: referee!.id,
    partido_id: partido!.id,
    tipo: 'performance',
    valor: 8,
    fecha: '2026-09-02',
    evaluador_id: evaluador.userId,
  })
  check(eEval === null, '4. evaluador carga una evaluación del partido')

  // --- 5. El referee carga su autoevaluación (RLS: autoevaluacion_insert self+elegible) ---
  const { error: eAuto } = await cRef.from('autoevaluacion_partido').insert({
    partido_id: partido!.id,
    referee_id: referee!.id,
    autocalificacion_general: 7.5,
    condiciones_cancha: 'Húmeda',
  })
  check(eAuto === null, '5. el referee carga su autoevaluación del partido aceptado y jugado')

  // --- 6. El designador ve la evaluación y la autoevaluación (perfil consolidado, solo lectura) ---
  const { data: evalsVistas } = await cDes.from('evaluacion').select('id').eq('referee_id', referee!.id)
  const { data: autoevalsVistas } = await cDes
    .from('autoevaluacion_partido')
    .select('id')
    .eq('referee_id', referee!.id)
  check((evalsVistas ?? []).length === 1, '6a. el designador ve la evaluación del referee de su scope')
  check((autoevalsVistas ?? []).length === 1, '6b. el designador ve la autoevaluación del referee de su scope')

  // --- 7. Aislamiento: el evaluador NO puede tocar el resultado del partido ---
  const { error: eEvalResultado } = await cEval
    .from('partido')
    .update({ resultado_local: 99 })
    .eq('id', partido!.id)
  const { data: verifResultado } = await admin
    .from('partido')
    .select('resultado_local')
    .eq('id', partido!.id)
    .single()
  check(
    eEvalResultado !== null || verifResultado?.resultado_local === 24,
    '7. el evaluador no puede alterar el resultado del partido (RLS)'
  )

  // --- Teardown ---
  await admin.from('autoevaluacion_partido').delete().eq('partido_id', partido!.id)
  await admin.from('evaluacion').delete().eq('partido_id', partido!.id)
  await admin.from('designacion').delete().eq('partido_id', partido!.id)
  await admin.from('disponibilidad').delete().eq('referee_id', referee!.id)
  await admin.from('referee').delete().eq('id', referee!.id)
  await admin.from('partido').delete().eq('id', partido!.id)
  for (const u of [designador, evaluador, refereeUser]) {
    await admin.auth.admin.deleteUser(u.userId)
  }

  console.log(`\n${fallos === 0 ? 'SMOKE OK — flujo completo verificado' : `${fallos} PASO(S) FALLARON`}`)
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
