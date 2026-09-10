-- Configuración de scoring por liga. Los pesos se guardan como columnas
-- explícitas (no jsonb) para que sean validables por constraint y legibles
-- en Studio. semivida_dias controla el decaimiento exponencial de la
-- antigüedad de las evaluaciones (una evaluación de hace `semivida_dias`
-- pesa la mitad que una de hoy).
create table configuracion_scoring (
  liga_id uuid primary key references liga(id) on delete cascade,
  peso_performance_normal numeric(4,3) not null default 0.400,
  peso_fisico_normal numeric(4,3) not null default 0.200,
  peso_videoanalisis_normal numeric(4,3) not null default 0.200,
  peso_coaching_normal numeric(4,3) not null default 0.200,
  peso_performance_alta numeric(4,3) not null default 0.500,
  peso_fisico_alta numeric(4,3) not null default 0.100,
  peso_videoanalisis_alta numeric(4,3) not null default 0.150,
  peso_coaching_alta numeric(4,3) not null default 0.250,
  umbral_complejidad_alta smallint not null default 7,
  factor_penalizacion_club numeric(4,3) not null default 0.800,
  semivida_dias int not null default 180,
  score_sin_evaluaciones numeric(3,1) not null default 5.0,
  evaluacion_bloqueante boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cfg_pesos_normal_suman_uno check (
    round((peso_performance_normal + peso_fisico_normal + peso_videoanalisis_normal + peso_coaching_normal)::numeric, 3) = 1.000
  ),
  constraint cfg_pesos_alta_suman_uno check (
    round((peso_performance_alta + peso_fisico_alta + peso_videoanalisis_alta + peso_coaching_alta)::numeric, 3) = 1.000
  ),
  constraint cfg_umbral_rango check (umbral_complejidad_alta between 1 and 10),
  constraint cfg_factor_rango check (factor_penalizacion_club between 0 and 1),
  constraint cfg_semivida_positiva check (semivida_dias > 0)
);

alter table configuracion_scoring enable row level security;
alter table configuracion_scoring force row level security;

-- SELECT: admin del país / región de esa liga, y el designador de esa región.
create policy configuracion_scoring_select on configuracion_scoring for select
using (
  fn_rol() = 'admin_nacional' and liga_id in (
    select id from liga where region_id in (select id from region where pais_id = fn_pais_id())
  )
  or liga_id in (select id from liga where region_id = fn_region_id())
);

-- UPDATE: solo admin_nacional (su país) y admin_regional (su región). El designador no edita config.
create policy configuracion_scoring_update on configuracion_scoring for update
using (
  fn_rol() = 'admin_nacional' and liga_id in (
    select id from liga where region_id in (select id from region where pais_id = fn_pais_id())
  )
  or fn_rol() = 'admin_regional' and liga_id in (select id from liga where region_id = fn_region_id())
);

-- Seed: configuración por defecto para la Liga Metropolitana (Temporada 2026).
insert into configuracion_scoring (liga_id) values
  ('33333333-3333-3333-3333-333333333333');
