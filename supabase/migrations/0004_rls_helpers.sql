create or replace function fn_perfil()
returns perfil
language sql
security definer
stable
set search_path = public
as $$
  select * from perfil where id = auth.uid();
$$;

create or replace function fn_rol()
returns rol_usuario
language sql
security definer
stable
set search_path = public
as $$
  select rol from perfil where id = auth.uid();
$$;

create or replace function fn_pais_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select pais_id from perfil where id = auth.uid();
$$;

create or replace function fn_region_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select region_id from perfil where id = auth.uid();
$$;

create or replace function fn_liga_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select liga_id from perfil where id = auth.uid();
$$;
