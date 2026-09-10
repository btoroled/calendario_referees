# Fase 8 — Carga de resultado de partido jugado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir cargar el resultado de un partido del fixture una vez jugado — score, amonestados (amarillas), expulsados (rojas) e incidentes — por dos vías: una pantalla `/fixture/[partidoId]/resultado` operada por el designador, y un script batch que actualiza una jornada completa desde un CSV con el formato de la ficha. Esto hace crecer el historial directo entre clubes (alimenta la complejidad de partidos futuros) y habilita "partidos jugados pendientes de evaluar" con datos reales.

**Architecture:** `validarResultado` es una función pura que valida los campos del formulario (enteros ≥ 0, score requerido). El server action `guardarResultado` hace un `UPDATE` sobre la fila `partido` existente, restringido por rol y por una nueva policy RLS (`partido_update_resultado`). El script batch reutiliza `parseHistoricoCsv` de la Fase 5 y, en vez de insertar, matchea partidos existentes del fixture por `(fecha, club_local_codigo, club_visita_codigo)` y los actualiza con service-role. Ninguna de las dos vías recalcula la `complejidad` del propio partido (ya se calculó al importarlo); el efecto buscado es que el partido pase a estar disponible como historial para cálculos futuros.

**Tech Stack:** Supabase CLI (migración de policy), TypeScript puro (`validarResultado`), Vitest (unit), Next.js App Router (server action + Server/Client Components), `tsx` + service-role (`scripts/cargar-resultados/run.ts`), reutiliza `lib/fixture/parseHistoricoCsv.ts` (Fase 5).

**Spec:** `docs/superpowers/specs/2026-09-10-fichas-cuerpo-arbitral-addendum.md` (§C carga de resultado) + `docs/superpowers/specs/2026-08-31-plataforma-designacion-referees-design.md` (§5 modelo `partido`, §9 cierre del loop, §11 RLS).

## Global Constraints

- RLS habilitada y forzada en `partido` (ya lo está desde Fase 4). La nueva policy `partido_update_resultado` habilita `UPDATE` a `designador`/`admin_regional`/`admin_nacional` cuyo scope de región/liga contiene el partido.
- Roles fijos, exactamente cinco. No hay rol "jefe de mesa" — la carga de resultado la hacen el designador y los admin.
- La pantalla y el action solo operan sobre partidos con `fecha <= current_date` y `es_historico = false`.
- Campos de resultado: `resultado_local`, `resultado_visita` (enteros ≥ 0, **requeridos**), `tarjetas_amarillas_local/visita`, `tarjetas_rojas_local/visita` (enteros ≥ 0, default 0), `incidentes` (texto libre, opcional). Es un subconjunto deliberado de la ficha física — sin planteles, anotaciones jugada por jugada ni firmas.
- **No** se recalcula la `complejidad` del propio partido al guardar el resultado.
- El script batch usa **service-role** (bypasea RLS a propósito, como el de Fase 5); matchea por `(fecha, club_local_codigo, club_visita_codigo)`; filas sin match → error reportado, no crea nada.
- La pantalla es **idempotente**: se puede volver a entrar y corregir un resultado ya cargado.
- MVP seedeado solo con Perú → Lima → Liga Metropolitana → Temporada 2026.

**Nota sobre TDD:** Task 2 (`validarResultado`) y Task 5 (parser/matcher del batch, la parte pura) siguen TDD rojo/verde con Vitest. Task 1 (migración) usa verificación determinística. Tasks 3-4 y 6 (action, UI, script ejecutable) se verifican con `npm run test:rls`, `npx vitest run`, `npm run lint` y verificación manual paso a paso.

---

## Estructura de archivos

```
supabase/migrations/
  0020_partido_update_resultado.sql   # policy partido_update_resultado
lib/fixture/
  validarResultado.ts                 # función pura de validación del formulario
actions/
  resultados.ts                       # obtenerPartidoParaResultado + guardarResultado
components/fixture/
  ResultadoForm.tsx                   # client form
app/(app)/fixture/[partidoId]/resultado/
  page.tsx                            # Server Component
app/(app)/fixture/[partidoId]/
  page.tsx                            # MODIFY: link a /resultado si el partido ya se jugó
scripts/cargar-resultados/
  run.ts                             # script batch ejecutable
tests/unit/
  validarResultado.test.ts
  cargarResultadosMatch.test.ts       # test de la función pura de matching
scripts/rls-test/run-rls-tests.ts    # MODIFY: casos de partido_update_resultado
```

---

### Task 1: Migración — policy `partido_update_resultado`

**Files:**
- Create: `supabase/migrations/0020_partido_update_resultado.sql`

**Interfaces:**
- Consumes: tabla `partido` + `fn_rol()`/`fn_region_id()`/`fn_pais_id()` (Fase 1/4).
- Produces: policy `partido_update_resultado` — consumida por Task 3 (`guardarResultado`).

