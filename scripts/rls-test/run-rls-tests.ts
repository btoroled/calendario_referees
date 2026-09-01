import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const PERU_ID = '11111111-1111-1111-1111-111111111111'
const LIMA_ID = '22222222-2222-2222-2222-222222222222'

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

  await crearUsuarioDePrueba({ email: emailAdminNacional, password, rol: 'admin_nacional', pais_id: PERU_ID, region_id: null })
  await crearUsuarioDePrueba({ email: emailAdminRegionalLima, password, rol: 'admin_regional', pais_id: null, region_id: LIMA_ID })
  await crearUsuarioDePrueba({ email: emailDesignadorLima, password, rol: 'designador', pais_id: null, region_id: LIMA_ID })

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

  await admin.from('referee').delete().eq('region_id', LIMA_ID).eq('nombre', `Ref Lima ${sufijo}`)
  await admin.from('referee').delete().eq('region_id', regionTest.id).eq('nombre', `Ref Test ${sufijo}`)
  await admin.from('club').delete().eq('id', clubLima.id)
  await admin.from('club').delete().eq('id', clubTest.id)

  await admin.from('region').delete().eq('id', regionTest.id)
  await limpiarUsuarioDePrueba(emailAdminNacional)
  await limpiarUsuarioDePrueba(emailAdminRegionalLima)
  await limpiarUsuarioDePrueba(emailDesignadorLima)

  console.log(`\n${fallos === 0 ? 'TODOS LOS CASOS PASARON' : `${fallos} CASO(S) FALLARON`}`)
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
