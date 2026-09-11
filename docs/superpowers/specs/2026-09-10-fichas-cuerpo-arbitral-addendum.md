# Addendum — Cuerpo arbitral, carga de resultado y roadmap Fases 6-11

> **Enmienda** a `docs/superpowers/specs/2026-08-31-plataforma-designacion-referees-design.md` (el "spec maestro").
> No reabre decisiones de las Fases 0-5, ya implementadas y mergeadas en `feature/plataforma-fundacion`.
> Origen: revisión de la ficha física de partido (`docs/referencia/formato-partido.pdf`) antes de planificar las fases restantes.

## A. Alcance

Este addendum fija cinco cosas que el spec maestro dejó abiertas o fuera de alcance, y que hacen falta para planificar las Fases 6-11:

1. Modelo de **cuerpo arbitral** con puestos (`designacion.puesto`), con UI diferida a v2.
2. Nueva fase de **carga de resultado de partido jugado** (pantalla + extensión del script batch).
3. Mecanismo concreto del **job de vencimiento a 48h**: Vercel Cron + ruta API.
4. Abstracción de **email transaccional** (`EmailTransport`), para no depender de credenciales de Resend durante el desarrollo.
5. **Roadmap renumerado** de las fases restantes, con el nombre de archivo de cada plan.

La ficha de partido (`docs/referencia/formato-partido.pdf`) queda versionada en el repo como documento de referencia — es la fuente de los campos de resultado (score final, amonestados = amarillas, expulsados = rojas, observaciones = incidentes) y del catálogo de puestos del cuerpo arbitral.

## B. `designacion.puesto` — modelo crew-aware, UI solo R1

La ficha física registra un cuerpo arbitral, no un único árbitro: **REFEREE (R1)**, **LINEMAN (R2)**, **LINEMAN (R3)**, **CUARTO (R4)**, **InGoal (1)**, **InGoal (2)**. El MVP sigue operando solo sobre R1, pero el modelo de datos nace preparado para el resto, para evitar una migración dolorosa en v2.

### Cambios de modelo

- `designacion` gana una columna:

  ```sql
  puesto text not null default 'R1'
    check (puesto in ('R1', 'R2', 'R3', 'R4', 'INGOAL_1', 'INGOAL_2'))
  ```

- El índice único parcial "una sola designación vigente por partido" (spec maestro §5) pasa a ser **por `(partido_id, puesto)`**: una designación vigente por puesto por partido. La condición de vigencia no cambia (`estado <> 'reemplazado'`).

### Cambios de comportamiento (todo el MVP, Fases 6-7)

- El **motor de recomendación** (spec maestro §6) recomienda exclusivamente para el puesto `R1`. No hay scoring para AR/InGoal en el MVP.
- El **designador** solo confirma/reasigna designaciones `R1`. No hay pantalla de armado de cuerpo.
- El **flujo de aceptación/rechazo + job de 48h** (spec maestro §8) se define sobre `designacion` sin discriminar por puesto — funciona igual el día que entren R2-R4/InGoal.
- "**Mis designaciones**" del referee lista sus designaciones confirmadas de cualquier puesto (en el MVP, de hecho, solo habrá `R1`).

### Cambio al spec maestro §2

La línea de "Fuera de alcance":

> ~~Múltiples oficiales por partido (jueces de touch, cuarto árbitro) — MVP es solo referee principal.~~

se reemplaza por, en "Incluido en el MVP":

> Cuerpo arbitral **modelado** en `designacion.puesto` (R1/R2/R3/R4/InGoal). El MVP solo designa, recomienda y notifica el puesto **R1**; la UI de armado de cuerpo completo queda para v2 sin cambio de modelo.

## C. Nueva fase — Carga de resultado de partido jugado

**Problema:** `partido.resultado_*` y `partido.tarjetas_*` son nullable. La Fase 5 los llena para partidos históricos vía script de migración único. No hay forma de cargar el resultado de un partido del **fixture** una vez jugado. Sin eso: (1) el historial directo entre clubes no crece, así que la complejidad de partidos futuros se queda congelada; (2) la vista "partidos jugados pendientes de evaluar" (spec maestro §9) nunca tiene score real; (3) el perfil de referee no puede mostrar el resultado de los partidos que arbitró.

