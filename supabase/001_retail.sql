-- Esquema de sell-out retail (Supermercados Peruanos hoy; Falabella u otros después, por la columna "cliente").
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar todo > Run.
-- Montos en soles sin IGV, con 2 decimales exactos (numeric) para cuadrar al céntimo con el portal.

create table if not exists productos (
  cliente   text not null,
  sku       text not null,
  producto  text,            -- descripción del portal (CALDERON-TURRON-CJX500GR)
  nombre    text,            -- nombre legible (Turrón caja 500 g)
  marca     text,
  umb       text,
  estado    text,
  primary key (cliente, sku)
);

create table if not exists locales (
  cliente    text not null,
  cod_local  integer not null,
  local      text,           -- nombre del portal (SPSA-PVEA-LOS-OLIVOS)
  nombre     text,           -- nombre legible (Plaza Vea Los Olivos)
  cadena     text,           -- Plaza Vea, Makro, Vivanda...
  zona       text,           -- Lima / Provincia / Por confirmar (editable a mano)
  formato    text,
  tipo       text,
  estado     text,
  primary key (cliente, cod_local)
);

create table if not exists venta_producto_dia (   -- tabla del portal: disponible desde el inicio
  cliente  text not null,
  fecha    date not null,
  sku      text not null,
  und      numeric(14,2) not null default 0,
  venta    numeric(14,2) not null default 0,     -- venta al público
  costo    numeric(14,2) not null default 0,     -- venta a costo = ingreso del proveedor
  primary key (cliente, fecha, sku)
);

create table if not exists venta_local_dia (      -- detalle Producto-Local: el portal lo da solo 45 días
  cliente    text not null,
  fecha      date not null,
  sku        text not null,
  cod_local  integer not null,
  und        numeric(14,2) not null default 0,
  venta      numeric(14,2) not null default 0,
  costo      numeric(14,2) not null default 0,
  primary key (cliente, fecha, sku, cod_local)
);
create index if not exists venta_local_dia_fecha on venta_local_dia (cliente, fecha);

create table if not exists inventario_local (     -- foto diaria del stock en tienda ("inventario al ...")
  cliente    text not null,
  fecha_inv  date not null,
  sku        text not null,
  cod_local  integer not null,
  inv_und    numeric(14,2) not null default 0,
  inv_costo  numeric(14,2) not null default 0,
  primary key (cliente, fecha_inv, sku, cod_local)
);

create table if not exists cargas (               -- bitácora de cada día cargado por el robot
  id       bigserial primary key,
  cuando   timestamptz not null default now(),
  cliente  text not null,
  fecha    date,
  nivel    text,       -- producto / local
  estado   text,       -- ok / no cuadra / error
  filas    integer,
  und      numeric(14,2),
  venta    numeric(14,2),
  detalle  text
);

-- Vista que usa el front: venta por local y día con nombres, cadena y zona.
create or replace view v_venta_local with (security_invoker = true) as
select v.cliente, v.fecha, v.sku, p.nombre as producto, v.cod_local, l.nombre as local, l.cadena, l.zona,
       v.und, v.venta, v.costo
from venta_local_dia v
join locales l on l.cliente = v.cliente and l.cod_local = v.cod_local
join productos p on p.cliente = v.cliente and p.sku = v.sku;

create or replace view v_inventario as
select i.cliente, i.fecha_inv, i.sku, p.nombre as producto, i.cod_local, l.nombre as local, l.cadena, l.zona,
       i.inv_und, i.inv_costo
from inventario_local i
join locales l on l.cliente = i.cliente and l.cod_local = i.cod_local
join productos p on p.cliente = i.cliente and p.sku = i.sku;
alter view v_inventario set (security_invoker = true);

-- Seguridad: solo usuarios con sesión iniciada pueden leer; nadie escribe desde la web.
-- El robot escribe con la conexión directa de la base (DATABASE_URL), que no pasa por estas reglas.
alter table productos          enable row level security;
alter table locales            enable row level security;
alter table venta_producto_dia enable row level security;
alter table venta_local_dia    enable row level security;
alter table inventario_local   enable row level security;
alter table cargas             enable row level security;

do $$
declare t text;
begin
  foreach t in array array['productos','locales','venta_producto_dia','venta_local_dia','inventario_local','cargas'] loop
    execute format('drop policy if exists "leer con sesion" on %I', t);
    execute format('create policy "leer con sesion" on %I for select to authenticated using (true)', t);
  end loop;
end $$;
