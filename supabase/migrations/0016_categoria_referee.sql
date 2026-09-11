-- Escalafón ordenado de categorías de referee. El "orden" permite comparar
-- si un referee está por debajo de la categoría mínima exigida por un partido.
create table categoria_referee (
  nombre text primary key,
  orden int not null unique,
  created_at timestamptz not null default now()
);

insert into categoria_referee (nombre, orden) values
  ('Escuela', 1),
  ('Distrital', 2),
  ('Regional', 3),
  ('Nacional', 4),
  ('Panamericana', 5),
  ('Internacional', 6);

alter table categoria_referee enable row level security;
alter table categoria_referee force row level security;

-- Catálogo global de solo lectura para cualquier usuario autenticado.
create policy categoria_referee_select on categoria_referee for select
using (auth.uid() is not null);