**Solución (dos vías complementarias):**

### C.1 Pantalla `/fixture/[partidoId]/resultado`

- **Roles:** `designador`, `admin_regional`, `admin_nacional` (mismo scope que importar fixture).
- **Visible/editable solo** para partidos con `fecha <= current_date` y `es_historico = false`.
- **Campos** (ficha simplificada): `resultado_local`, `resultado_visita` (enteros ≥ 0, requeridos), `tarjetas_amarillas_local`, `tarjetas_amarillas_visita`, `tarjetas_rojas_local`, `tarjetas_rojas_visita` (enteros ≥ 0, default 0), `incidentes` (texto libre, opcional). Es un subconjunto deliberado de la ficha física — no se cargan planteles, anotaciones jugada por jugada ni firmas.
- **Al guardar:** UPDATE de esos campos sobre la fila `partido`. **No** recalcula la `complejidad` del propio partido (ya se calculó al importarlo); el efecto es que el partido pasa a estar disponible como historial directo para el cálculo de complejidad de futuros enfrentamientos entre esos dos clubes.
- La pantalla es idempotente: se puede volver a entrar y corregir el resultado.

### C.2 Script batch

- Se agrega `scripts/cargar-resultados/run.ts` (hermano de `scripts/importar-historico/run.ts`, mismo patrón: `tsx`, service-role, `dotenv`).
- Consume un CSV con el **mismo formato de ficha** que `parseHistoricoCsv` (Fase 5) — se reutiliza ese parser.
- En vez de `insert`, hace `update` sobre partidos **existentes** del fixture, matcheando por `(fecha, club_local_codigo, club_visita_codigo)`. Filas sin match → error reportado, no se crea nada.
- Uso: cargar en lote los resultados de una jornada completa sin pasar por la pantalla.

### C.3 RLS

- Nueva policy `partido_update_resultado` en la tabla `partido`: permite `UPDATE` a `designador`/`admin_regional`/`admin_nacional` cuyo scope de región/liga contiene el partido. El script batch usa service-role y no depende de esta policy.
- La matriz de RLS (script `run-rls-tests.ts`) se extiende con casos de esta policy en la Fase 11.

## D. Job de vencimiento a 48h — Vercel Cron + ruta API

El spec maestro §8 deja el mecanismo abierto. Se elige **Vercel Cron sobre una ruta API** (sobre `pg_cron`) por ser más fácil de disparar y testear a mano, y por mantener la lógica en TypeScript.

- **Ruta:** `app/api/cron/vencer-designaciones/route.ts`, handler `GET` (Vercel Cron invoca con `GET`).
- **Protección:** header `Authorization: Bearer ${CRON_SECRET}` (env var). Sin el secreto correcto → `401`, sin efecto.
- **Efecto:** con service-role, busca `designacion` con `estado_aceptacion = 'pendiente'` y `fecha_confirmacion < now() - interval '48 hours'`; por cada una: `estado_aceptacion = 'vencido'`, marca el partido como "requiere atención", y dispara email al designador vía `EmailTransport` (best-effort, sección E).
- **Schedule:** `vercel.json` → `{ "crons": [{ "path": "/api/cron/vencer-designaciones", "schedule": "*/15 * * * *" }] }`.
- **Testeabilidad:** la lógica de selección + transición se extrae como función pura (`vencerDesignaciones(designaciones, ahora): { aVencer, emails }`) con unit tests; la ruta es una cáscara delgada que la conecta a la DB y al transporte. En local se ejerce con `curl -H "Authorization: Bearer <secret>" localhost:3000/api/cron/vencer-designaciones`.
- Requiere un campo `designacion.fecha_confirmacion timestamptz` (momento en que el designador confirmó y arrancó el reloj de 48h) — si el spec maestro §5 lo cubría con el genérico `fecha`, se explicita esta columna en el plan de Fase 7.

## E. Email transaccional — abstracción `EmailTransport`

No se depende de una cuenta de Resend con dominio verificado durante el desarrollo. El envío se abstrae:

- **`lib/email/transport.ts`:** interfaz `EmailTransport { send(msg: { to: string; subject: string; body: string }): Promise<void> }`.
  - `LogTransport` — dev/test: escribe el mensaje a consola. (Opcionalmente, apuntar a Mailpit de Supabase en `http://127.0.0.1:54324` para inspección visual.)
  - `ResendTransport` — prod: usa `RESEND_API_KEY` y `EMAIL_FROM`.
  - Selección por env: `EMAIL_TRANSPORT=log | resend` (default `log`).
