# Fase 6 — Motor de scoring + recomendaciones + configuración por liga — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el motor de recomendación de referees: una función pura que calcula el score de un referee para un partido (promedio ponderado de evaluaciones con decaimiento temporal, ajuste por complejidad, penalización por club), la configuración de scoring por liga, y la pantalla de detalle de partido que muestra la lista rankeada con el desglose completo.

**Architecture:** `calcularScore` es una función TypeScript pura (sin DB) que implementa el algoritmo del spec maestro §6 (pasos 3-5: score base + ajuste por complejidad + penalización por club). Los filtros (disponibilidad horaria como filtro duro, categoría mínima como alerta blanda) y la agregación de datos viven en un server action (`recomendarReferees`) que corre con **service-role** para poder leer evaluaciones/disponibilidad de todos los referees de la región sin pelear con RLS fila por fila — excepción intencional ya prevista en el spec maestro §11, con autorización de rol verificada explícitamente en código. La pantalla `/fixture/[partidoId]` es un Server Component que llama al action y renderiza la tabla con `TablaRecomendaciones`.

**Tech Stack:** TypeScript puro (motor), Vitest (unit), Next.js App Router (Server Components + server actions), `@supabase/supabase-js` con service-role para el action de agregación, Supabase CLI (migraciones), Tailwind con los tokens de color corporativos existentes (`bg-surface`, `border-border`, `text-muted`, `bg-primary`, etc.).

**Spec:** `docs/superpowers/specs/2026-08-31-plataforma-designacion-referees-design.md` (§6 motor de recomendación, §10 pantallas, §11 RLS, §12 decisión de implementación) + `docs/superpowers/specs/2026-09-10-fichas-cuerpo-arbitral-addendum.md` (§F roadmap).

## Global Constraints

- RLS habilitada y forzada (`enable row level security` + `force row level security`) en **todas** las tablas nuevas, sin excepciones (spec maestro §11).
- Roles fijos, exactamente cinco: `admin_nacional`, `admin_regional`, `designador`, `evaluador`, `referee`. No agregar roles.
- Nomenclatura de dominio en español, coincidiendo con los nombres del spec.
- Sin notificaciones push/email en esta fase (el email entra en Fase 7).
- El motor de scoring vive como **función TypeScript pura** en `lib/scoring/`, no PL/pgSQL ni RPC (spec maestro §12).
- El action de agregación (`recomendarReferees`) usa **service-role** y verifica el rol del llamador (`designador`/`admin_regional`/`admin_nacional`) explícitamente antes de tocar la DB — única excepción intencional a RLS, documentada (spec maestro §11).
- MVP seedeado solo con Perú → Lima → Liga Metropolitana → Temporada 2026. La `configuracion_scoring` de la Liga Metropolitana se seedea con valores por defecto razonables en la misma migración que crea la tabla.
- El motor recomienda exclusivamente para el puesto `R1` (addendum §B). En esta fase todavía no existe la tabla `designacion`; la pantalla no tiene botón de confirmar ni el dato de "designaciones acumuladas" — ambos entran en Fase 7.

**Nota de secuenciación (decisión de este plan, no del roadmap del addendum):** la tabla `evaluacion` y una tabla-catálogo `categoria_referee` (escalafón ordenado) se crean en esta fase porque el motor las necesita para leer. La Fase 9 construye la UI del evaluador y el bloqueo `evaluacion_bloqueante` sobre la tabla `evaluacion` ya existente. Una `evaluacion` vacía es un estado válido: un referee sin evaluaciones cae al score base neutro (constante documentada), sin ser penalizado (spec maestro §6.3).

**Nota sobre TDD:** la Tarea 3 (`calcularScore`) sigue TDD rojo/verde completo con Vitest. Las tareas de migración (1, 2) usan verificación determinística (`supabase db reset` + query). Las tareas de action/UI (4, 5) se verifican con `npm run test:rls` (para las policies nuevas), `npx vitest run`, `npm run lint` y una verificación manual descrita paso a paso.

---

## Estructura de archivos

```
supabase/migrations/
  0016_categoria_referee.sql        # catálogo de escalafón (nombre, orden) + seed + RLS + referee.categoria pasa a FK textual
  0017_configuracion_scoring.sql    # configuracion_scoring (por liga) + RLS + seed default Liga Metropolitana
  0018_evaluacion.sql               # evaluacion (referee_id, tipo, valor, fecha, evaluador_id, partido_id nullable) + RLS
lib/scoring/
  tipos.ts                          # tipos compartidos: TipoEvaluacion, ConfigScoring, EvaluacionInput, ResultadoScore
  calcularScore.ts                  # función pura calcularScore(...)
actions/
  recomendaciones.ts                # recomendarReferees(partidoId): server action con service-role
components/fixture/
  TablaRecomendaciones.tsx          # client component: tabla rankeada + desglose expandible
app/(app)/fixture/[partidoId]/
  page.tsx                          # Server Component: detalle de partido + recomendaciones
tests/unit/
  calcularScore.test.ts
scripts/rls-test/
  run-rls-tests.ts                  # MODIFY: casos nuevos para configuracion_scoring y evaluacion
```

---

### Task 1: Migración — catálogo `categoria_referee`

**Files:**
- Create: `supabase/migrations/0016_categoria_referee.sql`

**Interfaces:**
- Consumes: tabla `referee` (Fase 2), `fn_rol()` (Fase 1).
- Produces: tabla `categoria_referee (nombre text pk, orden int unique)` con 6 filas seedeadas; consumida por la Tarea 4 (alerta de categoría) y por la pantalla de la Tarea 5.

- [ ] **Step 1: Crear `supabase/migrations/0016_categoria_referee.sql`**

