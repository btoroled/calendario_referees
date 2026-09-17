-- Renombra referee.activo a arbitro_activo para distinguirlo de jugador_activo.
alter table referee rename column activo to arbitro_activo;
