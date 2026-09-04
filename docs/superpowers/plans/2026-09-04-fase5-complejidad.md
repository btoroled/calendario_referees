# Fase 5 — Seed Histórico + Cálculo de Complejidad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el motor de cálculo de complejidad de partido (función pura, testeada con historiales fabricados) y el script de importación histórica de una sola vez, y conectar ambos a la importación de fixture futuro (Fase 4) para que cada partido nuevo importado calcule su complejidad usando el historial disponible. **No incluye cargar la data histórica real todavía** — el usuario la va a proveer más adelante; esta fase deja el script listo para correr contra ese archivo cuando llegue, y usa datos sintéticos solo para verificar que el mecanismo funciona.

**Architecture:** `calcularComplejidad` es una función pura (sin DB) que implementa el algoritmo del spec §7 (paridad 40% + incidentes directos 30% + tendencia disciplinaria 30%, fallback neutro 5 sin historial directo). Un parser CSV puro análogo al de Fase 4 (`parseHistoricoCsv`) valida filas históricas. Un script ejecutable de una sola vez (`scripts/importar-historico/run.ts`, no una pantalla de la app) usa el service-role para insertar partidos históricos, bypaseando RLS intencionalmente — es una herramienta de migración de datos operada por un desarrollador/admin, no un flujo de usuario del comité. `importarFixture` (Fase 4) se extiende para consultar el historial directo + tendencia de cada club y calcular `complejidad` por fila antes de insertar.

**Tech Stack:** TypeScript puro (motor de complejidad + parser), tsx (script ejecutable), Supabase service-role client, Vitest (unit), script de RLS existente (sin casos nuevos — el script histórico usa service-role a propósito, no hay superficie de RLS nueva que probar).

**Spec:** `docs/superpowers/specs/2026-08-31-plataforma-designacion-referees-design.md` (secciones 5, 7, 11 (nota sobre la excepción intencional de bypass de RLS), 13, 14).

## Global Constraints

- **Sin data histórica real todavía**: la Task 5 (verificación) usa datos sintéticos claramente de prueba, insertados y limpiados por un script descartable — no se commitea ninguna data histórica ficticia como si fuera real.
- `complejidad` es 1-10 (constraint ya existente en `partido`, Fase 4). El fallback sin historial directo es exactamente **5** (spec §7, literal). Los pesos son **40% paridad / 30% incidentes directos / 30% tendencia disciplinaria** (spec §7, literal). Las escalas de normalización (diferencia máxima de puntos, incidentes máximos por partido) son una decisión de esta fase, no del spec — documentadas como constantes nombradas en el código, ajustables después sin tocar la forma de la función.
- `calcularComplejidad` vive en `lib/fixture/` (junto a `parseFixtureCsv`), como función TypeScript pura — spec §12: "viven como funciones TypeScript puras (no PL/pgSQL/RPC), para ser testeables con datos mock sin depender de la base de datos".
- El script histórico usa el **service-role** de Supabase (bypasea RLS) — excepción intencional y documentada (spec §11 ya reconoce el patrón para el motor de recomendación; acá aplica el mismo principio: es una herramienta de migración de datos operada fuera del flujo normal de usuarios, no una feature de la app).
- `partido.hora` pasa a ser **nullable** (Task 1) — las fichas históricas no siempre tienen hora exacta registrada; los partidos futuros (Fase 4, `importarFixture`) la siguen exigiendo vía la validación del CSV de fixture, que no cambia.
- Server actions y el script siguen autorizando por rol/contexto explícitamente antes de tocar la DB, igual que el resto de la app.

---

### Task 1: Migración — `partido.hora` nullable

**Files:**
- Create: `supabase/migrations/0015_partido_hora_nullable.sql`

**Interfaces:**
- Consumes: tabla `partido` (Fase 4).
- Produces: `partido.hora` sin `not null`.

- [ ] **Step 1: Crear `supabase/migrations/0015_partido_hora_nullable.sql`**

```sql
alter table partido alter column hora drop not null;
```

- [ ] **Step 2: Aplicar y verificar**

Run: `npx supabase db reset`
Expected: aplica sin error.

