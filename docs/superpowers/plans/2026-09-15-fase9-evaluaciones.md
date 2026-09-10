# Fase 9 — Evaluaciones + pendientes de evaluar + `evaluacion_bloqueante` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el loop de evaluación: el evaluador carga evaluaciones de desempeño (performance / físico / videoanálisis / coaching) asociadas a un partido ya jugado, ve una lista de "partidos jugados pendientes de evaluar", y — si el admin de la liga activó `evaluacion_bloqueante` — no se puede confirmar una nueva designación para un referee que tiene evaluaciones pendientes de partidos ya jugados. Incluye la pantalla de configuración de scoring por liga (pesos, umbrales, penalización, decaimiento, `evaluacion_bloqueante`).

**Architecture:** La tabla `evaluacion` y la columna `configuracion_scoring.evaluacion_bloqueante` ya existen (Fase 6). Esta fase agrega: dos funciones puras (`partidosPendientesDeEvaluar` y `refereeTieneEvaluacionesPendientes`) testeadas con datos mock; un server action `evaluaciones.ts` para el evaluador; un server action + pantalla de configuración para el admin; y un guard en `confirmarDesignacion` (Fase 7) que consulta la config de la liga y, si el bloqueo está activo, rechaza la confirmación con un mensaje claro.

**Tech Stack:** TypeScript puro (funciones de pendientes/bloqueo), Vitest (unit), Next.js App Router (server actions + Server/Client Components), `@supabase/supabase-js` (con `createClient` server para las lecturas scopeadas por RLS; service-role solo donde ya se venía usando en `confirmarDesignacion`).

**Spec:** `docs/superpowers/specs/2026-08-31-plataforma-designacion-referees-design.md` (§5 modelo `evaluacion`/`configuracion_scoring`, §9 cierre del loop, §10 pantallas, §11 RLS) + `docs/superpowers/specs/2026-09-10-fichas-cuerpo-arbitral-addendum.md` (§F roadmap).

## Global Constraints

- RLS ya activa en `evaluacion` y `configuracion_scoring` (Fase 6). No se agregan tablas nuevas en esta fase; sí se reusan sus policies (`evaluacion_insert` = evaluador/admin del scope; `configuracion_scoring_update` = admin del scope).
- Roles fijos, exactamente cinco. La carga de evaluaciones es del `evaluador` (y admin); la configuración de scoring es del `admin_regional`/`admin_nacional`.
- Tipos de evaluación: exactamente `performance`, `fisico`, `videoanalisis`, `coaching` (enum `tipo_evaluacion`, Fase 6). Valor `0-10` (constraint existente).
- "Partido jugado pendiente de evaluar" = existe una `designacion` con `estado='confirmado'` y `estado_aceptacion='aceptado'` para ese referee/partido, la `fecha` del partido ya pasó, y **no** hay ninguna `evaluacion` para ese `(referee_id, partido_id)` (spec §9). La evaluación pendiente se cuenta como "el partido no tiene NINGÚN tipo de evaluación cargado" — con una evaluación de cualquier tipo, el partido deja de estar pendiente (decisión de esta fase, documentada; evita trabar la designación por falta de, p. ej., el videoanálisis).
- `evaluacion_bloqueante` es **por liga** y lo decide el admin de esa liga (spec §9). Si está activo, `confirmarDesignacion` (Fase 7) falla cuando el referee candidato tiene ≥ 1 partido jugado pendiente de evaluar en esa liga.
- Las evaluaciones periódicas no atadas a un partido (`partido_id = null`) siguen permitidas por el modelo, pero la UI de esta fase solo carga evaluaciones **con** `partido_id` (las periódicas quedan para v2 / carga manual).
- MVP seedeado solo con Perú → Lima → Liga Metropolitana → Temporada 2026.

**Nota sobre TDD:** Task 1 (funciones puras) sigue TDD rojo/verde con Vitest. Las tareas de action/UI/guard (2-5) se verifican con `npx vitest run`, `npm run lint`, `npm run test:rls` y verificación manual paso a paso.

---

## Estructura de archivos

```
lib/evaluacion/
  pendientes.ts                       # partidosPendientesDeEvaluar + refereeTieneEvaluacionesPendientes (puras)
actions/
  evaluaciones.ts                     # listPendientesDeEvaluar + crearEvaluacion + listEvaluacionesDeReferee
  configuracion.ts                    # obtenerConfiguracionScoring + actualizarConfiguracionScoring
  designaciones.ts                    # MODIFY: guard evaluacion_bloqueante en confirmarDesignacion
components/evaluacion/
  EvaluacionForm.tsx                  # client form de carga
components/configuracion/
  ConfiguracionScoringForm.tsx        # client form de config
app/(app)/evaluaciones/
  page.tsx                            # Server Component (evaluador): pendientes + form + historial
app/(app)/admin/configuracion-scoring/
  page.tsx                            # Server Component (admin): form de config por liga
app/(app)/layout.tsx                 # MODIFY: nav "Evaluaciones" (evaluador) y "Config. scoring" (admins)
tests/unit/
  pendientesDeEvaluar.test.ts
scripts/rls-test/run-rls-tests.ts    # MODIFY: caso de evaluacion atada a partido de otra región
```