- [ ] **Step 1: Crear `supabase/migrations/0020_partido_update_resultado.sql`**

```sql
-- Permite a designador/admin del scope de la liga del partido actualizar la fila
-- (carga de resultado de partido jugado, Fase 8). Postgres no filtra UPDATE por
-- columna en RLS; la restricción a solo los campos de resultado se hace en el
-- server action. El script batch usa service-role y no depende de esta policy.
create policy partido_update_resultado on partido for update
using (
  fn_rol() = 'admin_nacional' and liga_id in (
    select id from liga where region_id in (select id from region where pais_id = fn_pais_id())
  )
  or fn_rol() in ('admin_regional', 'designador') and liga_id in (
    select id from liga where region_id = fn_region_id()
  )
);
```

- [ ] **Step 2: Aplicar y verificar**

Run: `npx supabase db reset`
Expected: aplica sin error.

Run: `docker exec supabase_db_rugby psql -U postgres -d postgres -c "select polname from pg_policy where polrelid = 'partido'::regclass;"`
Expected: la lista incluye `partido_select`, `partido_insert` y `partido_update_resultado`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0020_partido_update_resultado.sql
git commit -m "feat(db): add partido_update_resultado RLS policy for played-match result entry"
```

---

### Task 2: Función pura `validarResultado` (TDD)

**Files:**
- Create: `lib/fixture/validarResultado.ts`
- Test: `tests/unit/validarResultado.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ResultadoInput = {
    resultado_local: string; resultado_visita: string
    tarjetas_amarillas_local: string; tarjetas_amarillas_visita: string
    tarjetas_rojas_local: string; tarjetas_rojas_visita: string
    incidentes: string
  }
  export type ResultadoNormalizado = {
    resultado_local: number; resultado_visita: number
    tarjetas_amarillas_local: number; tarjetas_amarillas_visita: number
    tarjetas_rojas_local: number; tarjetas_rojas_visita: number
    incidentes: string | null
  }
  export function validarResultado(input: ResultadoInput):
    | { ok: true; valor: ResultadoNormalizado }
    | { ok: false; error: string }
  ```
  Consumido por Task 3 (`guardarResultado`) y Task 4 (`ResultadoForm`).

- [ ] **Step 1: Escribir el test que falla — `tests/unit/validarResultado.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { validarResultado } from '@/lib/fixture/validarResultado'

const BASE = {
  resultado_local: '20',
  resultado_visita: '18',
  tarjetas_amarillas_local: '',
  tarjetas_amarillas_visita: '',
  tarjetas_rojas_local: '',
  tarjetas_rojas_visita: '',
  incidentes: '',
}

