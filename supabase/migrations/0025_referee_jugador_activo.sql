-- Marca si un referee también es jugador activo actualmente — dato
-- independiente de `activo` (que indica si el referee está activo como tal).
alter table referee add column jugador_activo boolean not null default false;