---

### Task 1: Funciones puras de pendientes y bloqueo (TDD)

**Files:**
- Create: `lib/evaluacion/pendientes.ts`
- Test: `tests/unit/pendientesDeEvaluar.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type DesignacionAceptada = {
    referee_id: string; partido_id: string; partido_fecha: string; liga_id: string
  }
  export type EvaluacionRef = { referee_id: string; partido_id: string | null }

  export function partidosPendientesDeEvaluar(input: {
    designacionesAceptadas: DesignacionAceptada[]
    evaluaciones: EvaluacionRef[]
    hoy: string   // 'YYYY-MM-DD'
  }): DesignacionAceptada[]

  export function refereeTieneEvaluacionesPendientes(input: {
    refereeId: string
    ligaId: string
    designacionesAceptadas: DesignacionAceptada[]
    evaluaciones: EvaluacionRef[]
    hoy: string
  }): boolean
  ```
  Consumido por Task 2 (`listPendientesDeEvaluar`) y Task 5 (`confirmarDesignacion`).

- [ ] **Step 1: Escribir el test que falla — `tests/unit/pendientesDeEvaluar.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import {
  partidosPendientesDeEvaluar,
  refereeTieneEvaluacionesPendientes,
} from '@/lib/evaluacion/pendientes'

const HOY = '2026-09-15'

const D = (over: Partial<Parameters<typeof partidosPendientesDeEvaluar>[0]['designacionesAceptadas'][number]> = {}) => ({
  referee_id: 'r1',
  partido_id: 'p1',
  partido_fecha: '2026-09-01',
  liga_id: 'ligaA',
  ...over,
})

describe('partidosPendientesDeEvaluar', () => {
  it('un partido jugado, aceptado y sin evaluación → pendiente', () => {
    const r = partidosPendientesDeEvaluar({
      designacionesAceptadas: [D()],
      evaluaciones: [],
      hoy: HOY,
    })
    expect(r).toEqual([D()])
  })

  it('con al menos una evaluación de cualquier tipo para ese (referee, partido) → deja de ser pendiente', () => {
    const r = partidosPendientesDeEvaluar({
      designacionesAceptadas: [D()],
      evaluaciones: [{ referee_id: 'r1', partido_id: 'p1' }],
      hoy: HOY,
    })
    expect(r).toEqual([])
  })

  it('partido cuya fecha todavía no pasó → no es pendiente', () => {
    const r = partidosPendientesDeEvaluar({
      designacionesAceptadas: [D({ partido_fecha: '2026-12-01' })],
      evaluaciones: [],
      hoy: HOY,
    })
    expect(r).toEqual([])
  })

  it('una evaluación periódica (partido_id null) no cancela un pendiente concreto', () => {
    const r = partidosPendientesDeEvaluar({
      designacionesAceptadas: [D()],
      evaluaciones: [{ referee_id: 'r1', partido_id: null }],
      hoy: HOY,
    })
    expect(r).toEqual([D()])
  })

  it('la evaluación de otro referee para el mismo partido no cancela el pendiente', () => {
    const r = partidosPendientesDeEvaluar({
      designacionesAceptadas: [D()],
      evaluaciones: [{ referee_id: 'r2', partido_id: 'p1' }],
      hoy: HOY,
    })
    expect(r).toEqual([D()])
  })
})

describe('refereeTieneEvaluacionesPendientes', () => {
  it('true si el referee tiene un pendiente en esa liga', () => {
    const r = refereeTieneEvaluacionesPendientes({
      refereeId: 'r1',
      ligaId: 'ligaA',
      designacionesAceptadas: [D()],
      evaluaciones: [],
      hoy: HOY,
    })
    expect(r).toBe(true)
  })

  it('false si el pendiente es de OTRA liga', () => {
    const r = refereeTieneEvaluacionesPendientes({
      refereeId: 'r1',
      ligaId: 'ligaB',
      designacionesAceptadas: [D({ liga_id: 'ligaA' })],
      evaluaciones: [],
      hoy: HOY,
    })
    expect(r).toBe(false)
  })

  it('false si todos sus partidos jugados ya tienen evaluación', () => {
    const r = refereeTieneEvaluacionesPendientes({
      refereeId: 'r1',
      ligaId: 'ligaA',
      designacionesAceptadas: [D()],
      evaluaciones: [{ referee_id: 'r1', partido_id: 'p1' }],
      hoy: HOY,
    })
    expect(r).toBe(false)
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run tests/unit/pendientesDeEvaluar.test.ts`
Expected: FAIL — `Cannot find module '@/lib/evaluacion/pendientes'`.

- [ ] **Step 3: Implementar `lib/evaluacion/pendientes.ts`**

