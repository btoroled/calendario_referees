create table categoria_minima_mapa (
  id uuid primary key default gen_random_uuid(),
  liga_id uuid not null references liga(id) on delete cascade,
  categoria text not null,
  categoria_minima_referee text not null,
  created_at timestamptz not null default now(),
  unique (liga_id, categoria)
);

alter table categoria_minima_mapa enable row level security;
alter table categoria_minima_mapa force row level security;

create policy categoria_minima_mapa_select on categoria_minima_mapa for select
using (
  fn_rol() = 'admin_nacional' and liga_id in (select id from liga where region_id in (select id from region where pais_id = fn_pais_id()))
  or liga_id in (select id from liga where region_id = fn_region_id())
);

create table partido (
  id uuid primary key default gen_random_uuid(),
  liga_id uuid not null references liga(id) on delete restrict,
  temporada_id uuid not null references temporada(id) on delete restrict,
  fecha date not null,
  hora time not null,
  cancha text,
  categoria text not null,
  club_local_id uuid not null references club(id) on delete restrict,
  club_visita_id uuid not null references club(id) on delete restrict,
  jornada int,
  resultado_local int,
  resultado_visita int,
  tarjetas_amarillas_local int,
  tarjetas_amarillas_visita int,
  tarjetas_rojas_local int,
  tarjetas_rojas_visita int,
  incidentes text,
  complejidad smallint,
  categoria_minima_referee text not null,
  es_historico boolean not null default false,
  created_at timestamptz not null default now(),
  constraint partido_equipos_distintos check (club_local_id <> club_visita_id),
  constraint partido_complejidad_rango check (complejidad is null or (complejidad between 1 and 10))
);

create index partido_liga_temporada_idx on partido (liga_id, temporada_id);
create index partido_fecha_idx on partido (fecha);

alter table partido enable row level security;
alter table partido force row level security;

create policy partido_select on partido for select
using (
  fn_rol() = 'admin_nacional' and liga_id in (select id from liga where region_id in (select id from region where pais_id = fn_pais_id()))
  or liga_id in (select id from liga where region_id = fn_region_id())
);

create policy partido_insert on partido for insert
with check (
  fn_rol() = 'admin_nacional' and liga_id in (select id from liga where region_id in (select id from region where pais_id = fn_pais_id()))
  or fn_rol() in ('admin_regional', 'designador') and liga_id in (select id from liga where region_id = fn_region_id())
);
