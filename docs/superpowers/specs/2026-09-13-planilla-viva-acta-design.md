# Planilla en vivo + Confirmación de acta — Diseño

## 1. Contexto y objetivo

Este spec extiende `docs/superpowers/specs/2026-08-31-plataforma-designacion-referees-design.md`
(en adelante "el spec original") con el primero de tres sub-proyectos que cierran el ciclo
completo de un partido, según el flujo de proceso descrito por el usuario:

```
Carga de fixture → Disponibilidad → Designación → Aceptación →
Planilla en vivo → Confirmación de acta → [Evaluación con timestamps de video] →
[Comentarios de entrenadores + respuestas]
```

Los primeros cuatro pasos ya están construidos (Fases 3, 4, 7, 8). Los dos últimos
("Evaluación con timestamps de video" y "Comentarios de entrenadores") son sub-proyectos
independientes, fuera de este spec, a diseñarse por separado — el segundo consume el
registro de eventos que este spec produce.

**Objetivo de este sub-proyecto:** reemplazar la carga de resultado post-partido (Fase 8,
un formulario de una sola carga al terminar) por una **planilla en vivo**: el jefe de mesa
registra cada evento del partido (try, tarjeta, cambio, incidente) en el momento en que
ocurre, con el reloj del partido corriendo. Al terminar, la planilla se cierra y se
convierte en **el acta**, que deben confirmar cinco partes antes de darse por definitiva.

## 2. Alcance

**Dentro de este spec:**
- Rol nuevo `manager_equipo` (uno por club).
- Catálogo de jugadores por club (`jugador`) y nómina de partido (`partido_jugador`),
  editable por el manager hasta 1 hora antes del kickoff.
- Registro de eventos del partido (`partido_evento`): fuente de verdad de resultado,
  tarjetas, cambios e incidentes.
- Timer manual del partido (iniciar / pausar-entretiempo / reanudar / finalizar).
- Cierre de planilla → generación del estado "acta pendiente de confirmación".
- Flujo de confirmación de acta por 5 partes (manager local, manager visita, jefe de
  mesa, árbitro principal, match commissioner), con reparo no bloqueante + alerta.
- Backfill de partidos históricos al nuevo modelo de eventos.
- Reemplazo completo de la pantalla y server actions de Fase 8
  (`ResultadoForm`, `guardarResultado`, `obtenerPartidoParaResultado`,
  `/fixture/[partidoId]/resultado`, policy `partido_update_resultado`) — quedan
  obsoletas y se retiran como parte de esta implementación, no conviven indefinidamente
  con la planilla en vivo.
- Mejora de UX/diseño visual de esta sección específica (§11).

**Fuera de alcance (sub-proyectos separados, no diseñados acá):**
- Evaluación con timestamps de video (autoevaluación del referee + evaluador,
  revisando el registro de eventos de este spec).
- Comentarios de entrenadores con timestamp + respuesta del evaluador.
- Cualquier interacción de "entrenador" como parte del sistema — no se define en este spec.

## 3. Arquitectura

Mismo stack del spec original (Next.js App Router + server actions, Postgres/Supabase
con RLS, email transaccional vía Resend best-effort). No se introduce infraestructura
nueva.

## 4. Roles y permisos — actualización del spec original

El spec original (§4) fija "roles exactamente cinco". **Este spec agrega un sexto rol
fijo**, `manager_equipo`. La tabla de roles queda:

| Rol | Alcance | Puede hacer |
|---|---|---|
| `admin_nacional` | todo el país | (sin cambios respecto al spec original) |
| `admin_regional` | su región | (sin cambios) **+ actúa como jefe de mesa y/o match commissioner en los partidos de su región** |
| `designador` | su liga/región | (sin cambios) |
| `evaluador` | su liga/región | (sin cambios) |
| `referee` | su propio perfil | (sin cambios) **+ es "árbitro principal" en el flujo de confirmación de acta** |
| `manager_equipo` (nuevo) | su propio club | mantiene el catálogo de jugadores de su club; arma la nómina de cada partido de su club hasta 1h antes del kickoff; confirma el acta de los partidos de su club |

