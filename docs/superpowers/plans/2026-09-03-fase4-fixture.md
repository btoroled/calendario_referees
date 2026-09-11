# Fase 4 — Importación de Fixture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que un designador (o admin regional/nacional) importe el fixture semanal de una liga/temporada desde un CSV, sin calcular todavía la complejidad del partido (eso es Fase 5).

**Architecture:** Tabla única `partido` (futuros e históricos, per spec §5) con RLS region-scoped siguiendo el mismo patrón ya usado en `club`/`referee`/`liga`. Un parser/validador CSV **puro** (sin DB) para poder testearlo con TDD, envuelto por una server action que resuelve códigos de club → IDs y calcula `categoria_minima_referee` vía una tabla de mapeo (`categoria_minima_mapa`, cuya UI de edición es Fase 6 — acá solo se lee, con fallback). El import es todo-o-nada: si cualquier fila falla la validación, no se inserta nada.

**Tech Stack:** Next.js App Router (server actions), Supabase Postgres + RLS, `csv-parse` (nuevo, para parseo robusto de CSV con comillas/comas), Vitest (unit), script de RLS existente.

**Spec:** `docs/superpowers/specs/2026-08-31-plataforma-designacion-referees-design.md` (secciones 5, 7 (nota: complejidad NO se calcula en esta fase), 10, 13, 14).

## Global Constraints

- **Solo CSV, no Excel** (decisión de esta fase, no del spec): evita agregar una dependencia de parseo binario de `.xlsx`; cualquier hoja de Excel se exporta a CSV en un clic. Si más adelante se pide soporte nativo de Excel, es un cambio aislado al parser.
- RLS activa y forzada en toda tabla nueva, igual que el resto del schema.
- `designador` está scopeado por **región** (`perfil.region_id`), no por `liga_id` — mismo patrón ya usado para `club`/`referee`/`liga` en fases anteriores (aunque `perfil.liga_id` existe como columna, ninguna policy lo usa todavía; no se introduce un modelo de scoping nuevo en esta fase).
- `partido.complejidad` queda `null` — se calcula en la Fase 5, no acá.
- `categoria_minima_mapa` se crea con RLS forzada y **solo policy de SELECT** (necesaria para que el import pueda leerla) — el insert/update de esa tabla es la pantalla de "Configuración de scoring por liga" de la Fase 6, todavía no existe.
- Import todo-o-nada: si el CSV tiene cualquier fila inválida (formato o club inexistente), no se inserta ningún partido — se devuelve la lista completa de errores.
- Server actions autorizan por rol explícitamente antes de tocar la DB (defensa en profundidad además de RLS), igual que el resto de la app.
- Reusar los tokens de color de `app/globals.css` (`bg-surface`, `border-border`, `text-muted`, `bg-primary`, `text-danger`, etc.), texto en español.

---

### Task 1: Migración — `partido` + `categoria_minima_mapa` (schema + RLS)

**Files:**
- Create: `supabase/migrations/0014_partido.sql`

**Interfaces:**
- Consumes: `liga`, `temporada`, `club` (ya existen).
- Produces: tabla `categoria_minima_mapa(id, liga_id, categoria, categoria_minima_referee)`; tabla `partido(id, liga_id, temporada_id, fecha, hora, cancha, categoria, club_local_id, club_visita_id, jornada, resultado_local, resultado_visita, tarjetas_amarillas_local, tarjetas_amarillas_visita, tarjetas_rojas_local, tarjetas_rojas_visita, incidentes, complejidad, categoria_minima_referee, es_historico, created_at)`. Policies `partido_select`/`partido_insert` y `categoria_minima_mapa_select`, todas region-scoped vía `liga.region_id`.

- [ ] **Step 1: Crear `supabase/migrations/0014_partido.sql`**