```sql
-- Escalafón ordenado de categorías de referee. El "orden" permite comparar
-- si un referee está por debajo de la categoría mínima exigida por un partido.
create table categoria_referee (
  nombre text primary key,
  orden int not null unique,
  created_at timestamptz not null default now()
);

insert into categoria_referee (nombre, orden) values
  ('Escuela', 1),
  ('Distrital', 2),
  ('Regional', 3),
  ('Nacional', 4),
  ('Panamericana', 5),
  ('Internacional', 6);

alter table categoria_referee enable row level security;
alter table categoria_referee force row level security;

-- Catálogo global de solo lectura para cualquier usuario autenticado.
create policy categoria_referee_select on categoria_referee for select
using (auth.uid() is not null);
```

- [ ] **Step 2: Aplicar y verificar**

Run: `npx supabase db reset`
Expected: aplica sin error.

Run: `docker exec supabase_db_rugby psql -U postgres -d postgres -c "select nombre, orden from categoria_referee order by orden;"`
Expected: 6 filas, de `Escuela` (1) a `Internacional` (6).

Run: `docker exec supabase_db_rugby psql -U postgres -d postgres -c "select distinct categoria from referee;"`
Expected: devuelve `Regional` (el valor seedeado en `0011`), que existe en `categoria_referee` — no hay filas huérfanas.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0016_categoria_referee.sql
git commit -m "feat(db): add categoria_referee escalafon catalog with seed"
```

---

### Task 2: Migración — `configuracion_scoring` + `evaluacion`

**Files:**
- Create: `supabase/migrations/0017_configuracion_scoring.sql`, `supabase/migrations/0018_evaluacion.sql`

**Interfaces:**
- Consumes: `liga` (Fase 1), `referee` (Fase 2), `partido` (Fase 4), `fn_rol()`/`fn_pais_id()`/`fn_region_id()` (Fase 1).
- Produces:
  - tabla `configuracion_scoring` con 1 fila seedeada para la Liga Metropolitana (`33333333-3333-3333-3333-333333333333`);
  - tabla `evaluacion (id, referee_id, tipo, valor, fecha, evaluador_id, partido_id nullable)`.
  - Ambas consumidas por la Tarea 4.

- [ ] **Step 1: Crear `supabase/migrations/0017_configuracion_scoring.sql`**

```sql
-- Configuración de scoring por liga. Los pesos se guardan como columnas
-- explícitas (no jsonb) para que sean validables por constraint y legibles
-- en Studio. semivida_dias controla el decaimiento exponencial de la
-- antigüedad de las evaluaciones (una evaluación de hace `semivida_dias`
-- pesa la mitad que una de hoy).
create table configuracion_scoring (
  liga_id uuid primary key references liga(id) on delete cascade,
  peso_performance_normal numeric(4,3) not null default 0.400,
  peso_fisico_normal numeric(4,3) not null default 0.200,
  peso_videoanalisis_normal numeric(4,3) not null default 0.200,
  peso_coaching_normal numeric(4,3) not null default 0.200,
  peso_performance_alta numeric(4,3) not null default 0.500,
  peso_fisico_alta numeric(4,3) not null default 0.100,
  peso_videoanalisis_alta numeric(4,3) not null default 0.150,
  peso_coaching_alta numeric(4,3) not null default 0.250,
  umbral_complejidad_alta smallint not null default 7,
  factor_penalizacion_club numeric(4,3) not null default 0.800,
  semivida_dias int not null default 180,
  score_sin_evaluaciones numeric(3,1) not null default 5.0,
  evaluacion_bloqueante boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cfg_pesos_normal_suman_uno check (
    round((peso_performance_normal + peso_fisico_normal + peso_videoanalisis_normal + peso_coaching_normal)::numeric, 3) = 1.000
  ),
  constraint cfg_pesos_alta_suman_uno check (
    round((peso_performance_alta + peso_fisico_alta + peso_videoanalisis_alta + peso_coaching_alta)::numeric, 3) = 1.000
  ),
  constraint cfg_umbral_rango check (umbral_complejidad_alta between 1 and 10),
  constraint cfg_factor_rango check (factor_penalizacion_club between 0 and 1),
  constraint cfg_semivida_positiva check (semivida_dias > 0)
);

alter table configuracion_scoring enable row level security;
alter table configuracion_scoring force row level security;

-- SELECT: admin del país / región de esa liga, y el designador de esa región.
create policy configuracion_scoring_select on configuracion_scoring for select
using (
  fn_rol() = 'admin_nacional' and liga_id in (
    select id from liga where region_id in (select id from region where pais_id = fn_pais_id())
  )
  or liga_id in (select id from liga where region_id = fn_region_id())
);

-- UPDATE: solo admin_nacional (su país) y admin_regional (su región). El designador no edita config.
create policy configuracion_scoring_update on configuracion_scoring for update
using (
  fn_rol() = 'admin_nacional' and liga_id in (
    select id from liga where region_id in (select id from region where pais_id = fn_pais_id())
  )
  or fn_rol() = 'admin_regional' and liga_id in (select id from liga where region_id = fn_region_id())
);

-- Seed: configuración por defecto para la Liga Metropolitana (Temporada 2026).
insert into configuracion_scoring (liga_id) values
  ('33333333-3333-3333-3333-333333333333');
```

- [ ] **Step 2: Aplicar y verificar**

Run: `npx supabase db reset`
Expected: aplica sin error (los constraints de suma de pesos pasan: 0.4+0.2+0.2+0.2 = 1.0 y 0.5+0.1+0.15+0.25 = 1.0).

Run: `docker exec supabase_db_rugby psql -U postgres -d postgres -c "select liga_id, umbral_complejidad_alta, factor_penalizacion_club, semivida_dias from configuracion_scoring;"`
Expected: 1 fila, `liga_id = 33333333-...`, `umbral = 7`, `factor = 0.800`, `semivida = 180`.

- [ ] **Step 3: Crear `supabase/migrations/0018_evaluacion.sql`**

```sql
create type tipo_evaluacion as enum ('performance', 'fisico', 'videoanalisis', 'coaching');

