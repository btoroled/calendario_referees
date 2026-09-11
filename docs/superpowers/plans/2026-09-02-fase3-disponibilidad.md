# Fase 3 — Disponibilidad del Referee — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que un referee cargue sus propias ventanas de disponibilidad horaria ("Mi disponibilidad"), primer bloque de datos que el motor de recomendación (Fase 6) va a necesitar.

**Architecture:** Nueva tabla `disponibilidad` con RLS estricta de "solo el dueño" (vía `referee.usuario_id = auth.uid()`), un módulo de validación puro (TDD), server actions siguiendo el patrón ya establecido en `actions/catalogos.ts`, y una página `/disponibilidad` con formulario de alta + tabla + botón de eliminar, siguiendo el mismo patrón visual (`bg-surface`, `border-border`, `text-muted`, `bg-primary`) ya usado en `/admin/catalogos/*`.

**Tech Stack:** Next.js App Router (server actions), Supabase Postgres + RLS, Vitest (unit), script de RLS existente (`scripts/rls-test/run-rls-tests.ts`).

**Spec:** `docs/superpowers/specs/2026-08-31-plataforma-designacion-referees-design.md` (secciones 2, 5, 10, 11 — modelo de `disponibilidad` y pantalla "Mi disponibilidad").

## Global Constraints

- Modelo positivo con override: el referee marca ventanas donde SÍ está disponible; una fila con `disponible=false` sobre un sub-rango es una excepción. Si no cargó nada para una fecha, se considera no disponible por defecto (spec §5).
- RLS activa y forzada (`force row level security`) en toda tabla nueva, igual que el resto del schema.
- Todo texto de UI en español, mismo tono que el resto de la app (ver `components/catalogos/*`).
- Reusar los tokens de color ya definidos en `app/globals.css` (`bg-surface`, `border-border`, `text-muted`, `text-foreground`, `bg-primary`, `text-primary-foreground`, `text-danger`) — no reintroducir clases `slate-*`/`red-*` hardcodeadas.
- Server actions autorizan por rol explícitamente antes de tocar la DB (defensa en profundidad además de RLS), igual que `actions/catalogos.ts`.

---

### Task 1: Migración — tabla `disponibilidad` + RLS

**Files:**
- Create: `supabase/migrations/0012_disponibilidad.sql`

**Interfaces:**
- Consumes: tabla `referee` (columna `usuario_id`, ya existe desde `0008_referee.sql`).
- Produces: tabla `disponibilidad(id, referee_id, fecha_inicio, fecha_fin, disponible, created_at)`, policies `disponibilidad_select`/`disponibilidad_insert`/`disponibilidad_delete` (self-only vía `referee.usuario_id = auth.uid()`).

- [ ] **Step 1: Crear `supabase/migrations/0012_disponibilidad.sql`**

```sql
create table disponibilidad (
  id uuid primary key default gen_random_uuid(),
  referee_id uuid not null references referee(id) on delete cascade,
  fecha_inicio timestamptz not null,
  fecha_fin timestamptz not null,
  disponible boolean not null default true,
  created_at timestamptz not null default now(),
  constraint disponibilidad_rango_valido check (fecha_fin > fecha_inicio)
);

create index disponibilidad_referee_id_idx on disponibilidad (referee_id);

alter table disponibilidad enable row level security;
alter table disponibilidad force row level security;

create policy disponibilidad_select on disponibilidad for select
using (
  referee_id in (select id from referee where usuario_id = auth.uid())
);

create policy disponibilidad_insert on disponibilidad for insert
with check (
  referee_id in (select id from referee where usuario_id = auth.uid())
);

create policy disponibilidad_delete on disponibilidad for delete
using (
  referee_id in (select id from referee where usuario_id = auth.uid())
);
```

- [ ] **Step 2: Aplicar y verificar**

Run: `npx supabase db reset`
Expected: aplica sin error (reconstruye la DB local y reaplica todas las migraciones + seeds existentes).