```sql
create table categoria_minima_mapa (
  id uuid primary key default gen_random_uuid(),
  liga_id uuid not null references liga(id) on delete cascade,
  categoria text not null,
  categoria_minima_referee text not null,
  created_at timestamptz not null default now(),
  unique (liga_id, categoria)
);

alter table categoria_minima_mapa enable row level security;
alter table categoria_minima_mapa force row level security;

create policy categoria_minima_mapa_select on categoria_minima_mapa for select
using (
  fn_rol() = 'admin_nacional' and liga_id in (select id from liga where region_id in (select id from region where pais_id = fn_pais_id()))
  or liga_id in (select id from liga where region_id = fn_region_id())
);

create table partido (
  id uuid primary key default gen_random_uuid(),
  liga_id uuid not null references liga(id) on delete restrict,
  temporada_id uuid not null references temporada(id) on delete restrict,
  fecha date not null,
  hora time not null,
  cancha text,
  categoria text not null,
  club_local_id uuid not null references club(id) on delete restrict,
  club_visita_id uuid not null references club(id) on delete restrict,
  jornada int,
  resultado_local int,
  resultado_visita int,
  tarjetas_amarillas_local int,
  tarjetas_amarillas_visita int,
  tarjetas_rojas_local int,
  tarjetas_rojas_visita int,
  incidentes text,
  complejidad smallint,
  categoria_minima_referee text not null,
  es_historico boolean not null default false,
  created_at timestamptz not null default now(),
  constraint partido_equipos_distintos check (club_local_id <> club_visita_id),
  constraint partido_complejidad_rango check (complejidad is null or (complejidad between 1 and 10))
);

create index partido_liga_temporada_idx on partido (liga_id, temporada_id);
create index partido_fecha_idx on partido (fecha);

alter table partido enable row level security;
alter table partido force row level security;

create policy partido_select on partido for select
using (
  fn_rol() = 'admin_nacional' and liga_id in (select id from liga where region_id in (select id from region where pais_id = fn_pais_id()))
  or liga_id in (select id from liga where region_id = fn_region_id())
);

create policy partido_insert on partido for insert
with check (
  fn_rol() = 'admin_nacional' and liga_id in (select id from liga where region_id in (select id from region where pais_id = fn_pais_id()))
  or fn_rol() in ('admin_regional', 'designador') and liga_id in (select id from liga where region_id = fn_region_id())
);
```

- [ ] **Step 2: Aplicar y verificar**

Run: `npx supabase db reset`
Expected: aplica sin error.