**Jefe de mesa** y **match commissioner** no son roles nuevos: ambos son funciones que
cumple un `admin_regional` en un partido dado. Pueden ser la misma persona confirmando
ambas funciones, o dos personas `admin_regional` distintas — el sistema no lo restringe.

## 5. Modelo de datos

### 5.1 `jugador` (catálogo por club)

```
jugador
  id uuid pk
  club_id uuid not null references club(id) on delete cascade
  nombre text not null
  numero_camiseta int not null
  activo boolean not null default true
  created_at timestamptz not null default now()
  unique (club_id, numero_camiseta) where activo   -- partial unique index
```

Mantenido por `manager_equipo` (su propio club) y admin (todos), mismo patrón que hoy
`admin_regional`/`admin_nacional` mantienen `referee`.

### 5.2 `club.usuario_id` (vínculo del manager con su club)

Se agrega `usuario_id uuid references auth.users(id)` a `club`, nullable, simétrico a
`referee.usuario_id`. Un manager = una cuenta = un club. Lo asigna `admin_regional` al
crear al manager (mismo flujo que hoy vincula `referee.usuario_id`).

### 5.3 `partido_jugador` (nómina de un partido específico)

```
partido_jugador
  id uuid pk
  partido_id uuid not null references partido(id) on delete cascade
  jugador_id uuid not null references jugador(id) on delete restrict
  equipo text not null check (equipo in ('local','visita'))
  titular boolean not null default true
  numero_camiseta int not null   -- copia del número al momento de la nómina, no una referencia viva
  created_at timestamptz not null default now()
  unique (partido_id, jugador_id)
```

`numero_camiseta` se copia (no se lee de `jugador` en cada consulta) para que un cambio
posterior en el plantel del club no altere la planilla de un partido ya jugado.

Editable por `manager_equipo` de ese club **solo si `now() < kickoff_utc - interval '1 hour'`**
(ver §6.3 para el cálculo de `kickoff_utc`). Después del corte, de solo lectura para el
manager; el jefe de mesa puede seguir viéndola durante el partido.

### 5.4 `partido_evento` (fuente de verdad del partido)

```
partido_evento
  id uuid pk
  partido_id uuid not null references partido(id) on delete cascade
  tipo text not null check (tipo in
    ('try','conversion','penal','drop','tarjeta_amarilla','tarjeta_roja','cambio','incidente','ajuste_historico'))
  equipo text check (equipo in ('local','visita'))
  puntos smallint   -- derivado del tipo en código para tipos de score fijos; libre solo en 'ajuste_historico'
  jugador_id uuid references jugador(id)              -- quién anota / a quién se le saca tarjeta / quién entra en un cambio
  jugador_id_sale uuid references jugador(id)          -- solo se usa en tipo='cambio': quién sale
  detalle text                                          -- texto libre (nombre si no está en el plantel, texto de incidente, etc.)
  tiempo_transcurrido text                              -- reloj del partido al momento del evento, formato 'MM:SS'; null en 'ajuste_historico'
  creado_por uuid not null references perfil(id)
  created_at timestamptz not null default now(),        -- hora real del sistema, auditoría — NO es el reloj del partido
  constraint partido_evento_equipo_requerido check (tipo = 'incidente' or equipo is not null),
  constraint partido_evento_jugador_en_tarjeta check (tipo not in ('tarjeta_amarilla','tarjeta_roja') or jugador_id is not null),
  constraint partido_evento_jugadores_en_cambio check (tipo <> 'cambio' or (jugador_id is not null and jugador_id_sale is not null))
```

Puntos por tipo, con `SCORE_TIPOS = {try: 5, conversion: 2, penal: 3, drop: 3}` como
única fuente de verdad en código (no editable a mano salvo `ajuste_historico`, que carga
un total libre). `tarjeta_amarilla`, `tarjeta_roja` y `cambio` no suman puntos
(`puntos=null`). El trigger de §5.5 suma exactamente estos cuatro tipos
(`try`,`conversion`,`penal`,`drop`) más `ajuste_historico` para `resultado_local`/`visita`
— cualquier tipo nuevo que se agregue a futuro que deba sumar puntos tiene que
incorporarse explícitamente a esa lista del trigger, no queda implícito.