```ts
export type DesignacionAceptada = {
  referee_id: string
  partido_id: string
  partido_fecha: string
  liga_id: string
}

export type EvaluacionRef = { referee_id: string; partido_id: string | null }

function clave(refereeId: string, partidoId: string): string {
  return `${refereeId}|${partidoId}`
}

export function partidosPendientesDeEvaluar(input: {
  designacionesAceptadas: DesignacionAceptada[]
  evaluaciones: EvaluacionRef[]
  hoy: string
}): DesignacionAceptada[] {
  const evaluados = new Set(
    input.evaluaciones
      .filter((e): e is { referee_id: string; partido_id: string } => e.partido_id !== null)
      .map((e) => clave(e.referee_id, e.partido_id))
  )
  return input.designacionesAceptadas.filter(
    (d) => d.partido_fecha <= input.hoy && !evaluados.has(clave(d.referee_id, d.partido_id))
  )
}

export function refereeTieneEvaluacionesPendientes(input: {
  refereeId: string
  ligaId: string
  designacionesAceptadas: DesignacionAceptada[]
  evaluaciones: EvaluacionRef[]
  hoy: string
}): boolean {
  const pendientes = partidosPendientesDeEvaluar({
    designacionesAceptadas: input.designacionesAceptadas,
    evaluaciones: input.evaluaciones,
    hoy: input.hoy,
  })
  return pendientes.some((d) => d.referee_id === input.refereeId && d.liga_id === input.ligaId)
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run tests/unit/pendientesDeEvaluar.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluacion/pendientes.ts tests/unit/pendientesDeEvaluar.test.ts
git commit -m "feat(evaluacion): add pure partidosPendientesDeEvaluar / refereeTieneEvaluacionesPendientes"
```

---

### Task 2: Server actions de evaluaciones

**Files:**
- Create: `actions/evaluaciones.ts`

**Interfaces:**
- Consumes: `partidosPendientesDeEvaluar` (Task 1), `createClient` server + `getProfile()` + `ROLES` (Fase 1), tablas `designacion`/`partido`/`evaluacion`/`referee`.
- Produces:
  ```ts
  export type PartidoPendiente = {
    designacion_id: string; partido_id: string; referee_id: string; referee_nombre: string
    partido_label: string; fecha: string; categoria: string; liga_id: string
  }
  export type EvaluacionCargada = {
    id: string; tipo: 'performance' | 'fisico' | 'videoanalisis' | 'coaching'
    valor: number; fecha: string; partido_label: string | null
  }
  export async function listPendientesDeEvaluar(): Promise<PartidoPendiente[]>
  export async function crearEvaluacion(input: {
    referee_id: string; partido_id: string
    tipo: 'performance' | 'fisico' | 'videoanalisis' | 'coaching'; valor: number
  }): Promise<void>
  export async function listEvaluacionesDeReferee(refereeId: string): Promise<EvaluacionCargada[]>
  ```
  Consumido por Task 3 (`/evaluaciones`) y por Fase 10 (perfil de referee).