Run: `docker exec supabase_db_rugby psql -U postgres -d postgres -c "\d partido" && docker exec supabase_db_rugby psql -U postgres -d postgres -c "\d categoria_minima_mapa"`
Expected: `partido` muestra las 20 columnas, los 2 check constraints y las 2 policies; `categoria_minima_mapa` muestra sus 4 columnas y 1 policy.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0014_partido.sql
git commit -m "feat(db): add partido and categoria_minima_mapa tables with region-scoped RLS"
```

---

### Task 2: Parser/validador de fixture CSV (TDD, función pura)

**Files:**
- Create: `lib/fixture/parseFixtureCsv.ts`
- Test: `tests/unit/parseFixtureCsv.test.ts`
- Modify: `package.json` (agregar dependencia `csv-parse`)

**Interfaces:**
- Produces: `export type FilaFixture = { fecha: string; hora: string; cancha: string; categoria: string; club_local_codigo: string; club_visita_codigo: string; jornada: number | null }`, `export type ErrorFila = { fila: number; mensaje: string }`, `export function parseFixtureCsv(csvText: string): { filas: FilaFixture[]; errores: ErrorFila[] }`. Consumido por la Task 3 (`importarFixture`), que resuelve `club_local_codigo`/`club_visita_codigo` contra la tabla `club` (esta función no toca la DB).

- [ ] **Step 1: Instalar la dependencia**

Run: `npm install csv-parse`
Expected: agrega `"csv-parse": "^5..."` a `dependencies` en `package.json` y actualiza `package-lock.json`.

- [ ] **Step 2: Escribir el test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { parseFixtureCsv } from '@/lib/fixture/parseFixtureCsv'

const ENCABEZADO = 'fecha,hora,cancha,categoria,club_local,club_visita,jornada'

describe('parseFixtureCsv', () => {
  it('parsea una fila válida', () => {
    const csv = `${ENCABEZADO}\n2026-10-10,15:00,Cancha 1,Primera,ALU,LRC,5`
    const resultado = parseFixtureCsv(csv)
    expect(resultado.errores).toEqual([])
    expect(resultado.filas).toEqual([
      { fecha: '2026-10-10', hora: '15:00', cancha: 'Cancha 1', categoria: 'Primera', club_local_codigo: 'ALU', club_visita_codigo: 'LRC', jornada: 5 },
    ])
  })

  it('parsea varias filas válidas', () => {
    const csv = `${ENCABEZADO}\n2026-10-10,15:00,Cancha 1,Primera,ALU,LRC,5\n2026-10-11,12:30,Cancha 2,Intermedia,FLL,UNI,5`
    const resultado = parseFixtureCsv(csv)
    expect(resultado.errores).toEqual([])
    expect(resultado.filas).toHaveLength(2)
  })

  it('tolera variaciones de encabezado (mayúsculas, tildes, espacios)', () => {
    const csv = 'Fecha,Hora,Cancha,Categoría,Club Local,Club Visita,Jornada\n2026-10-10,15:00,Cancha 1,Primera,ALU,LRC,5'
    const resultado = parseFixtureCsv(csv)
    expect(resultado.errores).toEqual([])
    expect(resultado.filas[0].club_local_codigo).toBe('ALU')
  })

  it('rechaza cuando falta una columna requerida', () => {
    const csv = 'fecha,hora,categoria,club_local,club_visita\n2026-10-10,15:00,Primera,ALU,LRC'
    const resultado = parseFixtureCsv(csv)
    expect(resultado.filas).toEqual([])
    expect(resultado.errores).toEqual([{ fila: 0, mensaje: 'Faltan columnas requeridas: cancha' }])
  })

  it('rechaza fecha con formato inválido', () => {
    const csv = `${ENCABEZADO}\n10/10/2026,15:00,Cancha 1,Primera,ALU,LRC,5`
    const resultado = parseFixtureCsv(csv)
    expect(resultado.filas).toEqual([])
    expect(resultado.errores).toEqual([{ fila: 2, mensaje: 'Fecha inválida: "10/10/2026" (formato esperado AAAA-MM-DD)' }])
  })

  it('rechaza hora con formato inválido', () => {
    const csv = `${ENCABEZADO}\n2026-10-10,3pm,Cancha 1,Primera,ALU,LRC,5`
    const resultado = parseFixtureCsv(csv)
    expect(resultado.errores).toEqual([{ fila: 2, mensaje: 'Hora inválida: "3pm" (formato esperado HH:MM)' }])
  })

  it('rechaza cuando club local y visita son el mismo código', () => {
    const csv = `${ENCABEZADO}\n2026-10-10,15:00,Cancha 1,Primera,ALU,ALU,5`
    const resultado = parseFixtureCsv(csv)
    expect(resultado.errores).toEqual([{ fila: 2, mensaje: 'El club local y visita no pueden ser el mismo ("ALU")' }])
  })

  it('rechaza jornada no numérica', () => {
    const csv = `${ENCABEZADO}\n2026-10-10,15:00,Cancha 1,Primera,ALU,LRC,cinco`
    const resultado = parseFixtureCsv(csv)
    expect(resultado.errores).toEqual([{ fila: 2, mensaje: 'Jornada inválida: "cinco"' }])
  })

  it('permite jornada vacía (null)', () => {
    const csv = `${ENCABEZADO}\n2026-10-10,15:00,Cancha 1,Primera,ALU,LRC,`
    const resultado = parseFixtureCsv(csv)
    expect(resultado.errores).toEqual([])
    expect(resultado.filas[0].jornada).toBeNull()
  })

  it('acumula errores de varias filas sin abortar en la primera', () => {
    const csv = `${ENCABEZADO}\n10/10/2026,15:00,Cancha 1,Primera,ALU,LRC,5\n2026-10-11,3pm,Cancha 2,Intermedia,FLL,UNI,5`
    const resultado = parseFixtureCsv(csv)
    expect(resultado.errores).toHaveLength(2)
    expect(resultado.errores[0].fila).toBe(2)
    expect(resultado.errores[1].fila).toBe(3)
  })
})
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `npx vitest run tests/unit/parseFixtureCsv.test.ts`
Expected: FAIL — `Cannot find module '@/lib/fixture/parseFixtureCsv'`.

- [ ] **Step 4: Implementar `lib/fixture/parseFixtureCsv.ts`**

```ts
import { parse } from 'csv-parse/sync'

export type FilaFixture = {
  fecha: string
  hora: string
  cancha: string
  categoria: string
  club_local_codigo: string
  club_visita_codigo: string
  jornada: number | null
}

