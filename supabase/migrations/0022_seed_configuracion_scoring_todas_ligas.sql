-- Toda liga necesita una fila de configuración de scoring; sin ella el motor
-- cae a los defaults hardcodeados. Se siembra una fila con los valores por
-- defecto (los mismos que las columnas DEFAULT de 0017) para cada liga que no
-- tenga una. Editable luego por el admin de la liga (Fase 9).
insert into configuracion_scoring (liga_id)
select l.id from liga l
where not exists (select 1 from configuracion_scoring c where c.liga_id = l.id);