- [ ] **Step 1: Crear `actions/evaluaciones.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { ROLES } from '@/lib/auth/roles'
import { partidosPendientesDeEvaluar, type DesignacionAceptada } from '@/lib/evaluacion/pendientes'

export type PartidoPendiente = {
  designacion_id: string
  partido_id: string
  referee_id: string
  referee_nombre: string
  partido_label: string
  fecha: string
  categoria: string
  liga_id: string
}

export type EvaluacionCargada = {
  id: string
  tipo: 'performance' | 'fisico' | 'videoanalisis' | 'coaching'
  valor: number
  fecha: string
  partido_label: string | null
}

function exigirEvaluador(rol: string | undefined): void {
  if (rol !== ROLES.EVALUADOR && rol !== ROLES.ADMIN_REGIONAL && rol !== ROLES.ADMIN_NACIONAL) {
    throw new Error('No autorizado para gestionar evaluaciones.')
  }
}

export async function listPendientesDeEvaluar(): Promise<PartidoPendiente[]> {
  const perfil = await getProfile()
  exigirEvaluador(perfil?.rol)
  const supabase = await createClient()

  // RLS ya limita designacion/evaluacion al scope del evaluador.
  const { data: designaciones, error: dError } = await supabase
    .from('designacion')
    .select(
      'id, referee_id, partido_id, referee:referee_id(nombre), ' +
        'partido:partido_id(fecha, categoria, liga_id, club_local:club_local_id(nombre), club_visita:club_visita_id(nombre))'
    )
    .eq('estado', 'confirmado')
    .eq('estado_aceptacion', 'aceptado')
  if (dError) throw new Error(dError.message)

  const { data: evaluaciones, error: eError } = await supabase
    .from('evaluacion')
    .select('referee_id, partido_id')
  if (eError) throw new Error(eError.message)

  const aceptadas: DesignacionAceptada[] = (designaciones ?? []).map((d) => {
    const p = d.partido as { fecha: string; liga_id: string } | null
    return {
      referee_id: d.referee_id,
      partido_id: d.partido_id,
      partido_fecha: p?.fecha ?? '9999-12-31',
      liga_id: p?.liga_id ?? '',
    }
  })

  const hoy = new Date().toISOString().slice(0, 10)
  const pendientesClaves = new Set(
    partidosPendientesDeEvaluar({ designacionesAceptadas: aceptadas, evaluaciones: evaluaciones ?? [], hoy }).map(
      (d) => `${d.referee_id}|${d.partido_id}`
    )
  )

  return (designaciones ?? [])
    .filter((d) => pendientesClaves.has(`${d.referee_id}|${d.partido_id}`))
    .map((d) => {
      const p = d.partido as {
        fecha: string
        categoria: string
        liga_id: string
        club_local: { nombre: string } | null
        club_visita: { nombre: string } | null
      } | null
      return {
        designacion_id: d.id,
        partido_id: d.partido_id,
        referee_id: d.referee_id,
        referee_nombre: (d.referee as { nombre: string } | null)?.nombre ?? '',
        partido_label: `${p?.club_local?.nombre ?? '?'} vs ${p?.club_visita?.nombre ?? '?'}`,
        fecha: p?.fecha ?? '',
        categoria: p?.categoria ?? '',
        liga_id: p?.liga_id ?? '',
      }
    })
}

export async function crearEvaluacion(input: {
  referee_id: string
  partido_id: string
  tipo: 'performance' | 'fisico' | 'videoanalisis' | 'coaching'
  valor: number
}): Promise<void> {
  const perfil = await getProfile()
  exigirEvaluador(perfil?.rol)

  if (!Number.isFinite(input.valor) || input.valor < 0 || input.valor > 10) {
    throw new Error('El valor de la evaluación debe estar entre 0 y 10.')
  }

  const supabase = await createClient()
  const { error } = await supabase.from('evaluacion').insert({
    referee_id: input.referee_id,
    partido_id: input.partido_id,
    tipo: input.tipo,
    valor: input.valor,
    fecha: new Date().toISOString().slice(0, 10),
    evaluador_id: perfil!.id,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/evaluaciones')
}

export async function listEvaluacionesDeReferee(refereeId: string): Promise<EvaluacionCargada[]> {
  const perfil = await getProfile()
  if (!perfil) throw new Error('No autorizado.')
  const supabase = await createClient()

  // RLS: el propio referee ve las suyas; evaluador/designador/admin ven las de su scope.
  const { data, error } = await supabase
    .from('evaluacion')
    .select(
      'id, tipo, valor, fecha, ' +
        'partido:partido_id(club_local:club_local_id(nombre), club_visita:club_visita_id(nombre))'
    )
    .eq('referee_id', refereeId)
    .order('fecha', { ascending: false })
  if (error) throw new Error(error.message)

  return (data ?? []).map((e) => {
    const p = e.partido as {
      club_local: { nombre: string } | null
      club_visita: { nombre: string } | null
    } | null
    return {
      id: e.id,
      tipo: e.tipo,
      valor: Number(e.valor),
      fecha: e.fecha,
      partido_label: p ? `${p.club_local?.nombre ?? '?'} vs ${p.club_visita?.nombre ?? '?'}` : null,
    }
  })
}
```

- [ ] **Step 2: Verificar compila + suite**

Run: `npx vitest run` → todos pasan.
Run: `npm run lint` → sin errores.

- [ ] **Step 3: Commit**

```bash
git add actions/evaluaciones.ts
git commit -m "feat(evaluacion): add list-pendientes / crear / list-de-referee actions"
```

---

### Task 3: Pantalla `/evaluaciones` (evaluador) + nav

**Files:**
- Create: `components/evaluacion/EvaluacionForm.tsx`, `app/(app)/evaluaciones/page.tsx`
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `listPendientesDeEvaluar` / `crearEvaluacion` (Task 2).
- Produces: ruta `/evaluaciones`.

- [ ] **Step 1: Crear `components/evaluacion/EvaluacionForm.tsx`**

```tsx
'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

type Tipo = 'performance' | 'fisico' | 'videoanalisis' | 'coaching'

const TIPOS: { value: Tipo; label: string }[] = [
  { value: 'performance', label: 'Performance' },
  { value: 'fisico', label: 'Físico' },
  { value: 'videoanalisis', label: 'Videoanálisis' },
  { value: 'coaching', label: 'Coaching' },
]

type Props = {
  refereeId: string
  partidoId: string
  crearEvaluacion: (input: {
    referee_id: string
    partido_id: string
    tipo: Tipo
    valor: number
  }) => Promise<void>
}

export function EvaluacionForm({ refereeId, partidoId, crearEvaluacion }: Props) {
  const router = useRouter()
  const [tipo, setTipo] = useState<Tipo>('performance')
  const [valor, setValor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const n = Number(valor)
    if (!Number.isFinite(n) || n < 0 || n > 10) {
      setError('El valor debe estar entre 0 y 10.')
      return
    }
    startTransition(async () => {
      try {
        await crearEvaluacion({ referee_id: refereeId, partido_id: partidoId, tipo, valor: n })
        setValor('')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo guardar la evaluación.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="flex flex-col">
        <label className="text-xs text-muted">Tipo</label>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as Tipo)}
          className="rounded border border-border bg-background px-2 py-1 text-foreground"
        >
          {TIPOS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-muted">Valor (0-10)</label>
        <input
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          required
          className="w-24 rounded border border-border bg-background px-2 py-1 text-foreground"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
      >
        {isPending ? 'Guardando...' : 'Agregar'}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </form>
  )
}
```