### 5.5 `partido` — columnas de resultado pasan a ser caché derivado

Las columnas ya existentes `resultado_local`, `resultado_visita`,
`tarjetas_amarillas_local/visita`, `tarjetas_rojas_local/visita` **dejan de escribirse
directamente**. Un trigger (`AFTER INSERT` en `partido_evento`) recalcula y actualiza
estas columnas en `partido` cada vez que se agrega un evento:

- `resultado_local` = `sum(puntos) where equipo='local' and tipo in ('try','conversion','penal','drop','ajuste_historico') and partido_id=X`
- `resultado_visita` = ídem para `'visita'`
- `tarjetas_amarillas_local` = `count(*) where tipo='tarjeta_amarilla' and equipo='local'`
- (análogo para roja/visita)

`incidentes` (hoy una sola columna de texto libre) se retira: el listado de eventos
`tipo='incidente'` de ese partido, cada uno con su `tiempo_transcurrido`, lo reemplaza.

**Todo el código existente que lee estas columnas (`obtenerComplejidad`,
`obtenerTendenciaClub`, `calcularComplejidad`, cualquier pantalla) sigue funcionando sin
cambios** — la fuente de verdad cambió, la forma de leerla no.

Se agrega `partido.timer_estado` (`'no_iniciado' | 'en_curso' | 'pausado' | 'finalizado'`,
default `'no_iniciado'`) y `partido.acta_estado`
(`'sin_planilla' | 'pendiente_confirmacion' | 'confirmada'`, default `'sin_planilla'`).

### 5.6 `acta_confirmacion`

```
acta_confirmacion
  id uuid pk
  partido_id uuid not null references partido(id) on delete cascade
  parte text not null check (parte in
    ('manager_local','manager_visita','jefe_mesa','arbitro_principal','match_commissioner'))
  perfil_id uuid not null references perfil(id)
  confirmado_en timestamptz not null default now()
  observacion text   -- "con reparo" si no es null
  unique (partido_id, parte)
```

`jefe_mesa` y `match_commissioner` son filas independientes aunque el mismo `admin_regional`
confirme ambas — no hay restricción que lo impida.

## 6. Timer y captura en vivo

### 6.1 Máquina de estados del timer (`partido.timer_estado`)

```
no_iniciado --[Iniciar partido]--> en_curso
en_curso --[Pausar (entretiempo)]--> pausado
pausado --[Reanudar]--> en_curso
en_curso --[Finalizar y cerrar planilla]--> finalizado
```

Solo el jefe de mesa (`admin_regional` con scope sobre la liga del partido) puede mover
este estado. `en_curso`/`pausado` habilitan la carga de eventos; `finalizado` la bloquea
(ver §7).

### 6.2 Captura de eventos

Mientras `timer_estado in ('en_curso','pausado')`, el jefe de mesa carga eventos desde la
planilla: elige tipo, equipo, jugador (de la nómina `partido_jugador` de ese partido —
autocompletado, no texto libre salvo excepción), y el sistema estampa
`tiempo_transcurrido` automáticamente con el reloj corriendo al momento de guardar. No se
tipea el tiempo a mano.

### 6.3 Corte de edición de nómina (1 hora antes del kickoff)

Reusa la convención ya documentada en `disponibilidad-timezone-y-partido-hora`
(`partido.fecha`/`hora` son hora local de Lima sin offset; Lima es UTC-5 fijo, sin DST):

```
kickoff_utc = (partido.fecha + partido.hora)::timestamp + interval '5 hours'
corte = kickoff_utc - interval '1 hour'
```

Se aplica en dos capas: RLS (`partido_jugador` update/insert/delete `with check`/`using`
exige `now() < corte`) y una validación de UX en la acción (mensaje claro antes de
intentar, en vez de dejar que la falle RLS silenciosamente).

## 7. Cierre de planilla y confirmación de acta

### 7.1 Cierre

El jefe de mesa presiona "Finalizar y cerrar planilla": `timer_estado → 'finalizado'`,
`acta_estado → 'pendiente_confirmacion'`. Desde ese momento, `partido_evento` es de solo
lectura para ese partido (RLS: insert exige `timer_estado <> 'finalizado'`).