export type ErrorFila = { fila: number; mensaje: string }

export type ResultadoParseoFixture = {
  filas: FilaFixture[]
  errores: ErrorFila[]
}

const ALIAS_ENCABEZADOS: Record<string, string> = {
  fecha: 'fecha',
  hora: 'hora',
  cancha: 'cancha',
  sede: 'cancha',
  estadio: 'cancha',
  categoria: 'categoria',
  club_local: 'club_local',
  clublocal: 'club_local',
  local: 'club_local',
  club_visita: 'club_visita',
  clubvisita: 'club_visita',
  visita: 'club_visita',
  visitante: 'club_visita',
  jornada: 'jornada',
}

const CAMPOS_REQUERIDOS = ['fecha', 'hora', 'cancha', 'categoria', 'club_local', 'club_visita']

function normalizarEncabezado(encabezado: string): string {
  return encabezado
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
}

export function parseFixtureCsv(csvText: string): ResultadoParseoFixture {
  let filasCrudas: Record<string, string>[]
  try {
    filasCrudas = parse(csvText, {
      columns: (encabezados: string[]) =>
        encabezados.map((e) => {
          const normalizado = normalizarEncabezado(e)
          return ALIAS_ENCABEZADOS[normalizado] ?? normalizado
        }),
      skip_empty_lines: true,
      trim: true,
    })
  } catch (err) {
    return {
      filas: [],
      errores: [{ fila: 0, mensaje: 'No se pudo leer el archivo CSV: ' + (err instanceof Error ? err.message : 'formato inválido') }],
    }
  }

  const columnasEncontradas = filasCrudas.length > 0 ? Object.keys(filasCrudas[0]) : []
  const columnasFaltantes = CAMPOS_REQUERIDOS.filter((c) => !columnasEncontradas.includes(c))
  if (columnasFaltantes.length > 0) {
    return { filas: [], errores: [{ fila: 0, mensaje: `Faltan columnas requeridas: ${columnasFaltantes.join(', ')}` }] }
  }

  const filas: FilaFixture[] = []
  const errores: ErrorFila[] = []

  filasCrudas.forEach((fila, index) => {
    const numeroFila = index + 2
    const fecha = fila.fecha?.trim()
    const hora = fila.hora?.trim()
    const categoria = fila.categoria?.trim()
    const clubLocal = fila.club_local?.trim()
    const clubVisita = fila.club_visita?.trim()
    const jornadaTexto = fila.jornada?.trim()

    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      errores.push({ fila: numeroFila, mensaje: `Fecha inválida: "${fila.fecha ?? ''}" (formato esperado AAAA-MM-DD)` })
      return
    }
    if (!hora || !/^\d{2}:\d{2}$/.test(hora)) {
      errores.push({ fila: numeroFila, mensaje: `Hora inválida: "${fila.hora ?? ''}" (formato esperado HH:MM)` })
      return
    }
    if (!categoria) {
      errores.push({ fila: numeroFila, mensaje: 'Categoría vacía' })
      return
    }
    if (!clubLocal) {
      errores.push({ fila: numeroFila, mensaje: 'Club local vacío' })
      return
    }
    if (!clubVisita) {
      errores.push({ fila: numeroFila, mensaje: 'Club visita vacío' })
      return
    }
    if (clubLocal === clubVisita) {
      errores.push({ fila: numeroFila, mensaje: `El club local y visita no pueden ser el mismo ("${clubLocal}")` })
      return
    }

    let jornada: number | null = null
    if (jornadaTexto) {
      const jornadaNum = Number(jornadaTexto)
      if (!Number.isInteger(jornadaNum) || jornadaNum < 1) {
        errores.push({ fila: numeroFila, mensaje: `Jornada inválida: "${jornadaTexto}"` })
        return
      }
      jornada = jornadaNum
    }

    filas.push({
      fecha,
      hora,
      cancha: fila.cancha?.trim() ?? '',
      categoria,
      club_local_codigo: clubLocal,
      club_visita_codigo: clubVisita,
      jornada,
    })
  })

  return { filas, errores }
}
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `npx vitest run tests/unit/parseFixtureCsv.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/fixture/parseFixtureCsv.ts tests/unit/parseFixtureCsv.test.ts
git commit -m "feat(fixture): add pure CSV fixture parser/validator"
```

