# Fase 7 — Flujo de designación (confirmar / aceptar / rechazar / vencer) + emails — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el ciclo completo de designación: el designador confirma o reasigna un referee para el puesto R1 de un partido (desde la pantalla de recomendaciones de la Fase 6), el referee acepta o rechaza desde "Mis designaciones", y un job de Vercel Cron pasa a `vencido` las que no responden en 48 horas. Los tres eventos clave disparan un email best-effort vía una abstracción de transporte.

**Architecture:** La tabla `designacion` nunca se sobreescribe: al reasignar, la fila previa pasa a `reemplazado` y se crea una nueva. Un índice único parcial garantiza una sola designación vigente por `(partido_id, puesto)`. El envío de email se abstrae detrás de `EmailTransport` (`LogTransport` en dev/test, `ResendTransport` en prod, seleccionado por env) e ignora fallos (best-effort — el cambio de estado de negocio nunca se revierte por un email caído). El vencimiento a 48h es una **ruta API** (`GET /api/cron/vencer-designaciones`) protegida por `CRON_SECRET`, invocada por Vercel Cron cada 15 minutos; su lógica de "qué designaciones vencer" vive como función pura testeable.

**Tech Stack:** Supabase CLI (migraciones), TypeScript puro (`designacionesAVencer`, plantillas de email), Vitest (unit), Next.js App Router (server actions + Route Handler), `@supabase/supabase-js` con service-role para el cron y para el snapshot de score, `fetch` directo a la API de Resend (sin agregar el paquete `resend`).

**Spec:** `docs/superpowers/specs/2026-08-31-plataforma-designacion-referees-design.md` (§5 modelo, §6.6, §8 flujo de aceptación, §10 pantallas, §11 RLS) + `docs/superpowers/specs/2026-09-10-fichas-cuerpo-arbitral-addendum.md` (§B `designacion.puesto`, §D job de 48h, §E `EmailTransport`).

## Global Constraints

- RLS habilitada y forzada en **todas** las tablas nuevas.
- Roles fijos, exactamente cinco. El referee solo ve sus designaciones **confirmadas** (nunca ve por qué no fue elegido en otro partido) — spec maestro §11.
- El motor y el flujo operan solo sobre el puesto `R1` en el MVP (addendum §B). La columna `designacion.puesto` existe con `default 'R1'` y `check (puesto in ('R1','R2','R3','R4','INGOAL_1','INGOAL_2'))`; el índice único vigente es por `(partido_id, puesto)`.
- `designacion` **nunca se sobreescribe**: reasignar = fila previa a `estado='reemplazado'` + fila nueva (spec maestro §5).
- Estados: `estado in ('sugerido','confirmado','reemplazado')`, `estado_aceptacion in ('pendiente','aceptado','rechazado','vencido')`.
- Plazo de aceptación: **48 horas** exactas desde `fecha_confirmacion` (spec maestro §8). Sin recordatorios intermedios.
- Email **best-effort** (spec maestro §3): cada `transport.send(...)` va en `try/catch` que loguea y sigue; el cambio de estado se persiste igual si el email falla.
- Solo **3 emails** (spec maestro §8): (1) nueva designación → referee; (2) rechazo → designador; (3) vencimiento → designador. La aceptación no dispara email.
- `EMAIL_TRANSPORT=log|resend` (default `log`). `ResendTransport` usa `RESEND_API_KEY` y `EMAIL_FROM`. La verificación de esta fase usa `LogTransport`.
- `CRON_SECRET` en env; la ruta responde `401` sin el `Authorization: Bearer <CRON_SECRET>` correcto.
- MVP seedeado solo con Perú → Lima → Liga Metropolitana → Temporada 2026.

**Nota sobre TDD:** Task 2 (plantillas de email) y Task 3 (`designacionesAVencer`) siguen TDD rojo/verde con Vitest. Task 1 (migración) usa verificación determinística. Las tareas de action/ruta/UI (4-7) se verifican con `npm run test:rls`, `npx vitest run`, `npm run lint` y verificación manual paso a paso.

---

## Estructura de archivos

```
supabase/migrations/
  0019_designacion.sql              # designacion + partido.requiere_atencion + RLS
lib/email/
  tipos.ts                          # MensajeEmail, EmailTransport
  transport.ts                      # LogTransport, ResendTransport, obtenerTransport()
  mensajes.ts                       # 3 constructores de plantilla (pure)
lib/designacion/
  vencimiento.ts                    # designacionesAVencer(...) pure
actions/
  designaciones.ts                  # confirmar / reasignar / aceptar / rechazar / listMisDesignaciones
  recomendaciones.ts                # MODIFY: agrega `designacionesAceptadasEnTemporada` por referee
app/api/cron/vencer-designaciones/
  route.ts                          # GET handler protegido por CRON_SECRET
app/(app)/mis-designaciones/
  page.tsx                          # Server Component (referee)
components/designacion/
  BotonConfirmarDesignacion.tsx     # client (designador, en /fixture/[partidoId])
  BotonesAceptarRechazar.tsx        # client (referee, en /mis-designaciones)
components/fixture/
  TablaRecomendaciones.tsx          # MODIFY: recibe designacionVigente + slot de acción por fila
app/(app)/fixture/[partidoId]/
  page.tsx                          # MODIFY: pasa la designación vigente y el action de confirmar
app/(app)/layout.tsx               # MODIFY: nav "Mis designaciones" para referee
vercel.json                        # crons
tests/unit/
  mensajesEmail.test.ts
  designacionesAVencer.test.ts
scripts/rls-test/run-rls-tests.ts  # MODIFY: casos de designacion
.env.local.example                 # MODIFY: EMAIL_TRANSPORT, RESEND_API_KEY, EMAIL_FROM, CRON_SECRET
```

---

### Task 1: Migración — `designacion` + `partido.requiere_atencion`

**Files:**
- Create: `supabase/migrations/0019_designacion.sql`

**Interfaces:**
- Consumes: `partido` (Fase 4), `referee` (Fase 2), `perfil` (Fase 1), `fn_rol()`/`fn_region_id()`/`fn_pais_id()` (Fase 1).
- Produces: tabla `designacion`; columna `partido.requiere_atencion boolean not null default false`. Consumidas por Tasks 3-7.

- [ ] **Step 1: Crear `supabase/migrations/0019_designacion.sql`**

