-- Consolidado mensual de todos los canales (Excel «Consolidado-all-canales», hoja VENTAS NEGOCIO): venta real por mes de
-- 2025 y 2026 y la meta 2026, por canal. «CALDERON» es el total del negocio. Lo carga rpa/consolidado_excel.py.
-- Es repetible.

create table if not exists consolidado_mensual (
  canal   text not null,        -- CALDERON (total), TIENDAS, RETAIL, PROVINCIA, LIMA, B2B, RAPPI, B2C-DESCONTINUADO
  anio    integer not null,
  mes     integer not null check (mes between 1 and 12),
  real    numeric(16,2),        -- venta real del mes (vacío si aún no se cierra)
  meta    numeric(16,2),        -- meta del mes (solo años con meta)
  primary key (canal, anio, mes)
);
create table if not exists consolidado_cargas (
  id       bigserial primary key,
  cuando   timestamptz not null default now(),
  archivo  text,
  corte    date,                -- último día con venta real incluido (el mes del corte puede estar incompleto)
  detalle  text
);

alter table consolidado_mensual enable row level security;
alter table consolidado_cargas  enable row level security;
drop policy if exists "leer con sesion" on consolidado_mensual;
create policy "leer con sesion" on consolidado_mensual for select to authenticated using (true);
drop policy if exists "leer con sesion" on consolidado_cargas;
create policy "leer con sesion" on consolidado_cargas for select to authenticated using (true);