---

### Task 3: Importar fixture — actions + UI + nav

**Files:**
- Create: `actions/fixture.ts`, `components/fixture/FixtureImportForm.tsx`, `app/(app)/fixture/page.tsx`
- Modify: `actions/catalogos.ts` (agregar `Temporada` type + `listTemporadas()`), `app/(app)/layout.tsx` (agregar entrada de nav para `admin_nacional`, `admin_regional`, `designador`)

**Interfaces:**
- Consumes: `parseFixtureCsv` (Task 2), `getProfile()`/`ROLES` (`lib/auth/*`), `listLigas()` (`actions/catalogos.ts`, ya existe), tablas `partido`/`categoria_minima_mapa` (Task 1).
- Produces: `actions/catalogos.ts` → `export type Temporada = { id: string; nombre: string; liga_id: string; activa: boolean }`, `listTemporadas(): Promise<Temporada[]>`. `actions/fixture.ts` → `export type Partido = { id: string; fecha: string; hora: string; cancha: string | null; categoria: string; jornada: number | null; club_local: { nombre: string } | null; club_visita: { nombre: string } | null }`, `listPartidos(input: { liga_id: string; temporada_id: string }): Promise<Partido[]>`, `importarFixture(input: { liga_id: string; temporada_id: string; csvText: string }): Promise<{ importados: number }>`.

- [ ] **Step 1: Agregar `Temporada` + `listTemporadas()` a `actions/catalogos.ts`**

Agregar al final del archivo:

```ts
export type Temporada = {
  id: string
  nombre: string
  liga_id: string
  activa: boolean
}

export async function listTemporadas(): Promise<Temporada[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('temporada')
    .select('id, nombre, liga_id, activa')
    .order('nombre')
  if (error) throw new Error(error.message)
  return data
}
```

- [ ] **Step 2: Crear `actions/fixture.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { ROLES } from '@/lib/auth/roles'
import { parseFixtureCsv } from '@/lib/fixture/parseFixtureCsv'

export type Partido = {
  id: string
  fecha: string
  hora: string
  cancha: string | null
  categoria: string
  jornada: number | null
  club_local: { nombre: string } | null
  club_visita: { nombre: string } | null
}

export async function listPartidos(input: { liga_id: string; temporada_id: string }): Promise<Partido[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('partido')
    .select('id, fecha, hora, cancha, categoria, jornada, club_local:club_local_id(nombre), club_visita:club_visita_id(nombre)')
    .eq('liga_id', input.liga_id)
    .eq('temporada_id', input.temporada_id)
    .order('fecha')
    .order('hora')
  if (error) throw new Error(error.message)
  return data as unknown as Partido[]
}

export async function importarFixture(input: {
  liga_id: string
  temporada_id: string
  csvText: string
}): Promise<{ importados: number }> {
  const perfil = await getProfile()
  if (
    !perfil ||
    (perfil.rol !== ROLES.ADMIN_NACIONAL && perfil.rol !== ROLES.ADMIN_REGIONAL && perfil.rol !== ROLES.DESIGNADOR)
  ) {
    throw new Error('No autorizado para importar fixture.')
  }

  const { filas, errores: erroresParseo } = parseFixtureCsv(input.csvText)
  if (erroresParseo.length > 0) {
    throw new Error('Errores en el archivo:\n' + erroresParseo.map((e) => `Fila ${e.fila}: ${e.mensaje}`).join('\n'))
  }

  const supabase = await createClient()

  const { data: clubes, error: clubesError } = await supabase.from('club').select('id, codigo')
  if (clubesError) throw new Error(clubesError.message)
  const clubesPorCodigo = new Map((clubes ?? []).map((c) => [c.codigo, c.id]))

  const { data: mapa, error: mapaError } = await supabase
    .from('categoria_minima_mapa')
    .select('categoria, categoria_minima_referee')
    .eq('liga_id', input.liga_id)
  if (mapaError) throw new Error(mapaError.message)
  const minimaPorCategoria = new Map((mapa ?? []).map((m) => [m.categoria, m.categoria_minima_referee]))

  const erroresClubes: string[] = []
  const filasParaInsertar = filas.map((fila, index) => {
    const numeroFila = index + 2
    const clubLocalId = clubesPorCodigo.get(fila.club_local_codigo)
    const clubVisitaId = clubesPorCodigo.get(fila.club_visita_codigo)
    if (!clubLocalId) erroresClubes.push(`Fila ${numeroFila}: club local "${fila.club_local_codigo}" no existe`)
    if (!clubVisitaId) erroresClubes.push(`Fila ${numeroFila}: club visita "${fila.club_visita_codigo}" no existe`)
    return {
      liga_id: input.liga_id,
      temporada_id: input.temporada_id,
      fecha: fila.fecha,
      hora: fila.hora,
      cancha: fila.cancha || null,
      categoria: fila.categoria,
      club_local_id: clubLocalId ?? null,
      club_visita_id: clubVisitaId ?? null,
      jornada: fila.jornada,
      categoria_minima_referee: minimaPorCategoria.get(fila.categoria) ?? fila.categoria,
      es_historico: false,
    }
  })

  if (erroresClubes.length > 0) {
    throw new Error('Errores en el archivo:\n' + erroresClubes.join('\n'))
  }

  const { error: insertError } = await supabase.from('partido').insert(filasParaInsertar)
  if (insertError) throw new Error(insertError.message)

  revalidatePath('/fixture')
  return { importados: filasParaInsertar.length }
}
```