Run: `docker exec supabase_db_rugby psql -U postgres -d postgres -c "\d partido" | grep hora`
Expected: la columna `hora` ya no muestra `not null` (columna `Nullable` vacía en vez de mostrar una restricción).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0015_partido_hora_nullable.sql
git commit -m "feat(db): make partido.hora nullable for historical imports without exact kickoff time"
```

---

### Task 2: Motor de complejidad (TDD, función pura)

**Files:**
- Create: `lib/fixture/calcularComplejidad.ts`
- Test: `tests/unit/calcularComplejidad.test.ts`

**Interfaces:**
- Produces: `export type PartidoDirectoHistorico = { resultado_local: number; resultado_visita: number; tarjetas_amarillas_local: number; tarjetas_amarillas_visita: number; tarjetas_rojas_local: number; tarjetas_rojas_visita: number }`, `export type PartidoClubHistorico = { tarjetas_amarillas: number; tarjetas_rojas: number }`, `export function calcularComplejidad(input: { partidosDirectos: PartidoDirectoHistorico[]; partidosClubLocal: PartidoClubHistorico[]; partidosClubVisita: PartidoClubHistorico[] }): number`. Consumido por la Task 4 (`importarFixture`), que arma estos arrays desde consultas a la DB (esta función no toca la DB — recibe los datos ya resueltos).

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { calcularComplejidad } from '@/lib/fixture/calcularComplejidad'

describe('calcularComplejidad', () => {
  it('sin historial directo, cae al valor neutro 5', () => {
    const resultado = calcularComplejidad({ partidosDirectos: [], partidosClubLocal: [], partidosClubVisita: [] })
    expect(resultado).toBe(5)
  })

  it('partidos parejos con muchos incidentes → complejidad alta', () => {
    const partidoParejo = {
      resultado_local: 20,
      resultado_visita: 18,
      tarjetas_amarillas_local: 3,
      tarjetas_amarillas_visita: 3,
      tarjetas_rojas_local: 1,
      tarjetas_rojas_visita: 0,
    }
    const tendenciaAlta = { tarjetas_amarillas: 4, tarjetas_rojas: 1 }
    const resultado = calcularComplejidad({
      partidosDirectos: [partidoParejo, partidoParejo],
      partidosClubLocal: [tendenciaAlta, tendenciaAlta],
      partidosClubVisita: [tendenciaAlta, tendenciaAlta],
    })
    expect(resultado).toBe(10)
  })

  it('goleada sin incidentes → complejidad baja (mínimo 1)', () => {
    const goleada = {
      resultado_local: 45,
      resultado_visita: 5,
      tarjetas_amarillas_local: 0,
      tarjetas_amarillas_visita: 0,
      tarjetas_rojas_local: 0,
      tarjetas_rojas_visita: 0,
    }
    const sinIncidentes = { tarjetas_amarillas: 0, tarjetas_rojas: 0 }
    const resultado = calcularComplejidad({
      partidosDirectos: [goleada, goleada],
      partidosClubLocal: [sinIncidentes],
      partidosClubVisita: [sinIncidentes],
    })
    expect(resultado).toBe(1)
  })

  it('caso intermedio: diferencia de puntos media, sin incidentes', () => {
    const partidoMedio = {
      resultado_local: 25,
      resultado_visita: 10,
      tarjetas_amarillas_local: 0,
      tarjetas_amarillas_visita: 0,
      tarjetas_rojas_local: 0,
      tarjetas_rojas_visita: 0,
    }
    const sinIncidentes = { tarjetas_amarillas: 0, tarjetas_rojas: 0 }
    const resultado = calcularComplejidad({
      partidosDirectos: [partidoMedio],
      partidosClubLocal: [sinIncidentes],
      partidosClubVisita: [sinIncidentes],
    })
    expect(resultado).toBe(2)
  })

  it('el resultado siempre está entre 1 y 10', () => {
    const partidoExtremo = {
      resultado_local: 100,
      resultado_visita: 0,
      tarjetas_amarillas_local: 10,
      tarjetas_amarillas_visita: 10,
      tarjetas_rojas_local: 5,
      tarjetas_rojas_visita: 5,
    }
    const resultado = calcularComplejidad({
      partidosDirectos: [partidoExtremo],
      partidosClubLocal: [],
      partidosClubVisita: [],
    })
    expect(resultado).toBeGreaterThanOrEqual(1)
    expect(resultado).toBeLessThanOrEqual(10)
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run tests/unit/calcularComplejidad.test.ts`
Expected: FAIL — `Cannot find module '@/lib/fixture/calcularComplejidad'`.