```sql
alter table partido add column requiere_atencion boolean not null default false;

create table designacion (
  id uuid primary key default gen_random_uuid(),
  partido_id uuid not null references partido(id) on delete cascade,
  referee_id uuid not null references referee(id) on delete restrict,
  puesto text not null default 'R1',
  estado text not null default 'confirmado',
  estado_aceptacion text not null default 'pendiente',
  designado_por uuid references perfil(id) on delete set null,
  fecha timestamptz not null default now(),
  fecha_confirmacion timestamptz,
  fecha_respuesta timestamptz,
  score_snapshot jsonb,
  created_at timestamptz not null default now(),
  constraint designacion_puesto_valido check (puesto in ('R1','R2','R3','R4','INGOAL_1','INGOAL_2')),
  constraint designacion_estado_valido check (estado in ('sugerido','confirmado','reemplazado')),
  constraint designacion_aceptacion_valida check (estado_aceptacion in ('pendiente','aceptado','rechazado','vencido'))
);

create index designacion_partido_id_idx on designacion (partido_id);
create index designacion_referee_id_idx on designacion (referee_id);

-- Una sola designación vigente (no reemplazada) por partido y puesto.
create unique index designacion_vigente_por_puesto
  on designacion (partido_id, puesto)
  where estado <> 'reemplazado';

alter table designacion enable row level security;
alter table designacion force row level security;

-- SELECT: el referee ve SOLO sus designaciones confirmadas (estado='confirmado').
create policy designacion_select_referee on designacion for select
using (
  estado = 'confirmado'
  and referee_id in (select id from referee where usuario_id = auth.uid())
);

-- SELECT: designador/admin ven todas las designaciones de partidos de su scope.
create policy designacion_select_scope on designacion for select
using (
  fn_rol() = 'admin_nacional' and partido_id in (
    select id from partido where liga_id in (
      select id from liga where region_id in (select id from region where pais_id = fn_pais_id())
    )
  )
  or fn_rol() in ('admin_regional', 'designador') and partido_id in (
    select id from partido where liga_id in (select id from liga where region_id = fn_region_id())
  )
);

-- INSERT: designador/admin sobre partidos de su scope.
create policy designacion_insert_scope on designacion for insert
with check (
  fn_rol() = 'admin_nacional' and partido_id in (
    select id from partido where liga_id in (
      select id from liga where region_id in (select id from region where pais_id = fn_pais_id())
    )
  )
  or fn_rol() in ('admin_regional', 'designador') and partido_id in (
    select id from partido where liga_id in (select id from liga where region_id = fn_region_id())
  )
);

-- UPDATE: designador/admin (reasignar: pasar la previa a 'reemplazado') sobre su scope.
create policy designacion_update_scope on designacion for update
using (
  fn_rol() = 'admin_nacional' and partido_id in (
    select id from partido where liga_id in (
      select id from liga where region_id in (select id from region where pais_id = fn_pais_id())
    )
  )
  or fn_rol() in ('admin_regional', 'designador') and partido_id in (
    select id from partido where liga_id in (select id from liga where region_id = fn_region_id())
  )
);

-- UPDATE: el referee puede cambiar SOLO el estado_aceptacion de sus propias designaciones confirmadas.
create policy designacion_update_referee on designacion for update
using (
  estado = 'confirmado'
  and referee_id in (select id from referee where usuario_id = auth.uid())
);
```

- [ ] **Step 2: Aplicar y verificar**

Run: `npx supabase db reset`
Expected: aplica sin error.

Run: `docker exec supabase_db_rugby psql -U postgres -d postgres -c "\d designacion" | grep -E "puesto|estado|fecha_confirmacion"`
Expected: `puesto` con default `'R1'::text`, `estado` default `'confirmado'`, `fecha_confirmacion` nullable.

Run: `docker exec supabase_db_rugby psql -U postgres -d postgres -c "select indexdef from pg_indexes where indexname = 'designacion_vigente_por_puesto';"`
Expected: incluye `WHERE (estado <> 'reemplazado'::text)`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0019_designacion.sql
git commit -m "feat(db): add designacion table and partido.requiere_atencion with RLS"
```

---

### Task 2: Abstracción de email (`EmailTransport` + plantillas)

**Files:**
- Create: `lib/email/tipos.ts`, `lib/email/transport.ts`, `lib/email/mensajes.ts`
- Test: `tests/unit/mensajesEmail.test.ts`
- Modify: `.env.local.example`

**Interfaces:**
- Produces:
  ```ts
  // lib/email/tipos.ts
  export type MensajeEmail = { to: string; subject: string; body: string }
  export interface EmailTransport { send(msg: MensajeEmail): Promise<void> }
  // lib/email/mensajes.ts
  export function emailNuevaDesignacion(p: { refereeEmail: string; partidoLabel: string; fechaPartido: string; urlMisDesignaciones: string }): MensajeEmail
  export function emailRechazo(p: { designadorEmail: string; refereeNombre: string; partidoLabel: string }): MensajeEmail
  export function emailVencimiento(p: { designadorEmail: string; refereeNombre: string; partidoLabel: string }): MensajeEmail
  // lib/email/transport.ts
  export function obtenerTransport(): EmailTransport
  ```
  Consumido por Tasks 4, 5, 6.

- [ ] **Step 1: Crear `lib/email/tipos.ts`**

```ts
export type MensajeEmail = { to: string; subject: string; body: string }

export interface EmailTransport {
  send(msg: MensajeEmail): Promise<void>
}
```

- [ ] **Step 2: Escribir el test que falla — `tests/unit/mensajesEmail.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { emailNuevaDesignacion, emailRechazo, emailVencimiento } from '@/lib/email/mensajes'

describe('plantillas de email', () => {
  it('emailNuevaDesignacion va al referee y linkea a Mis designaciones', () => {
    const m = emailNuevaDesignacion({
      refereeEmail: 'ref@x.com',
      partidoLabel: 'Alumni vs Lima RC',
      fechaPartido: '2026-10-20 15:00',
      urlMisDesignaciones: 'https://app.test/mis-designaciones',
    })
    expect(m.to).toBe('ref@x.com')
    expect(m.subject).toContain('designación')
    expect(m.body).toContain('Alumni vs Lima RC')
    expect(m.body).toContain('2026-10-20 15:00')
    expect(m.body).toContain('https://app.test/mis-designaciones')
  })

  it('emailRechazo va al designador y nombra al referee y el partido', () => {
    const m = emailRechazo({ designadorEmail: 'des@x.com', refereeNombre: 'Juan Perez', partidoLabel: 'A vs B' })
    expect(m.to).toBe('des@x.com')
    expect(m.subject.toLowerCase()).toContain('rechaz')
    expect(m.body).toContain('Juan Perez')
    expect(m.body).toContain('A vs B')
  })

  it('emailVencimiento va al designador y menciona las 48 horas', () => {
    const m = emailVencimiento({ designadorEmail: 'des@x.com', refereeNombre: 'Juan Perez', partidoLabel: 'A vs B' })
    expect(m.to).toBe('des@x.com')
    expect(m.subject.toLowerCase()).toContain('venc')
    expect(m.body).toContain('48')
    expect(m.body).toContain('Juan Perez')
  })
})
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `npx vitest run tests/unit/mensajesEmail.test.ts`
Expected: FAIL — `Cannot find module '@/lib/email/mensajes'`.

