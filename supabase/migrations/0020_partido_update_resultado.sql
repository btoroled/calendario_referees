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
)
with check (
  fn_rol() = 'admin_nacional' and liga_id in (
    select id from liga where region_id in (select id from region where pais_id = fn_pais_id())
  )
  or fn_rol() in ('admin_regional', 'designador') and liga_id in (
    select id from liga where region_id = fn_region_id()
  )
);