Run: `docker exec supabase_db_rugby psql -U postgres -d postgres -c "\d disponibilidad"`
Expected: muestra la tabla con las 6 columnas y el constraint `disponibilidad_rango_valido`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0012_disponibilidad.sql
git commit -m "feat(db): add disponibilidad table with self-only RLS"
```

---

### Task 2: Validación de ventana de disponibilidad (TDD)

**Files:**
- Create: `lib/disponibilidad/validacion.ts`
- Test: `tests/unit/disponibilidad-validacion.test.ts`

**Interfaces:**
- Produces: `export function validarVentana(input: { fecha_inicio: string; fecha_fin: string }): string | null` — retorna un mensaje de error en español o `null` si la ventana es válida. Consumido por la Task 3 (action `crearDisponibilidad` y `DisponibilidadForm`).

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { validarVentana } from '@/lib/disponibilidad/validacion'

describe('validarVentana', () => {
  it('acepta una ventana válida (fin después de inicio)', () => {
    expect(
      validarVentana({ fecha_inicio: '2026-10-01T09:00', fecha_fin: '2026-10-01T18:00' })
    ).toBeNull()
  })

  it('rechaza cuando fin es igual a inicio', () => {
    expect(
      validarVentana({ fecha_inicio: '2026-10-01T09:00', fecha_fin: '2026-10-01T09:00' })
    ).toBe('La fecha de fin debe ser posterior a la fecha de inicio.')
  })

  it('rechaza cuando fin es anterior a inicio', () => {
    expect(
      validarVentana({ fecha_inicio: '2026-10-01T18:00', fecha_fin: '2026-10-01T09:00' })
    ).toBe('La fecha de fin debe ser posterior a la fecha de inicio.')
  })

  it('rechaza fechas inválidas', () => {
    expect(
      validarVentana({ fecha_inicio: 'no-es-fecha', fecha_fin: '2026-10-01T09:00' })
    ).toBe('Fechas inválidas.')
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run tests/unit/disponibilidad-validacion.test.ts`
Expected: FAIL — `Cannot find module '@/lib/disponibilidad/validacion'`.

- [ ] **Step 3: Implementar `lib/disponibilidad/validacion.ts`**

```ts
export function validarVentana(input: { fecha_inicio: string; fecha_fin: string }): string | null {
  const inicio = new Date(input.fecha_inicio)
  const fin = new Date(input.fecha_fin)

  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
    return 'Fechas inválidas.'
  }
  if (fin <= inicio) {
    return 'La fecha de fin debe ser posterior a la fecha de inicio.'
  }
  return null
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run tests/unit/disponibilidad-validacion.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/disponibilidad/validacion.ts tests/unit/disponibilidad-validacion.test.ts
git commit -m "feat(disponibilidad): add ventana validation helper"
```

---

### Task 3: Mi disponibilidad — actions + UI + nav

**Files:**
- Create: `actions/disponibilidad.ts`, `components/disponibilidad/DisponibilidadForm.tsx`, `components/disponibilidad/EliminarDisponibilidadButton.tsx`, `app/(app)/disponibilidad/page.tsx`
- Modify: `app/(app)/layout.tsx:19` (agregar entrada de nav para `ROLES.REFEREE`)

**Interfaces:**
- Consumes: `createClient()` server (`lib/supabase/server`), `getProfile()` + `ROLES` (`lib/auth/roles`), `validarVentana` (Task 2), tabla `disponibilidad` (Task 1).
- Produces: `export type Disponibilidad = { id: string; fecha_inicio: string; fecha_fin: string; disponible: boolean }`, `listMiDisponibilidad(): Promise<Disponibilidad[]>`, `crearDisponibilidad(input: { fecha_inicio: string; fecha_fin: string; disponible: boolean }): Promise<void>`, `eliminarDisponibilidad(id: string): Promise<void>`.

- [ ] **Step 1: Crear `actions/disponibilidad.ts`**

```ts
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
```

- [ ] **Step 2: Crear `components/disponibilidad/DisponibilidadForm.tsx`**

