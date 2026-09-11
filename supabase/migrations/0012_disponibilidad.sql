create table disponibilidad (
  id uuid primary key default gen_random_uuid(),
  referee_id uuid not null references referee(id) on delete cascade,
  fecha_inicio timestamptz not null,
  fecha_fin timestamptz not null,
  disponible boolean not null default true,
  created_at timestamptz not null default now(),
  constraint disponibilidad_rango_valido check (fecha_fin > fecha_inicio)
);

create index disponibilidad_referee_id_idx on disponibilidad (referee_id);

alter table disponibilidad enable row level security;
alter table disponibilidad force row level security;

create policy disponibilidad_select on disponibilidad for select
using (
  referee_id in (select id from referee where usuario_id = auth.uid())
);

create policy disponibilidad_insert on disponibilidad for insert
with check (
  referee_id in (select id from referee where usuario_id = auth.uid())
);

create policy disponibilidad_delete on disponibilidad for delete
using (
  referee_id in (select id from referee where usuario_id = auth.uid())
);
