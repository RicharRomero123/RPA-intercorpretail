-- Módulo TIENDAS y maestro de SKU compartido por todos los módulos.
-- Lo ejecuta rpa/tiendas_excel.py antes de cada carga (es repetible: no borra tablas ni datos).
-- SKU oficial = código de ContaNet. Montos en soles tal como están en los Excel de las tiendas.

-- Maestro de productos (hoja «Productos» de DATA-MAESTRA.xlsx)
create table if not exists sku_maestro (
  sku           text primary key,
  producto      text,
  familia       text,
  tipo          text,
  unidades      numeric,
  presentacion  text,
  gramos        numeric,
  temporada     text,
  precio_ref    numeric(12,2)
);

-- Equivalencias: qué SKU oficial corresponde a cada código de cada sistema (Power BI, código corto, ContaNet…)
create table if not exists sku_equivalencia (
  sistema  text not null,
  codigo   text not null,
  sku      text not null,
  primary key (sistema, codigo)
);

-- Venta diaria de las tiendas propias (Excel «01. Ventas Diarias»), una fila por fila del Excel.
create table if not exists tiendas_venta (
  id                 bigserial primary key,
  fecha              date,
  tienda             text,
  canal              text,
  codigo             text,           -- código tal cual está en el Excel
  codigo_corto       text,
  sku                text,           -- SKU oficial (vacío si el código no tiene equivalencia)
  origen_sku         text,           -- codigo / codigo_corto / pendiente
  tipo_precio        text,
  categoria_cliente  text,
  und                numeric(14,2),
  venta              numeric(14,2),
  archivo            text            -- Excel de origen
);
create index if not exists tiendas_venta_fecha on tiendas_venta (fecha);
create index if not exists tiendas_venta_tienda_fecha on tiendas_venta (tienda, fecha);

create table if not exists tiendas_cargas (
  id          bigserial primary key,
  cuando      timestamptz not null default now(),
  filas       integer,
  und         numeric(14,2),
  venta       numeric(14,2),
  desde       date,
  hasta       date,
  pendientes  integer,
  detalle     text
);

-- Resumen diario por tienda y SKU (lo que usa la web: pocas filas y rápido).
create or replace view v_tiendas_dia with (security_invoker = true) as
select v.fecha, v.tienda, v.sku, coalesce(m.producto, v.sku, v.codigo) as producto, m.familia,
       sum(v.und) as und, sum(v.venta) as venta
from tiendas_venta v
left join sku_maestro m on m.sku = v.sku
group by v.fecha, v.tienda, v.sku, coalesce(m.producto, v.sku, v.codigo), m.familia;

-- Seguridad: solo usuarios con sesión pueden leer; la carga usa la conexión directa de la base.
alter table sku_maestro      enable row level security;
alter table sku_equivalencia enable row level security;
alter table tiendas_venta    enable row level security;
alter table tiendas_cargas   enable row level security;
do $$
declare t text;
begin
  foreach t in array array['sku_maestro','sku_equivalencia','tiendas_venta','tiendas_cargas'] loop
    execute format('drop policy if exists "leer con sesion" on %I', t);
    execute format('create policy "leer con sesion" on %I for select to authenticated using (true)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- consultas para la web
-- La web no baja las 90 mil filas: pide a la base los totales ya sumados (por día, tienda, producto y tipo de precio).
-- security invoker: respetan la seguridad de las tablas (solo usuarios con sesión).
create or replace function tiendas_maestros() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'desde', (select min(fecha) from tiendas_venta where venta > 0),
    'hasta', (select max(fecha) from tiendas_venta),
    'tiendas', (select coalesce(jsonb_agg(t order by t), '[]') from (select distinct tienda t from tiendas_venta) x),
    'tipos', (select coalesce(jsonb_agg(t order by t), '[]') from (select distinct tipo_precio t from tiendas_venta where tipo_precio <> '') x),
    'productos', (select coalesce(jsonb_agg(jsonb_build_object('sku', sku, 'producto', producto) order by producto), '[]')
                  from (select distinct v.sku, coalesce(m.producto, v.sku) producto
                        from tiendas_venta v left join sku_maestro m on m.sku = v.sku where v.sku is not null) x)
  );
$$;

create or replace function tiendas_panel(desde date, hasta date, p_tiendas text[] default null, p_skus text[] default null,
                                         p_tipos text[] default null, p_dias int[] default null) returns jsonb
language sql stable security invoker set search_path = public as $$
  with v as (
    select v.fecha, v.tienda, coalesce(v.sku, v.codigo) sku, coalesce(m.producto, v.sku, v.codigo) producto,
           nullif(v.tipo_precio, '') tipo, coalesce(v.und, 0) und, coalesce(v.venta, 0) venta
    from tiendas_venta v left join sku_maestro m on m.sku = v.sku
    where v.fecha between desde and hasta
      and (p_tiendas is null or v.tienda = any(p_tiendas))
      and (p_skus is null or v.sku = any(p_skus))
      and (p_tipos is null or v.tipo_precio = any(p_tipos))
      and (p_dias is null or (extract(isodow from v.fecha)::int - 1) = any(p_dias))
  )
  select jsonb_build_object(
    'dias', (select coalesce(jsonb_agg(x order by fecha), '[]') from
             (select fecha, sum(und) und, sum(venta) venta from v group by fecha) x),
    'tiendas', (select coalesce(jsonb_agg(x), '[]') from
                (select tienda, sum(und) und, sum(venta) venta, count(distinct fecha) filter (where venta > 0) dias from v group by tienda) x),
    'productos', (select coalesce(jsonb_agg(x), '[]') from
                  (select sku, min(producto) producto, sum(und) und, sum(venta) venta from v group by sku) x),
    'tipos', (select coalesce(jsonb_agg(x), '[]') from
              (select coalesce(tipo, 'Sin tipo') tipo, sum(und) und, sum(venta) venta from v group by 1) x),
    'cruce', (select coalesce(jsonb_agg(x), '[]') from
              (select tienda, sku, sum(und) und, sum(venta) venta from v group by tienda, sku) x)
  );
$$;
grant execute on function tiendas_maestros() to authenticated;
grant execute on function tiendas_panel(date, date, text[], text[], text[], int[]) to authenticated;