- [ ] **Step 3: Crear `components/fixture/FixtureImportForm.tsx`**

```tsx
'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  ligaId: string
  temporadaId: string
  importarFixture: (input: { liga_id: string; temporada_id: string; csvText: string }) => Promise<{ importados: number }>
}

export function FixtureImportForm({ ligaId, temporadaId, importarFixture }: Props) {
  const router = useRouter()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMensaje(null)
    if (!archivo) {
      setError('Selecciona un archivo CSV.')
      return
    }
    startTransition(async () => {
      try {
        const csvText = await archivo.text()
        const resultado = await importarFixture({ liga_id: ligaId, temporada_id: temporadaId, csvText })
        setMensaje(`Se importaron ${resultado.importados} partidos.`)
        setArchivo(null)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al importar el fixture.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <label className="text-xs text-muted">Archivo CSV del fixture semanal</label>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
        className="text-sm text-foreground"
      />
      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded bg-primary px-3 py-1 text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
      >
        {isPending ? 'Importando...' : 'Importar'}
      </button>
      {mensaje && <p className="text-sm text-foreground">{mensaje}</p>}
      {error && <pre className="whitespace-pre-wrap text-sm text-danger">{error}</pre>}
    </form>
  )
}
```

- [ ] **Step 4: Crear `app/(app)/fixture/page.tsx`**

