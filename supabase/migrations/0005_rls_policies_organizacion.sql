-- perfil: cada usuario ve su propia fila; los roles de comité ven las de su scope
create policy perfil_select_self on perfil for select
using (id = auth.uid());

create policy perfil_select_scope on perfil for select
using (
  fn_rol() = 'admin_nacional' and pais_id = fn_pais_id()
  or fn_rol() in ('admin_regional', 'designador', 'evaluador') and region_id = fn_region_id()
);

-- pais: visible si es el país del propio perfil
create policy pais_select on pais for select
using (id = fn_pais_id());

-- region: admin_nacional ve todas las regiones de su país; el resto solo la propia
create policy region_select on region for select
using (
  fn_rol() = 'admin_nacional' and pais_id = fn_pais_id()
  or id = fn_region_id()
);

create policy region_insert on region for insert
with check (fn_rol() = 'admin_nacional' and pais_id = fn_pais_id());

create policy region_update on region for update
using (fn_rol() = 'admin_nacional' and pais_id = fn_pais_id());

-- liga: admin_nacional ve las ligas de las regiones de su país; el resto solo las de su región
create policy liga_select on liga for select
using (
  fn_rol() = 'admin_nacional' and region_id in (select id from region where pais_id = fn_pais_id())
  or region_id = fn_region_id()
);

create policy liga_insert on liga for insert
with check (
  fn_rol() = 'admin_nacional' and region_id in (select id from region where pais_id = fn_pais_id())
  or fn_rol() = 'admin_regional' and region_id = fn_region_id()
);

create policy liga_update on liga for update
using (
  fn_rol() = 'admin_nacional' and region_id in (select id from region where pais_id = fn_pais_id())
  or fn_rol() = 'admin_regional' and region_id = fn_region_id()
);

-- temporada: visible/insertable si su liga padre ya es visible (cascada vía RLS de liga)
create policy temporada_select on temporada for select
using (liga_id in (select id from liga));

create policy temporada_insert on temporada for insert
with check (
  fn_rol() in ('admin_nacional', 'admin_regional')
  and liga_id in (select id from liga)
);

create policy temporada_update on temporada for update
using (
  fn_rol() in ('admin_nacional', 'admin_regional')
  and liga_id in (select id from liga)
);
