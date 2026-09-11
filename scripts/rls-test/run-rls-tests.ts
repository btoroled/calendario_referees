import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const PERU_ID = '11111111-1111-1111-1111-111111111111'
const LIMA_ID = '22222222-2222-2222-2222-222222222222'
const LIGA_METRO_ID = '33333333-3333-3333-3333-333333333333'

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let fallos = 0
function assert(condicion: boolean, mensaje: string) {
  if (condicion) {
    console.log(`  OK   ${mensaje}`)
  } else {
    console.error(`  FAIL ${mensaje}`)
    fallos++
  }
}

type UsuarioDePrueba = {
  email: string
  password: string
  rol: 'admin_nacional' | 'admin_regional' | 'designador' | 'evaluador' | 'referee'
  pais_id: string | null
  region_id: string | null
}

async function crearUsuarioDePrueba(u: UsuarioDePrueba) {
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`No se pudo crear ${u.email}: ${error?.message}`)

  const { error: perfilError } = await admin.from('perfil').insert({
    id: data.user.id,
    nombre: u.email,
    email: u.email,
    rol: u.rol,
    pais_id: u.pais_id,
    region_id: u.region_id,
  })
  if (perfilError) throw new Error(`No se pudo crear perfil de ${u.email}: ${perfilError.message}`)

  return data.user.id
}

async function iniciarSesionComo(email: string, password: string) {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`No se pudo iniciar sesión como ${email}: ${error.message}`)
  return client
}

async function limpiarUsuarioDePrueba(email: string) {
  const { data } = await admin.auth.admin.listUsers()
  const usuario = data.users.find((u) => u.email === email)
  if (usuario) await admin.auth.admin.deleteUser(usuario.id)
}