```tsx
import { listLigas, listTemporadas } from '@/actions/catalogos'
import { listPartidos, importarFixture } from '@/actions/fixture'
import { FixtureImportForm } from '@/components/fixture/FixtureImportForm'

export default async function FixturePage({
  searchParams,
}: {
  searchParams: Promise<{ liga_id?: string; temporada_id?: string }>
}) {
  const params = await searchParams
  const [ligas, temporadas] = await Promise.all([listLigas(), listTemporadas()])

  const ligaId = params.liga_id ?? ligas[0]?.id ?? ''
  const temporadasDeLiga = temporadas.filter((t) => t.liga_id === ligaId)
  const temporadaId = params.temporada_id ?? temporadasDeLiga[0]?.id ?? ''

  const partidos = ligaId && temporadaId ? await listPartidos({ liga_id: ligaId, temporada_id: temporadaId }) : []

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Fixture</h1>

      <form method="get" className="flex items-end gap-2 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-col">
          <label className="text-xs text-muted">Liga</label>
          <select
            name="liga_id"
            defaultValue={ligaId}
            className="rounded border border-border bg-background px-2 py-1 text-foreground"
          >
            {ligas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted">Temporada</label>
          <select
            name="temporada_id"
            defaultValue={temporadaId}
            className="rounded border border-border bg-background px-2 py-1 text-foreground"
          >
            {temporadasDeLiga.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded bg-primary px-3 py-1 text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          Ver
        </button>
      </form>

      {ligaId && temporadaId && (
        <FixtureImportForm ligaId={ligaId} temporadaId={temporadaId} importarFixture={importarFixture} />
      )}

      <table className="w-full rounded-lg border border-border bg-surface text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th className="px-4 py-2">Fecha</th>
            <th className="px-4 py-2">Hora</th>
            <th className="px-4 py-2">Categoría</th>
            <th className="px-4 py-2">Local</th>
            <th className="px-4 py-2">Visita</th>
            <th className="px-4 py-2">Cancha</th>
            <th className="px-4 py-2">Jornada</th>
          </tr>
        </thead>
        <tbody>
          {partidos.map((p) => (
            <tr key={p.id} className="border-t border-border">
              <td className="px-4 py-2">{p.fecha}</td>
              <td className="px-4 py-2">{p.hora}</td>
              <td className="px-4 py-2">{p.categoria}</td>
              <td className="px-4 py-2">{p.club_local?.nombre}</td>
              <td className="px-4 py-2">{p.club_visita?.nombre}</td>
              <td className="px-4 py-2">{p.cancha}</td>
              <td className="px-4 py-2">{p.jornada}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 5: Agregar la entrada de nav en `app/(app)/layout.tsx`**

Reemplazar el objeto `NAV_POR_ROL` completo (agrega `/fixture` a `admin_nacional`, `admin_regional` y `designador`, sin tocar `evaluador`/`referee`):

```ts
const NAV_POR_ROL: Record<Rol, { href: string; label: string }[]> = {
  [ROLES.ADMIN_NACIONAL]: [
    { href: '/admin/catalogos/regiones', label: 'Regiones' },
    { href: '/admin/catalogos/ligas', label: 'Ligas' },
    { href: '/admin/catalogos/clubes', label: 'Clubes' },
    { href: '/admin/catalogos/referees', label: 'Referees' },
    { href: '/fixture', label: 'Fixture' },
  ],
  [ROLES.ADMIN_REGIONAL]: [
    { href: '/admin/catalogos/ligas', label: 'Ligas' },
    { href: '/admin/catalogos/clubes', label: 'Clubes' },
    { href: '/admin/catalogos/referees', label: 'Referees' },
    { href: '/fixture', label: 'Fixture' },
  ],
  [ROLES.DESIGNADOR]: [{ href: '/fixture', label: 'Fixture' }],
  [ROLES.EVALUADOR]: [],
  [ROLES.REFEREE]: [{ href: '/disponibilidad', label: 'Mi disponibilidad' }],
}
```

- [ ] **Step 6: Verificar manualmente**

Run: `npm run dev`, loguearse como `designador@rugby.local` (ver Task 5 para crearlo si no existe todavía), ir a `/fixture`.
Expected: se ve el selector de Liga/Temporada (por defecto "Liga Metropolitana" / "Temporada 2026"), el formulario de importar CSV, y una tabla vacía.

- [ ] **Step 7: Commit**

```bash
git add actions/catalogos.ts actions/fixture.ts components/fixture "app/(app)/fixture/page.tsx" "app/(app)/layout.tsx"
git commit -m "feat(fixture): add fixture import UI (actions, form, page, nav)"
```

---

### Task 4: Extender el script de RLS con casos de partido

**Files:**
- Modify: `scripts/rls-test/run-rls-tests.ts`

**Interfaces:**
- Consumes: `admin`, `assert`, `clienteDesignadorLima`, `clienteAdminRegionalLima`, `clienteAdminNacional`, `clubLima`, `clubTest`, `regionTest`, `LIMA_ID`, `sufijo` (ya definidos en el archivo), tablas `partido`/`liga`/`temporada` (Task 1).

- [ ] **Step 1: Agregar los casos de partido antes del bloque de limpieza**

En `scripts/rls-test/run-rls-tests.ts`, inmediatamente antes de esta línea existente (la primera línea del bloque de limpieza original):

```ts
  await admin.from('referee').delete().eq('region_id', LIMA_ID).eq('nombre', `Ref Lima ${sufijo}`)