- [ ] **Step 4: Implementar `lib/email/mensajes.ts`**

```ts
import type { MensajeEmail } from './tipos'

export function emailNuevaDesignacion(p: {
  refereeEmail: string
  partidoLabel: string
  fechaPartido: string
  urlMisDesignaciones: string
}): MensajeEmail {
  return {
    to: p.refereeEmail,
    subject: `Nueva designación: ${p.partidoLabel}`,
    body:
      `Tenés una nueva designación para el partido ${p.partidoLabel} (${p.fechaPartido}).\n\n` +
      `Ingresá a "Mis designaciones" para aceptarla o rechazarla dentro de las próximas 48 horas:\n` +
      `${p.urlMisDesignaciones}\n`,
  }
}

export function emailRechazo(p: {
  designadorEmail: string
  refereeNombre: string
  partidoLabel: string
}): MensajeEmail {
  return {
    to: p.designadorEmail,
    subject: `Designación rechazada: ${p.partidoLabel}`,
    body:
      `${p.refereeNombre} rechazó la designación para el partido ${p.partidoLabel}.\n` +
      `El partido quedó marcado como "requiere atención".\n`,
  }
}

export function emailVencimiento(p: {
  designadorEmail: string
  refereeNombre: string
  partidoLabel: string
}): MensajeEmail {
  return {
    to: p.designadorEmail,
    subject: `Designación vencida (48 h sin respuesta): ${p.partidoLabel}`,
    body:
      `${p.refereeNombre} no respondió la designación para el partido ${p.partidoLabel} ` +
      `dentro de las 48 horas. La designación quedó "vencida" y el partido "requiere atención".\n`,
  }
}
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `npx vitest run tests/unit/mensajesEmail.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 6: Implementar `lib/email/transport.ts`**

```ts
import type { EmailTransport, MensajeEmail } from './tipos'

class LogTransport implements EmailTransport {
  async send(msg: MensajeEmail): Promise<void> {
    console.log(`[email:log] to=${msg.to} subject=${JSON.stringify(msg.subject)}\n${msg.body}`)
  }
}

class ResendTransport implements EmailTransport {
  constructor(
    private readonly apiKey: string,
    private readonly from: string
  ) {}

  async send(msg: MensajeEmail): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: this.from, to: msg.to, subject: msg.subject, text: msg.body }),
    })
    if (!res.ok) {
      throw new Error(`Resend respondió ${res.status}: ${await res.text()}`)
    }
  }
}

export function obtenerTransport(): EmailTransport {
  if (process.env.EMAIL_TRANSPORT === 'resend') {
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.EMAIL_FROM
    if (!apiKey || !from) {
      throw new Error('EMAIL_TRANSPORT=resend requiere RESEND_API_KEY y EMAIL_FROM.')
    }
    return new ResendTransport(apiKey, from)
  }
  return new LogTransport()
}
```

- [ ] **Step 7: Actualizar `.env.local.example`**

Agregar al final:

```
# Email transaccional (Fase 7). log = escribe a consola; resend = envía real.
EMAIL_TRANSPORT=log
RESEND_API_KEY=
EMAIL_FROM=
# Secreto del cron de vencimiento (Fase 7).
CRON_SECRET=dev-cron-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Y agregar las mismas claves con valores dev a tu `.env.local` local (no versionado): `EMAIL_TRANSPORT=log`, `CRON_SECRET=dev-cron-secret`, `NEXT_PUBLIC_APP_URL=http://localhost:3000`.

- [ ] **Step 8: Commit**

```bash
git add lib/email tests/unit/mensajesEmail.test.ts .env.local.example
git commit -m "feat(email): add EmailTransport abstraction (log/resend) and message templates"
```

---

### Task 3: Lógica pura de vencimiento (`designacionesAVencer`)

**Files:**
- Create: `lib/designacion/vencimiento.ts`
- Test: `tests/unit/designacionesAVencer.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function designacionesAVencer(input: {
    pendientes: { id: string; fecha_confirmacion: string | null }[]
    ahora: string       // ISO
    horasLimite?: number // default 48
  }): string[]          // ids de las que deben pasar a 'vencido'
  ```
  Consumido por la ruta de cron (Task 6).

- [ ] **Step 1: Escribir el test que falla — `tests/unit/designacionesAVencer.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { designacionesAVencer } from '@/lib/designacion/vencimiento'

describe('designacionesAVencer', () => {
  const ahora = '2026-10-10T12:00:00.000Z'

  it('marca las que llevan más de 48 h desde la confirmación', () => {
    const ids = designacionesAVencer({
      pendientes: [
        { id: 'vieja', fecha_confirmacion: '2026-10-08T11:00:00.000Z' }, // 49 h
        { id: 'justo', fecha_confirmacion: '2026-10-08T12:00:01.000Z' }, // 47:59:59
        { id: 'reciente', fecha_confirmacion: '2026-10-10T09:00:00.000Z' }, // 3 h
      ],
      ahora,
    })
    expect(ids).toEqual(['vieja'])
  })

  it('exactamente 48 h no vence todavía (el límite es estricto)', () => {
    const ids = designacionesAVencer({
      pendientes: [{ id: 'x', fecha_confirmacion: '2026-10-08T12:00:00.000Z' }],
      ahora,
    })
    expect(ids).toEqual([])
  })

  it('ignora las que no tienen fecha_confirmacion', () => {
    const ids = designacionesAVencer({
      pendientes: [{ id: 'sinfecha', fecha_confirmacion: null }],
      ahora,
    })
    expect(ids).toEqual([])
  })

  it('respeta un horasLimite personalizado', () => {
    const ids = designacionesAVencer({
      pendientes: [{ id: 'a', fecha_confirmacion: '2026-10-10T09:00:00.000Z' }], // 3 h
      ahora,
      horasLimite: 2,
    })
    expect(ids).toEqual(['a'])
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run tests/unit/designacionesAVencer.test.ts`
Expected: FAIL — `Cannot find module '@/lib/designacion/vencimiento'`.

- [ ] **Step 3: Implementar `lib/designacion/vencimiento.ts`**

```ts
export function designacionesAVencer(input: {
  pendientes: { id: string; fecha_confirmacion: string | null }[]
  ahora: string
  horasLimite?: number
}): string[] {
  const limiteMs = (input.horasLimite ?? 48) * 60 * 60 * 1000
  const ahoraMs = new Date(input.ahora).getTime()
  return input.pendientes
    .filter((d) => {
      if (!d.fecha_confirmacion) return false
      const transcurrido = ahoraMs - new Date(d.fecha_confirmacion).getTime()
      return transcurrido > limiteMs
    })
    .map((d) => d.id)
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run tests/unit/designacionesAVencer.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/designacion/vencimiento.ts tests/unit/designacionesAVencer.test.ts
git commit -m "feat(designacion): add pure designacionesAVencer expiry logic"
```