```tsx
'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  crearDisponibilidad: (input: { fecha_inicio: string; fecha_fin: string; disponible: boolean }) => Promise<void>
}

export function DisponibilidadForm({ crearDisponibilidad }: Props) {
  const router = useRouter()
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [disponible, setDisponible] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await crearDisponibilidad({ fecha_inicio: fechaInicio, fecha_fin: fechaFin, disponible })
        setFechaInicio('')
        setFechaFin('')
        setDisponible(true)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar la ventana de disponibilidad.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col">
        <label className="text-xs text-muted">Desde</label>
        <input
          type="datetime-local"
          value={fechaInicio}
          onChange={(e) => setFechaInicio(e.target.value)}
          required
          className="rounded border border-border bg-background px-2 py-1 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-muted">Hasta</label>
        <input
          type="datetime-local"
          value={fechaFin}
          onChange={(e) => setFechaFin(e.target.value)}
          required
          className="rounded border border-border bg-background px-2 py-1 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-ring"
        />
      </div>
      <label className="flex items-center gap-1.5 pb-1.5 text-xs text-muted">
        <input
          type="checkbox"
          checked={disponible}
          onChange={(e) => setDisponible(e.target.checked)}
        />
        Disponible (desmarca para cargar una excepción de NO disponibilidad)
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-primary px-3 py-1 text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
      >
        {isPending ? 'Guardando...' : 'Agregar'}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 3: Crear `components/disponibilidad/EliminarDisponibilidadButton.tsx`**

```tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  id: string
  eliminarDisponibilidad: (id: string) => Promise<void>
}

export function EliminarDisponibilidadButton({ id, eliminarDisponibilidad }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      await eliminarDisponibilidad(id)
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-xs text-danger hover:underline disabled:opacity-50"
    >
      {isPending ? 'Eliminando...' : 'Eliminar'}
    </button>
  )
}
```

- [ ] **Step 4: Crear `app/(app)/disponibilidad/page.tsx`**

```tsx
import { listMiDisponibilidad, crearDisponibilidad, eliminarDisponibilidad } from '@/actions/disponibilidad'
import { DisponibilidadForm } from '@/components/disponibilidad/DisponibilidadForm'
import { EliminarDisponibilidadButton } from '@/components/disponibilidad/EliminarDisponibilidadButton'

