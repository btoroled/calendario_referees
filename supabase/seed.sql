-- Local development seed.
-- Loaded by `npx supabase db reset` via config.toml `[db.seed] sql_paths = ["./seed.sql"]`.
-- Creates one dev user per role. Password for ALL users: RugbyDev123!
--
--   | email                       | rol            |
--   | admin.nacional@rugby.local  | admin_nacional |
--   | admin.regional@rugby.local  | admin_regional |
--   | designador@rugby.local      | designador     |
--   | evaluador@rugby.local       | evaluador      |
--   | referee@rugby.local         | referee        |

create extension if not exists pgcrypto;

-- Guarda: este seed es exclusivamente para bases de desarrollo. Si la base
-- contiene cualquier usuario que no sea `@rugby.local`, abortar antes de tocar nada.
do $$
begin
  if exists (select 1 from auth.users where email not like '%@rugby.local') then
    raise exception 'seed.sql abortado: la base contiene usuarios que no son de desarrollo (@rugby.local)';
  end if;
end $$;

-- 1. auth.users -------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000',
  u.id, 'authenticated', 'authenticated', u.email,
  crypt('RugbyDev123!', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  '', '', '', ''
from (values
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'admin.nacional@rugby.local'),
  ('a0000000-0000-0000-0000-000000000002'::uuid, 'admin.regional@rugby.local'),
  ('a0000000-0000-0000-0000-000000000003'::uuid, 'designador@rugby.local'),
  ('a0000000-0000-0000-0000-000000000004'::uuid, 'evaluador@rugby.local'),
  ('a0000000-0000-0000-0000-000000000005'::uuid, 'referee@rugby.local')
) as u(id, email);

-- 2. auth.identities ------------------------------------------------------------
insert into auth.identities (
  provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  u.email, u.id,
  json_build_object('sub', u.id::text, 'email', u.email)::jsonb,
  'email', now(), now(), now()
from auth.users u
where u.email like '%@rugby.local';

-- 3. public.perfil -----------------------------------------------------------
insert into public.perfil (id, nombre, email, rol, pais_id, region_id, liga_id)
select
  p.id, p.nombre, p.email, p.rol::rol_usuario, p.pais_id, p.region_id, p.liga_id
from (values
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'Admin Nacional',  'admin.nacional@rugby.local', 'admin_nacional', '11111111-1111-1111-1111-111111111111'::uuid, null::uuid,                                     null::uuid),
  ('a0000000-0000-0000-0000-000000000002'::uuid, 'Admin Regional',  'admin.regional@rugby.local', 'admin_regional', null::uuid,                                     '22222222-2222-2222-2222-222222222222'::uuid, null::uuid),
  ('a0000000-0000-0000-0000-000000000003'::uuid, 'Designador Lima', 'designador@rugby.local',     'designador',     null::uuid,                                     '22222222-2222-2222-2222-222222222222'::uuid, null::uuid),
  ('a0000000-0000-0000-0000-000000000004'::uuid, 'Evaluador Lima',  'evaluador@rugby.local',      'evaluador',      null::uuid,                                     '22222222-2222-2222-2222-222222222222'::uuid, null::uuid),
  ('a0000000-0000-0000-0000-000000000005'::uuid, 'Referee Lima',    'referee@rugby.local',        'referee',        null::uuid,                                     '22222222-2222-2222-2222-222222222222'::uuid, null::uuid)
) as p(id, nombre, email, rol, pais_id, region_id, liga_id);

-- 4. Link the referee user to an existing referee row (first Lima referee by name).
update public.referee
set usuario_id = (select id from auth.users where email = 'referee@rugby.local')
where id = (
  select id from public.referee
  where region_id = '22222222-2222-2222-2222-222222222222'
  order by nombre
  limit 1
);

-- 5. Referees cargados a mano post-migración 0011 (vía UI de admin), nunca
--    versionados hasta ahora — sin esto se pierden en cada `db reset`.
update public.referee set nombre = 'Luis Lopez', activo = false where nombre = 'Lucho Lopez';
update public.referee set activo = false where nombre in ('Jonathan Bauza', 'Wilmer Peralta');

insert into public.referee (nombre, categoria, club_id, region_id, activo)
select r.nombre, 'Regional', c.id, '22222222-2222-2222-2222-222222222222', r.activo
from (
  values
    ('Alan Benavides', 'LRC', false),
    ('Benjamin Toro', null, true),
    ('Brenda Llanos', 'BLU', false),
    ('Carlos Achancaray', 'FLL', false),
    ('Erick Taboada', 'ALU', false),
    ('Jonathan Valdivia', 'BSH', false),
    ('Lisbeth Ccarampa', 'ALU', false),
    ('Marcelo Elias Brown', 'BLU', true),
    ('Mathias Ccorihuaman', 'FLL', false),
    ('Renzo Figueroa', 'FLL', false),
    ('Sergio Charlo', 'NAV', false),
    ('Vincenzo Caro', 'LRC', false)
) as r(nombre, club_codigo, activo)
left join public.club c on c.codigo = r.club_codigo;

-- 6. jugador_activo: releva quién es referee y también jugador activo hoy.
update public.referee set jugador_activo = true
where nombre in (
  'Andreina Ferrer', 'Cristian Quispe', 'Daniel Valera', 'David Villagra',
  'Ernesto Cuadra', 'Fernando Farfan', 'Fitzgerald Suarez', 'Geiner Vargas',
  'Giovani Sinche', 'Hatsumi Higa', 'Jonathan Bauza', 'Jonathan Valdivia',
  'Jose Barahona', 'Katherine Guerrero', 'Lisbeth Ccarampa', 'Lucero Baca',
  'Natalie Barbier', 'Nicolas Ramirez', 'Raymi Requena', 'Renzo Figueroa',
  'Renzo Flores Lecca', 'Salvador Diez Canseco', 'Salvador Perez',
  'Sergio Charlo', 'Vincenzo Caro', 'Wilmer Peralta'
);
