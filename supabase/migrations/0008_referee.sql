create table referee (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references perfil(id) on delete set null,
  nombre text not null,
  club_id uuid references club(id) on delete set null,
  categoria text not null,
  region_id uuid not null references region(id) on delete restrict,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table referee enable row level security;
alter table referee force row level security;

create policy referee_select on referee for select
using (
  fn_rol() = 'admin_nacional' and region_id in (select id from region where pais_id = fn_pais_id())
  or region_id = fn_region_id()
);

create policy referee_insert on referee for insert
with check (
  fn_rol() = 'admin_nacional' and region_id in (select id from region where pais_id = fn_pais_id())
  or fn_rol() = 'admin_regional' and region_id = fn_region_id()
);

create policy referee_update on referee for update
using (
  fn_rol() = 'admin_nacional' and region_id in (select id from region where pais_id = fn_pais_id())
  or fn_rol() = 'admin_regional' and region_id = fn_region_id()
);
