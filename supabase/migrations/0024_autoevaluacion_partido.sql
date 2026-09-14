create table autoevaluacion_partido (
  id uuid primary key default gen_random_uuid(),
  partido_id uuid not null references partido(id) on delete cascade,
  referee_id uuid not null references referee(id) on delete cascade,
  autocalificacion_general numeric(3,1),
  comentario_autoevaluacion text,
  incidentes_reportados text,
  condiciones_cancha text,
  condiciones_clima text,
  comportamiento_equipos text,
  fecha_creacion timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partido_id, referee_id),
  constraint autoeval_autocalificacion_rango check (
    autocalificacion_general is null or (autocalificacion_general between 0 and 10)
  )
);

create index autoevaluacion_partido_referee_id_idx on autoevaluacion_partido (referee_id);

alter table autoevaluacion_partido enable row level security;
alter table autoevaluacion_partido force row level security;

-- Elegibilidad reutilizable: el usuario tuvo una designacion aceptada para ese partido/referee y el partido ya se jugó.
create or replace function fn_puede_autoevaluar(p_partido_id uuid, p_referee_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from designacion d
    join referee r on r.id = d.referee_id
    join partido p on p.id = d.partido_id
    where d.partido_id = p_partido_id
      and d.referee_id = p_referee_id
      and d.estado = 'confirmado'
      and d.estado_aceptacion = 'aceptado'
      and r.usuario_id = auth.uid()
      and p.fecha <= current_date
  );
$$;

-- INSERT/UPDATE: solo el propio referee, y solo si es elegible.
create policy autoevaluacion_insert on autoevaluacion_partido for insert
with check (
  referee_id in (select id from referee where usuario_id = auth.uid())
  and fn_puede_autoevaluar(partido_id, referee_id)
);

create policy autoevaluacion_update on autoevaluacion_partido for update
using (referee_id in (select id from referee where usuario_id = auth.uid()));

-- SELECT: el propio referee + designador/evaluador/admin del scope de región del referee.
create policy autoevaluacion_select_self on autoevaluacion_partido for select
using (referee_id in (select id from referee where usuario_id = auth.uid()));

create policy autoevaluacion_select_scope on autoevaluacion_partido for select
using (
  fn_rol() = 'admin_nacional' and referee_id in (
    select id from referee where region_id in (select id from region where pais_id = fn_pais_id())
  )
  or fn_rol() in ('admin_regional', 'designador', 'evaluador')
     and referee_id in (select id from referee where region_id = fn_region_id())
);

-- El referee puede corregir el CONTENIDO de su autoevaluación (idempotente, Task 3 la
-- actualiza con upsert), pero nunca repuntar a qué partido/referee pertenece — eso
-- evadiría fn_puede_autoevaluar, que solo se valida en el INSERT. Mismo patrón que
-- designacion_referee_guard (0019_designacion.sql).
create or replace function fn_autoevaluacion_referee_solo_contenido()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if fn_rol() = 'referee' then
    if new.partido_id is distinct from old.partido_id
       or new.referee_id is distinct from old.referee_id
       or new.fecha_creacion is distinct from old.fecha_creacion then
      raise exception 'El referee solo puede corregir el contenido de su autoevaluación, no a qué partido/referee pertenece.';
    end if;
  end if;
  return new;
end $$;

create trigger autoevaluacion_referee_guard before update on autoevaluacion_partido
for each row execute function fn_autoevaluacion_referee_solo_contenido();