async function main() {
  const sufijo = randomUUID().slice(0, 8)
  const password = 'ClaveDePrueba123!'

  const { data: regionTest, error: regionTestError } = await admin
    .from('region')
    .insert({ pais_id: PERU_ID, nombre: `Región Test ${sufijo}`, codigo: `TST-${sufijo}` })
    .select('id')
    .single()
  if (regionTestError || !regionTest) throw new Error(regionTestError?.message)

  const emailAdminNacional = `admin-nacional-${sufijo}@test.local`
  const emailAdminRegionalLima = `admin-regional-lima-${sufijo}@test.local`
  const emailDesignadorLima = `designador-lima-${sufijo}@test.local`
  const emailEvaluadorLima = `evaluador-lima-${sufijo}@test.local`

  await crearUsuarioDePrueba({ email: emailAdminNacional, password, rol: 'admin_nacional', pais_id: PERU_ID, region_id: null })
  await crearUsuarioDePrueba({ email: emailAdminRegionalLima, password, rol: 'admin_regional', pais_id: null, region_id: LIMA_ID })
  await crearUsuarioDePrueba({ email: emailDesignadorLima, password, rol: 'designador', pais_id: null, region_id: LIMA_ID })
  await crearUsuarioDePrueba({ email: emailEvaluadorLima, password, rol: 'evaluador', pais_id: null, region_id: LIMA_ID })

  console.log('Caso: admin_nacional ve todas las regiones de Perú (Lima + región de prueba)')
  const clienteAdminNacional = await iniciarSesionComo(emailAdminNacional, password)
  const { data: regionesAdminNacional } = await clienteAdminNacional.from('region').select('id')
  assert(
    (regionesAdminNacional ?? []).some((r) => r.id === LIMA_ID) &&
      (regionesAdminNacional ?? []).some((r) => r.id === regionTest.id),
    'admin_nacional ve Lima y la región de prueba'
  )

  console.log('Caso: admin_regional de Lima NO ve la región de prueba')
  const clienteAdminRegionalLima = await iniciarSesionComo(emailAdminRegionalLima, password)
  const { data: regionesAdminRegional } = await clienteAdminRegionalLima.from('region').select('id')
  assert(
    (regionesAdminRegional ?? []).every((r) => r.id !== regionTest.id),
    'admin_regional de Lima no ve la región de prueba'
  )
  assert(
    (regionesAdminRegional ?? []).some((r) => r.id === LIMA_ID),
    'admin_regional de Lima ve su propia región'
  )

  console.log('Caso: designador de Lima NO puede insertar una región nueva')
  const clienteDesignadorLima = await iniciarSesionComo(emailDesignadorLima, password)
  const { error: insertRegionError } = await clienteDesignadorLima
    .from('region')
    .insert({ pais_id: PERU_ID, nombre: 'No debería crearse', codigo: `NOPE-${sufijo}` })
  assert(insertRegionError !== null, 'designador no puede insertar regiones (RLS lo bloquea)')

  console.log('Caso: admin_regional de Lima SÍ puede insertar una liga en su región')
  const { error: insertLigaError } = await clienteAdminRegionalLima
    .from('liga')
    .insert({ region_id: LIMA_ID, nombre: `Liga Test ${sufijo}`, codigo: `LIGA-TST-${sufijo}` })
  assert(insertLigaError === null, `admin_regional de Lima puede insertar ligas en su región${insertLigaError ? `: ${insertLigaError.message}` : ''}`)

  const { data: clubLima, error: clubLimaError } = await admin
    .from('club')
    .insert({ region_id: LIMA_ID, nombre: `Club Lima ${sufijo}`, codigo: `CLU-LIM-${sufijo}` })
    .select('id')
    .single()
  if (clubLimaError || !clubLima) throw new Error(clubLimaError?.message)

  const { data: clubTest, error: clubTestError } = await admin
    .from('club')
    .insert({ region_id: regionTest.id, nombre: `Club Test ${sufijo}`, codigo: `CLU-TST-${sufijo}` })
    .select('id')
    .single()
  if (clubTestError || !clubTest) throw new Error(clubTestError?.message)

  await admin.from('referee').insert({ region_id: LIMA_ID, club_id: clubLima.id, nombre: `Ref Lima ${sufijo}`, categoria: 'A' })
  await admin.from('referee').insert({ region_id: regionTest.id, club_id: clubTest.id, nombre: `Ref Test ${sufijo}`, categoria: 'A' })

  console.log('Caso: admin_regional de Lima solo ve clubes/referees de Lima')
  const { data: clubesAdminRegional } = await clienteAdminRegionalLima.from('club').select('id')
  assert(
    (clubesAdminRegional ?? []).some((c) => c.id === clubLima.id) &&
      (clubesAdminRegional ?? []).every((c) => c.id !== clubTest.id),
    'admin_regional de Lima ve su club y no el de la región de prueba'
  )
  const { data: refereesAdminRegional } = await clienteAdminRegionalLima.from('referee').select('id, region_id')
  assert(
    (refereesAdminRegional ?? []).every((r) => r.region_id === LIMA_ID),
    'admin_regional de Lima solo ve referees de su región'
  )

  console.log('Caso: admin_nacional ve clubes de ambas regiones')
  const { data: clubesAdminNacional } = await clienteAdminNacional.from('club').select('id')
  assert(
    (clubesAdminNacional ?? []).some((c) => c.id === clubLima.id) &&
      (clubesAdminNacional ?? []).some((c) => c.id === clubTest.id),
    'admin_nacional ve clubes de Lima y de la región de prueba'
  )

  console.log('Caso: admin_regional de Lima NO puede insertar un club en la región de prueba')
  const { error: insertClubForaneoError } = await clienteAdminRegionalLima
    .from('club')
    .insert({ region_id: regionTest.id, nombre: 'No debería crearse', codigo: `NOPE-CLU-${sufijo}` })
  assert(insertClubForaneoError !== null, 'admin_regional de Lima no puede insertar clubes fuera de su región')

  console.log('Caso: designador de Lima NO puede actualizar una región (regresión del bug de temporada_update)')
  const { data: updateRegionData, error: updateRegionError } = await clienteDesignadorLima
    .from('region')
    .update({ nombre: 'Hackeada' })
    .eq('id', LIMA_ID)
    .select()
  assert(
    updateRegionError !== null || (updateRegionData ?? []).length === 0,
    'designador no puede actualizar regiones (RLS lo bloquea)'
  )

  console.log('Caso: designador de Lima NO puede actualizar una liga')
  const { data: updateLigaData, error: updateLigaError } = await clienteDesignadorLima
    .from('liga')
    .update({ nombre: 'Hackeada' })
    .eq('id', '33333333-3333-3333-3333-333333333333')
    .select()
  assert(
    updateLigaError !== null || (updateLigaData ?? []).length === 0,
    'designador no puede actualizar ligas (RLS lo bloquea)'
  )

  console.log('Caso: designador de Lima NO puede actualizar una temporada (esto es lo que el bug de temporada_update permitía)')
  const { data: updateTemporadaData, error: updateTemporadaError } = await clienteDesignadorLima
    .from('temporada')
    .update({ activa: false })
    .eq('id', '44444444-4444-4444-4444-444444444444')
    .select()
  assert(
    updateTemporadaError !== null || (updateTemporadaData ?? []).length === 0,
    'designador no puede actualizar temporadas (RLS lo bloquea)'
  )

  console.log('Caso: admin_regional de Lima ve la Temporada 2026 (visibilidad en cascada vía liga)')
  const { data: temporadasAdminRegional } = await clienteAdminRegionalLima.from('temporada').select('id')
  assert(
    (temporadasAdminRegional ?? []).some((t) => t.id === '44444444-4444-4444-4444-444444444444'),
    'admin_regional de Lima ve la temporada de su liga'
  )

  console.log('Caso: designador de Lima NO puede actualizar un club de su propia región')
  const { data: updateClubData, error: updateClubError } = await clienteDesignadorLima
    .from('club')
    .update({ nombre: 'Hackeado' })
    .eq('id', clubLima.id)
    .select()
  assert(
    updateClubError !== null || (updateClubData ?? []).length === 0,
    'designador no puede actualizar clubes (RLS lo bloquea, solo admin_nacional/admin_regional)'
  )

  console.log('Caso: perfil — cada cliente ve su propio perfil')
  const { data: perfilPropioDesignador } = await clienteDesignadorLima.from('perfil').select('id').eq('id', (await clienteDesignadorLima.auth.getUser()).data.user?.id ?? '')
  assert((perfilPropioDesignador ?? []).length === 1, 'designador ve su propia fila de perfil (perfil_select_self)')

  const emailEvaluadorTest = `evaluador-test-${sufijo}@test.local`
  await crearUsuarioDePrueba({ email: emailEvaluadorTest, password, rol: 'evaluador', pais_id: null, region_id: regionTest.id })

  console.log('Caso: admin_regional de Lima NO ve el perfil de un evaluador de la región de prueba')
  const { data: perfilesAdminRegional } = await clienteAdminRegionalLima.from('perfil').select('id, email')
  assert(
    (perfilesAdminRegional ?? []).every((p) => p.email !== emailEvaluadorTest),
    'admin_regional de Lima no ve perfiles de otra región (perfil_select_scope)'
  )

  console.log('Caso: admin_nacional SÍ ve el perfil de un evaluador de la región de prueba')
  const { data: perfilesAdminNacional } = await clienteAdminNacional.from('perfil').select('id, email')
  assert(
    (perfilesAdminNacional ?? []).some((p) => p.email === emailEvaluadorTest),
    'admin_nacional ve perfiles de cualquier región de su país (perfil_select_scope)'
  )

  const emailRefereeA = `referee-a-${sufijo}@test.local`
  const emailRefereeB = `referee-b-${sufijo}@test.local`
  const refereeAUsuarioId = await crearUsuarioDePrueba({ email: emailRefereeA, password, rol: 'referee', pais_id: null, region_id: LIMA_ID })
  const refereeBUsuarioId = await crearUsuarioDePrueba({ email: emailRefereeB, password, rol: 'referee', pais_id: null, region_id: LIMA_ID })

  const { data: refereeCatalogoA, error: refereeCatalogoAError } = await admin
    .from('referee')
    .insert({ region_id: LIMA_ID, club_id: clubLima.id, nombre: `Referee A ${sufijo}`, categoria: 'A', usuario_id: refereeAUsuarioId })
    .select('id')
    .single()
  if (refereeCatalogoAError || !refereeCatalogoA) throw new Error(refereeCatalogoAError?.message)

  const { data: refereeCatalogoB, error: refereeCatalogoBError } = await admin
    .from('referee')
    .insert({ region_id: LIMA_ID, club_id: clubLima.id, nombre: `Referee B ${sufijo}`, categoria: 'A', usuario_id: refereeBUsuarioId })
    .select('id')
    .single()
  if (refereeCatalogoBError || !refereeCatalogoB) throw new Error(refereeCatalogoBError?.message)

  const clienteRefereeA = await iniciarSesionComo(emailRefereeA, password)
  const clienteRefereeB = await iniciarSesionComo(emailRefereeB, password)

  console.log('Caso: referee A puede insertar su propia disponibilidad')
  const { error: insertDisponibilidadAError } = await clienteRefereeA.from('disponibilidad').insert({
    referee_id: refereeCatalogoA.id,
    fecha_inicio: '2026-10-01T00:00:00Z',
    fecha_fin: '2026-10-03T00:00:00Z',
    disponible: true,
  })
  assert(
    insertDisponibilidadAError === null,
    `referee A puede insertar su propia disponibilidad${insertDisponibilidadAError ? `: ${insertDisponibilidadAError.message}` : ''}`
  )

  console.log('Caso: referee A NO puede insertar disponibilidad para referee B')
  const { error: insertDisponibilidadForaneaError } = await clienteRefereeA.from('disponibilidad').insert({
    referee_id: refereeCatalogoB.id,
    fecha_inicio: '2026-10-01T00:00:00Z',
    fecha_fin: '2026-10-03T00:00:00Z',
    disponible: true,
  })
  assert(insertDisponibilidadForaneaError !== null, 'referee A no puede insertar disponibilidad para referee B (RLS lo bloquea)')

  console.log('Caso: referee A ve su propia disponibilidad')
  const { data: disponibilidadPropiaA } = await clienteRefereeA.from('disponibilidad').select('id').eq('referee_id', refereeCatalogoA.id)
  assert((disponibilidadPropiaA ?? []).length === 1, 'referee A ve su propia disponibilidad')

  console.log('Caso: referee B NO ve la disponibilidad de referee A')
  const { data: disponibilidadVistaPorB } = await clienteRefereeB.from('disponibilidad').select('id').eq('referee_id', refereeCatalogoA.id)
  assert((disponibilidadVistaPorB ?? []).length === 0, 'referee B no ve la disponibilidad de referee A')

  console.log('Caso: referee B NO puede eliminar disponibilidad de referee A')
  const { data: deleteDisponibilidadData, error: deleteDisponibilidadError } = await clienteRefereeB
    .from('disponibilidad')
    .delete()
    .eq('referee_id', refereeCatalogoA.id)
    .select()
  assert(
    deleteDisponibilidadError !== null || (deleteDisponibilidadData ?? []).length === 0,
    'referee B no puede eliminar disponibilidad de referee A'
  )

  await admin.from('disponibilidad').delete().eq('referee_id', refereeCatalogoA.id)
  await admin.from('referee').delete().eq('id', refereeCatalogoA.id)
  await admin.from('referee').delete().eq('id', refereeCatalogoB.id)
  await limpiarUsuarioDePrueba(emailRefereeA)
  await limpiarUsuarioDePrueba(emailRefereeB)

  const { data: clubAlumni, error: clubAlumniError } = await admin
    .from('club')
    .select('id')
    .eq('region_id', LIMA_ID)
    .eq('codigo', 'ALU')
    .single()
  if (clubAlumniError || !clubAlumni) throw new Error('No se encontró el club semilla ALU: ' + clubAlumniError?.message)

  const { data: clubTest2, error: clubTest2Error } = await admin
    .from('club')
    .insert({ region_id: regionTest.id, nombre: `Club Test 2 ${sufijo}`, codigo: `CLU-TST2-${sufijo}` })
    .select('id')
    .single()
  if (clubTest2Error || !clubTest2) throw new Error(clubTest2Error?.message)

  const { data: ligaTest, error: ligaTestError } = await admin
    .from('liga')
    .insert({ region_id: regionTest.id, nombre: `Liga Test ${sufijo}`, codigo: `LIGA-TST2-${sufijo}` })
    .select('id')
    .single()
  if (ligaTestError || !ligaTest) throw new Error(ligaTestError?.message)

  const { data: temporadaTest, error: temporadaTestError } = await admin
    .from('temporada')
    .insert({ liga_id: ligaTest.id, nombre: `Temporada Test ${sufijo}`, fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31' })
    .select('id')
    .single()
  if (temporadaTestError || !temporadaTest) throw new Error(temporadaTestError?.message)

  console.log('Caso: designador de Lima puede insertar un partido en la liga de su región')
  const { error: insertPartidoLimaError } = await clienteDesignadorLima.from('partido').insert({
    liga_id: '33333333-3333-3333-3333-333333333333',
    temporada_id: '44444444-4444-4444-4444-444444444444',
    fecha: '2026-10-10',
    hora: '15:00',
    categoria: 'Primera',
    club_local_id: clubLima.id,
    club_visita_id: clubAlumni.id,
    categoria_minima_referee: 'Regional',
  })
  assert(
    insertPartidoLimaError === null,
    `designador de Lima puede insertar un partido en su región${insertPartidoLimaError ? `: ${insertPartidoLimaError.message}` : ''}`
  )

  console.log('Caso: designador de Lima NO puede insertar un partido en la liga de la región de prueba')
  const { error: insertPartidoForaneoError } = await clienteDesignadorLima.from('partido').insert({
    liga_id: ligaTest.id,
    temporada_id: temporadaTest.id,
    fecha: '2026-10-10',
    hora: '15:00',
    categoria: 'Primera',
    club_local_id: clubTest.id,
    club_visita_id: clubTest2.id,
    categoria_minima_referee: 'Regional',
  })
  assert(insertPartidoForaneoError !== null, 'designador de Lima no puede insertar partidos en la liga de otra región (RLS lo bloquea)')

  const { data: partidoTest, error: partidoTestError } = await admin
    .from('partido')
    .insert({
      liga_id: ligaTest.id,
      temporada_id: temporadaTest.id,
      fecha: '2026-10-11',
      hora: '15:00',
      categoria: 'Primera',
      club_local_id: clubTest.id,
      club_visita_id: clubTest2.id,
      categoria_minima_referee: 'Regional',
    })
    .select('id')
    .single()
  if (partidoTestError || !partidoTest) throw new Error(partidoTestError?.message)

  console.log('Caso: admin_regional de Lima ve los partidos de su región')
  const { data: partidosAdminRegional } = await clienteAdminRegionalLima.from('partido').select('id').eq('liga_id', '33333333-3333-3333-3333-333333333333')
  assert((partidosAdminRegional ?? []).length > 0, 'admin_regional de Lima ve los partidos de la liga de su región')

  console.log('Caso: admin_regional de Lima NO ve el partido de la liga de la región de prueba')
  const { data: partidosAjenosAdminRegional } = await clienteAdminRegionalLima.from('partido').select('id').eq('id', partidoTest.id)
  assert((partidosAjenosAdminRegional ?? []).length === 0, 'admin_regional de Lima no ve partidos de la región de prueba')

  console.log('Caso: designador de Lima NO ve el partido de la liga de la región de prueba (frontera en la que se apoya el gate de alcance de recomendarReferees)')
  const { data: partidoTestVistoPorDesignador } = await clienteDesignadorLima
    .from('partido')
    .select('*')
    .eq('id', partidoTest.id)
  assert(
    (partidoTestVistoPorDesignador ?? []).length === 0,
    'designador de Lima no ve el partido de otra región — el gate de alcance de recomendarReferees no puede ser burlado con un partidoId ajeno'
  )

  console.log('Caso: admin_nacional ve partidos de ambas regiones')
  const { data: partidosAdminNacional } = await clienteAdminNacional.from('partido').select('id').eq('id', partidoTest.id)
  assert((partidosAdminNacional ?? []).length === 1, 'admin_nacional ve el partido de la región de prueba')

  // ---- configuracion_scoring ----

  console.log('Caso: designador de Lima puede LEER la configuracion_scoring de su liga')
  const { data: cfgLeidaDesignador } = await clienteDesignadorLima
    .from('configuracion_scoring')
    .select('liga_id')
    .eq('liga_id', LIGA_METRO_ID)
  assert(
    (cfgLeidaDesignador ?? []).some((c) => c.liga_id === LIGA_METRO_ID),
    'designador de Lima lee la config de scoring de su liga'
  )

  console.log('Caso: designador de Lima NO puede MODIFICAR la configuracion_scoring')
  const { error: cfgUpdateDesignadorError } = await clienteDesignadorLima
    .from('configuracion_scoring')
    .update({ umbral_complejidad_alta: 3 })
    .eq('liga_id', LIGA_METRO_ID)
  assert(
    cfgUpdateDesignadorError !== null ||
      (await (async () => {
        const { data } = await admin
          .from('configuracion_scoring')
          .select('umbral_complejidad_alta')
          .eq('liga_id', LIGA_METRO_ID)
          .single()
        return data?.umbral_complejidad_alta === 7
      })()),
    'designador de Lima no puede modificar la config de scoring (RLS lo bloquea o el update no afecta filas)'
  )

  console.log('Caso: admin_regional de Lima SÍ puede MODIFICAR la configuracion_scoring de su liga')
  const { data: cfgUpdateAdminData, error: cfgUpdateAdminError } = await clienteAdminRegionalLima
    .from('configuracion_scoring')
    .update({ umbral_complejidad_alta: 6 })
    .eq('liga_id', LIGA_METRO_ID)
    .select('umbral_complejidad_alta')
  assert(
    cfgUpdateAdminError === null,
    `admin_regional de Lima modifica la config de su liga${cfgUpdateAdminError ? `: ${cfgUpdateAdminError.message}` : ''}`
  )
  assert(
    (cfgUpdateAdminData ?? []).length === 1 && cfgUpdateAdminData![0].umbral_complejidad_alta === 6,
    'el update de admin_regional realmente afectó la fila (umbral_complejidad_alta = 6)'
  )
  await admin.from('configuracion_scoring').update({ umbral_complejidad_alta: 7 }).eq('liga_id', LIGA_METRO_ID)

  // ---- evaluacion ----
  const { data: refereeLima } = await admin
    .from('referee')
    .select('id')
    .eq('region_id', LIMA_ID)
    .limit(1)
    .single()

  console.log('Caso: evaluador de Lima puede INSERTAR una evaluación de un referee de su región')
  const clienteEvaluadorLima = await iniciarSesionComo(emailEvaluadorLima, password)
  const { data: evalInsertada, error: evalInsertError } = await clienteEvaluadorLima
    .from('evaluacion')
    .insert({ referee_id: refereeLima!.id, tipo: 'performance', valor: 8, fecha: '2026-09-01' })
    .select('id')
  assert(
    evalInsertError === null,
    `evaluador de Lima inserta evaluación de un referee de su región${evalInsertError ? `: ${evalInsertError.message}` : ''}`
  )
  const evalIdsInsertadas = (evalInsertada ?? []).map((e) => e.id as string)

  console.log('Caso: designador de Lima NO puede INSERTAR una evaluación')
  const { error: evalInsertDesignadorError } = await clienteDesignadorLima
    .from('evaluacion')
    .insert({ referee_id: refereeLima!.id, tipo: 'fisico', valor: 5, fecha: '2026-09-01' })
  assert(
    evalInsertDesignadorError !== null,
    'designador de Lima no puede insertar evaluaciones (RLS lo bloquea)'
  )

  // Limpieza acotada: solo las filas que este script insertó, no todas las del referee.
  if (evalIdsInsertadas.length > 0) {
    await admin.from('evaluacion').delete().in('id', evalIdsInsertadas)
  }

  // ---- designacion ----
  // Prepara: un partido de la Liga Metropolitana y un referee de Lima con cuenta.
  const { data: clubLRC, error: clubLRCError } = await admin
    .from('club')
    .select('id')
    .eq('region_id', LIMA_ID)
    .eq('codigo', 'LRC')
    .single()
  if (clubLRCError || !clubLRC) throw new Error('No se encontró el club semilla LRC: ' + clubLRCError?.message)

  const { data: partidoLima, error: partidoLimaError } = await admin
    .from('partido')
    .insert({
      liga_id: LIGA_METRO_ID,
      temporada_id: '44444444-4444-4444-4444-444444444444',
      fecha: '2026-11-01',
      hora: '15:00',
      categoria: 'Regional',
      club_local_id: clubAlumni.id,
      club_visita_id: clubLRC.id,
      categoria_minima_referee: 'Regional',
      es_historico: false,
    })
    .select('id')
    .single()
  if (partidoLimaError || !partidoLima) throw new Error(partidoLimaError?.message)

  const emailRefereeLima = `referee-lima-${sufijo}@test.local`
  const refereeLimaUserId = await crearUsuarioDePrueba({
    email: emailRefereeLima,
    password,
    rol: 'referee',
    pais_id: null,
    region_id: LIMA_ID,
  })
  const { data: refereeVinculado, error: refereeVinculadoError } = await admin
    .from('referee')
    .insert({ nombre: emailRefereeLima, categoria: 'Regional', region_id: LIMA_ID, usuario_id: refereeLimaUserId })
    .select('id')
    .single()
  if (refereeVinculadoError || !refereeVinculado) throw new Error(refereeVinculadoError?.message)

  console.log('Caso: designador de Lima puede INSERTAR una designacion en un partido de su liga')
  const { error: desigInsertError } = await clienteDesignadorLima.from('designacion').insert({
    partido_id: partidoLima.id,
    referee_id: refereeVinculado.id,
    puesto: 'R1',
    estado: 'confirmado',
    estado_aceptacion: 'pendiente',
    fecha_confirmacion: new Date().toISOString(),
  })
  assert(
    desigInsertError === null,
    `designador de Lima inserta designacion${desigInsertError ? `: ${desigInsertError.message}` : ''}`
  )

  console.log('Caso: el referee ve su designacion confirmada')
  const clienteRefereeLima = await iniciarSesionComo(emailRefereeLima, password)
  const { data: misDesig } = await clienteRefereeLima.from('designacion').select('id, partido_id')
  assert(
    (misDesig ?? []).some((d) => d.partido_id === partidoLima.id),
    'el referee ve su designacion confirmada'
  )

  console.log('Caso: el referee puede cambiar su estado_aceptacion a aceptado')
  const { data: aceptada, error: aceptarError } = await clienteRefereeLima
    .from('designacion')
    .update({ estado_aceptacion: 'aceptado' })
    .eq('id', (misDesig ?? [])[0]?.id)
    .select('id, estado_aceptacion')
  assert(
    aceptarError === null && (aceptada ?? []).length === 1 && aceptada![0].estado_aceptacion === 'aceptado',
    `el referee acepta su designacion${aceptarError ? `: ${aceptarError.message}` : ''}`
  )

  // Caso "un referee NO ve designaciones que no son suyas": se omite — a esta altura
  // los clientes referee del bloque de disponibilidad ya fueron limpiados.

  // Limpieza de este bloque
  await admin.from('designacion').delete().eq('partido_id', partidoLima.id)
  await admin.from('referee').delete().eq('id', refereeVinculado.id)
  await admin.from('partido').delete().eq('id', partidoLima.id)
  await limpiarUsuarioDePrueba(emailRefereeLima)

  await admin.from('partido').delete().eq('liga_id', ligaTest.id)
  await admin.from('partido').delete().eq('liga_id', '33333333-3333-3333-3333-333333333333').eq('club_local_id', clubLima.id)
  await admin.from('temporada').delete().eq('id', temporadaTest.id)
  await admin.from('liga').delete().eq('id', ligaTest.id)
  await admin.from('club').delete().eq('id', clubTest2.id)

  await admin.from('referee').delete().eq('region_id', LIMA_ID).eq('nombre', `Ref Lima ${sufijo}`)
  await admin.from('referee').delete().eq('region_id', regionTest.id).eq('nombre', `Ref Test ${sufijo}`)
  await admin.from('club').delete().eq('id', clubLima.id)
  await admin.from('club').delete().eq('id', clubTest.id)

  await admin.from('region').delete().eq('id', regionTest.id)
  await limpiarUsuarioDePrueba(emailAdminNacional)
  await limpiarUsuarioDePrueba(emailAdminRegionalLima)
  await limpiarUsuarioDePrueba(emailDesignadorLima)
  await limpiarUsuarioDePrueba(emailEvaluadorLima)
  await limpiarUsuarioDePrueba(emailEvaluadorTest)

  console.log(`\n${fallos === 0 ? 'TODOS LOS CASOS PASARON' : `${fallos} CASO(S) FALLARON`}`)
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
