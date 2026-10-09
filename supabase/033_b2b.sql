-- B2B: pedidos a empresas del Excel «Ventas B2B» (un pedido por fila), con el producto ya limpio al SKU de ContaNet.
-- «maquila» = producto hecho con la marca del cliente: se clasifica en el SKU del producto base y se marca aparte.
-- Cuadra mes a mes con el canal B2B del consolidado. La carga reemplaza todo el año del archivo (rpa/b2b_excel.py). Es repetible.
create table if not exists b2b_ventas (
  id               bigint generated always as identity primary key,
  fecha            date not null,               -- día de despacho
  ruc              text,
  cliente          text not null,               -- razón social
  contacto         text,
  telefono         text,
  producto_excel   text not null,               -- como venía escrito en el Excel
  sku              text,                        -- SKU de ContaNet (sku_maestro)
  maquila          boolean not null default false,
  und              numeric not null,
  precio           numeric,
  venta            numeric not null,            -- monto cancelado
  condicion_pago   text,
  direccion        text,
  detalle          text,
  status           text,
  archivo          text,
  cargado          timestamptz not null default now()
);
create index if not exists b2b_ventas_fecha on b2b_ventas (fecha);

-- Se lee con el módulo del Resumen general (B2B no tiene módulo propio en usuario_acceso).
alter table b2b_ventas enable row level security;
drop policy if exists acceso_modulo on b2b_ventas;
create policy acceso_modulo on b2b_ventas for select to authenticated using ((select puede_modulo('consolidado')));
grant select on b2b_ventas to authenticated;
