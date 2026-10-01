-- Canales de ContaNet sin repetirse (cada línea cae en uno solo; juntos suman todo el reporte):
--   tiendas : todo lo de las tiendas menos lo cobrado con RAPPI (en el consolidado Rappi es un canal aparte)
--   rappi   : lo cobrado con condición de pago RAPPI
--   digital : el usuario VENTAS01 (vende por el canal digital y registra desde la oficina), sin lo cobrado con RAPPI
-- Así «Tiendas · ContaNet» se compara parejo con el reporte interno de tiendas. Reemplaza en_canal() de 006. Es repetible.
create or replace function en_canal(p_canal text, p_usuario text, p_medio text) returns boolean language sql immutable as $$
  select case p_canal
    when 'tiendas' then p_usuario is distinct from 'VENTAS01' and p_medio is distinct from 'Rappi'
    when 'digital' then p_usuario = 'VENTAS01' and p_medio is distinct from 'Rappi'
    when 'rappi'   then p_medio = 'Rappi'
    else false end;
$$;
