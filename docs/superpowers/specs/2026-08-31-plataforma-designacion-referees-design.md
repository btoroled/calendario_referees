# Plataforma de Designación de Referees — Diseño

## 1. Contexto y objetivo

Hoy la designación semanal de árbitros de rugby se hace manualmente, sin un sistema central que cruce disponibilidad, desempeño histórico y complejidad del partido. Se busca una plataforma ligera que:

- Centralice la disponibilidad horaria de los referees (cargada por ellos mismos).
- Permita cargar el fixture semanal de partidos.
- **Recomiende** (no asigne automáticamente) al mejor referee candidato por partido, en base a un score calculado con criterios objetivos.
- Deje la decisión final siempre en manos del comité de designaciones (rol `designador`).

El MVP se implementa para la liga de **Perú**, pero el modelo de datos y roles se diseña multi-tenant desde el día uno, para poder expandirse a otros países/regiones de Sudamérica agregando filas de configuración, sin reescribir código de negocio.

## 2. Alcance

**Incluido en el MVP:**
- Gestión de disponibilidad por referee.
- Importación de fixture semanal (Excel/CSV).
- Motor de recomendación con score transparente (desglose visible).
- Cálculo automático de complejidad de partido a partir de data histórica.
- Filtro de categoría mínima del referee vs. categoría del partido (con alerta, no bloqueo total).
- Flujo de aceptación/rechazo de la designación por parte del referee, con plazo automático de 48h.
- Carga de evaluaciones de desempeño (performance, físico, videoanálisis, coaching), con vista de partidos pendientes de evaluar.
- Autoevaluación/reporte post-partido cargado por el propio referee (autocalificación general + reporte objetivo de incidentes/condiciones), como registro/contexto, sin afectar el score.
- Perfil de referee con historial de partidos arbitrados, visible para el propio referee, designador, evaluador y admin.
- Indicador informativo de designaciones acumuladas en la temporada (para apoyar decisiones de desarrollo de referees nuevos).
- Roles: `admin_nacional`, `admin_regional`, `designador`, `evaluador`, `referee`.

**Fuera de alcance (anotado como futuro):**
- Múltiples oficiales por partido (jueces de touch, cuarto árbitro) — MVP es solo referee principal.
- Notificaciones automáticas por email/WhatsApp (el referee debe entrar a la app a ver su estado).
- Factor de distancia/logística de viaje en el score (potencial v2).
- Rotación/cupo forzado de formación de referees nuevos (el MVP solo muestra el dato, no lo impone).
- App móvil nativa.
- Integración automática con fuentes externas de videoanálisis.
- Pantalla permanente de importación de data histórica (es un script de migración único).

## 3. Arquitectura

- **Frontend + backend**: Next.js (App Router), server actions para la lógica de negocio.
- **Base de datos**: Postgres vía Supabase (Auth + Row-Level Security).
- **Hosting**: Vercel (app) + Supabase Cloud (DB/auth).
- **Multi-tenant**: jerarquía `pais → region → liga → temporada`. El MVP solo tiene Perú activo; agregar un país nuevo es insertar filas, no tocar código.

## 4. Roles y permisos

| Rol | Alcance | Puede hacer |
|---|---|---|
| `admin_nacional` | todo el país | gestiona regiones, ligas, usuarios, configuración de scoring de todas las ligas del país |
| `admin_regional` | su región | gestiona clubes, referees, usuarios y configuración de scoring de su región |
| `designador` | su liga/región | carga fixture, ve recomendaciones, confirma/reasigna designaciones |
| `evaluador` | su liga/región | carga evaluaciones de referees, ve partidos pendientes de evaluar |
| `referee` | su propio perfil | carga su disponibilidad, acepta/rechaza designaciones, ve sus evaluaciones |

## 5. Modelo de datos

