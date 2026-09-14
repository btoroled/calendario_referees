-- El evaluador necesita ver las designaciones de su región para poder listar
-- "partidos jugados pendientes de evaluar" (spec §9/§10). designacion_select_scope
-- (0019, Fase 7) solo cubría admin_nacional/admin_regional/designador.
alter policy designacion_select_scope on designacion
using (
  fn_rol() = 'admin_nacional' and partido_id in (
    select id from partido where liga_id in (
      select id from liga where region_id in (select id from region where pais_id = fn_pais_id())
    )
  )
  or fn_rol() in ('admin_regional', 'designador', 'evaluador') and partido_id in (
    select id from partido where liga_id in (select id from liga where region_id = fn_region_id())
  )
);