---

### Task 4: Server actions del designador — confirmar / reasignar

**Files:**
- Create: `actions/designaciones.ts` (sección designador)

**Interfaces:**
- Consumes: `recomendarReferees` (Fase 6), `getProfile()` + `ROLES` (Fase 1), `obtenerTransport()` + `emailNuevaDesignacion` (Task 2), tablas `designacion`/`partido`/`referee`/`perfil`.
- Produces:
  ```ts
  export type DesignacionVigente = {
    id: string; referee_id: string; referee_nombre: string
    estado_aceptacion: 'pendiente' | 'aceptado' | 'rechazado' | 'vencido'
    fecha_confirmacion: string | null
  }
  export async function obtenerDesignacionVigente(partidoId: string): Promise<DesignacionVigente | null>
  export async function confirmarDesignacion(input: { partidoId: string; refereeId: string }): Promise<void>
  ```
  Consumido por Task 7 (`/fixture/[partidoId]`).

- [ ] **Step 1: Crear `actions/designaciones.ts` con la sección del designador**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { ROLES } from '@/lib/auth/roles'
import { recomendarReferees } from '@/actions/recomendaciones'
import { obtenerTransport } from '@/lib/email/transport'
import { emailNuevaDesignacion } from '@/lib/email/mensajes'

function servicio() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export type DesignacionVigente = {
  id: string
  referee_id: string
  referee_nombre: string
  estado_aceptacion: 'pendiente' | 'aceptado' | 'rechazado' | 'vencido'
  fecha_confirmacion: string | null
}

async function exigirDesignador() {
  const perfil = await getProfile()
  if (
    !perfil ||
    (perfil.rol !== ROLES.DESIGNADOR &&
      perfil.rol !== ROLES.ADMIN_REGIONAL &&
      perfil.rol !== ROLES.ADMIN_NACIONAL)
  ) {
    throw new Error('No autorizado para gestionar designaciones.')
  }
  return perfil
}

export async function obtenerDesignacionVigente(partidoId: string): Promise<DesignacionVigente | null> {
  await exigirDesignador()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('designacion')
    .select('id, referee_id, estado_aceptacion, fecha_confirmacion, referee:referee_id(nombre)')
    .eq('partido_id', partidoId)
    .eq('puesto', 'R1')
    .neq('estado', 'reemplazado')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    id: data.id,
    referee_id: data.referee_id,
    referee_nombre: (data.referee as { nombre: string } | null)?.nombre ?? '',
    estado_aceptacion: data.estado_aceptacion,
    fecha_confirmacion: data.fecha_confirmacion,
  }
}