- [ ] **Step 3: Implementar `lib/fixture/calcularComplejidad.ts`**

```ts
export type PartidoDirectoHistorico = {
  resultado_local: number
  resultado_visita: number
  tarjetas_amarillas_local: number
  tarjetas_amarillas_visita: number
  tarjetas_rojas_local: number
  tarjetas_rojas_visita: number
}

export type PartidoClubHistorico = {
  tarjetas_amarillas: number
  tarjetas_rojas: number
}

export type InputComplejidad = {
  partidosDirectos: PartidoDirectoHistorico[]
  partidosClubLocal: PartidoClubHistorico[]
  partidosClubVisita: PartidoClubHistorico[]
}

// Constantes de normalización — decisión de esta fase (no del spec), ajustables sin
// tocar la forma de la función. DIFERENCIA_MAXIMA_PUNTOS: diferencia de puntos a partir
// de la cual un partido se considera una goleada total (score de paridad = 0).
// INCIDENTES_MAXIMOS_POR_PARTIDO: suma de tarjetas (amarilla=1, roja=2) a partir de la
// cual un partido/tendencia se considera al máximo de incidentes (score = 10).
const DIFERENCIA_MAXIMA_PUNTOS = 30
const INCIDENTES_MAXIMOS_POR_PARTIDO = 6

function puntajeIncidentesDirecto(p: PartidoDirectoHistorico): number {
  return (
    p.tarjetas_amarillas_local +
    p.tarjetas_amarillas_visita +
    (p.tarjetas_rojas_local + p.tarjetas_rojas_visita) * 2
  )
}

function puntajeIncidentesClub(p: PartidoClubHistorico): number {
  return p.tarjetas_amarillas + p.tarjetas_rojas * 2
}

function promedio(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function calcularComplejidad(input: InputComplejidad): number {
  if (input.partidosDirectos.length === 0) return 5

  const diferenciaPromedio = promedio(
    input.partidosDirectos.map((p) => Math.abs(p.resultado_local - p.resultado_visita))
  )
  const scoreParidad = clamp(10 - (diferenciaPromedio / DIFERENCIA_MAXIMA_PUNTOS) * 10, 0, 10)

  const incidentesPromedioDirectos = promedio(input.partidosDirectos.map(puntajeIncidentesDirecto))
  const scoreIncidentesDirectos = clamp((incidentesPromedioDirectos / INCIDENTES_MAXIMOS_POR_PARTIDO) * 10, 0, 10)

  const incidentesClubLocal = promedio(input.partidosClubLocal.map(puntajeIncidentesClub))
  const incidentesClubVisita = promedio(input.partidosClubVisita.map(puntajeIncidentesClub))
  const scoreTendencia = clamp(
    ((incidentesClubLocal + incidentesClubVisita) / 2 / INCIDENTES_MAXIMOS_POR_PARTIDO) * 10,
    0,
    10
  )

  const puntajeFinal = 0.4 * scoreParidad + 0.3 * scoreIncidentesDirectos + 0.3 * scoreTendencia
  return clamp(Math.round(puntajeFinal), 1, 10)
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run tests/unit/calcularComplejidad.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/fixture/calcularComplejidad.ts tests/unit/calcularComplejidad.test.ts
git commit -m "feat(fixture): add pure complejidad calculation engine"
```

---

### Task 3: Parser + script de importación histórica (TDD parser, script ejecutable)

**Files:**
- Create: `lib/fixture/parseHistoricoCsv.ts`, `tests/unit/parseHistoricoCsv.test.ts`, `scripts/importar-historico/run.ts`

