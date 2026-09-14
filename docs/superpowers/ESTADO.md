# Estado de implementación

| Fase | Descripción | Estado |
|---|---|---|
| 0-2 | Fundación: auth, RLS, catálogos | ✅ |
| 3 | Disponibilidad | ✅ |
| 4 | Importación de fixture | ✅ |
| 5 | Seed histórico + cálculo de complejidad | ✅ |
| 6 | Motor de scoring + recomendaciones + config por liga | ✅ |
| 7 | Flujo de designación (R1) + aceptación 48h + emails | ✅ |
| 8 | Carga de resultado de partido jugado | ✅ |
| 9 | Evaluaciones + `evaluacion_bloqueante` | ✅ |
| 10 | Autoevaluación + perfil de referee consolidado | ✅ |
| 11 | Pulido y testing | ✅ |

## Diferido a v2 (no MVP)

- Designación de cuerpo arbitral completo (R2/R3/R4/InGoal): el modelo (`designacion.puesto`) ya lo soporta; falta la UI de armado.
- Notificaciones WhatsApp/SMS/push y recordatorios previos al vencimiento de 48h.
- Factor de distancia/logística en el score.
- Rotación/cupo forzado de referees nuevos.
- App móvil nativa; integración con fuentes externas de videoanálisis.
- Evaluaciones periódicas (`evaluacion.partido_id = null`): permitidas por el modelo, sin UI.

## Batería de tests de cierre (Fase 11)

`npm run lint` · `npm run test` · `npm run test:rls` · `npm run test:smoke` · `npm run build` — todos en verde.
