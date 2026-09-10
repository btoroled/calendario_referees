create type tipo_evaluacion as enum ('performance', 'fisico', 'videoanalisis', 'coaching');

create table evaluacion (
  id uuid primary key default gen_random_uuid(),
  referee_id uuid not null references referee(id) on delete cascade,
  tipo tipo_evaluacion not null,
  valor numeric(4,2) not null,
  fecha date not null,
  evaluador_id uuid references perfil(id) on delete set null,
  partido_id uuid references partido(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint evaluacion_valor_rango check (valor between 0 and 10)
);

create index evaluacion_referee_id_idx on evaluacion (referee_id);
create index evaluacion_partido_id_idx on evaluacion (partido_id);

alter table evaluacion enable row level security;
alter table evaluacion force row level security;

-- SELECT: el propio referee ve sus evaluaciones; evaluador/designador/admin ven las de su scope de región.
create policy evaluacion_select_self on evaluacion for select
using (referee_id in (select id from referee where usuario_id = auth.uid()));

create policy evaluacion_select_scope on evaluacion for select
using (
  fn_rol() = 'admin_nacional' and referee_id in (
    select id from referee where region_id in (select id from region where pais_id = fn_pais_id())
  )
  or fn_rol() in ('admin_regional', 'designador', 'evaluador')
     and referee_id in (select id from referee where region_id = fn_region_id())
);

-- INSERT: solo evaluador/admin de la región del referee. (La UI de carga llega en Fase 9;
-- la policy se define ahora para que el modelo quede completo y testeado.)
create policy evaluacion_insert on evaluacion for insert
with check (
  fn_rol() = 'admin_nacional' and referee_id in (
    select id from referee where region_id in (select id from region where pais_id = fn_pais_id())
  )
  or fn_rol() in ('admin_regional', 'evaluador')
     and referee_id in (select id from referee where region_id = fn_region_id())
);