- `pais`, `region`, `liga`, `temporada` — jerarquía organizacional.
- `club` (region_id).
- `perfil` — vínculo a `auth.users`, con `rol` y scope explícito (`pais_id`/`region_id`/`liga_id` según corresponda al rol, no un campo genérico) para simplificar las políticas RLS.
- `referee` (usuario_id nullable, club_id, categoria, region_id, activo).
- `disponibilidad` (referee_id, fecha_inicio, fecha_fin, disponible bool). Modelo positivo con override: el referee marca ventanas donde SÍ está disponible; una fila `disponible=false` sobre un sub-rango es una excepción. **Si no cargó nada para una fecha, se considera no disponible por defecto** (conservador) — se debe comunicar claramente en la UI.
- `partido` — una sola tabla para partidos futuros e históricos (evita duplicar lógica de consulta al calcular complejidad contra el historial): fecha, hora, cancha, categoria, club_local_id, club_visita_id, liga_id, temporada_id, jornada, resultado_local/visita (nullable), tarjetas_amarillas/rojas local/visita (nullable), incidentes (nullable), `complejidad` (1-10, calculada), `categoria_minima_referee` (derivada de una tabla de mapeo configurable por liga), `es_historico` (bandera de conveniencia).
- `evaluacion` (referee_id, tipo enum [performance, fisico, videoanalisis, coaching], valor 0-10, fecha, evaluador_id, partido_id nullable — nullable para permitir evaluaciones periódicas no atadas a un partido puntual).
- `designacion` (partido_id, referee_id, estado [sugerido/confirmado/reemplazado], **estado_aceptacion** [pendiente/aceptado/rechazado/vencido], designado_por, fecha, score_snapshot jsonb). Nunca se sobreescribe: al reasignar, la fila previa pasa a `reemplazado` y se crea una nueva. Índice único parcial garantiza una sola designación vigente por partido.
- `configuracion_scoring` (por liga): pesos por criterio (normal y alta complejidad), umbral de complejidad alta, factor de penalización por mismo club, parámetros de decaimiento por antigüedad, **`evaluacion_bloqueante`** (bool, configurable por el admin/jefe de referees — si está activo, no se puede confirmar una nueva designación para un referee con evaluaciones pendientes de partidos ya jugados).
- Tabla de mapeo `categoria_partido → categoria_minima_referee`, configurable por liga.
- `autoevaluacion_partido` (partido_id fk, referee_id fk, autocalificacion_general numeric(3,1) nullable, comentario_autoevaluacion text nullable, incidentes_reportados text nullable, condiciones_cancha text nullable, condiciones_clima text nullable, comportamiento_equipos text nullable, fecha_creacion). Solo puede crearla el propio referee, y solo para un `partido_id` donde tuvo una `designacion` con `estado_aceptacion=aceptado` y fecha ya pasada. **No se usa como input del motor de scoring** — es registro/contexto para el comité y para el propio historial del referee.

## 6. Motor de recomendación

Para un partido dado:

1. **Filtros duros** (el referee ni aparece en la lista si no los cumple):
   - Disponibilidad horaria.
2. **Filtro blando con alerta**:
   - Categoría mínima: si el referee está por debajo de la categoría requerida para ese partido, aparece igual en la lista pero marcado con advertencia visible — el designador decide.
3. **Score base**: promedio ponderado por tipo de evaluación (performance/fisico/videoanalisis/coaching), con decaimiento exponencial por antigüedad (evaluaciones recientes pesan más). Si un referee no tiene evaluaciones de algún tipo, ese tipo se excluye y se renormalizan los pesos restantes (evita castigar a referees nuevos).
4. **Ajuste por complejidad**: si la complejidad del partido supera el umbral configurado, se usa un set de pesos alternativo (más peso a performance/coaching).
5. **Penalización por club**: si el referee pertenece al club local o visitante, se aplica una penalización configurable al score final (no exclusión).
6. **Resultado**: lista rankeada con score final y desglose completo (qué pesó cada criterio, si se aplicó ajuste por complejidad, si hubo penalización de club, alerta de categoría si aplica), más el dato informativo de **designaciones aceptadas y jugadas en la temporada** (para apoyar decisiones de desarrollo de referees nuevos, sin forzar rotación).

## 7. Cálculo de complejidad del partido (automático)

Se calcula al importar/crear un partido futuro, usando historial entre esos 2 clubes:
- Paridad de resultados históricos entre ambos clubes (40%): menor diferencia de puntos → mayor complejidad.
- Incidentes en esos enfrentamientos directos (30%): tarjetas/incidentes históricos entre ambos.
- Tendencia disciplinaria reciente de cada club por separado (30%).
- Si nunca jugaron entre sí, cae a un valor neutro (5) por defecto.

La data histórica se carga una única vez vía script de migración (no una pantalla permanente), usando las fichas de partido a las que el comité ya tiene acceso.

## 8. Flujo de aceptación de designación

1. Designador confirma una designación → `estado=confirmado`, `estado_aceptacion=pendiente`.
2. El referee ve la designación en "Mis designaciones" y debe aceptar o rechazar.
3. Si rechaza, o si pasan **48 horas sin respuesta** (`estado_aceptacion` pasa a `vencido`), el partido queda marcado como "requiere atención" para que el designador re-asigne.
4. Sin notificaciones push/email en el MVP — el referee debe entrar a la app.

## 9. Cierre del loop de evaluación

