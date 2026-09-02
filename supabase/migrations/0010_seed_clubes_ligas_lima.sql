-- Clubes reales de la Liga Metropolitana de Lima (Primera División Masculina)
-- Fuente: Torneo Metropolitano de Rugby de Lima (Federación Peruana de Rugby)
insert into club (region_id, nombre, codigo) values
  ('22222222-2222-2222-2222-222222222222', 'Alumni Rugby Club', 'ALU'),
  ('22222222-2222-2222-2222-222222222222', 'Lima Rugby Club', 'LRC'),
  ('22222222-2222-2222-2222-222222222222', 'Old Markhamians Rugby Football Club', 'OMK'),
  ('22222222-2222-2222-2222-222222222222', 'Flaming Lions Rugby Football Club', 'FLL'),
  ('22222222-2222-2222-2222-222222222222', 'Blues Rugby', 'BLU'),
  ('22222222-2222-2222-2222-222222222222', 'Dragones Rugby Club', 'DRA'),
  ('22222222-2222-2222-2222-222222222222', 'Blue Sharks', 'BSH'),
  ('22222222-2222-2222-2222-222222222222', 'Unión Rugby Club', 'UNI'),
  ('22222222-2222-2222-2222-222222222222', 'Navy Warriors', 'NAV'),
  ('22222222-2222-2222-2222-222222222222', 'Leones de San Marcos', 'LSM'),
  ('22222222-2222-2222-2222-222222222222', 'Guerreros Ruricancho', 'GRU'),
  ('22222222-2222-2222-2222-222222222222', 'Wiñay Rugby', 'WIN')
on conflict (region_id, codigo) do nothing;

-- Wiñay Rugby no está activo en la temporada actual
update club set activo = false
where region_id = '22222222-2222-2222-2222-222222222222' and codigo = 'WIN';

-- Categorías/divisiones adicionales de la liga de Lima, como ligas propias.
-- "Liga Metropolitana" (0006_seed_peru.sql) ya representa la Primera División Masculina.
insert into liga (region_id, nombre, codigo) values
  ('22222222-2222-2222-2222-222222222222', 'Intermedia', 'INTER'),
  ('22222222-2222-2222-2222-222222222222', 'M18 XII', 'M18'),
  ('22222222-2222-2222-2222-222222222222', 'M16', 'M16'),
  ('22222222-2222-2222-2222-222222222222', 'Primera División Femenina XII', 'PRIM-FEM'),
  ('22222222-2222-2222-2222-222222222222', 'Festival de Menores M14', 'FEST-M14'),
  ('22222222-2222-2222-2222-222222222222', 'Festival de Menores M12', 'FEST-M12'),
  ('22222222-2222-2222-2222-222222222222', 'Festival de Menores M10', 'FEST-M10'),
  ('22222222-2222-2222-2222-222222222222', 'Festival de Menores M8', 'FEST-M8'),
  ('22222222-2222-2222-2222-222222222222', 'Festival de Menores M6', 'FEST-M6'),
  ('22222222-2222-2222-2222-222222222222', '7s Nacional Femenino', '7S-FEM'),
  ('22222222-2222-2222-2222-222222222222', '7s Nacional Masculino', '7S-MASC')
on conflict (region_id, codigo) do nothing;
