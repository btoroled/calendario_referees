# Plataforma de Designación de Referees — Fundación (Fases 0-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar funcionando login vía Supabase Auth, navegación condicionada por rol, y CRUD de catálogos (regiones/ligas/clubes/referees) con Row-Level Security verificada automáticamente — la base sobre la que se construyen las fases de negocio (disponibilidad, fixture, scoring) en planes futuros.

**Architecture:** Next.js (App Router, TypeScript) para frontend + backend vía server actions. Postgres/Auth/RLS vía Supabase, desarrollado localmente con el Supabase CLI (migraciones versionadas en `supabase/migrations/`). El aislamiento multi-tenant (`pais → region → liga → temporada`) se implementa 100% a nivel de base de datos con RLS, usando funciones `SECURITY DEFINER` (`fn_rol()`, `fn_region_id()`, etc.) para evitar recursión al leer el propio perfil dentro de sus policies. Los server actions hacen una verificación de rol adicional en código (defensa en profundidad, y para dar mensajes de error legibles en vez de la violación cruda de RLS).

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind CSS, `@supabase/supabase-js` + `@supabase/ssr`, Supabase CLI para desarrollo local, Vitest para unit tests, `tsx` para scripts standalone, npm.

**Spec:** `docs/superpowers/specs/2026-08-31-plataforma-designacion-referees-design.md` (secciones 3, 4, 5 parcial, 10 parcial, 11)

## Global Constraints

- RLS habilitada y forzada (`force row level security`) en **todas** las tablas, sin excepciones (spec §11).
- Jerarquía multi-tenant fija: `pais → region → liga → temporada` (spec §3, §5).
- Roles fijos, exactamente estos cinco: `admin_nacional`, `admin_regional`, `designador`, `evaluador`, `referee` (spec §4). No agregar roles nuevos en esta fase.
- Nomenclatura de dominio en español, coincidiendo exactamente con los nombres de entidades/campos del spec.
- Sin notificaciones push/email en el MVP (spec §2).
- MVP seedeado solo con Perú → Lima → Liga Metropolitana → Temporada 2026 (spec §1, §3).

**Nota sobre TDD en este plan:** las tareas de infraestructura (scaffold, setup de Supabase, migraciones SQL) no tienen un ciclo rojo/verde clásico — no existe un "test que falla" antes de que un archivo de configuración exista. Para esas tareas, el paso "test" es un comando de verificación determinístico (build, `supabase db reset`, una query) que debe confirmarse en el estado esperado antes de continuar. Las tareas de lógica de aplicación (Tarea 7, y las de fases futuras como el motor de scoring) sí siguen TDD rojo/verde completo con Vitest.

---

## Estructura de archivos

```
supabase/
  config.toml
  migrations/
    0001_enums.sql
    0002_organizacion.sql
    0003_perfil.sql
    0004_rls_helpers.sql
    0005_rls_policies_organizacion.sql
    0006_seed_peru.sql
    0007_club.sql
    0008_referee.sql
lib/
  supabase/client.ts
  supabase/server.ts
  auth/roles.ts
  auth/getProfile.ts
actions/
  catalogos.ts
components/catalogos/
  RegionForm.tsx
  LigaForm.tsx
  ClubForm.tsx
  RefereeForm.tsx
app/
  page.tsx
  (auth)/login/page.tsx
  (app)/layout.tsx
  (app)/dashboard/page.tsx
  (app)/admin/catalogos/regiones/page.tsx
  (app)/admin/catalogos/ligas/page.tsx
  (app)/admin/catalogos/clubes/page.tsx
  (app)/admin/catalogos/referees/page.tsx
middleware.ts
scripts/rls-test/run-rls-tests.ts
tests/unit/roles.test.ts
vitest.config.ts
```

---

### Task 1: Scaffold del proyecto Next.js