- El evaluador carga evaluaciones asociadas a un `partido_id` después de jugado el partido.
- Vista dedicada: "partidos jugados pendientes de evaluar" (designación aceptada + fecha pasada + sin evaluación).
- El bloqueo de nuevas designaciones por evaluaciones pendientes (`evaluacion_bloqueante`) es **configurable por liga**, no fijo — decisión del admin/jefe de referees de esa liga.

## 10. Pantallas por rol

| Pantalla | Roles |
|---|---|
| Login | todos |
| Fixture semanal + importar | designador, admin_regional, admin_nacional |
| Detalle de partido + recomendaciones + confirmar/reasignar | designador, admin_regional, admin_nacional |
| Mi disponibilidad | referee |
| Mis designaciones (aceptar/rechazar) | referee |
| Mi autoevaluación post-partido (cargar) | referee |
| Perfil de referee — historial de partidos arbitrados, evaluaciones y autoevaluaciones (`/referees/[refereeId]`) | referee (propio), designador, evaluador, admin_regional, admin_nacional |
| Carga de evaluaciones + pendientes de evaluar | evaluador, admin_regional, admin_nacional |
| Catálogos (regiones, ligas, clubes, referees, usuarios) | admin_regional/admin_nacional según nivel |
| Configuración de scoring por liga (pesos, umbrales, `evaluacion_bloqueante`, mapeo categoría mínima) | admin_regional (su región), admin_nacional |

### Perfil de referee (`/referees/[refereeId]`)

Consolida en una sola vista, ordenada como línea de tiempo:
- Datos básicos: nombre, club, categoría, región, designaciones aceptadas y jugadas en la temporada.
- Por cada partido arbitrado: rival, fecha, complejidad, evaluación del evaluador (si existe), y su autoevaluación/reporte post-partido (si existe).
- Para el propio referee reemplaza (consolidándolas) las vistas separadas de "Mis designaciones" y "Mis evaluaciones"; para designador/evaluador/admin es de solo lectura, pensada como contexto adicional antes de designar o evaluar.

## 11. RLS y seguridad

- RLS activo en todas las tablas, scopeado por región/liga vía funciones helper `SECURITY DEFINER` (`fn_rol()`, `fn_region_id()`, etc.) para evitar recursión sobre `perfil`.
- El cálculo de recomendaciones corre del lado del servidor con service-role (bypassa RLS por necesidad de agregación eficiente), con autorización explícita verificada en código — única excepción intencional y documentada.
- El referee solo ve sus propias designaciones **confirmadas** (nunca ve por qué no fue elegido en otras).
- `autoevaluacion_partido`: INSERT/UPDATE solo por el propio referee sobre sus propios partidos aceptados y jugados; SELECT para el propio referee, designador, evaluador y admin del mismo scope de región/liga (mismo patrón que `evaluacion`).

## 12. Motor de scoring y complejidad — decisión de implementación

Ambos viven como **funciones TypeScript puras** (no PL/pgSQL/RPC), para ser testeables con datos mock sin depender de la base de datos. Se documentan como candidatos a mover a SQL/background job si el volumen crece mucho (no es el caso del MVP).

## 13. Fases de implementación (resumen)

0. Setup proyecto + infra (Next.js + Supabase, auth básico).
1. Schema base + roles + RLS.
2. Catálogos (regiones, ligas, clubes, referees).
3. Disponibilidad.
4. Importación de fixture (sin complejidad calculada aún).
5. Seed histórico + cálculo automático de complejidad.
6. Motor de scoring + UI de recomendaciones + configuración por liga.
7. Flujo de designación: confirmación, aceptación/rechazo del referee, plazo de 48h.
8. Evaluaciones: carga, vista de pendientes, `evaluacion_bloqueante` configurable.
9. Autoevaluación post-partido del referee + perfil de referee con historial consolidado.
10. Pulido y testing (unit del motor, validación de imports, matriz de RLS, e2e smoke).

## 14. Estrategia de testing

- **Motor de scoring**: unit tests con datos mock — pesos normal vs. alta complejidad, renormalización sin evaluaciones de un tipo, decaimiento por antigüedad, penalización por club, alerta de categoría mínima, orden de ranking.
- **Complejidad**: unit tests con historiales fabricados — parejo+incidentes → alta, goleada sin incidentes → baja, sin historial → fallback neutro.
- **Imports CSV/Excel**: validación fila por fila con casos válidos e inválidos, mensajes de error claros, tolerancia a variaciones de encabezado.
- **RLS**: matriz de pruebas por rol/scope (script + smoke tests e2e) verificando aislamiento entre regiones/ligas.