- [ ] **Step 2: Crear `app/(app)/evaluaciones/page.tsx`**

```tsx
import { listPendientesDeEvaluar, crearEvaluacion } from '@/actions/evaluaciones'
import { EvaluacionForm } from '@/components/evaluacion/EvaluacionForm'

export default async function EvaluacionesPage() {
  let pendientes: Awaited<ReturnType<typeof listPendientesDeEvaluar>>
  try {
    pendientes = await listPendientesDeEvaluar()
  } catch (err) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-muted">
        {err instanceof Error ? err.message : 'No se pudieron cargar los partidos pendientes.'}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Partidos jugados pendientes de evaluar</h1>
      <p className="text-sm text-muted">
        Cada fila es un partido ya jugado con una designación aceptada y sin ninguna evaluación cargada.
        Con agregar una evaluación de cualquier tipo, el partido sale de esta lista.
      </p>

      {pendientes.length === 0 && (
        <p className="text-sm text-muted">No hay partidos pendientes de evaluar.</p>
      )}

      <div className="flex flex-col gap-4">
        {pendientes.map((p) => (
          <div key={p.designacion_id} className="rounded-lg border border-border bg-surface p-4">
            <p className="text-sm font-medium">
              {p.referee_nombre} — {p.partido_label}
            </p>
            <p className="mb-3 text-xs text-muted">
              {p.fecha} · {p.categoria}
            </p>
            <EvaluacionForm
              refereeId={p.referee_id}
              partidoId={p.partido_id}
              crearEvaluacion={crearEvaluacion}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Modificar `app/(app)/layout.tsx`**

En `NAV_POR_ROL`:

```tsx
  [ROLES.ADMIN_NACIONAL]: [
    { href: '/admin/catalogos/regiones', label: 'Regiones' },
    { href: '/admin/catalogos/ligas', label: 'Ligas' },
    { href: '/admin/catalogos/clubes', label: 'Clubes' },
    { href: '/admin/catalogos/referees', label: 'Referees' },
    { href: '/fixture', label: 'Fixture' },
    { href: '/evaluaciones', label: 'Evaluaciones' },
    { href: '/admin/configuracion-scoring', label: 'Config. scoring' },
  ],
  [ROLES.ADMIN_REGIONAL]: [
    { href: '/admin/catalogos/ligas', label: 'Ligas' },
    { href: '/admin/catalogos/clubes', label: 'Clubes' },
    { href: '/admin/catalogos/referees', label: 'Referees' },
    { href: '/fixture', label: 'Fixture' },
    { href: '/evaluaciones', label: 'Evaluaciones' },
    { href: '/admin/configuracion-scoring', label: 'Config. scoring' },
  ],
  [ROLES.DESIGNADOR]: [{ href: '/fixture', label: 'Fixture' }],
  [ROLES.EVALUADOR]: [{ href: '/evaluaciones', label: 'Evaluaciones' }],
  [ROLES.REFEREE]: [
    { href: '/disponibilidad', label: 'Mi disponibilidad' },
    { href: '/mis-designaciones', label: 'Mis designaciones' },
  ],
```

- [ ] **Step 4: Verificar manualmente**

Precondición: `npx supabase db reset`, `npm run dev`.

1. Como `designador@rugby.local`: importar un partido de fecha pasada (`2026-09-01 ALU vs LRC`), crear disponibilidad para un referee con cuenta (`referee@rugby.local` vinculado a un `referee`), confirmar su designación desde `/fixture/<id>`.
2. Como `referee@rugby.local`: `/mis-designaciones` → **Aceptar**.
3. Como `evaluador@rugby.local`: ir a `/evaluaciones`. Expected: aparece 1 fila (`<referee> — Alumni vs Lima RC`, `2026-09-01`).
4. Agregar una evaluación `performance = 8`. Expected: al refrescar, la fila **desaparece** de pendientes.
5. En la DB: `select tipo, valor, evaluador_id from evaluacion;` → `performance, 8.00, <id del evaluador>`.
6. Limpiar: `docker exec supabase_db_rugby psql -U postgres -d postgres -c "delete from evaluacion; delete from designacion; delete from disponibilidad; delete from partido where es_historico=false;"`

- [ ] **Step 5: Commit**

```bash
git add components/evaluacion "app/(app)/evaluaciones/page.tsx" "app/(app)/layout.tsx"
git commit -m "feat(evaluacion): add evaluador pendientes screen and nav"
```

---

### Task 4: Configuración de scoring por liga (action + pantalla)

**Files:**
- Create: `actions/configuracion.ts`, `components/configuracion/ConfiguracionScoringForm.tsx`, `app/(app)/admin/configuracion-scoring/page.tsx`

**Interfaces:**
- Consumes: `createClient` server + `getProfile()` + `ROLES`, tabla `configuracion_scoring` + `liga` (Fase 1/6).
- Produces:
  ```ts
  export type ConfiguracionScoringFila = {
    liga_id: string; liga_nombre: string
    peso_performance_normal: number; peso_fisico_normal: number
    peso_videoanalisis_normal: number; peso_coaching_normal: number
    peso_performance_alta: number; peso_fisico_alta: number
    peso_videoanalisis_alta: number; peso_coaching_alta: number
    umbral_complejidad_alta: number; factor_penalizacion_club: number
    semivida_dias: number; score_sin_evaluaciones: number; evaluacion_bloqueante: boolean
  }
  export async function listConfiguracionesScoring(): Promise<ConfiguracionScoringFila[]>
  export async function actualizarConfiguracionScoring(input: ConfiguracionScoringFila): Promise<void>
  ```
  Consumido por la pantalla y (lectura) por Fase 6 / Fase 5's guard.

- [ ] **Step 1: Crear `actions/configuracion.ts`**

```ts
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
  const { error } = await supabase
    .from('configuracion_scoring')
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq('liga_id', liga_id)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/configuracion-scoring')
}
```

- [ ] **Step 2: Crear `components/configuracion/ConfiguracionScoringForm.tsx`**

```tsx
'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { ConfiguracionScoringFila } from '@/actions/configuracion'