export default async function DisponibilidadPage() {
  let ventanas: Awaited<ReturnType<typeof listMiDisponibilidad>>
  try {
    ventanas = await listMiDisponibilidad()
  } catch (err) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-muted">
        {err instanceof Error ? err.message : 'No se pudo cargar tu disponibilidad.'}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Mi disponibilidad</h1>
      <p className="text-sm text-muted">
        Marca las ventanas donde SÍ estás disponible para arbitrar. Si no cargas nada para una fecha, se te
        considera no disponible por defecto.
      </p>
      <DisponibilidadForm crearDisponibilidad={crearDisponibilidad} />
      <table className="w-full rounded-lg border border-border bg-surface text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th className="px-4 py-2">Desde</th>
            <th className="px-4 py-2">Hasta</th>
            <th className="px-4 py-2">Disponible</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {ventanas.map((v) => (
            <tr key={v.id} className="border-t border-border">
              <td className="px-4 py-2">{new Date(v.fecha_inicio).toLocaleString('es-PE')}</td>
              <td className="px-4 py-2">{new Date(v.fecha_fin).toLocaleString('es-PE')}</td>
              <td className="px-4 py-2">{v.disponible ? 'Sí' : 'No (excepción)'}</td>
              <td className="px-4 py-2">
                <EliminarDisponibilidadButton id={v.id} eliminarDisponibilidad={eliminarDisponibilidad} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 5: Agregar la entrada de nav para `referee` en `app/(app)/layout.tsx`**

En `app/(app)/layout.tsx:19`, reemplazar:

```ts
  [ROLES.REFEREE]: [],
```

por:

```ts
  [ROLES.REFEREE]: [{ href: '/disponibilidad', label: 'Mi disponibilidad' }],
```

- [ ] **Step 6: Verificar manualmente**

Run: `npm run dev`, loguearse como `referee@rugby.local` / `RugbyDev123!` (nota: este usuario aún no tiene un `referee` de catálogo vinculado — eso se resuelve en la Task 5 de este plan; por ahora la página debe mostrar el mensaje "No tienes un perfil de referee vinculado a tu cuenta." en vez de un error crudo).

Expected: el nav lateral muestra el link "Mi disponibilidad", y al entrar a `/disponibilidad` se ve el mensaje de perfil no vinculado (no un 500).

- [ ] **Step 7: Commit**

```bash
git add actions/disponibilidad.ts components/disponibilidad "app/(app)/disponibilidad/page.tsx" "app/(app)/layout.tsx"
git commit -m "feat(disponibilidad): add mi-disponibilidad page with create/delete flow"
```

---

### Task 4: Extender el script de RLS con casos de disponibilidad

**Files:**
- Modify: `scripts/rls-test/run-rls-tests.ts`

**Interfaces:**
- Consumes: `crearUsuarioDePrueba`, `iniciarSesionComo`, `limpiarUsuarioDePrueba`, `assert` (ya definidos en el archivo), tabla `disponibilidad` (Task 1).

- [ ] **Step 1: Agregar los casos de disponibilidad antes del bloque de limpieza**

En `scripts/rls-test/run-rls-tests.ts`, inmediatamente antes de esta línea existente (la primera línea del bloque de limpieza):

```ts
  await admin.from('referee').delete().eq('region_id', LIMA_ID).eq('nombre', `Ref Lima ${sufijo}`)
```

insertar:

```ts
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

```

(el bloque de limpieza original de `Ref Lima`/`Ref Test` sigue justo después, sin cambios).

- [ ] **Step 2: Correr y verificar**

Run: `npm run test:rls`
Expected: `TODOS LOS CASOS PASARON`, incluyendo los 5 casos nuevos de disponibilidad.

- [ ] **Step 3: Commit**

```bash
git add scripts/rls-test/run-rls-tests.ts
git commit -m "test: extend RLS script with disponibilidad self-only isolation cases"
```

---

### Task 5: Vincular el referee de prueba + verificación manual end-to-end

**Files:**
- Ninguno (paso operativo sobre datos locales, no sobre código versionado — igual que la creación manual de usuarios de prueba en el plan de la Fase 0-2).

**Interfaces:**
- Consumes: usuario `referee@rugby.local` (perfil rol `referee`, ya existe), tabla `referee` (33 filas de catálogo sin `usuario_id`, ya existen).

- [ ] **Step 1: Vincular un `referee` de catálogo al usuario de login `referee@rugby.local`**

Run:

```bash
docker exec supabase_db_rugby psql -U postgres -d postgres -c "
update referee set usuario_id = (select id from perfil where email = 'referee@rugby.local')
where nombre = 'Benjamin Toro';
"
```

Expected: `UPDATE 1`.

- [ ] **Step 2: Verificar manualmente el flujo completo**

Run: `npm run dev`, loguearse como `referee@rugby.local` / `RugbyDev123!`, ir a `/disponibilidad`.

Expected: ya no aparece el mensaje de "no vinculado" — se ve el formulario y una tabla vacía.

Cargar una ventana ("Desde" mañana 09:00, "Hasta" mañana 18:00, "Disponible" marcado) y confirmar que aparece en la tabla al refrescar. Cargar una segunda ventana con "Disponible" desmarcado y confirmar que se lista como "No (excepción)". Eliminar una de las dos y confirmar que desaparece de la tabla.

Loguearse como `admin.nacional@rugby.local` e ir directo a `http://localhost:3000/disponibilidad` (URL directa, sin link en el nav): debe mostrar el mensaje "No autorizado para ver disponibilidad." en vez de un error crudo o las ventanas de otro usuario.

- [ ] **Step 3: No hay commit en esta task** (cambio de datos locales, no de código).

---

## Al terminar

Con esto queda completa la Fase 3 del spec (`disponibilidad`). El siguiente checkpoint es la Fase 4 (Importación de fixture semanal), que va a necesitar la tabla `partido` — no se empieza hasta que este plan esté revisado y aprobado.