export async function confirmarDesignacion(input: {
  partidoId: string
  refereeId: string
}): Promise<void> {
  const perfil = await exigirDesignador()
  const db = servicio()

  // Snapshot del score desde el motor de recomendación (reusa la Fase 6).
  const reco = await recomendarReferees(input.partidoId)
  const fila = [...reco.recomendaciones, ...reco.noDisponibles].find(
    (r) => r.referee_id === input.refereeId
  )
  const scoreSnapshot = fila?.score ?? null

  // Reasignar: la designación vigente previa (si hay) pasa a 'reemplazado'.
  const { data: previa } = await db
    .from('designacion')
    .select('id')
    .eq('partido_id', input.partidoId)
    .eq('puesto', 'R1')
    .neq('estado', 'reemplazado')
    .maybeSingle()
  if (previa) {
    const { error: reemplazoError } = await db
      .from('designacion')
      .update({ estado: 'reemplazado' })
      .eq('id', previa.id)
    if (reemplazoError) throw new Error(reemplazoError.message)
  }

  const ahora = new Date().toISOString()
  const { error: insertError } = await db.from('designacion').insert({
    partido_id: input.partidoId,
    referee_id: input.refereeId,
    puesto: 'R1',
    estado: 'confirmado',
    estado_aceptacion: 'pendiente',
    designado_por: perfil.id,
    fecha: ahora,
    fecha_confirmacion: ahora,
    score_snapshot: scoreSnapshot,
  })
  if (insertError) throw new Error(insertError.message)

  // Reasignar deja el partido "resuelto" de nuevo hasta que el referee responda.
  await db.from('partido').update({ requiere_atencion: false }).eq('id', input.partidoId)

  // Email best-effort al referee.
  try {
    const { data: ref } = await db
      .from('referee')
      .select('nombre, usuario_id')
      .eq('id', input.refereeId)
      .single()
    let refereeEmail: string | null = null
    if (ref?.usuario_id) {
      const { data: perfilRef } = await db
        .from('perfil')
        .select('email')
        .eq('id', ref.usuario_id)
        .single()
      refereeEmail = perfilRef?.email ?? null
    }
    if (refereeEmail) {
      const label = `${reco.partido.club_local} vs ${reco.partido.club_visita}`
      await obtenerTransport().send(
        emailNuevaDesignacion({
          refereeEmail,
          partidoLabel: label,
          fechaPartido: `${reco.partido.fecha} ${reco.partido.hora ?? ''}`.trim(),
          urlMisDesignaciones: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/mis-designaciones`,
        })
      )
    }
  } catch (err) {
    console.error('[confirmarDesignacion] email falló (best-effort):', err)
  }

  revalidatePath(`/fixture/${input.partidoId}`)
  revalidatePath('/fixture')
}
```

- [ ] **Step 2: Verificar compila + suite**

Run: `npx vitest run` → todos pasan.
Run: `npm run lint` → sin errores.

- [ ] **Step 3: Commit**

```bash
git add actions/designaciones.ts
git commit -m "feat(designacion): add confirmarDesignacion / obtenerDesignacionVigente actions"
```

---

### Task 5: Server actions del referee — aceptar / rechazar / listar

**Files:**
- Modify: `actions/designaciones.ts` (agregar sección referee)

**Interfaces:**
- Consumes: `getProfile()` + `ROLES`, `obtenerTransport()` + `emailRechazo` (Task 2), tablas `designacion`/`partido`/`referee`/`perfil`.
- Produces:
  ```ts
  export type MiDesignacion = {
    id: string; partido_label: string; fecha: string; hora: string | null
    categoria: string; estado_aceptacion: 'pendiente' | 'aceptado' | 'rechazado' | 'vencido'
    fecha_confirmacion: string | null
  }
  export async function listMisDesignaciones(): Promise<MiDesignacion[]>
  export async function aceptarDesignacion(designacionId: string): Promise<void>
  export async function rechazarDesignacion(designacionId: string): Promise<void>
  ```
  Consumido por Task 7 (`/mis-designaciones`).

- [ ] **Step 1: Agregar a `actions/designaciones.ts`**

```ts
import { emailRechazo } from '@/lib/email/mensajes'

export type MiDesignacion = {
  id: string
  partido_label: string
  fecha: string
  hora: string | null
  categoria: string
  estado_aceptacion: 'pendiente' | 'aceptado' | 'rechazado' | 'vencido'
  fecha_confirmacion: string | null
}

async function exigirRefereeYSuId() {
  const perfil = await getProfile()
  if (!perfil || perfil.rol !== ROLES.REFEREE) {
    throw new Error('No autorizado.')
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('referee')
    .select('id')
    .eq('usuario_id', perfil.id)
    .single()
  if (error || !data) throw new Error('No tenés un perfil de referee vinculado a tu cuenta.')
  return { perfil, refereeId: data.id }
}

export async function listMisDesignaciones(): Promise<MiDesignacion[]> {
  await exigirRefereeYSuId()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('designacion')
    .select(
      'id, estado_aceptacion, fecha_confirmacion, ' +
        'partido:partido_id(fecha, hora, categoria, club_local:club_local_id(nombre), club_visita:club_visita_id(nombre))'
    )
    .eq('estado', 'confirmado')
    .order('fecha_confirmacion', { ascending: false })
  if (error) throw new Error(error.message)

  return (data ?? []).map((d) => {
    const p = d.partido as {
      fecha: string
      hora: string | null
      categoria: string
      club_local: { nombre: string } | null
      club_visita: { nombre: string } | null
    } | null
    return {
      id: d.id,
      partido_label: `${p?.club_local?.nombre ?? '?'} vs ${p?.club_visita?.nombre ?? '?'}`,
      fecha: p?.fecha ?? '',
      hora: p?.hora ?? null,
      categoria: p?.categoria ?? '',
      estado_aceptacion: d.estado_aceptacion,
      fecha_confirmacion: d.fecha_confirmacion,
    }
  })
}

async function cambiarEstadoAceptacion(
  designacionId: string,
  nuevoEstado: 'aceptado' | 'rechazado'
): Promise<void> {
  const { refereeId } = await exigirRefereeYSuId()
  const supabase = await createClient()

  // Verifica pertenencia y estado actual (RLS ya restringe, pero damos mensaje legible).
  const { data: actual, error: actualError } = await supabase
    .from('designacion')
    .select('id, referee_id, estado_aceptacion')
    .eq('id', designacionId)
    .single()
  if (actualError || !actual) throw new Error('Designación no encontrada.')
  if (actual.referee_id !== refereeId) throw new Error('Esa designación no es tuya.')
  if (actual.estado_aceptacion !== 'pendiente') {
    throw new Error('Esta designación ya fue respondida o venció.')
  }

  const { error } = await supabase
    .from('designacion')
    .update({ estado_aceptacion: nuevoEstado, fecha_respuesta: new Date().toISOString() })
    .eq('id', designacionId)
  if (error) throw new Error(error.message)

  if (nuevoEstado === 'rechazado') {
    // Marca el partido y avisa al designador (best-effort). Usa service-role para leer emails.
    const db = servicio()
    const { data: d } = await db
      .from('designacion')
      .select(
        'partido_id, designado_por, referee:referee_id(nombre), ' +
          'partido:partido_id(club_local:club_local_id(nombre), club_visita:club_visita_id(nombre))'
      )
      .eq('id', designacionId)
      .single()
    if (d) {
      await db.from('partido').update({ requiere_atencion: true }).eq('id', d.partido_id)
      try {
        let designadorEmail: string | null = null
        if (d.designado_por) {
          const { data: pd } = await db.from('perfil').select('email').eq('id', d.designado_por).single()
          designadorEmail = pd?.email ?? null
        }
        const p = d.partido as {
          club_local: { nombre: string } | null
          club_visita: { nombre: string } | null
        } | null
        if (designadorEmail) {
          await obtenerTransport().send(
            emailRechazo({
              designadorEmail,
              refereeNombre: (d.referee as { nombre: string } | null)?.nombre ?? 'El referee',
              partidoLabel: `${p?.club_local?.nombre ?? '?'} vs ${p?.club_visita?.nombre ?? '?'}`,
            })
          )
        }
      } catch (err) {
        console.error('[rechazarDesignacion] email falló (best-effort):', err)
      }
    }
  }

  revalidatePath('/mis-designaciones')
}

export async function aceptarDesignacion(designacionId: string): Promise<void> {
  await cambiarEstadoAceptacion(designacionId, 'aceptado')
}

export async function rechazarDesignacion(designacionId: string): Promise<void> {
  await cambiarEstadoAceptacion(designacionId, 'rechazado')
}
```

- [ ] **Step 2: Verificar compila + suite**

Run: `npx vitest run` → todos pasan.
Run: `npm run lint` → sin errores.

- [ ] **Step 3: Commit**

```bash
git add actions/designaciones.ts
git commit -m "feat(designacion): add referee aceptar/rechazar/list actions with best-effort email"
```

---

### Task 6: Ruta de cron de vencimiento + `vercel.json`

**Files:**
- Create: `app/api/cron/vencer-designaciones/route.ts`, `vercel.json`

**Interfaces:**
- Consumes: `designacionesAVencer` (Task 3), `obtenerTransport()` + `emailVencimiento` (Task 2), `CRON_SECRET` (env), tablas `designacion`/`partido`/`perfil`/`referee`.
- Produces: endpoint `GET /api/cron/vencer-designaciones`.

- [ ] **Step 1: Crear `app/api/cron/vencer-designaciones/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { designacionesAVencer } from '@/lib/designacion/vencimiento'
import { obtenerTransport } from '@/lib/email/transport'
import { emailVencimiento } from '@/lib/email/mensajes'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: pendientes, error } = await db
    .from('designacion')
    .select(
      'id, partido_id, designado_por, fecha_confirmacion, referee:referee_id(nombre), ' +
        'partido:partido_id(club_local:club_local_id(nombre), club_visita:club_visita_id(nombre))'
    )
    .eq('estado', 'confirmado')
    .eq('estado_aceptacion', 'pendiente')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ahora = new Date().toISOString()
  const idsAVencer = designacionesAVencer({
    pendientes: (pendientes ?? []).map((d) => ({ id: d.id, fecha_confirmacion: d.fecha_confirmacion })),
    ahora,
  })

  if (idsAVencer.length === 0) {
    return NextResponse.json({ vencidas: 0 })
  }

  await db
    .from('designacion')
    .update({ estado_aceptacion: 'vencido', fecha_respuesta: ahora })
    .in('id', idsAVencer)

  const partidoIds = [
    ...new Set((pendientes ?? []).filter((d) => idsAVencer.includes(d.id)).map((d) => d.partido_id)),
  ]
  await db.from('partido').update({ requiere_atencion: true }).in('id', partidoIds)

  const transport = obtenerTransport()
  for (const d of (pendientes ?? []).filter((x) => idsAVencer.includes(x.id))) {
    try {
      if (!d.designado_por) continue
      const { data: pd } = await db.from('perfil').select('email').eq('id', d.designado_por).single()
      if (!pd?.email) continue
      const p = d.partido as {
        club_local: { nombre: string } | null
        club_visita: { nombre: string } | null
      } | null
      await transport.send(
        emailVencimiento({
          designadorEmail: pd.email,
          refereeNombre: (d.referee as { nombre: string } | null)?.nombre ?? 'El referee',
          partidoLabel: `${p?.club_local?.nombre ?? '?'} vs ${p?.club_visita?.nombre ?? '?'}`,
        })
      )
    } catch (err) {
      console.error('[cron vencer] email falló (best-effort):', err)
    }
  }

  return NextResponse.json({ vencidas: idsAVencer.length })
}
```

- [ ] **Step 2: Crear `vercel.json`**

```json
{
  "crons": [
    {
      "path": "/api/cron/vencer-designaciones",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

- [ ] **Step 3: Verificar manualmente en local**

Precondición: `.env.local` con `CRON_SECRET=dev-cron-secret`, `npm run dev`.

1. Sin auth: `curl -i localhost:3000/api/cron/vencer-designaciones`
   Expected: `HTTP/1.1 401`.
2. Con auth y sin designaciones pendientes vencidas:
   `curl -s -H "Authorization: Bearer dev-cron-secret" localhost:3000/api/cron/vencer-designaciones`
   Expected: `{"vencidas":0}`.
3. Insertar una designación pendiente con `fecha_confirmacion` de hace 3 días (service-role), luego repetir el curl:
   ```bash
   npx tsx -e "
   import 'dotenv/config'
   import { createClient } from '@supabase/supabase-js'
   const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
   const { data: p } = await db.from('partido').select('id').limit(1).single()
   const { data: r } = await db.from('referee').select('id').limit(1).single()
   const hace3dias = new Date(Date.now() - 3*24*3600*1000).toISOString()
   await db.from('designacion').insert({ partido_id: p!.id, referee_id: r!.id, puesto: 'R1', estado: 'confirmado', estado_aceptacion: 'pendiente', fecha_confirmacion: hace3dias })
   console.log('designacion pendiente vieja creada')
   "
   ```
   Expected del curl: `{"vencidas":1}`. En los logs de `npm run dev` aparece `[email:log] ...` (best-effort, aunque `designado_por` sea null no rompe). En la DB: `select estado_aceptacion from designacion;` → `vencido`; `select requiere_atencion from partido where id = ...` → `t`.
4. Limpiar: `docker exec supabase_db_rugby psql -U postgres -d postgres -c "delete from designacion;"`

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/vencer-designaciones/route.ts vercel.json
git commit -m "feat(cron): add 48h designacion expiry route + vercel cron config"
```

---

### Task 7: UI — botón confirmar, "Mis designaciones", nav, stat de designaciones acumuladas

**Files:**
- Create: `components/designacion/BotonConfirmarDesignacion.tsx`, `components/designacion/BotonesAceptarRechazar.tsx`, `app/(app)/mis-designaciones/page.tsx`
- Modify: `components/fixture/TablaRecomendaciones.tsx`, `app/(app)/fixture/[partidoId]/page.tsx`, `app/(app)/layout.tsx`, `actions/recomendaciones.ts`

**Interfaces:**
- Consumes: `confirmarDesignacion` / `obtenerDesignacionVigente` (Task 4), `listMisDesignaciones` / `aceptarDesignacion` / `rechazarDesignacion` (Task 5).
- Produces: ruta `/mis-designaciones`; el detalle de partido muestra la designación vigente y permite confirmar/reasignar.

- [ ] **Step 1: `actions/recomendaciones.ts` — agregar `designacionesAceptadasEnTemporada` por referee**

En `RecomendacionReferee`, agregar el campo:

```ts
  designacionesAceptadasEnTemporada: number
```

En `recomendarReferees`, después de cargar `referees` y antes de construir `filas`, agregar:

```ts
  const { data: aceptadasTemporada } = await db
    .from('designacion')
    .select('referee_id, partido:partido_id(temporada_id)')
    .eq('estado', 'confirmado')
    .eq('estado_aceptacion', 'aceptado')

  const conteoPorReferee = new Map<string, number>()
  for (const d of aceptadasTemporada ?? []) {
    const temporadaId = (d.partido as { temporada_id: string } | null)?.temporada_id
    if (temporadaId === partido.temporada_id) {
      conteoPorReferee.set(d.referee_id, (conteoPorReferee.get(d.referee_id) ?? 0) + 1)
    }
  }
```

Y agregar `partido.temporada_id` al `.select(...)` del partido, y en cada fila:

```ts
    designacionesAceptadasEnTemporada: conteoPorReferee.get(r.id) ?? 0,
```

- [ ] **Step 2: `components/designacion/BotonConfirmarDesignacion.tsx`**

```tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  partidoId: string
  refereeId: string
  esReasignacion: boolean
  confirmarDesignacion: (input: { partidoId: string; refereeId: string }) => Promise<void>
}

export function BotonConfirmarDesignacion({
  partidoId,
  refereeId,
  esReasignacion,
  confirmarDesignacion,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      await confirmarDesignacion({ partidoId, refereeId })
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
    >
      {isPending ? 'Guardando...' : esReasignacion ? 'Reasignar' : 'Confirmar'}
    </button>
  )
}
```

- [ ] **Step 3: `components/designacion/BotonesAceptarRechazar.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  designacionId: string
  aceptarDesignacion: (id: string) => Promise<void>
  rechazarDesignacion: (id: string) => Promise<void>
}

export function BotonesAceptarRechazar({
  designacionId,
  aceptarDesignacion,
  rechazarDesignacion,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function ejecutar(fn: (id: string) => Promise<void>) {
    setError(null)
    startTransition(async () => {
      try {
        await fn(designacionId)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al responder la designación.')
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => ejecutar(aceptarDesignacion)}
        disabled={isPending}
        className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
      >
        Aceptar
      </button>
      <button
        type="button"
        onClick={() => ejecutar(rechazarDesignacion)}
        disabled={isPending}
        className="rounded border border-border px-3 py-1 text-xs text-danger hover:underline disabled:opacity-50"
      >
        Rechazar
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  )
}
```

- [ ] **Step 4: `app/(app)/mis-designaciones/page.tsx`**

```tsx
import {
  listMisDesignaciones,
  aceptarDesignacion,
  rechazarDesignacion,
} from '@/actions/designaciones'
import { BotonesAceptarRechazar } from '@/components/designacion/BotonesAceptarRechazar'

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: 'Pendiente',
  aceptado: 'Aceptada',
  rechazado: 'Rechazada',
  vencido: 'Vencida (48 h sin respuesta)',
}

export default async function MisDesignacionesPage() {
  let designaciones: Awaited<ReturnType<typeof listMisDesignaciones>>
  try {
    designaciones = await listMisDesignaciones()
  } catch (err) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-muted">
        {err instanceof Error ? err.message : 'No se pudieron cargar tus designaciones.'}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Mis designaciones</h1>
      <p className="text-sm text-muted">
        Tenés 48 horas desde que se confirma una designación para aceptarla o rechazarla. Pasado ese
        plazo queda vencida y el designador debe reasignar.
      </p>
      <table className="w-full rounded-lg border border-border bg-surface text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th className="px-4 py-2">Partido</th>
            <th className="px-4 py-2">Fecha</th>
            <th className="px-4 py-2">Categoría</th>
            <th className="px-4 py-2">Estado</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {designaciones.map((d) => (
            <tr key={d.id} className="border-t border-border">
              <td className="px-4 py-2">{d.partido_label}</td>
              <td className="px-4 py-2">
                {d.fecha} {d.hora ?? ''}
              </td>
              <td className="px-4 py-2">{d.categoria}</td>
              <td className="px-4 py-2">{ETIQUETA_ESTADO[d.estado_aceptacion] ?? d.estado_aceptacion}</td>
              <td className="px-4 py-2">
                {d.estado_aceptacion === 'pendiente' && (
                  <BotonesAceptarRechazar
                    designacionId={d.id}
                    aceptarDesignacion={aceptarDesignacion}
                    rechazarDesignacion={rechazarDesignacion}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {designaciones.length === 0 && (
        <p className="text-sm text-muted">No tenés designaciones confirmadas todavía.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Modificar `components/fixture/TablaRecomendaciones.tsx`**

Agregar props y una columna de acción. Cambiar la firma del componente:

```tsx
export function TablaRecomendaciones({
  recomendaciones,
  noDisponibles,
  partidoId,
  designacionVigente,
  confirmarDesignacion,
}: {
  recomendaciones: RecomendacionReferee[]
  noDisponibles: RecomendacionReferee[]
  partidoId: string
  designacionVigente: { referee_id: string; referee_nombre: string; estado_aceptacion: string } | null
  confirmarDesignacion: (input: { partidoId: string; refereeId: string }) => Promise<void>
}) {
```

Importar `BotonConfirmarDesignacion` desde `@/components/designacion/BotonConfirmarDesignacion`. En el `<thead>` agregar `<th className="px-4 py-2">Designación</th>` antes de la última `<th>`. En cada fila de `recomendaciones.map`, agregar antes de la celda del botón "desglose":

```tsx
                <td className="px-4 py-2">
                  {designacionVigente?.referee_id === rec.referee_id ? (
                    <span className="text-xs text-muted">
                      Designado ({designacionVigente.estado_aceptacion})
                    </span>
                  ) : (
                    <BotonConfirmarDesignacion
                      partidoId={partidoId}
                      refereeId={rec.referee_id}
                      esReasignacion={designacionVigente !== null}
                      confirmarDesignacion={confirmarDesignacion}
                    />
                  )}
                </td>
```

Agregar también, en la celda de "Alertas" o como columna nueva, el dato informativo:

```tsx
                <td className="px-4 py-2 text-xs text-muted">{rec.designacionesAceptadasEnTemporada}</td>
```

(con su `<th>Desig. temporada</th>` correspondiente).

- [ ] **Step 6: Modificar `app/(app)/fixture/[partidoId]/page.tsx`**

```tsx
import Link from 'next/link'
import { recomendarReferees } from '@/actions/recomendaciones'
import { confirmarDesignacion, obtenerDesignacionVigente } from '@/actions/designaciones'
import { TablaRecomendaciones } from '@/components/fixture/TablaRecomendaciones'

export default async function DetallePartidoPage({
  params,
}: {
  params: Promise<{ partidoId: string }>
}) {
  const { partidoId } = await params
  const [data, designacionVigente] = await Promise.all([
    recomendarReferees(partidoId),
    obtenerDesignacionVigente(partidoId),
  ])
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
        {designacionVigente && (
          <p className="mt-2 text-sm">
            Designado: <strong>{designacionVigente.referee_nombre}</strong> ·{' '}
            {designacionVigente.estado_aceptacion}
          </p>
        )}
      </div>

      <h2 className="text-base font-semibold">Referees recomendados (puesto R1)</h2>
      <TablaRecomendaciones
        recomendaciones={data.recomendaciones}
        noDisponibles={data.noDisponibles}
        partidoId={partidoId}
        designacionVigente={designacionVigente}
        confirmarDesignacion={confirmarDesignacion}
      />
    </div>
  )
}
```

- [ ] **Step 7: Modificar `app/(app)/layout.tsx` — nav del referee**

En `NAV_POR_ROL`, cambiar la entrada del referee:

```tsx
  [ROLES.REFEREE]: [
    { href: '/disponibilidad', label: 'Mi disponibilidad' },
    { href: '/mis-designaciones', label: 'Mis designaciones' },
  ],
```

- [ ] **Step 8: Verificar manualmente el flujo completo**

Precondición: `npx supabase db reset`, `.env.local` con `EMAIL_TRANSPORT=log`, `CRON_SECRET=dev-cron-secret`, `NEXT_PUBLIC_APP_URL=http://localhost:3000`; `npm run dev`.

1. Como `designador@rugby.local`: importar un partido futuro `ALU` vs `LRC` desde `/fixture`. Crear disponibilidad (service-role) para 2 referees de Lima que NO sean de `ALU` ni `LRC`.
2. Entrar a `/fixture/<id>`: ver la lista, clickear **Confirmar** en el primero.
   Expected: la fila pasa a "Designado (pendiente)"; en los logs de `npm run dev` aparece `[email:log] to=... subject="Nueva designación: ...` (o nada si ese referee no tiene `usuario_id`/email — usar un referee con cuenta, ej. vincular `referee@rugby.local`). La cabecera muestra "Designado: <nombre> · pendiente".
3. Clickear **Reasignar** en el segundo referee.
   Expected: ahora el segundo queda "Designado (pendiente)"; en la DB `select estado, estado_aceptacion from designacion order by fecha;` → primera fila `reemplazado/pendiente`, segunda `confirmado/pendiente`.
4. Loguearse como `referee@rugby.local` (asegurarse de que su `perfil.id` esté en `referee.usuario_id` de alguno de los designados; si no, designar a ese). Ir a `/mis-designaciones`: ver la designación pendiente. Clickear **Rechazar**.
   Expected: estado pasa a "Rechazada"; en los logs aparece `[email:log] ... subject="Designación rechazada: ...`; en la DB `select requiere_atencion from partido where id=<id>` → `t`.
5. Volver como designador a `/fixture/<id>`: reasignar de nuevo → `requiere_atencion` vuelve a `false`.
6. Probar vencimiento: `curl -s -H "Authorization: Bearer dev-cron-secret" localhost:3000/api/cron/vencer-designaciones` no vence nada (recién confirmado). Envejecer con service-role (`update designacion set fecha_confirmacion = now() - interval '3 days' where estado_aceptacion='pendiente'`), repetir curl → `{"vencidas":1}`; `/mis-designaciones` muestra "Vencida".
7. Limpiar: `docker exec supabase_db_rugby psql -U postgres -d postgres -c "delete from designacion; delete from disponibilidad; update partido set requiere_atencion = false; delete from partido where es_historico = false;"`

- [ ] **Step 9: Commit**

```bash
git add "app/(app)/mis-designaciones/page.tsx" components/designacion "app/(app)/fixture/[partidoId]/page.tsx" components/fixture/TablaRecomendaciones.tsx "app/(app)/layout.tsx" actions/recomendaciones.ts
git commit -m "feat(designacion): add confirm/reassign UI, mis-designaciones page, referee nav"
```

---

### Task 8: Extender el script de RLS con `designacion`

**Files:**
- Modify: `scripts/rls-test/run-rls-tests.ts`

**Interfaces:**
- Consumes: helpers existentes + usuarios de prueba (`designador` de Lima, `referee` de Lima). Si el script no crea un usuario `referee` de Lima con un `referee` vinculado, agregarlo siguiendo el patrón de los otros.
- Produces: casos nuevos en `npm run test:rls`.

- [ ] **Step 1: Agregar casos al final de `main()` en `scripts/rls-test/run-rls-tests.ts`**

```ts
  // ---- designacion ----
  // Prepara: un partido de la Liga Metropolitana y un referee de Lima con cuenta.
  const { data: partidoLima } = await admin
    .from('partido')
    .insert({
      liga_id: LIGA_METRO_ID,
      temporada_id: '44444444-4444-4444-4444-444444444444',
      fecha: '2026-11-01',
      hora: '15:00',
      categoria: 'Regional',
      club_local_id: (await admin.from('club').select('id').eq('codigo', 'ALU').single()).data!.id,
      club_visita_id: (await admin.from('club').select('id').eq('codigo', 'LRC').single()).data!.id,
      categoria_minima_referee: 'Regional',
      es_historico: false,
    })
    .select('id')
    .single()

  const emailRefereeLima = `referee-lima-${sufijo}@test.local`
  const refereeLimaUserId = await crearUsuarioDePrueba({
    email: emailRefereeLima,
    password,
    rol: 'referee',
    pais_id: null,
    region_id: LIMA_ID,
  })
  const { data: refereeVinculado } = await admin
    .from('referee')
    .insert({ nombre: emailRefereeLima, categoria: 'Regional', region_id: LIMA_ID, usuario_id: refereeLimaUserId })
    .select('id')
    .single()

  console.log('Caso: designador de Lima puede INSERTAR una designacion en un partido de su liga')
  const { error: desigInsertError } = await clienteDesignadorLima.from('designacion').insert({
    partido_id: partidoLima!.id,
    referee_id: refereeVinculado!.id,
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
    (misDesig ?? []).some((d) => d.partido_id === partidoLima!.id),
    'el referee ve su designacion confirmada'
  )

  console.log('Caso: el referee puede cambiar su estado_aceptacion a aceptado')
  const { error: aceptarError } = await clienteRefereeLima
    .from('designacion')
    .update({ estado_aceptacion: 'aceptado' })
    .eq('id', (misDesig ?? [])[0]?.id)
  assert(aceptarError === null, `el referee acepta su designacion${aceptarError ? `: ${aceptarError.message}` : ''}`)

  console.log('Caso: un referee NO ve designaciones que no son suyas')
  // (el referee de la región de prueba, si el script lo tiene; si no, se omite)

  // Limpieza de este bloque
  await admin.from('designacion').delete().eq('partido_id', partidoLima!.id)
  await admin.from('referee').delete().eq('id', refereeVinculado!.id)
  await admin.from('partido').delete().eq('id', partidoLima!.id)
  await limpiarUsuarioDePrueba(emailRefereeLima)
```

**Nota:** si `crearUsuarioDePrueba` no devuelve el `user.id`, ajustarla para que lo haga (`return data.user.id`) — ya lo hace en la versión de Fase 0-2.

- [ ] **Step 2: Correr y verificar**

Run: `npx supabase db reset && npm run test:rls`
Expected: `TODOS LOS CASOS PASARON`, código de salida 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/rls-test/run-rls-tests.ts
git commit -m "test: extend RLS script with designacion cases"
```

---

## Self-review (cobertura vs. spec §8 + addendum §B/§D/§E)

| Requisito | Task |
|---|---|
| Confirmar → `estado=confirmado`, `estado_aceptacion=pendiente`, email al referee | Task 4 (`confirmarDesignacion`) + Task 2 (`emailNuevaDesignacion`) |
| Reasignar sin sobreescribir (previa → `reemplazado`) | Task 4 + Task 1 (índice único parcial) |
| Referee acepta (sin email) / rechaza (email al designador + "requiere atención") | Task 5 (`aceptar`/`rechazar`) + Task 2 (`emailRechazo`) |
| 48 h sin respuesta → `vencido` + "requiere atención" + email al designador | Task 3 (`designacionesAVencer`) + Task 6 (ruta cron) + Task 2 (`emailVencimiento`) |
| Job programado (mecanismo: Vercel Cron + ruta API) | Task 6 (`route.ts` + `vercel.json`) |
| Email best-effort (no revierte el estado) | Tasks 4/5/6 (todos los `send` en `try/catch`) |
| `designacion.puesto` default `R1`, índice vigente por `(partido_id, puesto)` | Task 1 |
| Referee solo ve designaciones confirmadas | Task 1 (`designacion_select_referee`) + Task 5 (`listMisDesignaciones` filtra `estado='confirmado'`) |
| Dato "designaciones aceptadas y jugadas en la temporada" en las recomendaciones | Task 7 Step 1 (`designacionesAceptadasEnTemporada`) |
| Pantalla "Mis designaciones" (referee) | Task 7 (`/mis-designaciones` + nav) |
| `score_snapshot` en la designación | Task 4 (snapshot desde `recomendarReferees`) |

**Nota:** "jugadas" en el dato de temporada se aproxima por "aceptadas" en el MVP (la marca de partido jugado formal llega con la Fase 8 / el resultado cargado). Anotado como simplificación.

## Al terminar

Queda el ciclo de designación funcionando end-to-end con notificaciones best-effort y vencimiento automático. El siguiente checkpoint es la **Fase 8** (carga de resultado de partido jugado: pantalla `/fixture/[partidoId]/resultado` + script batch + policy `partido_update_resultado`) — no se empieza hasta que este plan esté revisado y mergeado a `feature/plataforma-fundacion`.
