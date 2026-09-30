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
