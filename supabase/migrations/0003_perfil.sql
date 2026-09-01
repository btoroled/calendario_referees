create table perfil (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  email text not null,
  rol rol_usuario not null,
  pais_id uuid references pais(id) on delete restrict,
  region_id uuid references region(id) on delete restrict,
  liga_id uuid references liga(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table perfil enable row level security;
alter table perfil force row level security;