const CAMPOS_NUMERICOS: { key: keyof ConfiguracionScoringFila; label: string; step: string }[] = [
  { key: 'peso_performance_normal', label: 'Peso performance (normal)', step: '0.001' },
  { key: 'peso_fisico_normal', label: 'Peso físico (normal)', step: '0.001' },
  { key: 'peso_videoanalisis_normal', label: 'Peso videoanálisis (normal)', step: '0.001' },
  { key: 'peso_coaching_normal', label: 'Peso coaching (normal)', step: '0.001' },
  { key: 'peso_performance_alta', label: 'Peso performance (alta)', step: '0.001' },
  { key: 'peso_fisico_alta', label: 'Peso físico (alta)', step: '0.001' },
  { key: 'peso_videoanalisis_alta', label: 'Peso videoanálisis (alta)', step: '0.001' },
  { key: 'peso_coaching_alta', label: 'Peso coaching (alta)', step: '0.001' },
  { key: 'umbral_complejidad_alta', label: 'Umbral de complejidad alta (1-10)', step: '1' },
  { key: 'factor_penalizacion_club', label: 'Factor penalización por club (0-1)', step: '0.001' },
  { key: 'semivida_dias', label: 'Semivida de decaimiento (días)', step: '1' },
  { key: 'score_sin_evaluaciones', label: 'Score base sin evaluaciones', step: '0.1' },
]