describe('validarResultado', () => {
  it('acepta un resultado válido con tarjetas vacías (default 0) e incidentes vacío (null)', () => {
    const r = validarResultado(BASE)
    expect(r).toEqual({
      ok: true,
      valor: {
        resultado_local: 20,
        resultado_visita: 18,
        tarjetas_amarillas_local: 0,
        tarjetas_amarillas_visita: 0,
        tarjetas_rojas_local: 0,
        tarjetas_rojas_visita: 0,
        incidentes: null,
      },
    })
  })

  it('conserva incidentes con texto y parsea tarjetas provistas', () => {
    const r = validarResultado({
      ...BASE,
      tarjetas_amarillas_local: '2',
      tarjetas_rojas_visita: '1',
      incidentes: '  Roce entre capitanes  ',
    })
    expect(r).toEqual({
      ok: true,
      valor: {
        resultado_local: 20,
        resultado_visita: 18,
        tarjetas_amarillas_local: 2,
        tarjetas_amarillas_visita: 0,
        tarjetas_rojas_local: 0,
        tarjetas_rojas_visita: 1,
        incidentes: 'Roce entre capitanes',
      },
    })
  })

  it('rechaza score local vacío', () => {
    const r = validarResultado({ ...BASE, resultado_local: '' })
    expect(r).toEqual({ ok: false, error: 'El resultado local es requerido.' })
  })

  it('rechaza score no numérico', () => {
    const r = validarResultado({ ...BASE, resultado_visita: 'diez' })
    expect(r).toEqual({ ok: false, error: 'El resultado visita debe ser un entero no negativo.' })
  })

  it('rechaza score negativo', () => {
    const r = validarResultado({ ...BASE, resultado_local: '-3' })
    expect(r).toEqual({ ok: false, error: 'El resultado local debe ser un entero no negativo.' })
  })

  it('rechaza tarjetas negativas', () => {
    const r = validarResultado({ ...BASE, tarjetas_amarillas_visita: '-1' })
    expect(r).toEqual({
      ok: false,
      error: 'La cantidad de tarjetas amarillas visita debe ser un entero no negativo.',
    })
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run tests/unit/validarResultado.test.ts`
Expected: FAIL — `Cannot find module '@/lib/fixture/validarResultado'`.

- [ ] **Step 3: Implementar `lib/fixture/validarResultado.ts`**

```ts
export type ResultadoInput = {
  resultado_local: string
  resultado_visita: string
  tarjetas_amarillas_local: string
  tarjetas_amarillas_visita: string
  tarjetas_rojas_local: string
  tarjetas_rojas_visita: string
  incidentes: string
}

export type ResultadoNormalizado = {
  resultado_local: number
  resultado_visita: number
  tarjetas_amarillas_local: number
  tarjetas_amarillas_visita: number
  tarjetas_rojas_local: number
  tarjetas_rojas_visita: number
  incidentes: string | null
}

function enteroNoNegativo(texto: string): number | null {
  const t = texto.trim()
  if (t === '') return null
  const n = Number(t)
  if (!Number.isInteger(n) || n < 0) return NaN
  return n
}

export function validarResultado(
  input: ResultadoInput
):
  | { ok: true; valor: ResultadoNormalizado }
  | { ok: false; error: string } {
  const score = (etiqueta: string, texto: string): number | { error: string } => {
    const t = texto.trim()
    if (t === '') return { error: `El resultado ${etiqueta} es requerido.` }
    const n = Number(t)
    if (!Number.isInteger(n) || n < 0) {
      return { error: `El resultado ${etiqueta} debe ser un entero no negativo.` }
    }
    return n
  }

  const local = score('local', input.resultado_local)
  if (typeof local !== 'number') return { ok: false, error: local.error }
  const visita = score('visita', input.resultado_visita)
  if (typeof visita !== 'number') return { ok: false, error: visita.error }

  const tarjetas: Record<string, number> = {}
  const campos: [keyof ResultadoInput, string][] = [
    ['tarjetas_amarillas_local', 'tarjetas amarillas local'],
    ['tarjetas_amarillas_visita', 'tarjetas amarillas visita'],
    ['tarjetas_rojas_local', 'tarjetas rojas local'],
    ['tarjetas_rojas_visita', 'tarjetas rojas visita'],
  ]
  for (const [campo, etiqueta] of campos) {
    const n = enteroNoNegativo(input[campo])
    if (Number.isNaN(n)) {
      return { ok: false, error: `La cantidad de ${etiqueta} debe ser un entero no negativo.` }
    }
    tarjetas[campo] = n ?? 0
  }

  return {
    ok: true,
    valor: {
      resultado_local: local,
      resultado_visita: visita,
      tarjetas_amarillas_local: tarjetas.tarjetas_amarillas_local,
      tarjetas_amarillas_visita: tarjetas.tarjetas_amarillas_visita,
      tarjetas_rojas_local: tarjetas.tarjetas_rojas_local,
      tarjetas_rojas_visita: tarjetas.tarjetas_rojas_visita,
      incidentes: input.incidentes.trim() || null,
    },
  }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run tests/unit/validarResultado.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/fixture/validarResultado.ts tests/unit/validarResultado.test.ts
git commit -m "feat(fixture): add pure validarResultado form validator"
```

---

### Task 3: Server action `guardarResultado`

**Files:**
- Create: `actions/resultados.ts`

**Interfaces:**
- Consumes: `validarResultado` + `ResultadoInput` (Task 2), `createClient` server (Fase 0), `getProfile()` + `ROLES` (Fase 1), tabla `partido`.
- Produces:
  ```ts
  export type PartidoParaResultado = {
    id: string; fecha: string; hora: string | null; categoria: string
    club_local: string; club_visita: string; ya_jugado: boolean; es_historico: boolean
    resultado_local: number | null; resultado_visita: number | null
    tarjetas_amarillas_local: number | null; tarjetas_amarillas_visita: number | null
    tarjetas_rojas_local: number | null; tarjetas_rojas_visita: number | null
    incidentes: string | null
  }
  export async function obtenerPartidoParaResultado(partidoId: string): Promise<PartidoParaResultado>
  export async function guardarResultado(input: { partidoId: string } & ResultadoInput): Promise<void>
  ```
  Consumido por Task 4 (`/fixture/[partidoId]/resultado`).

- [ ] **Step 1: Crear `actions/resultados.ts`**

```ts
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
      'id, fecha, hora, categoria, es_historico, resultado_local, resultado_visita, ' +
        'tarjetas_amarillas_local, tarjetas_amarillas_visita, tarjetas_rojas_local, tarjetas_rojas_visita, ' +
        'incidentes, club_local:club_local_id(nombre), club_visita:club_visita_id(nombre)'
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
    club_local: (data.club_local as { nombre: string } | null)?.nombre ?? '',
    club_visita: (data.club_visita as { nombre: string } | null)?.nombre ?? '',
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
```

- [ ] **Step 2: Verificar compila + suite**

Run: `npx vitest run` → todos pasan.
Run: `npm run lint` → sin errores.

- [ ] **Step 3: Commit**

```bash
git add actions/resultados.ts
git commit -m "feat(resultados): add obtenerPartidoParaResultado / guardarResultado actions"
```

---

### Task 4: Pantalla `/fixture/[partidoId]/resultado`

**Files:**
- Create: `components/fixture/ResultadoForm.tsx`, `app/(app)/fixture/[partidoId]/resultado/page.tsx`
- Modify: `app/(app)/fixture/[partidoId]/page.tsx` (link a `/resultado` si el partido ya se jugó)

**Interfaces:**
- Consumes: `obtenerPartidoParaResultado` / `guardarResultado` (Task 3).
- Produces: ruta `/fixture/[partidoId]/resultado`.

- [ ] **Step 1: Crear `components/fixture/ResultadoForm.tsx`**

```tsx
'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { ResultadoInput } from '@/lib/fixture/validarResultado'

type Props = {
  partidoId: string
  clubLocal: string
  clubVisita: string
  inicial: ResultadoInput
  guardarResultado: (input: { partidoId: string } & ResultadoInput) => Promise<void>
}

const CAMPOS_TARJETA: { name: keyof ResultadoInput; label: string }[] = [
  { name: 'tarjetas_amarillas_local', label: 'Amarillas local' },
  { name: 'tarjetas_amarillas_visita', label: 'Amarillas visita' },
  { name: 'tarjetas_rojas_local', label: 'Rojas local' },
  { name: 'tarjetas_rojas_visita', label: 'Rojas visita' },
]

export function ResultadoForm({ partidoId, clubLocal, clubVisita, inicial, guardarResultado }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<ResultadoInput>(inicial)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function set<K extends keyof ResultadoInput>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setOkMsg(null)
    startTransition(async () => {
      try {
        await guardarResultado({ partidoId, ...form })
        setOkMsg('Resultado guardado.')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo guardar el resultado.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-end gap-3">
        <div className="flex flex-col">
          <label className="text-xs text-muted">{clubLocal} (local)</label>
          <input
            inputMode="numeric"
            value={form.resultado_local}
            onChange={(e) => set('resultado_local', e.target.value)}
            className="w-24 rounded border border-border bg-background px-2 py-1 text-foreground"
          />
        </div>
        <span className="pb-1 text-muted">—</span>
        <div className="flex flex-col">
          <label className="text-xs text-muted">{clubVisita} (visita)</label>
          <input
            inputMode="numeric"
            value={form.resultado_visita}
            onChange={(e) => set('resultado_visita', e.target.value)}
            className="w-24 rounded border border-border bg-background px-2 py-1 text-foreground"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CAMPOS_TARJETA.map((c) => (
          <div key={c.name} className="flex flex-col">
            <label className="text-xs text-muted">{c.label}</label>
            <input
              inputMode="numeric"
              value={form[c.name]}
              onChange={(e) => set(c.name, e.target.value)}
              placeholder="0"
              className="rounded border border-border bg-background px-2 py-1 text-foreground"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col">
        <label className="text-xs text-muted">Incidentes (opcional)</label>
        <textarea
          value={form.incidentes}
          onChange={(e) => set('incidentes', e.target.value)}
          rows={3}
          className="rounded border border-border bg-background px-2 py-1 text-foreground"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {isPending ? 'Guardando...' : 'Guardar resultado'}
        </button>
        {error && <span className="text-sm text-danger">{error}</span>}
        {okMsg && <span className="text-sm text-muted">{okMsg}</span>}
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Crear `app/(app)/fixture/[partidoId]/resultado/page.tsx`**

```tsx
import Link from 'next/link'
import { obtenerPartidoParaResultado, guardarResultado } from '@/actions/resultados'
import { ResultadoForm } from '@/components/fixture/ResultadoForm'

function str(n: number | null): string {
  return n === null || n === undefined ? '' : String(n)
}

export default async function ResultadoPartidoPage({
  params,
}: {
  params: Promise<{ partidoId: string }>
}) {
  const { partidoId } = await params

  let partido: Awaited<ReturnType<typeof obtenerPartidoParaResultado>>
  try {
    partido = await obtenerPartidoParaResultado(partidoId)
  } catch (err) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-muted">
        {err instanceof Error ? err.message : 'No se pudo cargar el partido.'}
      </div>
    )
  }

  if (partido.es_historico || !partido.ya_jugado) {
    return (
      <div className="flex flex-col gap-4">
        <Link href={`/fixture/${partidoId}`} className="text-sm text-primary hover:underline">
          ← Volver al partido
        </Link>
        <div className="rounded-lg border border-border bg-surface p-6 text-sm text-muted">
          {partido.es_historico
            ? 'Este partido es histórico; su resultado se administra por el script de importación.'
            : 'Este partido todavía no se jugó. Volvé cuando la fecha haya pasado.'}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/fixture/${partidoId}`} className="text-sm text-primary hover:underline">
        ← Volver al partido
      </Link>
      <div>
        <h1 className="text-lg font-semibold">
          Resultado: {partido.club_local} vs {partido.club_visita}
        </h1>
        <p className="text-sm text-muted">
          {partido.fecha} {partido.hora ?? ''} · {partido.categoria}
        </p>
      </div>
      <ResultadoForm
        partidoId={partido.id}
        clubLocal={partido.club_local}
        clubVisita={partido.club_visita}
        inicial={{
          resultado_local: str(partido.resultado_local),
          resultado_visita: str(partido.resultado_visita),
          tarjetas_amarillas_local: str(partido.tarjetas_amarillas_local),
          tarjetas_amarillas_visita: str(partido.tarjetas_amarillas_visita),
          tarjetas_rojas_local: str(partido.tarjetas_rojas_local),
          tarjetas_rojas_visita: str(partido.tarjetas_rojas_visita),
          incidentes: partido.incidentes ?? '',
        }}
        guardarResultado={guardarResultado}
      />
    </div>
  )
}
```

- [ ] **Step 3: Modificar `app/(app)/fixture/[partidoId]/page.tsx`**

Agregar, en la caja de cabecera del partido (después del `<p>` con fecha/categoría/complejidad), un link condicional a la carga de resultado. Como la page de detalle ya llama `recomendarReferees` (que trae `partido.fecha`), comparar contra hoy:

```tsx
      {p.fecha <= new Date().toISOString().slice(0, 10) && (
        <Link
          href={`/fixture/${partidoId}/resultado`}
          className="mt-2 inline-block text-sm text-primary hover:underline"
        >
          Cargar / editar resultado del partido
        </Link>
      )}
```

(`Link` ya está importado en ese archivo.)

- [ ] **Step 4: Verificar manualmente**

Precondición: `npx supabase db reset`, `npm run dev`, logueado como `designador@rugby.local`.

1. Importar un partido con **fecha pasada** (ej. `2026-09-01`, `ALU` vs `LRC`) desde `/fixture`. (El importador de fixture no restringe fechas pasadas.)
2. Ir a `/fixture/<id>` → aparece el link "Cargar / editar resultado del partido". Clickearlo.
3. En el form: cargar `resultado_local=25`, `resultado_visita=18`, `amarillas_local=2`, dejar el resto vacío, incidentes "Prueba". Guardar.
   Expected: mensaje "Resultado guardado.". En la DB: `select resultado_local, resultado_visita, tarjetas_amarillas_local, tarjetas_amarillas_visita, incidentes from partido where id=<id>;` → `25, 18, 2, 0, Prueba`.
4. Volver a entrar a `/fixture/<id>/resultado`: el form aparece **precargado** con `25 / 18 / 2 / 0 / 0 / 0 / Prueba` (idempotencia).
5. Probar guarda de estado: crear un partido con fecha futura, entrar a `/fixture/<id-futuro>/resultado` → muestra "Este partido todavía no se jugó.".
6. Probar validación: en el partido pasado, borrar el score local y guardar → error "El resultado local es requerido.".
7. Limpiar: `docker exec supabase_db_rugby psql -U postgres -d postgres -c "delete from partido where es_historico = false;"`

- [ ] **Step 5: Commit**

```bash
git add components/fixture/ResultadoForm.tsx "app/(app)/fixture/[partidoId]/resultado/page.tsx" "app/(app)/fixture/[partidoId]/page.tsx"
git commit -m "feat(fixture): add played-match result entry screen"
```

---

### Task 5: Función pura de matching para el batch (TDD)

**Files:**
- Create: `lib/fixture/matchResultados.ts`
- Test: `tests/unit/cargarResultadosMatch.test.ts`

**Interfaces:**
- Consumes: `FilaHistorico` de `lib/fixture/parseHistoricoCsv.ts` (Fase 5).
- Produces:
  ```ts
  import type { FilaHistorico } from './parseHistoricoCsv'
  export type PartidoExistente = {
    id: string; fecha: string; club_local_codigo: string; club_visita_codigo: string; es_historico: boolean
  }
  export type MatchResultado =
    | { fila: number; match: { partidoId: string; update: Record<string, number | string | null> } }
    | { fila: number; error: string }
  export function matchResultados(input: {
    filas: FilaHistorico[]
    partidos: PartidoExistente[]
  }): MatchResultado[]
  ```
  Consumido por Task 6 (`scripts/cargar-resultados/run.ts`).

- [ ] **Step 1: Escribir el test que falla — `tests/unit/cargarResultadosMatch.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { matchResultados } from '@/lib/fixture/matchResultados'
import type { FilaHistorico } from '@/lib/fixture/parseHistoricoCsv'

function fila(over: Partial<FilaHistorico> = {}): FilaHistorico {
  return {
    fecha: '2026-09-01',
    hora: '15:00',
    categoria: 'Regional',
    club_local_codigo: 'ALU',
    club_visita_codigo: 'LRC',
    resultado_local: 25,
    resultado_visita: 18,
    tarjetas_amarillas_local: 2,
    tarjetas_amarillas_visita: 1,
    tarjetas_rojas_local: 0,
    tarjetas_rojas_visita: 0,
    incidentes: 'Roce',
    ...over,
  }
}

const PARTIDOS = [
  { id: 'p1', fecha: '2026-09-01', club_local_codigo: 'ALU', club_visita_codigo: 'LRC', es_historico: false },
  { id: 'p2', fecha: '2026-09-08', club_local_codigo: 'BLU', club_visita_codigo: 'NAV', es_historico: false },
  { id: 'ph', fecha: '2025-04-05', club_local_codigo: 'ALU', club_visita_codigo: 'LRC', es_historico: true },
]

describe('matchResultados', () => {
  it('matchea por (fecha, club_local, club_visita) y arma el update', () => {
    const r = matchResultados({ filas: [fila()], partidos: PARTIDOS })
    expect(r).toEqual([
      {
        fila: 2,
        match: {
          partidoId: 'p1',
          update: {
            resultado_local: 25,
            resultado_visita: 18,
            tarjetas_amarillas_local: 2,
            tarjetas_amarillas_visita: 1,
            tarjetas_rojas_local: 0,
            tarjetas_rojas_visita: 0,
            incidentes: 'Roce',
          },
        },
      },
    ])
  })

  it('reporta error si no hay partido del fixture que matchee', () => {
    const r = matchResultados({ filas: [fila({ fecha: '2026-12-25' })], partidos: PARTIDOS })
    expect(r).toEqual([{ fila: 2, error: 'No hay partido del fixture para 2026-12-25 ALU vs LRC.' }])
  })

  it('no matchea contra un partido histórico', () => {
    const r = matchResultados({ filas: [fila({ fecha: '2025-04-05' })], partidos: PARTIDOS })
    expect(r).toEqual([{ fila: 2, error: 'No hay partido del fixture para 2025-04-05 ALU vs LRC.' }])
  })

  it('numera las filas empezando en 2 (fila 1 = encabezado del CSV)', () => {
    const r = matchResultados({
      filas: [fila(), fila({ fecha: '2026-09-08', club_local_codigo: 'BLU', club_visita_codigo: 'NAV' })],
      partidos: PARTIDOS,
    })
    expect(r.map((x) => x.fila)).toEqual([2, 3])
    expect('match' in r[1] && r[1].match.partidoId).toBe('p2')
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run tests/unit/cargarResultadosMatch.test.ts`
Expected: FAIL — `Cannot find module '@/lib/fixture/matchResultados'`.

- [ ] **Step 3: Implementar `lib/fixture/matchResultados.ts`**

```ts
import type { FilaHistorico } from './parseHistoricoCsv'

export type PartidoExistente = {
  id: string
  fecha: string
  club_local_codigo: string
  club_visita_codigo: string
  es_historico: boolean
}

export type MatchResultado =
  | { fila: number; match: { partidoId: string; update: Record<string, number | string | null> } }
  | { fila: number; error: string }

export function matchResultados(input: {
  filas: FilaHistorico[]
  partidos: PartidoExistente[]
}): MatchResultado[] {
  const indice = new Map<string, PartidoExistente>()
  for (const p of input.partidos) {
    if (p.es_historico) continue
    indice.set(`${p.fecha}|${p.club_local_codigo}|${p.club_visita_codigo}`, p)
  }

  return input.filas.map((f, i) => {
    const numeroFila = i + 2
    const clave = `${f.fecha}|${f.club_local_codigo}|${f.club_visita_codigo}`
    const partido = indice.get(clave)
    if (!partido) {
      return {
        fila: numeroFila,
        error: `No hay partido del fixture para ${f.fecha} ${f.club_local_codigo} vs ${f.club_visita_codigo}.`,
      }
    }
    return {
      fila: numeroFila,
      match: {
        partidoId: partido.id,
        update: {
          resultado_local: f.resultado_local,
          resultado_visita: f.resultado_visita,
          tarjetas_amarillas_local: f.tarjetas_amarillas_local,
          tarjetas_amarillas_visita: f.tarjetas_amarillas_visita,
          tarjetas_rojas_local: f.tarjetas_rojas_local,
          tarjetas_rojas_visita: f.tarjetas_rojas_visita,
          incidentes: f.incidentes,
        },
      },
    }
  })
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run tests/unit/cargarResultadosMatch.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/fixture/matchResultados.ts tests/unit/cargarResultadosMatch.test.ts
git commit -m "feat(fixture): add pure matchResultados batch matcher"
```

---

### Task 6: Script batch `scripts/cargar-resultados/run.ts`

**Files:**
- Create: `scripts/cargar-resultados/run.ts`

**Interfaces:**
- Consumes: `parseHistoricoCsv` (Fase 5), `matchResultados` (Task 5), service-role, `dotenv`.
- Produces: comando `npx tsx scripts/cargar-resultados/run.ts <ruta-al-csv> <liga_id>`.

- [ ] **Step 1: Crear `scripts/cargar-resultados/run.ts`**

```ts
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { parseHistoricoCsv } from '../../lib/fixture/parseHistoricoCsv'
import { matchResultados, type PartidoExistente } from '../../lib/fixture/matchResultados'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function main() {
  const [, , rutaCsv, ligaId] = process.argv
  if (!rutaCsv || !ligaId) {
    console.error('Uso: npx tsx scripts/cargar-resultados/run.ts <ruta-al-csv> <liga_id>')
    process.exit(1)
  }

  const csvText = readFileSync(rutaCsv, 'utf-8')
  const { filas, errores } = parseHistoricoCsv(csvText)
  if (errores.length > 0) {
    console.error('Errores en el archivo:')
    errores.forEach((e) => console.error(`  Fila ${e.fila}: ${e.mensaje}`))
    process.exit(1)
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: clubes, error: clubesError } = await db.from('club').select('id, codigo')
  if (clubesError) throw new Error(clubesError.message)
  const codigoPorId = new Map((clubes ?? []).map((c) => [c.id, c.codigo]))

  const { data: partidos, error: partidosError } = await db
    .from('partido')
    .select('id, fecha, club_local_id, club_visita_id, es_historico')
    .eq('liga_id', ligaId)
  if (partidosError) throw new Error(partidosError.message)

  const partidosExistentes: PartidoExistente[] = (partidos ?? []).map((p) => ({
    id: p.id,
    fecha: p.fecha,
    club_local_codigo: codigoPorId.get(p.club_local_id) ?? '',
    club_visita_codigo: codigoPorId.get(p.club_visita_id) ?? '',
    es_historico: p.es_historico,
  }))

  const resultados = matchResultados({ filas, partidos: partidosExistentes })
  const erroresMatch = resultados.filter((r): r is { fila: number; error: string } => 'error' in r)
  if (erroresMatch.length > 0) {
    console.error('Errores de matching (no se actualizó nada):')
    erroresMatch.forEach((e) => console.error(`  Fila ${e.fila}: ${e.error}`))
    process.exit(1)
  }

  let actualizados = 0
  for (const r of resultados) {
    if (!('match' in r)) continue
    const { error } = await db.from('partido').update(r.match.update).eq('id', r.match.partidoId)
    if (error) {
      console.error(`  Fila ${r.fila}: error al actualizar ${r.match.partidoId}: ${error.message}`)
      process.exit(1)
    }
    actualizados++
  }

  console.log(`Se actualizaron ${actualizados} partidos con su resultado.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Verificar manualmente**

Precondición: `npx supabase db reset`, `npm run dev` (o solo Supabase), logueado como `designador@rugby.local` para importar el fixture.

1. Importar 2 partidos de fecha pasada desde `/fixture` (ej. `2026-09-01 ALU vs LRC`, `2026-09-08 BLU vs NAV`).
2. Crear un CSV temporal (fuera del repo, en el scratchpad):
   ```csv
   fecha,hora,categoria,club_local,club_visita,resultado_local,resultado_visita,tarjetas_amarillas_local,tarjetas_amarillas_visita,tarjetas_rojas_local,tarjetas_rojas_visita,incidentes
   2026-09-01,15:00,Regional,ALU,LRC,25,18,2,1,0,0,Roce entre capitanes
   2026-09-08,15:00,Regional,BLU,NAV,10,32,0,0,0,1,
   ```
3. Run: `npx tsx scripts/cargar-resultados/run.ts <ruta-al-csv> 33333333-3333-3333-3333-333333333333`
   Expected: `Se actualizaron 2 partidos con su resultado.`
   Run: `docker exec supabase_db_rugby psql -U postgres -d postgres -c "select fecha, resultado_local, resultado_visita, tarjetas_rojas_visita from partido where es_historico = false order by fecha;"`
   Expected: `2026-09-01 → 25, 18, 0` y `2026-09-08 → 10, 32, 1`.
4. Probar el error de matching: agregar una fila con `2026-12-25,...,ALU,LRC,...` al CSV y re-correr → sale `Fila N: No hay partido del fixture para 2026-12-25 ALU vs LRC.` y **no** actualiza nada (exit 1). Verificar con la query anterior que los valores no cambiaron por la corrida fallida (el script sale antes de actualizar).
5. Limpiar: `docker exec supabase_db_rugby psql -U postgres -d postgres -c "delete from partido where es_historico = false;"` y borrar el CSV temporal.

- [ ] **Step 3: Commit**

```bash
git add scripts/cargar-resultados/run.ts
git commit -m "feat(fixture): add batch cargar-resultados script"
```

---

### Task 7: Extender el script de RLS con `partido_update_resultado`

**Files:**
- Modify: `scripts/rls-test/run-rls-tests.ts`

**Interfaces:**
- Consumes: helpers + usuarios de prueba (`designador` de Lima, `admin_regional` de la región de prueba o `designador` de otra región). UUID de la Liga Metropolitana y de un club de Lima.
- Produces: casos nuevos en `npm run test:rls`.

- [ ] **Step 1: Agregar casos al final de `main()` en `scripts/rls-test/run-rls-tests.ts`**

```ts
  // ---- partido_update_resultado ----
  const { data: partidoParaResultado } = await admin
    .from('partido')
    .insert({
      liga_id: '33333333-3333-3333-3333-333333333333',
      temporada_id: '44444444-4444-4444-4444-444444444444',
      fecha: '2026-09-01',
      hora: '15:00',
      categoria: 'Regional',
      club_local_id: (await admin.from('club').select('id').eq('codigo', 'ALU').single()).data!.id,
      club_visita_id: (await admin.from('club').select('id').eq('codigo', 'LRC').single()).data!.id,
      categoria_minima_referee: 'Regional',
      es_historico: false,
    })
    .select('id')
    .single()

  console.log('Caso: designador de Lima puede ACTUALIZAR el resultado de un partido de su liga')
  const { error: updResultadoOkError } = await clienteDesignadorLima
    .from('partido')
    .update({ resultado_local: 25, resultado_visita: 18 })
    .eq('id', partidoParaResultado!.id)
  assert(
    updResultadoOkError === null,
    `designador de Lima actualiza el resultado de un partido de su liga${updResultadoOkError ? `: ${updResultadoOkError.message}` : ''}`
  )

  console.log('Caso: designador de la región de prueba NO puede actualizar el resultado de un partido de Lima')
  // clienteDesignadorRegionTest existe si el script ya crea un designador de la región de prueba;
  // si no, crear uno con el patrón habitual (rol 'designador', region_id = regionTest.id).
  const { error: updResultadoBloqueadoError } = await clienteDesignadorRegionTest
    .from('partido')
    .update({ resultado_local: 99 })
    .eq('id', partidoParaResultado!.id)
  const { data: verif } = await admin
    .from('partido')
    .select('resultado_local')
    .eq('id', partidoParaResultado!.id)
    .single()
  assert(
    updResultadoBloqueadoError !== null || verif?.resultado_local === 25,
    'designador de otra región no puede actualizar el resultado (RLS lo bloquea o el update no afecta filas)'
  )

  await admin.from('partido').delete().eq('id', partidoParaResultado!.id)
```

**Nota:** si el script todavía no tiene un `clienteDesignadorRegionTest`, agregarlo junto a los otros `crearUsuarioDePrueba` del principio (`rol: 'designador'`, `region_id: regionTest.id`) y su `iniciarSesionComo` + `limpiarUsuarioDePrueba`.

- [ ] **Step 2: Correr y verificar**

Run: `npx supabase db reset && npm run test:rls`
Expected: `TODOS LOS CASOS PASARON`, código de salida 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/rls-test/run-rls-tests.ts
git commit -m "test: extend RLS script with partido_update_resultado cases"
```

---

## Self-review (cobertura vs. addendum §C)

| Requisito addendum §C | Task |
|---|---|
| Pantalla `/fixture/[partidoId]/resultado` para designador + admin | Task 4 + Task 3 (`exigirDesignador`) |
| Visible/editable solo para `fecha <= hoy` y `es_historico = false` | Task 3 (`obtenerPartidoParaResultado.ya_jugado`, guardas en `guardarResultado`) + Task 4 (page redirige el caso inválido) |
| Campos: score (requerido) + tarjetas (default 0) + incidentes (opcional) | Task 2 (`validarResultado`) + Task 4 (`ResultadoForm`) |
| No recalcula la complejidad del propio partido | Task 3 (`guardarResultado` solo hace UPDATE de esos campos) |
| Idempotente (se puede corregir) | Task 4 (form precargado con `inicial`) + Task 3 (UPDATE, no INSERT) |
| Script batch, mismo formato de ficha (reusa `parseHistoricoCsv`) | Task 5 + Task 6 |
| Batch matchea por `(fecha, club_local, club_visita)`; sin match → error, no crea nada | Task 5 (`matchResultados`) + Task 6 (sale con exit 1 antes de actualizar) |
| Policy `partido_update_resultado` (designador/admin del scope); el batch usa service-role | Task 1 + Task 7 (casos RLS) |

## Al terminar

Con esto el resultado de un partido jugado entra al sistema por pantalla o por lote, y queda disponible como historial directo para la complejidad de futuros enfrentamientos. El siguiente checkpoint es la **Fase 9** (evaluaciones: carga por el evaluador asociada a `partido_id`, vista "partidos jugados pendientes de evaluar", `evaluacion_bloqueante` configurable) — no se empieza hasta que este plan esté revisado y mergeado a `feature/plataforma-fundacion`.