### 7.2 Confirmación

Las 5 partes (§5.6) ven el acta cerrada — la planilla completa, de solo lectura — y cada
una confirma independientemente (`acta_confirmacion` insert, una fila por `parte`).
Cuando existen las 5 filas para un `partido_id`, `partido.acta_estado → 'confirmada'`
(trigger o chequeo en la acción de confirmar, el que resulte más simple de implementar).

### 7.3 Reparo

Confirmar con `observacion` no bloquea el conteo de las 5 — el acta se confirma igual.
Dispara un email (best-effort, no bloqueante, mismo patrón que el flujo de designación)
a `admin_regional` y `designador` de esa liga/región, avisando el reparo para revisión
posterior. No hay una pantalla de "resolución de reparo" en este spec — es notificación,
no un flujo de arbitraje adicional.

## 8. Backfill de partidos históricos

Migración de datos (no solo de schema), corre una vez sobre todos los `partido` con
`es_historico=true` que ya tengan `resultado_local`/`resultado_visita` no nulos:

- Un evento `tipo='ajuste_historico', equipo='local', puntos=resultado_local` y su par
  para `'visita'`.
- N eventos `tipo='tarjeta_amarilla', equipo='local'` (uno por cada unidad de
  `tarjetas_amarillas_local`, sin `jugador_id` ni `detalle`), y análogo para roja/visita.
- Si `incidentes` no es null, un evento `tipo='incidente', detalle=<el texto>`.
- Todos con `tiempo_transcurrido=null`, `creado_por` = una cuenta de servicio o el
  `admin_nacional` semilla (a definir en el plan de implementación), `detalle` adicional
  `'backfill histórico'` donde aplique.

El trigger de §5.5 recalcula las columnas de `partido` a partir de estos eventos — el
resultado final visible no cambia, solo la forma en que se sostiene.

**La importación de fixture histórico por CSV (`importarFixture`, camino
`es_historico`) se actualiza para generar estos mismos eventos sintéticos en vez de
escribir las columnas de resultado directamente** — así todo partido, histórico o en
vivo, importado o jugado con planilla, pasa siempre por `partido_evento`.

## 9. Notificaciones

Reusa `lib/email/transport.ts` / `lib/email/mensajes.ts` (Resend, best-effort, no
bloqueante — si falla el envío, la confirmación con reparo igual se persiste). Un solo
caso nuevo: alerta de reparo (§7.3).

## 10. RLS y seguridad — resumen de políticas nuevas

| Tabla | Política | Regla |
|---|---|---|
| `jugador` | select/insert/update | scope por `club_id` = región del actor (admin) o club propio (`manager_equipo` vía `club.usuario_id = auth.uid()`) |
| `partido_jugador` | insert/update/delete | mismo scope de club, **y** `now() < corte` (§6.3) para `manager_equipo`; sin corte para admin (edición de emergencia) |
| `partido_jugador` | select | scope de club (manager) + scope de liga/región (roles existentes que ya ven `partido`) |
| `partido_evento` | insert | solo `admin_regional` con scope sobre la liga del partido, **y** `partido.timer_estado <> 'finalizado'` |
| `partido_evento` | select | mismo scope de `partido_select` ya existente, **más** `manager_equipo` de los clubes del partido |
| `acta_confirmacion` | insert | el `perfil_id` debe corresponder a la `parte` declarada (ej. `parte='manager_local'` exige que el actor sea el manager del `club_local_id` de ese partido) |
| `acta_confirmacion` | select | mismo scope que `partido_evento` select |

Todo insert/update queda cubierto por el patrón ya establecido en fases anteriores:
`.select()` + verificación de filas afectadas en cualquier UPDATE bajo RLS (nunca
`error === null` como única prueba de éxito) — aplica directamente a las transiciones de
`timer_estado`/`acta_estado`.

## 11. UX y diseño visual

Esta sección es explícitamente sobre que la pantalla de planilla en vivo se vea moderna
y sea agradable de usar en cancha (probablemente desde un celular o tablet, con el jefe
de mesa parado o sentado en la mesa de control) — no solo funcional:

- **Reloj prominente y animado**: el timer corriendo es el elemento visual central de la
  pantalla mientras `timer_estado='en_curso'` — tipografía grande, tabular, con un
  indicador visual claro de pausado vs corriendo (color/ícono), no un campo de texto más.
- **Feed de eventos en vivo**: los eventos cargados aparecen como una línea de tiempo
  (más reciente arriba), con ícono por tipo (try/tarjeta/cambio/incidente) y color por
  equipo — no una tabla plana.
- **Carga de evento de un toque**: elegir tipo + jugador debe ser rápido bajo presión
  (ej. selección visual de jugador por foto/número grande, no un `<select>` con 23
  nombres en texto chico) — pensado para uso táctil.
- **Colores por equipo consistentes**: local/visita usan el mismo par de colores en toda
  la pantalla (reloj, feed, marcador) para que se puedan distinguir de un vistazo.
- **Marcador siempre visible**: el score actual (derivado de eventos) fijo en la parte
  superior mientras se scrollea el feed de eventos.
- **Vista del acta cerrada**: al confirmar, el acta se ve como un documento prolijo y
  legible (no el mismo formulario de carga) — pensado para poder compartirse/imprimirse,
  con las 5 confirmaciones y sus timestamps visibles claramente, y cualquier reparo
  resaltado.
- **Estados vacíos y de carga**: mientras no hay eventos, mientras la nómina no está
  cargada, mientras se espera la primera confirmación de acta — cada uno con su propio
  mensaje, no una tabla vacía sin contexto.
- **Responsive real**: layout que funcione bien en pantalla de celular en orientación
  vertical, no solo "no se rompe" — la mayoría de este flujo pasa en cancha, no en un
  escritorio.

Estas tareas de UX se implementan junto con la funcionalidad de cada fase (§12), no como
una pasada de "pulido" al final — el timer y el feed en vivo, en particular, no cumplen
su propósito si no transmiten sensación de tiempo real.

## 12. Fases de implementación (resumen)

Dado el tamaño de este sub-proyecto, se divide en tres fases (planes independientes,
mismo patrón de `subagent-driven-development` de fases anteriores):

- **Fase 12 — Rol `manager_equipo` + catálogo de jugadores + nómina de partido**:
  migración de rol y `club.usuario_id`, tablas `jugador`/`partido_jugador`, pantallas de
  alta (admin) y de armado de nómina (manager), corte de 1 hora.
- **Fase 13 — `partido_evento` + timer + planilla en vivo**: tabla de eventos y trigger
  de columnas derivadas, máquina de estados del timer, pantalla de captura de eventos
  (reemplaza la de Fase 8), backfill de históricos + actualización de `importarFixture`.
- **Fase 14 — Cierre de planilla + confirmación de acta + notificaciones**:
  `acta_confirmacion`, pantallas de confirmación por parte, alerta de reparo, vista del
  acta cerrada.

El plan detallado de cada fase (tareas, migraciones numeradas, tests) se escribe con
`superpowers:writing-plans` cuando corresponda empezar cada una — este spec es el
contrato funcional de las tres.

## 13. Testing

Mismo enfoque que fases anteriores:
- Funciones puras nuevas (derivación de puntos por tipo, cálculo de `kickoff_utc`/corte,
  chequeo de "5 confirmaciones completas") vía TDD con Vitest.
- `scripts/rls-test/run-rls-tests.ts` se extiende con casos por cada política nueva de
  §10 — en particular, aislamiento de `jugador`/`partido_jugador` por club, y que
  `partido_evento` no admita insert una vez `timer_estado='finalizado'`.
- Verificación manual de los flujos de timer/captura/cierre/confirmación vía integración
  directa contra la DB local con sesiones RLS reales (mismo método usado en toda la rama
  `feature/plataforma-fundacion` a falta de herramienta de navegador) — si para cuando se
  implemente esto ya hay browser tool disponible, usarlo en su lugar para las partes de
  UX (timer animado, feed en vivo) que una verificación de datos no puede confirmar por
  sí sola.