**Interfaces:**
- Consumes: `parseFixtureCsv.ts` como referencia de estilo (no se importa nada de ahí). Tabla `club`/`categoria_minima_mapa`/`partido` (ya existen).
- Produces: `export type FilaHistorico = { fecha: string; hora: string | null; categoria: string; club_local_codigo: string; club_visita_codigo: string; resultado_local: number; resultado_visita: number; tarjetas_amarillas_local: number; tarjetas_amarillas_visita: number; tarjetas_rojas_local: number; tarjetas_rojas_visita: number; incidentes: string | null }`, `export function parseHistoricoCsv(csvText: string): { filas: FilaHistorico[]; errores: ErrorFila[] }` (mismo `ErrorFila` de `parseFixtureCsv.ts`, reexportado). El script `run.ts` no exporta nada — se ejecuta directamente.

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { parseHistoricoCsv } from '@/lib/fixture/parseHistoricoCsv'

const ENCABEZADO =
  'fecha,hora,categoria,club_local,club_visita,resultado_local,resultado_visita,tarjetas_amarillas_local,tarjetas_amarillas_visita,tarjetas_rojas_local,tarjetas_rojas_visita,incidentes'

describe('parseHistoricoCsv', () => {
  it('parsea una fila válida completa', () => {
    const csv = `${ENCABEZADO}\n2025-05-10,15:00,Primera,ALU,LRC,25,18,2,3,0,1,Suspensión por 10 minutos`
    const resultado = parseHistoricoCsv(csv)
    expect(resultado.errores).toEqual([])
    expect(resultado.filas).toEqual([
      {
        fecha: '2025-05-10',
        hora: '15:00',
        categoria: 'Primera',
        club_local_codigo: 'ALU',
        club_visita_codigo: 'LRC',
        resultado_local: 25,
        resultado_visita: 18,
        tarjetas_amarillas_local: 2,
        tarjetas_amarillas_visita: 3,
        tarjetas_rojas_local: 0,
        tarjetas_rojas_visita: 1,
        incidentes: 'Suspensión por 10 minutos',
      },
    ])
  })

  it('permite hora, tarjetas e incidentes vacíos (defaults)', () => {
    const csv = `${ENCABEZADO}\n2025-05-10,,Primera,ALU,LRC,25,18,,,,,`
    const resultado = parseHistoricoCsv(csv)
    expect(resultado.errores).toEqual([])
    expect(resultado.filas[0]).toEqual({
      fecha: '2025-05-10',
      hora: null,
      categoria: 'Primera',
      club_local_codigo: 'ALU',
      club_visita_codigo: 'LRC',
      resultado_local: 25,
      resultado_visita: 18,
      tarjetas_amarillas_local: 0,
      tarjetas_amarillas_visita: 0,
      tarjetas_rojas_local: 0,
      tarjetas_rojas_visita: 0,
      incidentes: null,
    })
  })

  it('rechaza cuando falta una columna requerida', () => {
    const csv = 'fecha,categoria,club_local,club_visita,resultado_local\n2025-05-10,Primera,ALU,LRC,25'
    const resultado = parseHistoricoCsv(csv)
    expect(resultado.filas).toEqual([])
    expect(resultado.errores).toEqual([{ fila: 0, mensaje: 'Faltan columnas requeridas: resultado_visita' }])
  })

  it('rechaza resultado no numérico', () => {
    const csv = `${ENCABEZADO}\n2025-05-10,15:00,Primera,ALU,LRC,veinte,18,,,,,`
    const resultado = parseHistoricoCsv(csv)
    expect(resultado.errores).toEqual([{ fila: 2, mensaje: 'Resultado local inválido: "veinte"' }])
  })

  it('rechaza resultado negativo', () => {
    const csv = `${ENCABEZADO}\n2025-05-10,15:00,Primera,ALU,LRC,-5,18,,,,,`
    const resultado = parseHistoricoCsv(csv)
    expect(resultado.errores).toEqual([{ fila: 2, mensaje: 'Resultado local inválido: "-5"' }])
  })

  it('rechaza cuando club local y visita son el mismo código', () => {
    const csv = `${ENCABEZADO}\n2025-05-10,15:00,Primera,ALU,ALU,25,18,,,,,`
    const resultado = parseHistoricoCsv(csv)
    expect(resultado.errores).toEqual([{ fila: 2, mensaje: 'El club local y visita no pueden ser el mismo ("ALU")' }])
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run tests/unit/parseHistoricoCsv.test.ts`
Expected: FAIL — `Cannot find module '@/lib/fixture/parseHistoricoCsv'`.

- [ ] **Step 3: Implementar `lib/fixture/parseHistoricoCsv.ts`**

```ts
import { parse } from 'csv-parse/sync'
import type { ErrorFila } from './parseFixtureCsv'

export type { ErrorFila } from './parseFixtureCsv'

export type FilaHistorico = {
  fecha: string
  hora: string | null
  categoria: string
  club_local_codigo: string
  club_visita_codigo: string
  resultado_local: number
  resultado_visita: number
  tarjetas_amarillas_local: number
  tarjetas_amarillas_visita: number
  tarjetas_rojas_local: number
  tarjetas_rojas_visita: number
  incidentes: string | null
}

export type ResultadoParseoHistorico = {
  filas: FilaHistorico[]
  errores: ErrorFila[]
}

const CAMPOS_REQUERIDOS = [
  'fecha',
  'categoria',
  'club_local',
  'club_visita',
  'resultado_local',
  'resultado_visita',
]

function normalizarEncabezado(encabezado: string): string {
  return encabezado
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
}

function parsearEnteroNoNegativo(texto: string | undefined): number | null {
  if (!texto || texto.trim() === '') return 0
  const n = Number(texto.trim())
  if (!Number.isInteger(n) || n < 0) return null
  return n
}

export function parseHistoricoCsv(csvText: string): ResultadoParseoHistorico {
  let filasCrudas: Record<string, string>[]
  try {
    filasCrudas = parse(csvText, {
      columns: (encabezados: string[]) => encabezados.map((e) => normalizarEncabezado(e)),
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

  const filas: FilaHistorico[] = []
  const errores: ErrorFila[] = []

  filasCrudas.forEach((fila, index) => {
    const numeroFila = index + 2
    const fecha = fila.fecha?.trim()
    const categoria = fila.categoria?.trim()
    const clubLocal = fila.club_local?.trim()
    const clubVisita = fila.club_visita?.trim()

    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      errores.push({ fila: numeroFila, mensaje: `Fecha inválida: "${fila.fecha ?? ''}" (formato esperado AAAA-MM-DD)` })
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

    const resultadoLocal = parsearEnteroNoNegativo(fila.resultado_local)
    if (resultadoLocal === null || !fila.resultado_local?.trim()) {
      errores.push({ fila: numeroFila, mensaje: `Resultado local inválido: "${fila.resultado_local ?? ''}"` })
      return
    }
    const resultadoVisita = parsearEnteroNoNegativo(fila.resultado_visita)
    if (resultadoVisita === null || !fila.resultado_visita?.trim()) {
      errores.push({ fila: numeroFila, mensaje: `Resultado visita inválido: "${fila.resultado_visita ?? ''}"` })
      return
    }

    const tarjetasAmarillasLocal = parsearEnteroNoNegativo(fila.tarjetas_amarillas_local)
    const tarjetasAmarillasVisita = parsearEnteroNoNegativo(fila.tarjetas_amarillas_visita)
    const tarjetasRojasLocal = parsearEnteroNoNegativo(fila.tarjetas_rojas_local)
    const tarjetasRojasVisita = parsearEnteroNoNegativo(fila.tarjetas_rojas_visita)
    if (
      tarjetasAmarillasLocal === null ||
      tarjetasAmarillasVisita === null ||
      tarjetasRojasLocal === null ||
      tarjetasRojasVisita === null
    ) {
      errores.push({ fila: numeroFila, mensaje: 'Cantidad de tarjetas inválida (debe ser un entero no negativo o estar vacía)' })
      return
    }

    filas.push({
      fecha,
      hora: fila.hora?.trim() || null,
      categoria,
      club_local_codigo: clubLocal,
      club_visita_codigo: clubVisita,
      resultado_local: resultadoLocal,
      resultado_visita: resultadoVisita,
      tarjetas_amarillas_local: tarjetasAmarillasLocal,
      tarjetas_amarillas_visita: tarjetasAmarillasVisita,
      tarjetas_rojas_local: tarjetasRojasLocal,
      tarjetas_rojas_visita: tarjetasRojasVisita,
      incidentes: fila.incidentes?.trim() || null,
    })
  })

  return { filas, errores }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run tests/unit/parseHistoricoCsv.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit el parser**

```bash
git add lib/fixture/parseHistoricoCsv.ts tests/unit/parseHistoricoCsv.test.ts
git commit -m "feat(fixture): add pure historical-fixture CSV parser/validator"
```

- [ ] **Step 6: Crear el script ejecutable `scripts/importar-historico/run.ts`**

```ts
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { parseHistoricoCsv } from '../../lib/fixture/parseHistoricoCsv'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function main() {
  const [, , rutaCsv, ligaId, temporadaId] = process.argv
  if (!rutaCsv || !ligaId || !temporadaId) {
    console.error('Uso: npx tsx scripts/importar-historico/run.ts <ruta-al-csv> <liga_id> <temporada_id>')
    process.exit(1)
  }

  const csvText = readFileSync(rutaCsv, 'utf-8')
  const { filas, errores: erroresParseo } = parseHistoricoCsv(csvText)
  if (erroresParseo.length > 0) {
    console.error('Errores en el archivo:')
    erroresParseo.forEach((e) => console.error(`  Fila ${e.fila}: ${e.mensaje}`))
    process.exit(1)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data: clubes, error: clubesError } = await admin.from('club').select('id, codigo')
  if (clubesError) throw new Error(clubesError.message)
  const clubesPorCodigo = new Map((clubes ?? []).map((c) => [c.codigo, c.id]))

  const { data: mapa, error: mapaError } = await admin
    .from('categoria_minima_mapa')
    .select('categoria, categoria_minima_referee')
    .eq('liga_id', ligaId)
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
      liga_id: ligaId,
      temporada_id: temporadaId,
      fecha: fila.fecha,
      hora: fila.hora,
      categoria: fila.categoria,
      club_local_id: clubLocalId ?? null,
      club_visita_id: clubVisitaId ?? null,
      resultado_local: fila.resultado_local,
      resultado_visita: fila.resultado_visita,
      tarjetas_amarillas_local: fila.tarjetas_amarillas_local,
      tarjetas_amarillas_visita: fila.tarjetas_amarillas_visita,
      tarjetas_rojas_local: fila.tarjetas_rojas_local,
      tarjetas_rojas_visita: fila.tarjetas_rojas_visita,
      incidentes: fila.incidentes,
      categoria_minima_referee: minimaPorCategoria.get(fila.categoria) ?? fila.categoria,
      es_historico: true,
    }
  })

  if (erroresClubes.length > 0) {
    console.error('Errores en el archivo:')
    erroresClubes.forEach((e) => console.error(`  ${e}`))
    process.exit(1)
  }

  const { error: insertError, data: insertados } = await admin.from('partido').insert(filasParaInsertar).select('id')
  if (insertError) {
    console.error('Error al insertar:', insertError.message)
    process.exit(1)
  }

  console.log(`Se importaron ${insertados?.length ?? 0} partidos históricos.`)
}

main()
```

- [ ] **Step 7: Commit el script**

```bash
git add scripts/importar-historico/run.ts
git commit -m "feat(fixture): add one-time historical fixture import script"
```

---

### Task 4: Conectar el cálculo de complejidad a la importación de fixture

**Files:**
- Modify: `actions/fixture.ts` (reemplazo completo del archivo)

**Interfaces:**
- Consumes: `calcularComplejidad`, `PartidoDirectoHistorico`, `PartidoClubHistorico` (Task 2).
- Produces: `importarFixture` ahora calcula y guarda `complejidad` por cada partido nuevo, usando el historial directo entre los dos clubes y la tendencia disciplinaria reciente (últimos 10 partidos con resultado cargado) de cada club. `listPartidos` no cambia.

- [ ] **Step 1: Reemplazar el contenido completo de `actions/fixture.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { ROLES } from '@/lib/auth/roles'
import { parseFixtureCsv } from '@/lib/fixture/parseFixtureCsv'
import { calcularComplejidad, type PartidoClubHistorico, type PartidoDirectoHistorico } from '@/lib/fixture/calcularComplejidad'

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

const LIMITE_PARTIDOS_TENDENCIA = 10

async function obtenerTendenciaClub(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clubId: string
): Promise<PartidoClubHistorico[]> {
  const { data } = await supabase
    .from('partido')
    .select('club_local_id, tarjetas_amarillas_local, tarjetas_amarillas_visita, tarjetas_rojas_local, tarjetas_rojas_visita')
    .not('resultado_local', 'is', null)
    .or(`club_local_id.eq.${clubId},club_visita_id.eq.${clubId}`)
    .order('fecha', { ascending: false })
    .limit(LIMITE_PARTIDOS_TENDENCIA)

  return (data ?? []).map((p) => ({
    tarjetas_amarillas: p.club_local_id === clubId ? (p.tarjetas_amarillas_local ?? 0) : (p.tarjetas_amarillas_visita ?? 0),
    tarjetas_rojas: p.club_local_id === clubId ? (p.tarjetas_rojas_local ?? 0) : (p.tarjetas_rojas_visita ?? 0),
  }))
}

async function obtenerComplejidad(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clubLocalId: string,
  clubVisitaId: string
): Promise<number> {
  const { data: directos } = await supabase
    .from('partido')
    .select('resultado_local, resultado_visita, tarjetas_amarillas_local, tarjetas_amarillas_visita, tarjetas_rojas_local, tarjetas_rojas_visita')
    .not('resultado_local', 'is', null)
    .or(
      `and(club_local_id.eq.${clubLocalId},club_visita_id.eq.${clubVisitaId}),and(club_local_id.eq.${clubVisitaId},club_visita_id.eq.${clubLocalId})`
    )

  const partidosDirectos: PartidoDirectoHistorico[] = (directos ?? []).map((p) => ({
    resultado_local: p.resultado_local!,
    resultado_visita: p.resultado_visita!,
    tarjetas_amarillas_local: p.tarjetas_amarillas_local ?? 0,
    tarjetas_amarillas_visita: p.tarjetas_amarillas_visita ?? 0,
    tarjetas_rojas_local: p.tarjetas_rojas_local ?? 0,
    tarjetas_rojas_visita: p.tarjetas_rojas_visita ?? 0,
  }))

  const [partidosClubLocal, partidosClubVisita] = await Promise.all([
    obtenerTendenciaClub(supabase, clubLocalId),
    obtenerTendenciaClub(supabase, clubVisitaId),
  ])

  return calcularComplejidad({ partidosDirectos, partidosClubLocal, partidosClubVisita })
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
  const filasParaInsertar: Record<string, unknown>[] = []

  for (let index = 0; index < filas.length; index++) {
    const fila = filas[index]
    const numeroFila = index + 2
    const clubLocalId = clubesPorCodigo.get(fila.club_local_codigo)
    const clubVisitaId = clubesPorCodigo.get(fila.club_visita_codigo)
    if (!clubLocalId) erroresClubes.push(`Fila ${numeroFila}: club local "${fila.club_local_codigo}" no existe`)
    if (!clubVisitaId) erroresClubes.push(`Fila ${numeroFila}: club visita "${fila.club_visita_codigo}" no existe`)

    const complejidad = clubLocalId && clubVisitaId ? await obtenerComplejidad(supabase, clubLocalId, clubVisitaId) : null

    filasParaInsertar.push({
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
      complejidad,
    })
  }

  if (erroresClubes.length > 0) {
    throw new Error('Errores en el archivo:\n' + erroresClubes.join('\n'))
  }

  const { error: insertError } = await supabase.from('partido').insert(filasParaInsertar)
  if (insertError) throw new Error(insertError.message)

  revalidatePath('/fixture')
  return { importados: filasParaInsertar.length }
}
```

- [ ] **Step 2: Verificar que compila y el resto de la suite sigue pasando**

Run: `npx vitest run`
Expected: todos los tests pasan (incluyendo los de `parseFixtureCsv`/`calcularComplejidad`/`parseHistoricoCsv`, sin regresiones).

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add actions/fixture.ts
git commit -m "feat(fixture): compute complejidad per row when importing future fixtures"
```

---

### Task 5: Verificación manual con datos sintéticos

**Files:**
- Ninguno (paso operativo — usa un script descartable que se borra al terminar).

**Interfaces:**
- Consumes: `scripts/importar-historico/run.ts` (Task 3), `importarFixture` (Task 4), usuario `designador@rugby.local` (ya existe).

- [ ] **Step 1: Preparar un CSV histórico sintético (NO es data real — solo para probar el mecanismo)**

Crear un archivo temporal (fuera del repo, ej. `/tmp/historico-sintetico.csv`, o en `scripts/importar-historico/` si se borra después — no commitear):

```csv
fecha,hora,categoria,club_local,club_visita,resultado_local,resultado_visita,tarjetas_amarillas_local,tarjetas_amarillas_visita,tarjetas_rojas_local,tarjetas_rojas_visita,incidentes
2025-04-05,15:00,Primera,ALU,LRC,22,20,3,2,1,0,Roce entre capitanes
2025-05-12,15:00,Primera,ALU,LRC,25,10,0,0,0,0,
```

- [ ] **Step 2: Correr el script histórico**

Run: `npx tsx scripts/importar-historico/run.ts /tmp/historico-sintetico.csv 33333333-3333-3333-3333-333333333333 44444444-4444-4444-4444-444444444444`

Expected: `Se importaron 2 partidos históricos.`

Run: `docker exec supabase_db_rugby psql -U postgres -d postgres -c "select fecha, es_historico, complejidad from partido where es_historico = true;"`
Expected: 2 filas, `es_historico = t`, `complejidad` en NULL (los históricos no calculan su propia complejidad).

- [ ] **Step 3: Importar un partido futuro entre esos mismos dos clubes y verificar que la complejidad se calculó**

Run: `npm run dev`, loguearse como `designador@rugby.local` / `RugbyDev123!`, ir a `/fixture` (Liga Metropolitana / Temporada 2026 por defecto), subir un CSV con una sola fila: `fecha,hora,cancha,categoria,club_local,club_visita,jornada` / `2026-10-20,15:00,Cancha Alumni,Primera,ALU,LRC,10`.

Expected: "Se importaron 1 partidos." (el componente no maneja singular/plural, ese es el texto literal esperado).

Run: `docker exec supabase_db_rugby psql -U postgres -d postgres -c "select fecha, es_historico, complejidad from partido where fecha = '2026-10-20';"`
Expected: `es_historico = f`, `complejidad = 5` exacto. Cálculo esperado con los 2 partidos sintéticos del Step 1 (diferenciaPromedio=8.5→scoreParidad≈7.17; incidentesPromedioDirectos=3.5→scoreIncidentesDirectos≈5.83; tendencia ALU=[5,0]→2.5, tendencia LRC=[2,0]→1→scoreTendencia≈2.92; final=0.4×7.17+0.3×5.83+0.3×2.92≈5.49→round→5). Si el valor no es exactamente 5, hay un desvío entre la implementación y el motor — no lo trates como "esperable", repórtalo.

- [ ] **Step 4: Limpiar los datos sintéticos**

Run:

```bash
docker exec supabase_db_rugby psql -U postgres -d postgres -c "
delete from partido where es_historico = true;
delete from partido where fecha = '2026-10-20';
"
rm -f /tmp/historico-sintetico.csv
```

Expected: la tabla `partido` vuelve a tener solo los datos de verificación de fases anteriores (o ninguno, según lo que haya quedado de la Fase 4).

- [ ] **Step 5: No hay commit en esta task** (verificación manual con datos sintéticos, sin cambios de código).

---

## Al terminar

Con esto queda completa la infraestructura de la Fase 5, lista para correr contra la data histórica real cuando el usuario la provea (`npx tsx scripts/importar-historico/run.ts <archivo-real> <liga_id> <temporada_id>`, una vez por liga/temporada). El siguiente checkpoint es la Fase 6 (Motor de scoring + UI de recomendaciones + configuración por liga), que consume tanto `complejidad` (esta fase) como `disponibilidad` (Fase 3) — no se empieza hasta que este plan esté revisado y ejecutado.
