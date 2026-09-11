-- Documenta la convención de zona horaria de disponibilidad.fecha_inicio/fecha_fin.
-- El formulario envía el valor crudo de un <input type="datetime-local">, sin offset,
-- que Postgres interpreta en UTC. En la práctica esto guarda la hora local de Lima
-- (Perú, MVP de una sola zona horaria) "disfrazada" de UTC — la UI la vuelve a leer
-- con toLocaleString(..., { timeZone: 'UTC' }) para que el round-trip sea consistente.
-- Cualquier código futuro (ej. el motor de matching de la Fase 6 contra partido.fecha/hora)
-- debe seguir la misma convención (comparar los dígitos crudos) en vez de tratar estas
-- columnas como instantes UTC reales, o los cálculos quedarán desfasados por el offset de Lima.
comment on column disponibilidad.fecha_inicio is
  'Hora local de Lima almacenada sin conversión (interpretada como UTC por Postgres). No es un instante UTC real — ver comentario de esta migración.';
comment on column disponibilidad.fecha_fin is
  'Hora local de Lima almacenada sin conversión (interpretada como UTC por Postgres). No es un instante UTC real — ver comentario de esta migración.';