export function ConfiguracionScoringForm({
  inicial,
  actualizar,
}: {
  inicial: ConfiguracionScoringFila
  actualizar: (input: ConfiguracionScoringFila) => Promise<void>
}) {
  const router = useRouter()
  const [form, setForm] = useState<ConfiguracionScoringFila>(inicial)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setOkMsg(null)
    startTransition(async () => {
      try {
        await actualizar(form)
        setOkMsg('Configuración guardada.')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo guardar la configuración.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-base font-semibold">{form.liga_nombre}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CAMPOS_NUMERICOS.map((c) => (
          <div key={c.key} className="flex flex-col">
            <label className="text-xs text-muted">{c.label}</label>
            <input
              type="number"
              step={c.step}
              value={String(form[c.key])}
              onChange={(e) => setForm((f) => ({ ...f, [c.key]: Number(e.target.value) }))}
              className="rounded border border-border bg-background px-2 py-1 text-foreground"
            />
          </div>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.evaluacion_bloqueante}
          onChange={(e) => setForm((f) => ({ ...f, evaluacion_bloqueante: e.target.checked }))}
        />
        Bloquear nuevas designaciones si el referee tiene evaluaciones pendientes
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        >
          {isPending ? 'Guardando...' : 'Guardar'}
        </button>
        {error && <span className="text-sm text-danger">{error}</span>}
        {okMsg && <span className="text-sm text-muted">{okMsg}</span>}
      </div>
    </form>
  )
}
```

- [ ] **Step 3: Crear `app/(app)/admin/configuracion-scoring/page.tsx`**

```tsx
import { listConfiguracionesScoring, actualizarConfiguracionScoring } from '@/actions/configuracion'
import { ConfiguracionScoringForm } from '@/components/configuracion/ConfiguracionScoringForm'

export default async function ConfiguracionScoringPage() {
  let configs: Awaited<ReturnType<typeof listConfiguracionesScoring>>
  try {
    configs = await listConfiguracionesScoring()
  } catch (err) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-muted">
        {err instanceof Error ? err.message : 'No se pudo cargar la configuración.'}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Configuración de scoring por liga</h1>
      {configs.length === 0 && (
        <p className="text-sm text-muted">No hay ligas con configuración en tu ámbito.</p>
      )}
      {configs.map((c) => (
        <ConfiguracionScoringForm
          key={c.liga_id}
          inicial={c}
          actualizar={actualizarConfiguracionScoring}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Verificar manualmente**

Precondición: `npx supabase db reset`, `npm run dev`, logueado como `admin.regional@rugby.local`.

1. Ir a `/admin/configuracion-scoring` → aparece 1 form ("Liga Metropolitana") con los defaults (`0.4/0.2/0.2/0.2`, umbral 7, factor 0.8, semivida 180, `evaluacion_bloqueante` desmarcado).
2. Cambiar `semivida_dias` a `90`, marcar `evaluacion_bloqueante`, guardar → "Configuración guardada.".
   En la DB: `select semivida_dias, evaluacion_bloqueante from configuracion_scoring;` → `90, t`.
3. Probar validación: poner `peso_performance_normal = 0.9` (rompe la suma) y guardar → error "Los pesos normales deben sumar 1.000."; la DB no cambia.
4. Como `designador@rugby.local`: `/admin/configuracion-scoring` → mensaje "No autorizado para editar la configuración de scoring." (o la página no está en su nav; entrar por URL directa da el error del action).
5. Restaurar: volver a `semivida_dias = 180`, `evaluacion_bloqueante` según lo que quiera la Task 5 (dejarlo marcado para probar el guard).

- [ ] **Step 5: Commit**

```bash
git add actions/configuracion.ts components/configuracion "app/(app)/admin/configuracion-scoring/page.tsx"
git commit -m "feat(configuracion): add per-liga scoring configuration screen"
```

---

### Task 5: Guard `evaluacion_bloqueante` en `confirmarDesignacion`

**Files:**
- Modify: `actions/designaciones.ts`

**Interfaces:**
- Consumes: `refereeTieneEvaluacionesPendientes` (Task 1), tabla `configuracion_scoring`/`designacion`/`partido`/`evaluacion`.
- Produces: `confirmarDesignacion` ahora falla con `"El referee tiene evaluaciones pendientes..."` si la liga tiene `evaluacion_bloqueante = true` y el referee candidato tiene ≥ 1 partido jugado pendiente de evaluar en esa liga.

- [ ] **Step 1: Modificar `confirmarDesignacion` en `actions/designaciones.ts`**

Después de obtener `reco = await recomendarReferees(input.partidoId)` y antes de tocar `designacion`, agregar el guard. Se necesita la `liga_id` del partido: agregarla al retorno de `recomendarReferees` (`ResultadoRecomendaciones.partido.liga_id`) si no está — o consultarla acá con service-role:

```ts
import { refereeTieneEvaluacionesPendientes, type DesignacionAceptada } from '@/lib/evaluacion/pendientes'

// ... dentro de confirmarDesignacion, tras `const db = servicio()` y el cálculo de scoreSnapshot:

  const { data: partidoLiga } = await db
    .from('partido')
    .select('liga_id')
    .eq('id', input.partidoId)
    .single()
  const ligaId = partidoLiga?.liga_id

  if (ligaId) {
    const { data: cfg } = await db
      .from('configuracion_scoring')
      .select('evaluacion_bloqueante')
      .eq('liga_id', ligaId)
      .maybeSingle()

    if (cfg?.evaluacion_bloqueante) {
      const { data: aceptadasRaw } = await db
        .from('designacion')
        .select('referee_id, partido_id, partido:partido_id(fecha, liga_id)')
        .eq('referee_id', input.refereeId)
        .eq('estado', 'confirmado')
        .eq('estado_aceptacion', 'aceptado')
      const { data: evalsRef } = await db
        .from('evaluacion')
        .select('referee_id, partido_id')
        .eq('referee_id', input.refereeId)

      const aceptadas: DesignacionAceptada[] = (aceptadasRaw ?? []).map((d) => {
        const p = d.partido as { fecha: string; liga_id: string } | null
        return {
          referee_id: d.referee_id,
          partido_id: d.partido_id,
          partido_fecha: p?.fecha ?? '9999-12-31',
          liga_id: p?.liga_id ?? '',
        }
      })

      const bloqueado = refereeTieneEvaluacionesPendientes({
        refereeId: input.refereeId,
        ligaId,
        designacionesAceptadas: aceptadas,
        evaluaciones: evalsRef ?? [],
        hoy: new Date().toISOString().slice(0, 10),
      })
      if (bloqueado) {
        throw new Error(
          'El referee tiene partidos jugados sin evaluar en esta liga. La configuración de la liga ' +
            'bloquea nuevas designaciones hasta que se completen esas evaluaciones.'
        )
      }
    }
  }
```

- [ ] **Step 2: Verificar compila + suite**

Run: `npx vitest run` → todos pasan.
Run: `npm run lint` → sin errores.

- [ ] **Step 3: Verificar manualmente el guard**

Precondición: `npx supabase db reset`, `npm run dev`. En `/admin/configuracion-scoring` (como admin) marcar `evaluacion_bloqueante` para la Liga Metropolitana.

1. Como `designador@rugby.local`: importar dos partidos de fecha pasada con el mismo referee candidato disponible. Confirmar el referee en el partido A.
2. Como ese referee: aceptar la designación del partido A (`/mis-designaciones`).
3. Como `designador`: entrar a `/fixture/<partido B>` e intentar **Confirmar** el mismo referee.
   Expected: error visible "El referee tiene partidos jugados sin evaluar en esta liga...". No se crea la designación B (`select count(*) from designacion where partido_id = <B>` → 0).
4. Como `evaluador@rugby.local`: cargar una evaluación `performance` para el referee en el partido A desde `/evaluaciones`.
5. Como `designador`: reintentar Confirmar en el partido B → ahora funciona.
6. Desmarcar `evaluacion_bloqueante` y verificar que el guard deja de aplicar.
7. Limpiar: `docker exec supabase_db_rugby psql -U postgres -d postgres -c "delete from evaluacion; delete from designacion; delete from disponibilidad; delete from partido where es_historico=false; update configuracion_scoring set evaluacion_bloqueante = false;"`

- [ ] **Step 4: Commit**

```bash
git add actions/designaciones.ts
git commit -m "feat(designacion): enforce evaluacion_bloqueante guard on confirmarDesignacion"
```

---

### Task 6: Extender el script de RLS con aislamiento de `evaluacion` por región

**Files:**
- Modify: `scripts/rls-test/run-rls-tests.ts`

**Interfaces:**
- Consumes: helpers + usuarios de prueba (`evaluador` de Lima, y un `evaluador`/`referee` de la región de prueba). Reusa el `referee` de Lima creado en el bloque de Fase 6.
- Produces: casos nuevos en `npm run test:rls`.

- [ ] **Step 1: Agregar casos al final de `main()` en `scripts/rls-test/run-rls-tests.ts`**

```ts
  // ---- evaluacion: aislamiento por región ----
  const { data: refereeRegionTest } = await admin
    .from('referee')
    .insert({ nombre: `ref-regiontest-${sufijo}`, categoria: 'Regional', region_id: regionTest.id })
    .select('id')
    .single()

  await admin
    .from('evaluacion')
    .insert({ referee_id: refereeRegionTest!.id, tipo: 'performance', valor: 7, fecha: '2026-09-01' })

  console.log('Caso: evaluador de Lima NO ve evaluaciones de un referee de la región de prueba')
  const clienteEvaluadorLima2 = await iniciarSesionComo(emailEvaluadorLima, password)
  const { data: evalsVistasPorLima } = await clienteEvaluadorLima2
    .from('evaluacion')
    .select('referee_id')
  assert(
    (evalsVistasPorLima ?? []).every((e) => e.referee_id !== refereeRegionTest!.id),
    'evaluador de Lima no ve evaluaciones de referees de otra región'
  )

  console.log('Caso: evaluador de Lima NO puede insertar una evaluación de un referee de otra región')
  const { error: evalCruzadoError } = await clienteEvaluadorLima2
    .from('evaluacion')
    .insert({ referee_id: refereeRegionTest!.id, tipo: 'fisico', valor: 5, fecha: '2026-09-01' })
  assert(
    evalCruzadoError !== null,
    'evaluador de Lima no puede insertar evaluaciones de referees de otra región (RLS lo bloquea)'
  )

  await admin.from('evaluacion').delete().eq('referee_id', refereeRegionTest!.id)
  await admin.from('referee').delete().eq('id', refereeRegionTest!.id)
```

- [ ] **Step 2: Correr y verificar**

Run: `npx supabase db reset && npm run test:rls`
Expected: `TODOS LOS CASOS PASARON`, código de salida 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/rls-test/run-rls-tests.ts
git commit -m "test: extend RLS script with evaluacion region isolation cases"
```

---

## Self-review (cobertura vs. spec §9)

| Requisito spec §9 | Task |
|---|---|
| El evaluador carga evaluaciones asociadas a `partido_id` después del partido | Task 2 (`crearEvaluacion`) + Task 3 (`/evaluaciones` + `EvaluacionForm`) |
| Vista "partidos jugados pendientes de evaluar" (aceptada + fecha pasada + sin evaluación) | Task 1 (`partidosPendientesDeEvaluar`) + Task 2 (`listPendientesDeEvaluar`) + Task 3 |
| `evaluacion_bloqueante` configurable por liga (decisión del admin) | Task 4 (`/admin/configuracion-scoring` + toggle) |
| Bloqueo de nuevas designaciones por evaluaciones pendientes | Task 5 (guard en `confirmarDesignacion`) + Task 1 (`refereeTieneEvaluacionesPendientes`) |
| RLS: evaluación scopeada por región; el propio referee ve las suyas | Fase 6 (policies) + Task 6 (casos de aislamiento) |
| Config de scoring editable (pesos, umbrales, penalización, decaimiento) | Task 4 (`ConfiguracionScoringForm` cubre todos los campos) |

## Al terminar

Con esto el loop de evaluación queda cerrado y la designación puede bloquearse por evaluaciones pendientes según la política de cada liga. El siguiente checkpoint es la **Fase 10** (autoevaluación post-partido del referee + perfil de referee consolidado `/referees/[refereeId]`) — no se empieza hasta que este plan esté revisado y mergeado a `feature/plataforma-fundacion`.
