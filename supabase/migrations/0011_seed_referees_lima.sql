-- Referees reales de la Liga Metropolitana de Lima
insert into referee (nombre, club_id, categoria, region_id)
select r.nombre, c.id, 'Regional', '22222222-2222-2222-2222-222222222222'
from (
  values
    ('Gerson Perez', 'DRA'),
    ('Natalie Barbier', 'FLL'),
    ('Abner Davalos', 'ALU'),
    ('Alejandra Navarro', 'WIN'),
    ('Fitzgerald Suarez', 'FLL'),
    ('Andreina Ferrer', 'LSM'),
    ('Anderson Pinto', 'UNI'),
    ('Cristian Quispe', 'UNI'),
    ('Daniel Valera', 'ALU'),
    ('David Villagra', 'BSH'),
    ('Diego Cavero', null),
    ('Diego Saravia', 'LRC'),
    ('Ernesto Cuadra', 'FLL'),
    ('Fernando Farfan', 'LRC'),
    ('Giovani Sinche', 'NAV'),
    ('Hatsumi Higa', 'LRC'),
    ('Jonathan Bauza', 'FLL'),
    ('Jose Barahona', 'ALU'),
    ('Katherine Guerrero', 'BLU'),
    ('Larry Brito', 'NAV'),
    ('Lucero Baca', 'FLL'),
    ('Nicolas Ramirez', 'FLL'),
    ('Pia Ferreyra', 'BSH'),
    ('Raymi Requena', 'BLU'),
    ('Raysa Gonzales', 'LSM'),
    ('Renzo Flores Lecca', 'ALU'),
    ('Salvador Diez Canseco', 'BSH'),
    ('Salvador Perez', 'LRC'),
    ('Ximena Peralta', 'FLL'),
    ('Geiner Vargas', 'BLU'),
    ('Lucho Lopez', 'UNI'),
    ('Wilmer Peralta', 'UNI')
) as r(nombre, club_codigo)
left join club c
  on c.codigo = r.club_codigo and c.region_id = '22222222-2222-2222-2222-222222222222';
