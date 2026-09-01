create table club (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references region(id) on delete restrict,
  nombre text not null,
  codigo text not null,
  created_at timestamptz not null default now(),
  unique (region_id, codigo)
);

alter table club enable row level security;
alter table club force row level security;

create policy club_select on club for select
using (
  fn_rol() = 'admin_nacional' and region_id in (select id from region where pais_id = fn_pais_id())
  or region_id = fn_region_id()
);

create policy club_insert on club for insert
with check (
  fn_rol() = 'admin_nacional' and region_id in (select id from region where pais_id = fn_pais_id())
  or fn_rol() = 'admin_regional' and region_id = fn_region_id()
);

create policy club_update on club for update
using (
  fn_rol() = 'admin_nacional' and region_id in (select id from region where pais_id = fn_pais_id())
  or fn_rol() = 'admin_regional' and region_id = fn_region_id()
);