**Files:**
- Create: todo lo generado por `create-next-app` en la raíz del repo (`package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `.gitignore`, `eslint.config.mjs`)

**Interfaces:**
- Produces: proyecto Next.js compilable (`npm run build`, `npm run dev`), alias de import `@/*` → raíz del repo.

- [ ] **Step 1: Scaffold en un directorio temporal**

`create-next-app` rechaza directorios no vacíos que contengan archivos fuera de su lista blanca (el repo ya tiene `README.md` y `docs/`). Se scaffoldea en un hermano temporal y se copia después.

```bash
cd /Users/btoro/Documents/GitHub
npx create-next-app@latest rugby-scaffold-tmp \
  --typescript --tailwind --eslint --app \
  --src-dir=false --import-alias "@/*" --use-npm --yes
```

- [ ] **Step 2: Copiar el scaffold al repo, sin pisar lo existente**

```bash
rsync -a \
  --exclude='.git' --exclude='README.md' \
  --exclude='node_modules' --exclude='.next' \
  /Users/btoro/Documents/GitHub/rugby-scaffold-tmp/ \
  /Users/btoro/Documents/GitHub/rugby/
rm -rf /Users/btoro/Documents/GitHub/rugby-scaffold-tmp
cd /Users/btoro/Documents/GitHub/rugby
npm install
```

- [ ] **Step 3: Verificar que compila**

Run: `npm run build`
Expected: termina con código de salida 0, sin errores de tipos.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project (App Router, TypeScript, Tailwind)"
```

---

### Task 2: Cliente Supabase (browser/server) + Supabase local

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `supabase/config.toml`, `.env.local` (no versionado), `.env.local.example`
- Modify: `.gitignore` (agregar `.env.local` si `create-next-app` no lo hizo ya — normalmente ya lo hace vía el patrón `.env*.local`)

**Interfaces:**
- Consumes: nada (primera pieza de infraestructura de datos).
- Produces: `createClient(): SupabaseClient` (browser, `lib/supabase/client.ts`), `createClient(): Promise<SupabaseClient>` (server, `lib/supabase/server.ts`) — usados por todas las tareas siguientes que leen/escriben en Supabase.

- [ ] **Step 1: Instalar dependencias**

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install -D supabase tsx vitest dotenv
```

- [ ] **Step 2: Inicializar y levantar Supabase local**

```bash
npx supabase init
npx supabase start
```

Anotar del output: `API URL`, `anon key`, `service_role key`.

- [ ] **Step 3: Crear `.env.local` y `.env.local.example`**

`.env.local` (con los valores reales impresos por `supabase start`):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key de supabase start>
SUPABASE_SERVICE_ROLE_KEY=<service_role key de supabase start>
```

`.env.local.example` (mismo archivo sin valores reales, sí versionado):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 4: Crear `lib/supabase/client.ts`**

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 5: Crear `lib/supabase/server.ts`**

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Se llama desde un Server Component sin permiso de escritura;
            // el middleware (Task 8) se encarga de refrescar la sesión.
          }
        },
      },
    }
  )
}
```

- [ ] **Step 6: Verificar conexión**

Run: `npx supabase status`
Expected: todos los servicios (`API`, `DB`, `Studio`, etc.) aparecen corriendo.

- [ ] **Step 7: Commit**

```bash
git add lib/supabase supabase/config.toml .env.local.example .gitignore package.json package-lock.json
git commit -m "feat: add Supabase browser/server clients and local project config"
```

---

### Task 3: Migraciones — enums + organización

**Files:**
- Create: `supabase/migrations/0001_enums.sql`, `supabase/migrations/0002_organizacion.sql`

**Interfaces:**
- Produces: tipo `rol_usuario`; tablas `pais`, `region`, `liga`, `temporada` (RLS enabled/forced, sin policies — deny-by-default hasta la Task 5).

- [ ] **Step 1: `supabase/migrations/0001_enums.sql`**

```sql
create type rol_usuario as enum (
  'admin_nacional',
  'admin_regional',
  'designador',
  'evaluador',
  'referee'
);
```

- [ ] **Step 2: `supabase/migrations/0002_organizacion.sql`**

```sql
create table pais (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  codigo text not null unique,
  created_at timestamptz not null default now()
);

create table region (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references pais(id) on delete restrict,
  nombre text not null,
  codigo text not null,
  created_at timestamptz not null default now(),
  unique (pais_id, codigo)
);

create table liga (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references region(id) on delete restrict,
  nombre text not null,
  codigo text not null,
  created_at timestamptz not null default now(),
  unique (region_id, codigo)
);

create table temporada (
  id uuid primary key default gen_random_uuid(),
  liga_id uuid not null references liga(id) on delete restrict,
  nombre text not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

alter table pais enable row level security;
alter table pais force row level security;
alter table region enable row level security;
alter table region force row level security;
alter table liga enable row level security;
alter table liga force row level security;
alter table temporada enable row level security;
alter table temporada force row level security;
```

- [ ] **Step 3: Aplicar y verificar**

Run: `npx supabase db reset`
Expected: aplica sin error.

Run: `npx supabase db execute --local "select count(*) from region;"` (o vía Studio en `http://127.0.0.1:54323`)
Expected: `0` filas, sin error — la tabla existe y el service role (usado por `db execute`) bypassa RLS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_enums.sql supabase/migrations/0002_organizacion.sql
git commit -m "feat(db): add rol_usuario enum and pais/region/liga/temporada tables"
```

---

### Task 4: Migración — perfil + funciones RLS helper

**Files:**
- Create: `supabase/migrations/0003_perfil.sql`, `supabase/migrations/0004_rls_helpers.sql`

**Interfaces:**
- Consumes: tabla `pais`/`region`/`liga` (Task 3), `auth.users` (nativa de Supabase).
- Produces: tabla `perfil`; funciones SQL `fn_perfil()`, `fn_rol()`, `fn_pais_id()`, `fn_region_id()`, `fn_liga_id()` — usadas por todas las policies desde la Task 5 en adelante.

- [ ] **Step 1: `supabase/migrations/0003_perfil.sql`**

```sql
create table perfil (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  email text not null,
  rol rol_usuario not null,
  pais_id uuid references pais(id) on delete restrict,
  region_id uuid references region(id) on delete restrict,
  liga_id uuid references liga(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table perfil enable row level security;
alter table perfil force row level security;
```

- [ ] **Step 2: `supabase/migrations/0004_rls_helpers.sql`**

```sql
create or replace function fn_perfil()
returns perfil
language sql
security definer
stable
set search_path = public
as $$
  select * from perfil where id = auth.uid();
$$;

create or replace function fn_rol()
returns rol_usuario
language sql
security definer
stable
set search_path = public
as $$
  select rol from perfil where id = auth.uid();
$$;

create or replace function fn_pais_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select pais_id from perfil where id = auth.uid();
$$;

create or replace function fn_region_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select region_id from perfil where id = auth.uid();
$$;

create or replace function fn_liga_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select liga_id from perfil where id = auth.uid();
$$;
```

- [ ] **Step 3: Aplicar y verificar**

Run: `npx supabase db reset`
Expected: aplica sin error.

Run: `npx supabase db execute --local "select fn_rol();"`
Expected: devuelve `null` (no hay sesión de usuario en este contexto), sin excepción.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0003_perfil.sql supabase/migrations/0004_rls_helpers.sql
git commit -m "feat(db): add perfil table and RLS helper functions"
```

---

### Task 5: Policies de organización/perfil + seed Perú

**Files:**
- Create: `supabase/migrations/0005_rls_policies_organizacion.sql`, `supabase/migrations/0006_seed_peru.sql`

**Interfaces:**
- Consumes: `fn_rol()`, `fn_pais_id()`, `fn_region_id()` (Task 4).
- Produces: policies activas en `perfil`/`pais`/`region`/`liga`/`temporada`; filas sembradas con UUIDs fijos: Perú `11111111-1111-1111-1111-111111111111`, Lima `22222222-2222-2222-2222-222222222222`, Liga Metropolitana `33333333-3333-3333-3333-333333333333`, Temporada 2026 `44444444-4444-4444-4444-444444444444` — referenciados por el script de RLS (Task 6) y por planes futuros.

- [ ] **Step 1: `supabase/migrations/0005_rls_policies_organizacion.sql`**

```sql
-- perfil: cada usuario ve su propia fila; los roles de comité ven las de su scope
create policy perfil_select_self on perfil for select
using (id = auth.uid());

create policy perfil_select_scope on perfil for select
using (
  fn_rol() = 'admin_nacional' and pais_id = fn_pais_id()
  or fn_rol() in ('admin_regional', 'designador', 'evaluador') and region_id = fn_region_id()
);

-- pais: visible si es el país del propio perfil
create policy pais_select on pais for select
using (id = fn_pais_id());

-- region: admin_nacional ve todas las regiones de su país; el resto solo la propia
create policy region_select on region for select
using (
  fn_rol() = 'admin_nacional' and pais_id = fn_pais_id()
  or id = fn_region_id()
);

create policy region_insert on region for insert
with check (fn_rol() = 'admin_nacional' and pais_id = fn_pais_id());

create policy region_update on region for update
using (fn_rol() = 'admin_nacional' and pais_id = fn_pais_id());

-- liga: admin_nacional ve las ligas de las regiones de su país; el resto solo las de su región
create policy liga_select on liga for select
using (
  fn_rol() = 'admin_nacional' and region_id in (select id from region where pais_id = fn_pais_id())
  or region_id = fn_region_id()
);

create policy liga_insert on liga for insert
with check (
  fn_rol() = 'admin_nacional' and region_id in (select id from region where pais_id = fn_pais_id())
  or fn_rol() = 'admin_regional' and region_id = fn_region_id()
);

create policy liga_update on liga for update
using (
  fn_rol() = 'admin_nacional' and region_id in (select id from region where pais_id = fn_pais_id())
  or fn_rol() = 'admin_regional' and region_id = fn_region_id()
);

-- temporada: visible/insertable si su liga padre ya es visible (cascada vía RLS de liga)
create policy temporada_select on temporada for select
using (liga_id in (select id from liga));

create policy temporada_insert on temporada for insert
with check (
  fn_rol() in ('admin_nacional', 'admin_regional')
  and liga_id in (select id from liga)
);

create policy temporada_update on temporada for update
using (liga_id in (select id from liga));
```

- [ ] **Step 2: `supabase/migrations/0006_seed_peru.sql`**

```sql
insert into pais (id, nombre, codigo) values
  ('11111111-1111-1111-1111-111111111111', 'Perú', 'PE');

insert into region (id, pais_id, nombre, codigo) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Lima', 'LIM');

insert into liga (id, region_id, nombre, codigo) values
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Liga Metropolitana', 'LIGA-MET');

insert into temporada (id, liga_id, nombre, fecha_inicio, fecha_fin, activa) values
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'Temporada 2026', '2026-03-01', '2026-11-30', true);
```

- [ ] **Step 3: Aplicar y verificar**

Run: `npx supabase db reset`
Expected: aplica sin error.

Run: `npx supabase db execute --local "select nombre from region where id = '22222222-2222-2222-2222-222222222222';"`
Expected: devuelve `Lima`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0005_rls_policies_organizacion.sql supabase/migrations/0006_seed_peru.sql
git commit -m "feat(db): add RLS policies for organizacion/perfil and seed Peru"
```

---

### Task 6: Script de verificación de RLS (organización + perfil)

**Files:**
- Create: `scripts/rls-test/run-rls-tests.ts`
- Modify: `package.json` (agregar script `test:rls`)

**Interfaces:**
- Consumes: `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`.env.local`, Task 2); tablas/policies de Task 3-5; UUID de Lima `22222222-2222-2222-2222-222222222222` y de Perú `11111111-1111-1111-1111-111111111111` (Task 5).
- Produces: comando `npm run test:rls` — se extiende en la Task 15 con casos de club/referee.

- [ ] **Step 1: Escribir `scripts/rls-test/run-rls-tests.ts`**

```ts
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
```

- [ ] **Step 2: Agregar el script a `package.json`**

```json
"scripts": {
  "test:rls": "tsx scripts/rls-test/run-rls-tests.ts"
}
```

- [ ] **Step 3: Correr y verificar**

Run: `npm run test:rls`
Expected: `TODOS LOS CASOS PASARON`, código de salida 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/rls-test/run-rls-tests.ts package.json
git commit -m "test: add RLS isolation script for organizacion/perfil"
```

---

### Task 7: Roles + getProfile

**Files:**
- Create: `lib/auth/roles.ts`, `lib/auth/getProfile.ts`, `vitest.config.ts`, `tests/unit/roles.test.ts`

**Interfaces:**
- Consumes: `createClient()` de `lib/supabase/server.ts` (Task 2), tabla `perfil` (Task 4).
- Produces: `ROLES` (objeto de constantes), `type Rol`, `puedeGestionarCatalogos(rol: Rol): boolean`, `type Perfil`, `getProfile(): Promise<Perfil | null>` — usados por el middleware (Task 8), el layout (Task 9) y las server actions de catálogos (Task 11-14).

- [ ] **Step 1: Escribir el test que falla**

`tests/unit/roles.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ROLES, puedeGestionarCatalogos } from '@/lib/auth/roles'

describe('puedeGestionarCatalogos', () => {
  it('permite a admin_nacional', () => {
    expect(puedeGestionarCatalogos(ROLES.ADMIN_NACIONAL)).toBe(true)
  })

  it('permite a admin_regional', () => {
    expect(puedeGestionarCatalogos(ROLES.ADMIN_REGIONAL)).toBe(true)
  })

  it('no permite a designador', () => {
    expect(puedeGestionarCatalogos(ROLES.DESIGNADOR)).toBe(false)
  })

  it('no permite a evaluador', () => {
    expect(puedeGestionarCatalogos(ROLES.EVALUADOR)).toBe(false)
  })

  it('no permite a referee', () => {
    expect(puedeGestionarCatalogos(ROLES.REFEREE)).toBe(false)
  })
})
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: { environment: 'node' },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run tests/unit/roles.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth/roles'`.

- [ ] **Step 3: Implementar `lib/auth/roles.ts`**

```ts
export const ROLES = {
  ADMIN_NACIONAL: 'admin_nacional',
  ADMIN_REGIONAL: 'admin_regional',
  DESIGNADOR: 'designador',
  EVALUADOR: 'evaluador',
  REFEREE: 'referee',
} as const

export type Rol = (typeof ROLES)[keyof typeof ROLES]

export function puedeGestionarCatalogos(rol: Rol): boolean {
  return rol === ROLES.ADMIN_NACIONAL || rol === ROLES.ADMIN_REGIONAL
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run tests/unit/roles.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Implementar `lib/auth/getProfile.ts`**

```ts
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
```

No tiene test unitario propio (depende de una sesión real de Supabase) — se verifica en la Task 8 vía login manual.

- [ ] **Step 6: Commit**

```bash
git add lib/auth/roles.ts lib/auth/getProfile.ts vitest.config.ts tests/unit/roles.test.ts package.json
git commit -m "feat(auth): add role constants and getProfile()"
```

---

### Task 8: Middleware de auth + login

**Files:**
- Create: `middleware.ts`, `app/(auth)/login/page.tsx`

**Interfaces:**
- Consumes: `createClient()` de `lib/supabase/client.ts` (Task 2).
- Produces: sesión de Supabase persistida en cookies para todas las rutas protegidas; redirección a `/login` si no hay sesión.

- [ ] **Step 1: Crear `middleware.ts`**

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const rutasProtegidas = ['/dashboard', '/admin', '/mi-', '/fixture', '/evaluaciones', '/referees']
  const esProtegida = rutasProtegidas.some((p) => request.nextUrl.pathname.startsWith(p))

  if (esProtegida && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 2: Crear `app/(auth)/login/page.tsx`**

```tsx
'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setLoading(false)
    if (error) {
      setError('Email o contraseña incorrectos.')
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto mt-24 flex max-w-sm flex-col gap-4">
      <h1 className="text-xl font-semibold">Ingresar</h1>
      <input
        type="email"
        required
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded border px-3 py-2"
      />
      <input
        type="password"
        required
        placeholder="Contraseña"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded border px-3 py-2"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-50"
      >
        {loading ? 'Ingresando...' : 'Ingresar'}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Crear un usuario de prueba y verificar manualmente**

```bash
npx tsx -e "
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const { data } = await admin.auth.admin.createUser({ email: 'admin@test.local', password: 'ClaveDePrueba123!', email_confirm: true })
await admin.from('perfil').insert({ id: data.user!.id, nombre: 'Admin Nacional', email: 'admin@test.local', rol: 'admin_nacional', pais_id: '11111111-1111-1111-1111-111111111111' })
console.log('usuario creado:', data.user!.id)
"
```

Run: `npm run dev`, ir a `http://localhost:3000/login`, ingresar `admin@test.local` / `ClaveDePrueba123!`.
Expected: redirige a `/dashboard` (aunque la página aún no exista formalmente hasta la Task 9, Next.js muestra un 404 controlado — no un error de auth). Ir directo a `http://localhost:3000/dashboard` sin sesión iniciada (en una ventana de incógnito) redirige a `/login`.

- [ ] **Step 4: Commit**

```bash
git add middleware.ts "app/(auth)/login/page.tsx"
git commit -m "feat(auth): add route-protection middleware and login page"
```

---

### Task 9: Layout con nav por rol + dashboard

**Files:**
- Create: `app/(app)/layout.tsx`, `app/(app)/dashboard/page.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `getProfile()` (Task 7).
- Produces: layout de `(app)` que envuelve todas las páginas protegidas de las tareas siguientes.

- [ ] **Step 1: Crear `app/(app)/layout.tsx`**

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getProfile } from '@/lib/auth/getProfile'
import { ROLES, type Rol } from '@/lib/auth/roles'

const NAV_POR_ROL: Record<Rol, { href: string; label: string }[]> = {
  [ROLES.ADMIN_NACIONAL]: [
    { href: '/admin/catalogos/regiones', label: 'Regiones' },
    { href: '/admin/catalogos/ligas', label: 'Ligas' },
    { href: '/admin/catalogos/clubes', label: 'Clubes' },
    { href: '/admin/catalogos/referees', label: 'Referees' },
  ],
  [ROLES.ADMIN_REGIONAL]: [
    { href: '/admin/catalogos/ligas', label: 'Ligas' },
    { href: '/admin/catalogos/clubes', label: 'Clubes' },
    { href: '/admin/catalogos/referees', label: 'Referees' },
  ],
  [ROLES.DESIGNADOR]: [],
  [ROLES.EVALUADOR]: [],
  [ROLES.REFEREE]: [],
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const perfil = await getProfile()
  if (!perfil) redirect('/login')

  const items = NAV_POR_ROL[perfil.rol] ?? []

  return (
    <div className="flex min-h-screen">
      <nav className="w-56 border-r p-4">
        <p className="mb-4 text-sm text-slate-500">
          {perfil.nombre} · {perfil.rol}
        </p>
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="text-sm hover:underline">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Crear `app/(app)/dashboard/page.tsx`**

```tsx
import { getProfile } from '@/lib/auth/getProfile'

export default async function DashboardPage() {
  const perfil = await getProfile()

  return (
    <div>
      <h1 className="text-lg font-semibold">Bienvenido, {perfil?.nombre}</h1>
      <p className="text-sm text-slate-500">Rol: {perfil?.rol}</p>
    </div>
  )
}
```

- [ ] **Step 3: Modificar `app/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/getProfile'

export default async function HomePage() {
  const perfil = await getProfile()
  redirect(perfil ? '/dashboard' : '/login')
}
```

- [ ] **Step 4: Verificar manualmente**

Run: `npm run dev`, loguearse con `admin@test.local` (creado en Task 8).
Expected: llega a `/dashboard`, ve "Bienvenido, Admin Nacional" y el nav con los 4 links de catálogos (aunque esas páginas todavía no existan hasta la Task 11-14 — el link puede dar 404, es esperado en este punto).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/layout.tsx" "app/(app)/dashboard/page.tsx" app/page.tsx
git commit -m "feat: add role-based nav layout and dashboard"
```

---

### Task 10: Migraciones — club + referee

**Files:**
- Create: `supabase/migrations/0007_club.sql`, `supabase/migrations/0008_referee.sql`

**Interfaces:**
- Consumes: `fn_rol()`, `fn_pais_id()`, `fn_region_id()` (Task 4); tabla `region` (Task 3); tabla `perfil` (Task 4).
- Produces: tablas `club`, `referee` con RLS — consumidas por las Tasks 13, 14 y 15.

- [ ] **Step 1: `supabase/migrations/0007_club.sql`**

```sql
create table club (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references region(id) on delete restrict,
  nombre text not null,
  codigo text not null,
  created_at timestamptz not null default now(),
  unique (region_id, codigo)
);

alter table club enable row level security;
alter table club force row level security;

create policy club_select on club for select
using (
  fn_rol() = 'admin_nacional' and region_id in (select id from region where pais_id = fn_pais_id())
  or region_id = fn_region_id()
);

create policy club_insert on club for insert
with check (
  fn_rol() = 'admin_nacional' and region_id in (select id from region where pais_id = fn_pais_id())
  or fn_rol() = 'admin_regional' and region_id = fn_region_id()
);

create policy club_update on club for update
using (
  fn_rol() = 'admin_nacional' and region_id in (select id from region where pais_id = fn_pais_id())
  or fn_rol() = 'admin_regional' and region_id = fn_region_id()
);
```

- [ ] **Step 2: `supabase/migrations/0008_referee.sql`**

```sql
create table referee (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references perfil(id) on delete set null,
  nombre text not null,
  club_id uuid references club(id) on delete set null,
  categoria text not null,
  region_id uuid not null references region(id) on delete restrict,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table referee enable row level security;
alter table referee force row level security;

create policy referee_select on referee for select
using (
  fn_rol() = 'admin_nacional' and region_id in (select id from region where pais_id = fn_pais_id())
  or region_id = fn_region_id()
);

create policy referee_insert on referee for insert
with check (
  fn_rol() = 'admin_nacional' and region_id in (select id from region where pais_id = fn_pais_id())
  or fn_rol() = 'admin_regional' and region_id = fn_region_id()
);

create policy referee_update on referee for update
using (
  fn_rol() = 'admin_nacional' and region_id in (select id from region where pais_id = fn_pais_id())
  or fn_rol() = 'admin_regional' and region_id = fn_region_id()
);
```

`categoria` queda como texto libre en esta fase (spec §5 nota que se formaliza como catálogo cuando la Fase 6 introduzca el mapeo `categoria_partido → categoria_minima_referee`).

- [ ] **Step 3: Aplicar y verificar**

Run: `npx supabase db reset`
Expected: aplica sin error.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0007_club.sql supabase/migrations/0008_referee.sql
git commit -m "feat(db): add club and referee tables with RLS"
```

---

### Task 11: Catálogo de Regiones (action + página)

**Files:**
- Create: `actions/catalogos.ts`, `components/catalogos/RegionForm.tsx`, `app/(app)/admin/catalogos/regiones/page.tsx`

**Interfaces:**
- Consumes: `createClient()` server (Task 2), `getProfile()` + `ROLES` (Task 7), tabla `region` (Task 3/5).
- Produces: `export type Region = { id: string; nombre: string; codigo: string; pais_id: string }`, `listRegiones(): Promise<Region[]>`, `crearRegion(input: { nombre: string; codigo: string }): Promise<void>` — `listRegiones` es consumido por las Tasks 12 y 14 para poblar selects.

- [ ] **Step 1: Crear `actions/catalogos.ts` (sección Regiones)**

```ts
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
```

- [ ] **Step 2: Crear `components/catalogos/RegionForm.tsx`**

```tsx
'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  crearRegion: (input: { nombre: string; codigo: string }) => Promise<void>
}

export function RegionForm({ crearRegion }: Props) {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await crearRegion({ nombre, codigo })
        setNombre('')
        setCodigo('')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al crear la región.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="flex flex-col">
        <label className="text-xs text-slate-500">Nombre</label>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
          className="rounded border px-2 py-1"
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-slate-500">Código</label>
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          required
          className="rounded border px-2 py-1"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-slate-900 px-3 py-1 text-white disabled:opacity-50"
      >
        {isPending ? 'Guardando...' : 'Agregar'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 3: Crear `app/(app)/admin/catalogos/regiones/page.tsx`**

```tsx
import { listRegiones, crearRegion } from '@/actions/catalogos'
import { RegionForm } from '@/components/catalogos/RegionForm'

export default async function RegionesPage() {
  const regiones = await listRegiones()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Regiones</h1>
      <RegionForm crearRegion={crearRegion} />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1">Nombre</th>
            <th className="py-1">Código</th>
          </tr>
        </thead>
        <tbody>
          {regiones.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="py-1">{r.nombre}</td>
              <td className="py-1">{r.codigo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Verificar manualmente**

Logueado como `admin@test.local` (`admin_nacional`), ir a `/admin/catalogos/regiones`, crear una región nueva ("Arequipa" / "AQP") y confirmar que aparece en la tabla al refrescar.

Crear un segundo usuario de prueba con `rol: 'designador'` (mismo patrón del Step 3 de Task 8) e intentar el mismo flujo: el formulario debe mostrar el mensaje "No autorizado para crear regiones." en vez de un error crudo.

- [ ] **Step 5: Commit**

```bash
git add actions/catalogos.ts components/catalogos/RegionForm.tsx "app/(app)/admin/catalogos/regiones/page.tsx"
git commit -m "feat(catalogos): add regiones list and create form"
```

---

### Task 12: Catálogo de Ligas (action + página)

**Files:**
- Modify: `actions/catalogos.ts` (agregar sección Ligas)
- Create: `components/catalogos/LigaForm.tsx`, `app/(app)/admin/catalogos/ligas/page.tsx`

**Interfaces:**
- Consumes: `listRegiones()` (Task 11), `getProfile()` + `ROLES` (Task 7).
- Produces: `export type Liga = { id: string; nombre: string; codigo: string; region_id: string; region: { nombre: string } | null }`, `listLigas(): Promise<Liga[]>`, `crearLiga(input: { nombre: string; codigo: string; region_id: string }): Promise<void>`.

- [ ] **Step 1: Agregar a `actions/catalogos.ts`**

```ts
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
```

- [ ] **Step 2: Crear `components/catalogos/LigaForm.tsx`**

```tsx
'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { Region } from '@/actions/catalogos'

type Props = {
  crearLiga: (input: { nombre: string; codigo: string; region_id: string }) => Promise<void>
  regiones: Region[]
}

export function LigaForm({ crearLiga, regiones }: Props) {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [regionId, setRegionId] = useState(regiones[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await crearLiga({ nombre, codigo, region_id: regionId })
        setNombre('')
        setCodigo('')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al crear la liga.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="flex flex-col">
        <label className="text-xs text-slate-500">Nombre</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} required className="rounded border px-2 py-1" />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-slate-500">Código</label>
        <input value={codigo} onChange={(e) => setCodigo(e.target.value)} required className="rounded border px-2 py-1" />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-slate-500">Región</label>
        <select value={regionId} onChange={(e) => setRegionId(e.target.value)} className="rounded border px-2 py-1">
          {regiones.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={isPending} className="rounded bg-slate-900 px-3 py-1 text-white disabled:opacity-50">
        {isPending ? 'Guardando...' : 'Agregar'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 3: Crear `app/(app)/admin/catalogos/ligas/page.tsx`**

```tsx
import { listLigas, listRegiones, crearLiga } from '@/actions/catalogos'
import { LigaForm } from '@/components/catalogos/LigaForm'

export default async function LigasPage() {
  const [ligas, regiones] = await Promise.all([listLigas(), listRegiones()])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Ligas</h1>
      <LigaForm crearLiga={crearLiga} regiones={regiones} />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1">Nombre</th>
            <th className="py-1">Código</th>
            <th className="py-1">Región</th>
          </tr>
        </thead>
        <tbody>
          {ligas.map((l) => (
            <tr key={l.id} className="border-t">
              <td className="py-1">{l.nombre}</td>
              <td className="py-1">{l.codigo}</td>
              <td className="py-1">{l.region?.nombre}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Verificar manualmente**

Crear un usuario de prueba `rol: 'admin_regional'` con `region_id: '22222222-2222-2222-2222-222222222222'` (Lima). Loguearse, ir a `/admin/catalogos/ligas`: el select de región debe mostrar solo Lima (porque `listRegiones()` ya viene filtrado por RLS). Crear una liga y confirmar que aparece.

- [ ] **Step 5: Commit**

```bash
git add actions/catalogos.ts components/catalogos/LigaForm.tsx "app/(app)/admin/catalogos/ligas/page.tsx"
git commit -m "feat(catalogos): add ligas list and create form"
```

---

### Task 13: Catálogo de Clubes (action + página)

**Files:**
- Modify: `actions/catalogos.ts` (agregar sección Clubes)
- Create: `components/catalogos/ClubForm.tsx`, `app/(app)/admin/catalogos/clubes/page.tsx`

**Interfaces:**
- Consumes: `listRegiones()` (Task 11), `getProfile()` + `ROLES` (Task 7), tabla `club` (Task 10).
- Produces: `export type Club = { id: string; nombre: string; codigo: string; region_id: string; region: { nombre: string } | null }`, `listClubes(): Promise<Club[]>`, `crearClub(input: { nombre: string; codigo: string; region_id: string }): Promise<void>` — `listClubes` es consumido por la Task 14.

- [ ] **Step 1: Agregar a `actions/catalogos.ts`**

```ts
export type Club = {
  id: string
  nombre: string
  codigo: string
  region_id: string
  region: { nombre: string } | null
}

export async function listClubes(): Promise<Club[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('club')
    .select('id, nombre, codigo, region_id, region:region(nombre)')
    .order('nombre')
  if (error) throw new Error(error.message)
  return data as unknown as Club[]
}

export async function crearClub(input: { nombre: string; codigo: string; region_id: string }): Promise<void> {
  const perfil = await getProfile()
  if (!perfil || (perfil.rol !== ROLES.ADMIN_NACIONAL && perfil.rol !== ROLES.ADMIN_REGIONAL)) {
    throw new Error('No autorizado para crear clubes.')
  }

  const supabase = await createClient()
  const { error } = await supabase.from('club').insert(input)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/catalogos/clubes')
}
```

- [ ] **Step 2: Crear `components/catalogos/ClubForm.tsx`**

```tsx
'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { Region } from '@/actions/catalogos'

type Props = {
  crearClub: (input: { nombre: string; codigo: string; region_id: string }) => Promise<void>
  regiones: Region[]
}

export function ClubForm({ crearClub, regiones }: Props) {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [regionId, setRegionId] = useState(regiones[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await crearClub({ nombre, codigo, region_id: regionId })
        setNombre('')
        setCodigo('')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al crear el club.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="flex flex-col">
        <label className="text-xs text-slate-500">Nombre</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} required className="rounded border px-2 py-1" />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-slate-500">Código</label>
        <input value={codigo} onChange={(e) => setCodigo(e.target.value)} required className="rounded border px-2 py-1" />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-slate-500">Región</label>
        <select value={regionId} onChange={(e) => setRegionId(e.target.value)} className="rounded border px-2 py-1">
          {regiones.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={isPending} className="rounded bg-slate-900 px-3 py-1 text-white disabled:opacity-50">
        {isPending ? 'Guardando...' : 'Agregar'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 3: Crear `app/(app)/admin/catalogos/clubes/page.tsx`**

```tsx
import { listClubes, listRegiones, crearClub } from '@/actions/catalogos'
import { ClubForm } from '@/components/catalogos/ClubForm'

export default async function ClubesPage() {
  const [clubes, regiones] = await Promise.all([listClubes(), listRegiones()])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Clubes</h1>
      <ClubForm crearClub={crearClub} regiones={regiones} />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1">Nombre</th>
            <th className="py-1">Código</th>
            <th className="py-1">Región</th>
          </tr>
        </thead>
        <tbody>
          {clubes.map((c) => (
            <tr key={c.id} className="border-t">
              <td className="py-1">{c.nombre}</td>
              <td className="py-1">{c.codigo}</td>
              <td className="py-1">{c.region?.nombre}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Verificar manualmente**

Análogo a la Task 12: como `admin_regional` de Lima, crear un club y confirmar que aparece; como `designador`, confirmar que no puede acceder al formulario de creación con éxito (mensaje de error legible).

- [ ] **Step 5: Commit**

```bash
git add actions/catalogos.ts components/catalogos/ClubForm.tsx "app/(app)/admin/catalogos/clubes/page.tsx"
git commit -m "feat(catalogos): add clubes list and create form"
```

---

### Task 14: Catálogo de Referees (action + página)

**Files:**
- Modify: `actions/catalogos.ts` (agregar sección Referees)
- Create: `components/catalogos/RefereeForm.tsx`, `app/(app)/admin/catalogos/referees/page.tsx`

**Interfaces:**
- Consumes: `listRegiones()` (Task 11), `listClubes()` (Task 13), `getProfile()` + `ROLES` (Task 7), tabla `referee` (Task 10).
- Produces: `export type Referee = { id: string; nombre: string; categoria: string; activo: boolean; club_id: string | null; region_id: string; club: { nombre: string } | null }`, `listReferees(): Promise<Referee[]>`, `crearReferee(input: { nombre: string; categoria: string; club_id: string | null; region_id: string }): Promise<void>`.

- [ ] **Step 1: Agregar a `actions/catalogos.ts`**

```ts
export type Referee = {
  id: string
  nombre: string
  categoria: string
  activo: boolean
  club_id: string | null
  region_id: string
  club: { nombre: string } | null
}

export async function listReferees(): Promise<Referee[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('referee')
    .select('id, nombre, categoria, activo, club_id, region_id, club:club(nombre)')
    .order('nombre')
  if (error) throw new Error(error.message)
  return data as unknown as Referee[]
}

export async function crearReferee(input: {
  nombre: string
  categoria: string
  club_id: string | null
  region_id: string
}): Promise<void> {
  const perfil = await getProfile()
  if (!perfil || (perfil.rol !== ROLES.ADMIN_NACIONAL && perfil.rol !== ROLES.ADMIN_REGIONAL)) {
    throw new Error('No autorizado para crear referees.')
  }

  const supabase = await createClient()
  const { error } = await supabase.from('referee').insert({ ...input, activo: true })
  if (error) throw new Error(error.message)

  revalidatePath('/admin/catalogos/referees')
}
```

- [ ] **Step 2: Crear `components/catalogos/RefereeForm.tsx`**

```tsx
'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { Region, Club } from '@/actions/catalogos'

type Props = {
  crearReferee: (input: { nombre: string; categoria: string; club_id: string | null; region_id: string }) => Promise<void>
  regiones: Region[]
  clubes: Club[]
}

export function RefereeForm({ crearReferee, regiones, clubes }: Props) {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState('')
  const [regionId, setRegionId] = useState(regiones[0]?.id ?? '')
  const [clubId, setClubId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await crearReferee({ nombre, categoria, club_id: clubId || null, region_id: regionId })
        setNombre('')
        setCategoria('')
        setClubId('')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al crear el referee.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="flex flex-col">
        <label className="text-xs text-slate-500">Nombre</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} required className="rounded border px-2 py-1" />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-slate-500">Categoría</label>
        <input value={categoria} onChange={(e) => setCategoria(e.target.value)} required className="rounded border px-2 py-1" />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-slate-500">Región</label>
        <select value={regionId} onChange={(e) => setRegionId(e.target.value)} className="rounded border px-2 py-1">
          {regiones.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-slate-500">Club (opcional)</label>
        <select value={clubId} onChange={(e) => setClubId(e.target.value)} className="rounded border px-2 py-1">
          <option value="">Sin club</option>
          {clubes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={isPending} className="rounded bg-slate-900 px-3 py-1 text-white disabled:opacity-50">
        {isPending ? 'Guardando...' : 'Agregar'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 3: Crear `app/(app)/admin/catalogos/referees/page.tsx`**

```tsx
import { listReferees, listRegiones, listClubes, crearReferee } from '@/actions/catalogos'
import { RefereeForm } from '@/components/catalogos/RefereeForm'

export default async function RefereesPage() {
  const [referees, regiones, clubes] = await Promise.all([listReferees(), listRegiones(), listClubes()])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Referees</h1>
      <RefereeForm crearReferee={crearReferee} regiones={regiones} clubes={clubes} />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1">Nombre</th>
            <th className="py-1">Categoría</th>
            <th className="py-1">Club</th>
            <th className="py-1">Activo</th>
          </tr>
        </thead>
        <tbody>
          {referees.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="py-1">{r.nombre}</td>
              <td className="py-1">{r.categoria}</td>
              <td className="py-1">{r.club?.nombre ?? '—'}</td>
              <td className="py-1">{r.activo ? 'Sí' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Verificar manualmente**

Análogo a la Task 12/13: como `admin_regional` de Lima, crear un referee (con y sin club) y confirmar que aparece en la tabla.

- [ ] **Step 5: Commit**

```bash
git add actions/catalogos.ts components/catalogos/RefereeForm.tsx "app/(app)/admin/catalogos/referees/page.tsx"
git commit -m "feat(catalogos): add referees list and create form"
```

---

### Task 15: Extender el script de RLS con club/referee

**Files:**
- Modify: `scripts/rls-test/run-rls-tests.ts`

**Interfaces:**
- Consumes: tablas `club`/`referee` (Task 10), usuarios y región de prueba ya creados dentro de `main()` (Task 6).

- [ ] **Step 1: Agregar casos de club/referee antes de la limpieza**

Insertar este bloque en `run-rls-tests.ts`, justo antes de la sección `// Limpieza` existente (usa `regionTest.id`, `LIMA_ID` y los clientes ya autenticados de la Task 6):

```ts
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
```

- [ ] **Step 2: Correr y verificar**

Run: `npm run test:rls`
Expected: `TODOS LOS CASOS PASARON`, incluyendo los 4 casos nuevos.

- [ ] **Step 3: Commit**

```bash
git add scripts/rls-test/run-rls-tests.ts
git commit -m "test: extend RLS script with club/referee isolation cases"
```

---

## Self-Review

**Cobertura del spec:** login (Task 8), navegación por rol (Task 9), roles fijos de spec §4 (Task 4/7), jerarquía multi-tenant pais→region→liga→temporada (Task 3/5), RLS forzada en todas las tablas (Task 3/4/10), seed de Perú/Lima/Liga Metropolitana/Temporada 2026 (Task 5), catálogos de regiones/ligas/clubes/referees (Task 11-14). Sin gaps frente al alcance acordado (Fases 0-2 del spec).

**Placeholder scan:** sin TBD/TODO; cada paso de código tiene el contenido completo, ningún "similar a la Task N" — los patrones repetidos (RLS por región, forms de catálogo) están escritos completos en cada tarea que los usa.

**Consistencia de tipos:** `Region`, `Liga`, `Club`, `Referee` se definen una sola vez en `actions/catalogos.ts` (Tasks 11, 12, 13, 14 respectivamente) y se reimportan con el mismo nombre en los forms correspondientes; `getProfile(): Promise<Perfil | null>` (Task 7) se usa con esa firma exacta en Tasks 8, 9, 11-14; `createClient` tiene dos exports con el mismo nombre pero de módulos distintos (`lib/supabase/client.ts` para cliente, `lib/supabase/server.ts` para servidor) — verificado que ningún archivo importa ambos a la vez bajo el mismo identificador.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-01-plataforma-referees-fundacion.md`. Two execution options:

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints

**¿Cuál prefieres?**
