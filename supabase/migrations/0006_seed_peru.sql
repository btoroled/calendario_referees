insert into pais (id, nombre, codigo) values
  ('11111111-1111-1111-1111-111111111111', 'Perú', 'PE');

insert into region (id, pais_id, nombre, codigo) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Lima', 'LIM');

insert into liga (id, region_id, nombre, codigo) values
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Liga Metropolitana', 'LIGA-MET');

insert into temporada (id, liga_id, nombre, fecha_inicio, fecha_fin, activa) values
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'Temporada 2026', '2026-03-01', '2026-11-30', true);