- **`lib/email/mensajes.ts`:** las tres plantillas de los eventos del spec maestro §8:
  1. Nueva designación confirmada → al referee (con link a "Mis designaciones").
  2. Rechazo del referee → al designador.
  3. Vencimiento a 48h → al designador.
- **Best-effort en todos los call sites:** cada llamada a `transport.send` va envuelta en `try/catch` que loguea y continúa. El cambio de estado de negocio nunca se revierte por un fallo de email (spec maestro §3).
- **Verificación de Fase 7:** se hace con `LogTransport`. Conectar Resend en producción es setear `EMAIL_TRANSPORT=resend` + las credenciales, sin tocar código.

## F. Roadmap renumerado — Fases 6-11

Reemplaza la lista del spec maestro §13, puntos 6-10.

| # | Fase | Archivo de plan |
|---|---|---|
| 6 | **Motor de scoring** (función TS pura, TDD) + UI de recomendaciones en el detalle de partido + `configuracion_scoring` por liga (pesos normal/alta complejidad, umbral, penalización por club, decaimiento, `evaluacion_bloqueante`) | `docs/superpowers/plans/2026-09-10-fase6-scoring.md` |
| 7 | **Flujo de designación**: tabla `designacion` (con `puesto` default `R1` y `fecha_confirmacion`), confirmar/reasignar (designador), aceptar/rechazar (referee), job de 48h (Vercel Cron, sección D), emails (`EmailTransport`, sección E) | `docs/superpowers/plans/2026-09-11-fase7-designacion.md` |
| 8 | **Carga de resultado de partido jugado**: pantalla `/fixture/[partidoId]/resultado`, script batch `scripts/cargar-resultados/run.ts`, policy `partido_update_resultado` (sección C) | `docs/superpowers/plans/2026-09-12-fase8-resultado.md` |
| 9 | **Evaluaciones**: tabla `evaluacion`, carga por el evaluador asociada a `partido_id`, vista "partidos jugados pendientes de evaluar", `evaluacion_bloqueante` configurable por liga aplicado al confirmar designación | `docs/superpowers/plans/2026-09-15-fase9-evaluaciones.md` |
| 10 | **Autoevaluación + perfil de referee**: tabla `autoevaluacion_partido`, pantalla de carga del referee, perfil consolidado `/referees/[refereeId]` como línea de tiempo (spec maestro §10) | `docs/superpowers/plans/2026-09-16-fase10-perfil.md` |
| 11 | **Pulido y testing**: unit del motor de scoring con datos mock, validación de imports fila por fila, matriz de RLS completa por rol/scope (incluye `partido_update_resultado` y `designacion`), e2e smoke del flujo designación→aceptación→evaluación | `docs/superpowers/plans/2026-09-17-fase11-pulido.md` |

Cada fase mantiene el ritmo de las Fases 0-5: un plan por fase, ejecutado con `subagent-driven-development` / `executing-plans`, revisado y mergeado a `feature/plataforma-fundacion` antes de arrancar la siguiente.

## G. Resumen de deltas al spec maestro

| Sección maestro | Cambio |
|---|---|
| §2 Alcance | "Múltiples oficiales" sale de *Fuera de alcance*; entra como *modelado, UI diferida a v2* (sección B). |
| §5 Modelo de datos | `designacion` +`puesto` (default `R1`, check) y +`fecha_confirmacion`; índice único vigente pasa a `(partido_id, puesto)`. Nueva policy `partido_update_resultado`. |
| §8 Flujo de aceptación | Mecanismo del job de 48h fijado: Vercel Cron + `app/api/cron/vencer-designaciones` protegida por `CRON_SECRET` (sección D). |
| §8 / §3 Email | Implementación vía `EmailTransport` con `LogTransport`/`ResendTransport` seleccionable por env (sección E). |
| §13 Fases | Puntos 6-10 reemplazados por el roadmap de 6 fases de la sección F (se agrega la fase de carga de resultado). |
| Nuevo | `docs/referencia/formato-partido.pdf` versionado como referencia. |
