-- Metas por tienda y mes (Excel «Metas tiendas 2026», hoja R.Facturación 2026) y venta real por tienda y mes para el
-- Resumen general. La suma de las metas de las tiendas es la meta TIENDAS del consolidado (rpa/metas_tiendas_excel.py lo
-- controla al céntimo antes de cargar). La venta real sale de contanet_historia('tiendas'): reporte interno antes de
-- ContaNet y ContaNet después, la misma fuente de Tiendas · ContaNet. Es repetible.
create table if not exists meta_tienda (
  anio    int not null,
  mes     int not null check (mes between 1 and 12),
  tienda  text not null,
  meta    numeric(14,2) not null,
  archivo text,
  cargado timestamptz not null default now(),
  primary key (anio, mes, tienda)
);
alter table meta_tienda enable row level security;
drop policy if exists meta_tienda_lectura on meta_tienda;
create policy meta_tienda_lectura on meta_tienda for select to authenticated using (true);

-- Venta por tienda y mes del año pedido y del anterior, y el último día con datos.
create or replace function tiendas_mensual(p_anio int) returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'hasta', (select max(fecha) from contanet_venta),
    'filas', (select coalesce(jsonb_agg(x), '[]') from (
      select extract(year from fecha)::int anio, extract(month from fecha)::int mes, tienda, sum(total) venta
      from contanet_historia('tiendas')
      where fecha between make_date(p_anio - 1, 1, 1) and make_date(p_anio, 12, 31)
      group by 1, 2, 3) x));
$$;
grant execute on function tiendas_mensual(int) to authenticated;