create table evaluacion (
  id uuid primary key default gen_random_uuid(),
  referee_id uuid not null references referee(id) on delete cascade,
  tipo tipo_evaluacion not null,
  valor numeric(4,2) not null,
  fecha date not null,
  evaluador_id uuid references perfil(id) on delete set null,
  partido_id uuid references partido(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint evaluacion_valor_rango check (valor between 0 and 10)
);

create index evaluacion_referee_id_idx on evaluacion (referee_id);
create index evaluacion_partido_id_idx on evaluacion (partido_id);

alter table evaluacion enable row level security;
alter table evaluacion force row level security;

-- SELECT: el propio referee ve sus evaluaciones; evaluador/designador/admin ven las de su scope de región.
create policy evaluacion_select_self on evaluacion for select
using (referee_id in (select id from referee where usuario_id = auth.uid()));

create policy evaluacion_select_scope on evaluacion for select
using (
  fn_rol() = 'admin_nacional' and referee_id in (
    select id from referee where region_id in (select id from region where pais_id = fn_pais_id())
  )
  or fn_rol() in ('admin_regional', 'designador', 'evaluador')
     and referee_id in (select id from referee where region_id = fn_region_id())
);

-- INSERT: solo evaluador/admin de la región del referee. (La UI de carga llega en Fase 9;
-- la policy se define ahora para que el modelo quede completo y testeado.)
create policy evaluacion_insert on evaluacion for insert
with check (
  fn_rol() = 'admin_nacional' and referee_id in (
    select id from referee where region_id in (select id from region where pais_id = fn_pais_id())
  )
  or fn_rol() in ('admin_regional', 'evaluador')
     and referee_id in (select id from referee where region_id = fn_region_id())
);
```

- [ ] **Step 4: Aplicar y verificar**

Run: `npx supabase db reset`
Expected: aplica sin error.

Run: `docker exec supabase_db_rugby psql -U postgres -d postgres -c "\d evaluacion" | grep -E "tipo|valor|referee_id"`
Expected: `tipo` es `tipo_evaluacion`, `valor` es `numeric(4,2)`, `referee_id` `not null`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0017_configuracion_scoring.sql supabase/migrations/0018_evaluacion.sql
git commit -m "feat(db): add configuracion_scoring (seeded) and evaluacion tables with RLS"
```

---

### Task 3: Motor de scoring (TDD, función pura)

**Files:**
- Create: `lib/scoring/tipos.ts`, `lib/scoring/calcularScore.ts`
- Test: `tests/unit/calcularScore.test.ts`

**Interfaces:**
- Consumes: nada (función pura).
- Produces:
  - `lib/scoring/tipos.ts`:
    ```ts
    export type TipoEvaluacion = 'performance' | 'fisico' | 'videoanalisis' | 'coaching'
    export type EvaluacionInput = { tipo: TipoEvaluacion; valor: number; fecha: string } // fecha ISO 'YYYY-MM-DD'
    export type ConfigScoring = {
      pesosNormal: Record<TipoEvaluacion, number>
      pesosAltaComplejidad: Record<TipoEvaluacion, number>
      umbralComplejidadAlta: number
      factorPenalizacionClub: number
      semividaDias: number
      scoreSinEvaluaciones: number
    }
    export type DesgloseScore = {
      pesosUsados: Record<TipoEvaluacion, number>       // pesos renormalizados sobre los tipos presentes
      aportePorTipo: Partial<Record<TipoEvaluacion, number>> // valorTipo * pesoRenorm, por tipo presente
      valorPorTipo: Partial<Record<TipoEvaluacion, number>>  // promedio ponderado por recencia, por tipo presente
      tiposExcluidos: TipoEvaluacion[]                  // tipos sin ninguna evaluación
      ajustePorComplejidad: boolean                     // true si se usó el set de pesos de alta complejidad
      penalizacionClub: boolean                         // true si se aplicó factorPenalizacionClub
      scoreBase: number                                 // antes de la penalización de club
    }
    export type ResultadoScore = { scoreFinal: number; desglose: DesgloseScore }
    ```
  - `lib/scoring/calcularScore.ts`:
    ```ts
    export function calcularScore(input: {
      evaluaciones: EvaluacionInput[]
      perteneceAClubDelPartido: boolean
      complejidadPartido: number
      config: ConfigScoring
      hoy: string   // 'YYYY-MM-DD' — inyectado para test determinístico
    }): ResultadoScore
    ```
  - Consumido por la Tarea 4 (`recomendarReferees`), que arma `evaluaciones`/`config` desde la DB.

- [ ] **Step 1: Escribir `lib/scoring/tipos.ts`** (solo tipos, sin lógica — no necesita test)

Copiar el bloque `lib/scoring/tipos.ts` de la sección Interfaces de arriba, textual.

- [ ] **Step 2: Escribir el test que falla — `tests/unit/calcularScore.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { calcularScore } from '@/lib/scoring/calcularScore'
import type { ConfigScoring } from '@/lib/scoring/tipos'

const CONFIG: ConfigScoring = {
  pesosNormal: { performance: 0.4, fisico: 0.2, videoanalisis: 0.2, coaching: 0.2 },
  pesosAltaComplejidad: { performance: 0.5, fisico: 0.1, videoanalisis: 0.15, coaching: 0.25 },
  umbralComplejidadAlta: 7,
  factorPenalizacionClub: 0.8,
  semividaDias: 180,
  scoreSinEvaluaciones: 5,
}

describe('calcularScore', () => {
  it('sin evaluaciones, devuelve el score base neutro configurado', () => {
    const r = calcularScore({
      evaluaciones: [],
      perteneceAClubDelPartido: false,
      complejidadPartido: 5,
      config: CONFIG,
      hoy: '2026-09-10',
    })
    expect(r.scoreFinal).toBe(5)
    expect(r.desglose.tiposExcluidos).toEqual(['performance', 'fisico', 'videoanalisis', 'coaching'])
    expect(r.desglose.scoreBase).toBe(5)
  })

  it('una sola evaluación de hoy: el score base es ese valor, pesos renormalizados a 1', () => {
    const r = calcularScore({
      evaluaciones: [{ tipo: 'performance', valor: 8, fecha: '2026-09-10' }],
      perteneceAClubDelPartido: false,
      complejidadPartido: 5,
      config: CONFIG,
      hoy: '2026-09-10',
    })
    expect(r.scoreFinal).toBe(8)
    expect(r.desglose.pesosUsados.performance).toBe(1)
    expect(r.desglose.tiposExcluidos).toEqual(['fisico', 'videoanalisis', 'coaching'])
    expect(r.desglose.ajustePorComplejidad).toBe(false)
  })

  it('dos tipos presentes: promedio ponderado por los pesos renormalizados', () => {
    // performance=8 (peso normal 0.4), fisico=6 (peso normal 0.2) → renorm: 0.4/0.6, 0.2/0.6
    // score = 8*(0.6667) + 6*(0.3333) = 5.333 + 2.0 = 7.333 → 7.3
    const r = calcularScore({
      evaluaciones: [
        { tipo: 'performance', valor: 8, fecha: '2026-09-10' },
        { tipo: 'fisico', valor: 6, fecha: '2026-09-10' },
      ],
      perteneceAClubDelPartido: false,
      complejidadPartido: 5,
      config: CONFIG,
      hoy: '2026-09-10',
    })
    expect(r.scoreFinal).toBe(7.3)
  })

  it('decaimiento: una evaluación de hace una semivida pesa la mitad que una reciente', () => {
    // performance: valor 10 hoy, valor 4 hace 180 días (semivida) → decay 1.0 y 0.5
    // valorTipo = (10*1.0 + 4*0.5) / (1.0 + 0.5) = 12 / 1.5 = 8.0
    const r = calcularScore({
      evaluaciones: [
        { tipo: 'performance', valor: 10, fecha: '2026-09-10' },
        { tipo: 'performance', valor: 4, fecha: '2026-03-14' }, // 180 días antes
      ],
      perteneceAClubDelPartido: false,
      complejidadPartido: 5,
      config: CONFIG,
      hoy: '2026-09-10',
    })
    expect(r.desglose.valorPorTipo.performance).toBeCloseTo(8.0, 5)
    expect(r.scoreFinal).toBe(8)
  })

  it('complejidad por encima del umbral: usa el set de pesos de alta complejidad', () => {
    // performance=9, coaching=5. Pesos alta: perf 0.5, coaching 0.25 → renorm 0.6667 / 0.3333
    // score = 9*0.6667 + 5*0.3333 = 6.0 + 1.667 = 7.667 → 7.7
    const r = calcularScore({
      evaluaciones: [
        { tipo: 'performance', valor: 9, fecha: '2026-09-10' },
        { tipo: 'coaching', valor: 5, fecha: '2026-09-10' },
      ],
      perteneceAClubDelPartido: false,
      complejidadPartido: 8,
      config: CONFIG,
      hoy: '2026-09-10',
    })
    expect(r.desglose.ajustePorComplejidad).toBe(true)
    expect(r.scoreFinal).toBe(7.7)
  })

  it('penalización por club: multiplica el score base por el factor configurado', () => {
    // score base 8 (una perf de hoy) * 0.8 = 6.4
    const r = calcularScore({
      evaluaciones: [{ tipo: 'performance', valor: 8, fecha: '2026-09-10' }],
      perteneceAClubDelPartido: true,
      complejidadPartido: 5,
      config: CONFIG,
      hoy: '2026-09-10',
    })
    expect(r.desglose.scoreBase).toBe(8)
    expect(r.desglose.penalizacionClub).toBe(true)
    expect(r.scoreFinal).toBe(6.4)
  })

  it('el score final siempre queda entre 0 y 10 y redondeado a 1 decimal', () => {
    const r = calcularScore({
      evaluaciones: [
        { tipo: 'performance', valor: 10, fecha: '2026-09-10' },
        { tipo: 'fisico', valor: 10, fecha: '2026-09-10' },
        { tipo: 'videoanalisis', valor: 10, fecha: '2026-09-10' },
        { tipo: 'coaching', valor: 10, fecha: '2026-09-10' },
      ],
      perteneceAClubDelPartido: false,
      complejidadPartido: 5,
      config: CONFIG,
      hoy: '2026-09-10',
    })
    expect(r.scoreFinal).toBe(10)
    expect(Number.isInteger(r.scoreFinal * 10)).toBe(true)
  })
})
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `npx vitest run tests/unit/calcularScore.test.ts`
Expected: FAIL — `Cannot find module '@/lib/scoring/calcularScore'`.

- [ ] **Step 4: Implementar `lib/scoring/calcularScore.ts`**

```ts
import type {
  ConfigScoring,
  DesgloseScore,
  EvaluacionInput,
  ResultadoScore,
  TipoEvaluacion,
} from './tipos'

const TODOS_LOS_TIPOS: TipoEvaluacion[] = ['performance', 'fisico', 'videoanalisis', 'coaching']

function diasEntre(desde: string, hasta: string): number {
  const ms = new Date(hasta + 'T00:00:00Z').getTime() - new Date(desde + 'T00:00:00Z').getTime()
  return ms / (1000 * 60 * 60 * 24)
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function redondear1(n: number): number {
  return Math.round(n * 10) / 10
}

export function calcularScore(input: {
  evaluaciones: EvaluacionInput[]
  perteneceAClubDelPartido: boolean
  complejidadPartido: number
  config: ConfigScoring
  hoy: string
}): ResultadoScore {
  const { evaluaciones, perteneceAClubDelPartido, complejidadPartido, config, hoy } = input

  const ajustePorComplejidad = complejidadPartido > config.umbralComplejidadAlta
  const pesosConfig = ajustePorComplejidad ? config.pesosAltaComplejidad : config.pesosNormal

  // 1. Promedio ponderado por recencia dentro de cada tipo.
  const valorPorTipo: Partial<Record<TipoEvaluacion, number>> = {}
  for (const tipo of TODOS_LOS_TIPOS) {
    const delTipo = evaluaciones.filter((e) => e.tipo === tipo)
    if (delTipo.length === 0) continue
    let sumaPesada = 0
    let sumaPesos = 0
    for (const e of delTipo) {
      const edadDias = Math.max(0, diasEntre(e.fecha, hoy))
      const peso = Math.pow(0.5, edadDias / config.semividaDias)
      sumaPesada += e.valor * peso
      sumaPesos += peso
    }
    valorPorTipo[tipo] = sumaPesada / sumaPesos
  }

  const tiposPresentes = TODOS_LOS_TIPOS.filter((t) => valorPorTipo[t] !== undefined)
  const tiposExcluidos = TODOS_LOS_TIPOS.filter((t) => valorPorTipo[t] === undefined)

  // 2. Renormalizar los pesos de config sobre los tipos presentes.
  const pesosUsados: Record<TipoEvaluacion, number> = {
    performance: 0,
    fisico: 0,
    videoanalisis: 0,
    coaching: 0,
  }
  const sumaPesosPresentes = tiposPresentes.reduce((acc, t) => acc + pesosConfig[t], 0)
  for (const t of tiposPresentes) {
    pesosUsados[t] = sumaPesosPresentes > 0 ? pesosConfig[t] / sumaPesosPresentes : 0
  }

  // 3. Score base.
  let scoreBase: number
  const aportePorTipo: Partial<Record<TipoEvaluacion, number>> = {}
  if (tiposPresentes.length === 0) {
    scoreBase = config.scoreSinEvaluaciones
  } else {
    scoreBase = 0
    for (const t of tiposPresentes) {
      const aporte = (valorPorTipo[t] as number) * pesosUsados[t]
      aportePorTipo[t] = aporte
      scoreBase += aporte
    }
  }
  scoreBase = clamp(scoreBase, 0, 10)

  // 4. Penalización por club (sobre el score base).
  const penalizacionClub = perteneceAClubDelPartido
  const scoreFinal = redondear1(
    clamp(penalizacionClub ? scoreBase * config.factorPenalizacionClub : scoreBase, 0, 10)
  )

  const desglose: DesgloseScore = {
    pesosUsados,
    aportePorTipo,
    valorPorTipo,
    tiposExcluidos,
    ajustePorComplejidad,
    penalizacionClub,
    scoreBase: redondear1(scoreBase),
  }

  return { scoreFinal, desglose }
}
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `npx vitest run tests/unit/calcularScore.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/scoring/tipos.ts lib/scoring/calcularScore.ts tests/unit/calcularScore.test.ts
git commit -m "feat(scoring): add pure calcularScore recommendation engine"
```

---

### Task 4: Server action `recomendarReferees`

**Files:**
- Create: `actions/recomendaciones.ts`

**Interfaces:**
- Consumes: `calcularScore` + tipos (Tarea 3); tablas `partido` (Fase 4), `referee` (Fase 2), `disponibilidad` (Fase 3), `evaluacion` + `configuracion_scoring` (Tarea 2), `categoria_referee` (Tarea 1); `getProfile()` + `ROLES` (Fase 1); `SUPABASE_SERVICE_ROLE_KEY` (`.env.local`).
- Produces:
  ```ts
  export type RecomendacionReferee = {
    referee_id: string
    nombre: string
    club_nombre: string | null
    categoria: string
    disponible: boolean            // pasó el filtro duro de disponibilidad horaria
    alertaCategoria: boolean       // categoría del referee por debajo de la mínima del partido
    perteneceAClub: boolean
    score: ResultadoScore
  }
  export type ResultadoRecomendaciones = {
    partido: {
      id: string; fecha: string; hora: string | null; categoria: string
      categoria_minima_referee: string; complejidad: number | null
      club_local: string; club_visita: string
    }
    recomendaciones: RecomendacionReferee[]  // solo los disponibles, ordenados por score.scoreFinal desc
    noDisponibles: RecomendacionReferee[]    // referees filtrados por disponibilidad, para contexto
  }
  export async function recomendarReferees(partidoId: string): Promise<ResultadoRecomendaciones>
  ```
  Consumido por la pantalla de la Tarea 5.

- [ ] **Step 1: Crear `actions/recomendaciones.ts`**

```ts
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
}

export type ResultadoRecomendaciones = {
  partido: {
    id: string
    fecha: string
    hora: string | null
    categoria: string
    categoria_minima_referee: string
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
      'id, fecha, hora, categoria, categoria_minima_referee, complejidad, liga_id, club_local_id, club_visita_id, ' +
        'club_local:club_local_id(nombre), club_visita:club_visita_id(nombre)'
    )
    .eq('id', partidoId)
    .single()
  if (partidoError || !partido) throw new Error('Partido no encontrado.')

  const [{ data: cfgFila }, { data: escalafon }, { data: referees }] = await Promise.all([
    db.from('configuracion_scoring').select('*').eq('liga_id', partido.liga_id).maybeSingle(),
    db.from('categoria_referee').select('nombre, orden'),
    db
      .from('referee')
      .select('id, nombre, categoria, club_id, region_id, activo, club:club_id(nombre)')
      .eq('activo', true),
  ])

  const config = cfgFila ? configDesdeFila(cfgFila as Record<string, number>) : CONFIG_POR_DEFECTO
  const ordenPorCategoria = new Map((escalafon ?? []).map((c) => [c.nombre, c.orden]))
  const ordenMinima = ordenPorCategoria.get(partido.categoria_minima_referee) ?? 0

  // Referees de la región de la liga del partido.
  const { data: ligaRow } = await db.from('liga').select('region_id').eq('id', partido.liga_id).single()
  const regionId = ligaRow?.region_id
  const refsRegion = (referees ?? []).filter((r) => r.region_id === regionId)
  const refIds = refsRegion.map((r) => r.id)

  const { data: evaluaciones } = await db
    .from('evaluacion')
    .select('referee_id, tipo, valor, fecha')
    .in('referee_id', refIds.length > 0 ? refIds : ['00000000-0000-0000-0000-000000000000'])

  const evalsPorReferee = new Map<string, EvaluacionInput[]>()
  for (const e of evaluaciones ?? []) {
    const arr = evalsPorReferee.get(e.referee_id) ?? []
    arr.push({ tipo: e.tipo as TipoEvaluacion, valor: Number(e.valor), fecha: e.fecha })
    evalsPorReferee.set(e.referee_id, arr)
  }

  // Disponibilidad: el partido es a `fecha` `hora`; el referee está disponible si tiene
  // una ventana `disponible=true` que cubre ese instante y ninguna `disponible=false` que lo pise.
  const instante = new Date(`${partido.fecha}T${partido.hora ?? '00:00'}:00`).toISOString()
  const { data: ventanas } = await db
    .from('disponibilidad')
    .select('referee_id, fecha_inicio, fecha_fin, disponible')
    .in('referee_id', refIds.length > 0 ? refIds : ['00000000-0000-0000-0000-000000000000'])

  function estaDisponible(refereeId: string): boolean {
    const propias = (ventanas ?? []).filter((v) => v.referee_id === refereeId)
    const cubren = propias.filter((v) => v.fecha_inicio <= instante && v.fecha_fin >= instante)
    if (cubren.length === 0) return false
    // Si alguna ventana que cubre el instante es disponible=false, gana la excepción.
    return !cubren.some((v) => v.disponible === false) && cubren.some((v) => v.disponible === true)
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
      club_nombre: (r.club as { nombre: string } | null)?.nombre ?? null,
      categoria: r.categoria,
      disponible: estaDisponible(r.id),
      alertaCategoria: ordenRef < ordenMinima,
      perteneceAClub,
      score,
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
      complejidad: partido.complejidad,
      club_local: (partido.club_local as { nombre: string } | null)?.nombre ?? '',
      club_visita: (partido.club_visita as { nombre: string } | null)?.nombre ?? '',
    },
    recomendaciones,
    noDisponibles,
  }
}
```

- [ ] **Step 2: Verificar que compila y la suite no regresiona**

Run: `npx vitest run`
Expected: todos los tests pasan (sin tests nuevos en esta tarea; se verifica que no rompió imports).

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add actions/recomendaciones.ts
git commit -m "feat(recomendaciones): add recomendarReferees service-role aggregation action"
```

---

### Task 5: Pantalla de detalle de partido + recomendaciones

**Files:**
- Create: `components/fixture/TablaRecomendaciones.tsx`, `app/(app)/fixture/[partidoId]/page.tsx`
- Modify: `app/(app)/fixture/page.tsx` (hacer cada fila de la tabla un link a `/fixture/[partidoId]`)

**Interfaces:**
- Consumes: `recomendarReferees` + tipos (Tarea 4).
- Produces: ruta `/fixture/[partidoId]` — consumida por Fase 7 (que agrega el botón de confirmar designación en esta misma pantalla).

- [ ] **Step 1: Crear `components/fixture/TablaRecomendaciones.tsx`**

```tsx
'use client'

import { useState } from 'react'
import type { RecomendacionReferee } from '@/actions/recomendaciones'

function BadgeDesglose({ rec }: { rec: RecomendacionReferee }) {
  const d = rec.score.desglose
  return (
    <div className="flex flex-col gap-1 rounded bg-background p-2 text-xs text-muted">
      <div>Score base: {d.scoreBase.toFixed(1)}</div>
      {Object.entries(d.aportePorTipo).map(([tipo, aporte]) => (
        <div key={tipo}>
          {tipo}: valor {d.valorPorTipo[tipo as keyof typeof d.valorPorTipo]?.toFixed(1)} · peso{' '}
          {d.pesosUsados[tipo as keyof typeof d.pesosUsados].toFixed(2)} · aporte {aporte.toFixed(2)}
        </div>
      ))}
      {d.tiposExcluidos.length > 0 && <div>Sin evaluaciones de: {d.tiposExcluidos.join(', ')}</div>}
      {d.ajustePorComplejidad && <div>Ajuste por alta complejidad aplicado.</div>}
      {d.penalizacionClub && <div>Penalización por pertenecer a un club del partido.</div>}
    </div>
  )
}

export function TablaRecomendaciones({
  recomendaciones,
  noDisponibles,
}: {
  recomendaciones: RecomendacionReferee[]
  noDisponibles: RecomendacionReferee[]
}) {
  const [expandido, setExpandido] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <table className="w-full rounded-lg border border-border bg-surface text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th className="px-4 py-2">#</th>
            <th className="px-4 py-2">Referee</th>
            <th className="px-4 py-2">Club</th>
            <th className="px-4 py-2">Categoría</th>
            <th className="px-4 py-2">Score</th>
            <th className="px-4 py-2">Alertas</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {recomendaciones.map((rec, i) => (
            <>
              <tr key={rec.referee_id} className="border-t border-border">
                <td className="px-4 py-2">{i + 1}</td>
                <td className="px-4 py-2">{rec.nombre}</td>
                <td className="px-4 py-2">{rec.club_nombre ?? '—'}</td>
                <td className="px-4 py-2">{rec.categoria}</td>
                <td className="px-4 py-2 font-semibold">{rec.score.scoreFinal.toFixed(1)}</td>
                <td className="px-4 py-2">
                  {rec.alertaCategoria && (
                    <span className="mr-1 rounded bg-amber-500/20 px-1 text-amber-600">categoría</span>
                  )}
                  {rec.perteneceAClub && (
                    <span className="rounded bg-amber-500/20 px-1 text-amber-600">club</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => setExpandido(expandido === rec.referee_id ? null : rec.referee_id)}
                    className="text-primary hover:underline"
                  >
                    {expandido === rec.referee_id ? 'ocultar' : 'desglose'}
                  </button>
                </td>
              </tr>
              {expandido === rec.referee_id && (
                <tr key={rec.referee_id + '-d'} className="border-t border-border">
                  <td colSpan={7} className="px-4 py-2">
                    <BadgeDesglose rec={rec} />
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>

      {noDisponibles.length > 0 && (
        <details className="rounded-lg border border-border bg-surface p-4 text-sm">
          <summary className="cursor-pointer text-muted">
            {noDisponibles.length} referee(s) no disponibles en el horario del partido
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-muted">
            {noDisponibles.map((r) => (
              <li key={r.referee_id}>
                {r.nombre} — {r.categoria}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Crear `app/(app)/fixture/[partidoId]/page.tsx`**

```tsx
import Link from 'next/link'
import { recomendarReferees } from '@/actions/recomendaciones'
import { TablaRecomendaciones } from '@/components/fixture/TablaRecomendaciones'

export default async function DetallePartidoPage({
  params,
}: {
  params: Promise<{ partidoId: string }>
}) {
  const { partidoId } = await params
  const data = await recomendarReferees(partidoId)
  const p = data.partido

  return (
    <div className="flex flex-col gap-6">
      <Link href="/fixture" className="text-sm text-primary hover:underline">
        ← Volver al fixture
      </Link>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h1 className="text-lg font-semibold">
          {p.club_local} vs {p.club_visita}
        </h1>
        <p className="text-sm text-muted">
          {p.fecha} {p.hora ?? ''} · {p.categoria} · categoría mínima: {p.categoria_minima_referee} ·
          complejidad: {p.complejidad ?? '—'}
        </p>
      </div>

      <h2 className="text-base font-semibold">Referees recomendados (puesto R1)</h2>
      <TablaRecomendaciones
        recomendaciones={data.recomendaciones}
        noDisponibles={data.noDisponibles}
      />
    </div>
  )
}
```

- [ ] **Step 3: Modificar `app/(app)/fixture/page.tsx` — hacer cada fila un link**

En el `<tbody>` de la tabla de partidos, envolver el contenido de la primera celda (fecha) en un `Link`, o hacer toda la fila clickeable. Cambio mínimo: reemplazar la celda de fecha

```tsx
<td className="px-4 py-2">{p.fecha}</td>
```

por

```tsx
<td className="px-4 py-2">
  <Link href={`/fixture/${p.id}`} className="text-primary hover:underline">
    {p.fecha}
  </Link>
</td>
```

y agregar `import Link from 'next/link'` al tope del archivo.

- [ ] **Step 4: Verificar manualmente**

Precondición: `npx supabase db reset` (aplica todas las migraciones + seeds), `npm run dev`.

1. Loguearse como `designador@rugby.local` / `RugbyDev123!`.
2. Importar un fixture mínimo desde `/fixture` (una fila, dos clubes de Lima con referees seedeados, ej. `ALU` vs `LRC`, fecha futura, categoría `Regional`).
3. Cargar disponibilidad para al menos un referee: como no hay UI de "disponibilidad de otro referee", insertar a mano con service-role:
   ```bash
   npx tsx -e "
   import 'dotenv/config'
   import { createClient } from '@supabase/supabase-js'
   const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
   const { data: ref } = await db.from('referee').select('id').eq('nombre','Abner Davalos').single()
   await db.from('disponibilidad').insert({ referee_id: ref!.id, fecha_inicio: '2026-01-01T00:00:00Z', fecha_fin: '2026-12-31T23:59:59Z', disponible: true })
   console.log('ventana creada para', ref!.id)
   "
   ```
4. Desde `/fixture`, clickear la fecha del partido → llega a `/fixture/<id>`.

Expected: se ve la cabecera del partido (clubes, fecha, categoría mínima, complejidad) y la tabla de recomendaciones. `Abner Davalos` aparece en la lista de recomendados (disponible), con score `5.0` (sin evaluaciones → score base neutro). Si `Abner Davalos` es del club `ALU` y el partido es `ALU` vs `LRC`, su fila muestra la alerta `club` y el score es `5.0 * 0.8 = 4.0`. El resto de los referees de Lima aparecen bajo "no disponibles".

5. Insertar una evaluación para ese referee y refrescar:
   ```bash
   npx tsx -e "
   import 'dotenv/config'
   import { createClient } from '@supabase/supabase-js'
   const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
   const { data: ref } = await db.from('referee').select('id').eq('nombre','Abner Davalos').single()
   await db.from('evaluacion').insert({ referee_id: ref!.id, tipo: 'performance', valor: 9, fecha: '2026-09-01' })
   console.log('evaluacion creada')
   "
   ```
   Expected: al refrescar `/fixture/<id>`, el score de `Abner Davalos` sube (base ≈ 9, con penalización de club ≈ 7.2 si aplica), y el desglose muestra `performance` con su aporte y `Sin evaluaciones de: fisico, videoanalisis, coaching`.

6. Limpiar: `docker exec supabase_db_rugby psql -U postgres -d postgres -c "delete from evaluacion; delete from disponibilidad; delete from partido where es_historico = false;"`

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/fixture/[partidoId]/page.tsx" components/fixture/TablaRecomendaciones.tsx "app/(app)/fixture/page.tsx"
git commit -m "feat(fixture): add match detail page with ranked referee recommendations"
```

---

### Task 6: Extender el script de RLS con `configuracion_scoring` y `evaluacion`

**Files:**
- Modify: `scripts/rls-test/run-rls-tests.ts`

**Interfaces:**
- Consumes: helpers existentes del script (`crearUsuarioDePrueba`, `iniciarSesionComo`, `limpiarUsuarioDePrueba`, `assert`), UUID de Lima `22222222-...` y de la Liga Metropolitana `33333333-...`.
- Produces: casos nuevos en `npm run test:rls`.

- [ ] **Step 1: Agregar casos al final de `main()` en `scripts/rls-test/run-rls-tests.ts`** (antes de la limpieza de usuarios y del resumen de fallos)

```ts
  // ---- configuracion_scoring ----
  const LIGA_METRO_ID = '33333333-3333-3333-3333-333333333333'

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
  const { error: cfgUpdateAdminError } = await clienteAdminRegionalLima
    .from('configuracion_scoring')
    .update({ umbral_complejidad_alta: 6 })
    .eq('liga_id', LIGA_METRO_ID)
  assert(
    cfgUpdateAdminError === null,
    `admin_regional de Lima modifica la config de su liga${cfgUpdateAdminError ? `: ${cfgUpdateAdminError.message}` : ''}`
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
  const { error: evalInsertError } = await clienteEvaluadorLima
    .from('evaluacion')
    .insert({ referee_id: refereeLima!.id, tipo: 'performance', valor: 8, fecha: '2026-09-01' })
  assert(
    evalInsertError === null,
    `evaluador de Lima inserta evaluación de un referee de su región${evalInsertError ? `: ${evalInsertError.message}` : ''}`
  )

  console.log('Caso: designador de Lima NO puede INSERTAR una evaluación')
  const { error: evalInsertDesignadorError } = await clienteDesignadorLima
    .from('evaluacion')
    .insert({ referee_id: refereeLima!.id, tipo: 'fisico', valor: 5, fecha: '2026-09-01' })
  assert(
    evalInsertDesignadorError !== null,
    'designador de Lima no puede insertar evaluaciones (RLS lo bloquea)'
  )

  await admin.from('evaluacion').delete().eq('referee_id', refereeLima!.id)
```

**Nota:** este bloque asume un usuario `evaluador` de Lima. Si el script todavía no lo crea, agregar junto a los otros `crearUsuarioDePrueba` del principio de `main()`:

```ts
  const emailEvaluadorLima = `evaluador-lima-${sufijo}@test.local`
  await crearUsuarioDePrueba({ email: emailEvaluadorLima, password, rol: 'evaluador', pais_id: null, region_id: LIMA_ID })
```

y su `limpiarUsuarioDePrueba(emailEvaluadorLima)` al final.

- [ ] **Step 2: Correr y verificar**

Run: `npx supabase db reset && npm run test:rls`
Expected: `TODOS LOS CASOS PASARON`, código de salida 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/rls-test/run-rls-tests.ts
git commit -m "test: extend RLS script with configuracion_scoring and evaluacion cases"
```

---

## Self-review (cobertura vs. spec §6)

| Requisito spec §6 | Task |
|---|---|
| Filtro duro: disponibilidad horaria | Task 4 (`estaDisponible`, separa `recomendaciones` de `noDisponibles`) |
| Filtro blando con alerta: categoría mínima | Task 1 (escalafón) + Task 4 (`alertaCategoria`) + Task 5 (badge) |
| Score base: promedio ponderado por tipo con decaimiento exponencial | Task 3 (`calcularScore`, tests de decaimiento y renormalización) |
| Tipo sin evaluaciones → excluir y renormalizar | Task 3 (`tiposPresentes` / `pesosUsados`) |
| Ajuste por complejidad → set de pesos alternativo | Task 3 (`ajustePorComplejidad`) + Task 2 (columnas `_alta`) |
| Penalización por club (no exclusión) | Task 3 (`factorPenalizacionClub`) + Task 4 (`perteneceAClub`) |
| Resultado: lista rankeada con score final y desglose completo | Task 4 (orden por `scoreFinal`) + Task 5 (`TablaRecomendaciones` + `BadgeDesglose`) |
| Config por liga (pesos, umbral, penalización, decaimiento, `evaluacion_bloqueante`) | Task 2 (`configuracion_scoring` + seed) |
| Dato "designaciones acumuladas en la temporada" | **Diferido a Fase 7** (necesita la tabla `designacion`) — anotado en Global Constraints |
| Botón confirmar/reasignar en el detalle de partido | **Fase 7** (esta fase deja la pantalla lista para recibirlo) |

## Al terminar

Con esto queda el motor de recomendación funcionando end-to-end: config por liga, función pura testeada, y la pantalla de detalle de partido con la lista rankeada. El siguiente checkpoint es la **Fase 7** (flujo de designación: `designacion` + `puesto`, confirmar/reasignar sobre esta misma pantalla, aceptación/rechazo del referee, job de 48h, emails) — no se empieza hasta que este plan esté revisado y mergeado a `feature/plataforma-fundacion`.
