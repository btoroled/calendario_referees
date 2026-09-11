alter table partido add column requiere_atencion boolean not null default false;

create table designacion (
  id uuid primary key default gen_random_uuid(),
  partido_id uuid not null references partido(id) on delete cascade,
  referee_id uuid not null references referee(id) on delete restrict,
  puesto text not null default 'R1',
  estado text not null default 'confirmado',
  estado_aceptacion text not null default 'pendiente',
  designado_por uuid references perfil(id) on delete set null,
  fecha timestamptz not null default now(),
  fecha_confirmacion timestamptz,
  fecha_respuesta timestamptz,
  score_snapshot jsonb,
  created_at timestamptz not null default now(),
  constraint designacion_puesto_valido check (puesto in ('R1','R2','R3','R4','INGOAL_1','INGOAL_2')),
  constraint designacion_estado_valido check (estado in ('sugerido','confirmado','reemplazado')),
  constraint designacion_aceptacion_valida check (estado_aceptacion in ('pendiente','aceptado','rechazado','vencido'))
);

create index designacion_partido_id_idx on designacion (partido_id);
create index designacion_referee_id_idx on designacion (referee_id);

-- Una sola designación vigente (no reemplazada) por partido y puesto.
create unique index designacion_vigente_por_puesto
  on designacion (partido_id, puesto)
  where estado <> 'reemplazado';

alter table designacion enable row level security;
alter table designacion force row level security;

-- SELECT: el referee ve SOLO sus designaciones confirmadas (estado='confirmado').
create policy designacion_select_referee on designacion for select
using (
  estado = 'confirmado'
  and referee_id in (select id from referee where usuario_id = auth.uid())
);

-- SELECT: designador/admin ven todas las designaciones de partidos de su scope.
create policy designacion_select_scope on designacion for select
using (
  fn_rol() = 'admin_nacional' and partido_id in (
    select id from partido where liga_id in (
      select id from liga where region_id in (select id from region where pais_id = fn_pais_id())
    )
  )
  or fn_rol() in ('admin_regional', 'designador') and partido_id in (
    select id from partido where liga_id in (select id from liga where region_id = fn_region_id())
  )
);

-- INSERT: designador/admin sobre partidos de su scope Y referees de su scope.
-- Ambos alcances se exigen: el partido debe ser de su región/país y el referee también
-- (mismo patrón que evaluacion_insert en 0018). Así la DB respalda el chequeo que
-- `confirmarDesignacion` hace en código antes de usar el service-role client.
create policy designacion_insert_scope on designacion for insert
with check (
  (
    fn_rol() = 'admin_nacional' and partido_id in (
      select id from partido where liga_id in (
        select id from liga where region_id in (select id from region where pais_id = fn_pais_id())
      )
    )
    or fn_rol() in ('admin_regional', 'designador') and partido_id in (
      select id from partido where liga_id in (select id from liga where region_id = fn_region_id())
    )
  )
  and (
    fn_rol() = 'admin_nacional' and referee_id in (
      select id from referee where region_id in (select id from region where pais_id = fn_pais_id())
    )
    or fn_rol() in ('admin_regional', 'designador') and referee_id in (
      select id from referee where region_id = fn_region_id()
    )
  )
);

-- UPDATE: designador/admin (reasignar: pasar la previa a 'reemplazado') sobre su scope.
-- El WITH CHECK es explícito: sin él Postgres reusa el USING y la fila NUEVA solo
-- quedaría atada al partido original, permitiendo repuntar partido_id/referee_id
-- fuera del alcance del designador.
create policy designacion_update_scope on designacion for update
using (
  fn_rol() = 'admin_nacional' and partido_id in (
    select id from partido where liga_id in (
      select id from liga where region_id in (select id from region where pais_id = fn_pais_id())
    )
  )
  or fn_rol() in ('admin_regional', 'designador') and partido_id in (
    select id from partido where liga_id in (select id from liga where region_id = fn_region_id())
  )
)
with check (
  (
    fn_rol() = 'admin_nacional' and partido_id in (
      select id from partido where liga_id in (
        select id from liga where region_id in (select id from region where pais_id = fn_pais_id())
      )
    )
    or fn_rol() in ('admin_regional', 'designador') and partido_id in (
      select id from partido where liga_id in (select id from liga where region_id = fn_region_id())
    )
  )
  and (
    fn_rol() = 'admin_nacional' and referee_id in (
      select id from referee where region_id in (select id from region where pais_id = fn_pais_id())
    )
    or fn_rol() in ('admin_regional', 'designador') and referee_id in (
      select id from referee where region_id = fn_region_id()
    )
  )
);

-- UPDATE: el referee puede cambiar SOLO el estado_aceptacion de sus propias designaciones
-- confirmadas y AÚN PENDIENTES. Una designación ya respondida o vencida deja de ser suya
-- para tocar. El WITH CHECK es explícito (sin él, Postgres reusa el USING y la fila nueva
-- quedaría sin restricción sobre partido_id, fecha_confirmacion, designado_por, etc.).
create policy designacion_update_referee on designacion for update
using (
  estado = 'confirmado'
  and estado_aceptacion = 'pendiente'
  and referee_id in (select id from referee where usuario_id = auth.uid())
)
with check (
  estado = 'confirmado'
  and referee_id in (select id from referee where usuario_id = auth.uid())
);

-- Backstop del WITH CHECK: para un referee, TODA columna salvo estado_aceptacion y
-- fecha_respuesta queda clavada. Evita que el referee se auto-designe repuntando
-- partido_id, evada el vencimiento reseteando fecha_confirmacion, o silencie al
-- designador nulificando designado_por.
create or replace function fn_designacion_referee_solo_aceptacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if fn_rol() = 'referee' then
    if new.partido_id        is distinct from old.partido_id
       or new.referee_id     is distinct from old.referee_id
       or new.puesto         is distinct from old.puesto
       or new.estado         is distinct from old.estado
       or new.designado_por  is distinct from old.designado_por
       or new.fecha          is distinct from old.fecha
       or new.fecha_confirmacion is distinct from old.fecha_confirmacion
       or new.score_snapshot is distinct from old.score_snapshot
       or new.created_at     is distinct from old.created_at then
      raise exception 'El referee solo puede cambiar estado_aceptacion.';
    end if;
  end if;
  return new;
end $$;

create trigger designacion_referee_guard before update on designacion
for each row execute function fn_designacion_referee_solo_aceptacion();
