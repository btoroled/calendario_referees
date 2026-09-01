create table pais (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  codigo text not null unique,
  created_at timestamptz not null default now()
);

create table region (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references pais(id) on delete restrict,
  nombre text not null,
  codigo text not null,
  created_at timestamptz not null default now(),
  unique (pais_id, codigo)
);

create table liga (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references region(id) on delete restrict,
  nombre text not null,
  codigo text not null,
  created_at timestamptz not null default now(),
  unique (region_id, codigo)
);

create table temporada (
  id uuid primary key default gen_random_uuid(),
  liga_id uuid not null references liga(id) on delete restrict,
  nombre text not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

alter table pais enable row level security;
alter table pais force row level security;
alter table region enable row level security;
alter table region force row level security;
alter table liga enable row level security;
alter table liga force row level security;
alter table temporada enable row level security;
alter table temporada force row level security;