```

insertar (nota: si la Fase 3 ya agregó su propio bloque de disponibilidad justo antes de esa misma línea, este bloque va inmediatamente antes de la línea de arriba, después del bloque de disponibilidad — el orden entre bloques de fases distintas no importa, ambos corren antes de la limpieza original):

```ts
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

  console.log('Caso: admin_nacional ve partidos de ambas regiones')
  const { data: partidosAdminNacional } = await clienteAdminNacional.from('partido').select('id').eq('id', partidoTest.id)
  assert((partidosAdminNacional ?? []).length === 1, 'admin_nacional ve el partido de la región de prueba')

  await admin.from('partido').delete().eq('liga_id', ligaTest.id)
  await admin.from('partido').delete().eq('liga_id', '33333333-3333-3333-3333-333333333333').eq('club_local_id', clubLima.id)
  await admin.from('temporada').delete().eq('id', temporadaTest.id)
  await admin.from('liga').delete().eq('id', ligaTest.id)
  await admin.from('club').delete().eq('id', clubTest2.id)

```

(el bloque de limpieza original de `Ref Lima`/`Ref Test` sigue justo después, sin cambios — nota que ahora borra `club_local_id: clubLima.id`/`clubTest.id` referenciados por partido, así que este bloque de limpieza de partido DEBE ejecutarse antes, ya que `partido.club_local_id`/`club_visita_id`/`liga_id`/`temporada_id` son `on delete restrict`).

- [ ] **Step 2: Correr y verificar**

Run: `npm run test:rls`
Expected: `TODOS LOS CASOS PASARON`, incluyendo los 5 casos nuevos de partido.

- [ ] **Step 3: Commit**

```bash
git add scripts/rls-test/run-rls-tests.ts
git commit -m "test: extend RLS script with partido region-scoped isolation cases"
```

---

### Task 5: Verificación manual end-to-end

**Files:**
- Ninguno (paso operativo).

**Interfaces:**
- Consumes: usuario `designador@rugby.local` (crear si no existe — ver Step 1), liga "Liga Metropolitana" / temporada "Temporada 2026" (ya sembradas), clubes reales de Lima (migración `0010`, códigos `ALU`, `LRC`, `FLL`, `UNI`, etc.).

- [ ] **Step 1: Confirmar que existe el usuario de prueba `designador@rugby.local`**

Si no existe (ver el patrón de creación de usuarios de prueba usado en fases anteriores — `auth.admin.createUser` + insert en `perfil` con `rol: 'designador'`, `region_id: '22222222-2222-2222-2222-222222222222'`), crearlo con contraseña `RugbyDev123!`.

- [ ] **Step 2: Preparar un CSV de prueba**

```csv
fecha,hora,cancha,categoria,club_local,club_visita,jornada
2026-10-10,15:00,Cancha Alumni,Primera,ALU,LRC,5
2026-10-11,12:30,Cancha Flaming,Intermedia,FLL,UNI,5
```

- [ ] **Step 3: Importar y verificar en el navegador**

Run: `npm run dev`, loguearse como `designador@rugby.local` / `RugbyDev123!`, ir a `/fixture` (debe aparecer en el nav).

Expected: selector muestra "Liga Metropolitana" / "Temporada 2026" por defecto. Subir el CSV del Step 2 y hacer clic en "Importar".

Expected: mensaje "Se importaron 2 partidos.", y la tabla de abajo muestra ambas filas con los nombres de club resueltos (no los códigos).

- [ ] **Step 4: Verificar tolerancia de encabezados**

Preparar un segundo CSV con encabezados en otro formato:

```csv
Fecha,Hora,Cancha,Categoría,Club Local,Club Visita,Jornada
2026-10-12,10:00,Cancha Blues,Primera,BLU,DRA,6
```

Importar. Expected: se importa igual (1 partido más en la tabla), confirmando que la tolerancia de encabezados funciona con datos reales, no solo en el test unitario.

- [ ] **Step 5: Verificar el error todo-o-nada**

Preparar un tercer CSV con una fila inválida (club inexistente):

```csv
fecha,hora,cancha,categoria,club_local,club_visita,jornada
2026-10-13,15:00,Cancha X,Primera,ZZZ,LRC,7
```

Importar. Expected: mensaje de error mostrando "club local \"ZZZ\" no existe" — y la tabla NO debe mostrar un partido nuevo (nada se insertó).

- [ ] **Step 6: No hay commit en esta task** (verificación manual, sin cambios de código).

---

## Al terminar

Con esto queda completa la Fase 4 del spec (`Importación de fixture`). El siguiente checkpoint es la Fase 5 (Seed histórico + cálculo automático de complejidad), que consume la tabla `partido` creada acá — no se empieza hasta que este plan esté revisado y ejecutado.
