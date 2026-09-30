-- Carga de archivos desde la web (Configuración → Cargar datos).
-- Nota: confirmar_carga() y cargas_existente() se amplían en 004_retail_tipos.sql; si se vuelve a correr este archivo, correr 004 después.
-- El navegador lee el Excel, muestra la vista previa y sube las filas a una zona de espera (cargas_web_filas).
-- confirmar_carga() reemplaza el rango en una sola transacción y verifica que lo guardado sea idéntico a lo leído;
-- si algo no cuadra, se deshace todo y la base queda como estaba.
-- Es repetible: no borra tablas ni datos.

-- Venta del ERP ContaNet («Reporte detallado»): una fila por línea de comprobante.
create table if not exists contanet_venta (
  id                bigserial primary key,
  fecha             date not null,
  fecha_hora        timestamp not null,
  comprobante       text,
  tipo_comprobante  text,
  serie             text,
  numero            text,
  doc_cliente       text,
  tipo_doc_cliente  text,
  cliente           text,
  codigo            text,            -- código comercial tal cual en ContaNet
  sku               text,            -- SKU oficial (vacío si el código no tiene equivalencia)
  producto          text,
  und               numeric(14,3),   -- notas de crédito en negativo
  precio_unit       numeric(14,4),
  total             numeric(14,4),   -- notas de crédito en negativo
  cond_pago         text,
  medio_pago        text,
  usuario           text,            -- usuario del ERP (cada tienda tiene el suyo)
  tienda            text,
  vendedor          text,
  archivo           text,
  carga             uuid
);
create index if not exists contanet_venta_fecha on contanet_venta (fecha);
create index if not exists contanet_venta_tienda_fecha on contanet_venta (tienda, fecha);
create index if not exists contanet_venta_carga on contanet_venta (carga);

alter table tiendas_venta add column if not exists carga uuid;
create index if not exists tiendas_venta_carga on tiendas_venta (carga);

-- Registro de cada archivo subido desde la web.
create table if not exists cargas_web (
  id               uuid primary key default gen_random_uuid(),
  creada           timestamptz not null default now(),
  usuario          uuid not null default auth.uid(),
  correo           text,
  tipo             text not null check (tipo in ('contanet', 'tiendas')),
  archivo          text not null,
  desde            date not null,
  hasta            date not null,
  rangos           jsonb not null,   -- [{tienda, desde, hasta}] que se reemplazan (ContaNet: tienda null = todas)
  filas            integer not null,
  und              numeric(16,3) not null,
  venta            numeric(16,4) not null,
  avisos           jsonb,
  estado           text not null default 'preparada' check (estado in ('preparada', 'cargada')),
  cargada          timestamptz,
  reemplazo_filas  integer,
  reemplazo_venta  numeric(16,4)
);
create table if not exists cargas_web_filas (
  carga  uuid not null references cargas_web (id) on delete cascade,
  parte  integer not null,
  filas  jsonb not null,
  primary key (carga, parte)
);

alter table contanet_venta   enable row level security;
alter table cargas_web       enable row level security;
alter table cargas_web_filas enable row level security;
drop policy if exists "leer con sesion" on contanet_venta;
create policy "leer con sesion" on contanet_venta for select to authenticated using (true);
drop policy if exists "leer con sesion" on cargas_web;
create policy "leer con sesion" on cargas_web for select to authenticated using (true);
drop policy if exists "crear la propia" on cargas_web;
create policy "crear la propia" on cargas_web for insert to authenticated
  with check (usuario = auth.uid() and estado = 'preparada');
drop policy if exists "subir a la propia" on cargas_web_filas;
create policy "subir a la propia" on cargas_web_filas for insert to authenticated
  with check (exists (select 1 from cargas_web c where c.id = carga and c.usuario = auth.uid() and c.estado = 'preparada'));

-- Lo que hay hoy en la base para los rangos del archivo (para la vista previa: «hoy en la base» vs «archivo»).
create or replace function cargas_existente(p_tipo text, p_rangos jsonb) returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]') from (
    select v.tienda, count(*) filas, coalesce(sum(v.und), 0) und, coalesce(sum(v.venta), 0) venta
    from tiendas_venta v join jsonb_to_recordset(p_rangos) r(tienda text, desde date, hasta date)
      on v.tienda = r.tienda and v.fecha between r.desde and r.hasta
    where p_tipo = 'tiendas' group by v.tienda
    union all
    select v.tienda, count(*), coalesce(sum(v.und), 0), coalesce(sum(v.total), 0)
    from contanet_venta v join jsonb_to_recordset(p_rangos) r(tienda text, desde date, hasta date)
      on (r.tienda is null or v.tienda = r.tienda) and v.fecha between r.desde and r.hasta
    where p_tipo = 'contanet' group by v.tienda
  ) x;
$$;

-- Reemplaza el rango con las filas subidas y verifica. Corre con permisos de la base (security definer), pero solo
-- sobre una carga creada por quien la confirma.
create or replace function confirmar_carga(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '120s' as $$
declare
  c cargas_web;
  n integer; su numeric; sv numeric; rf integer; rv numeric;
begin
  if auth.uid() is null then raise exception 'Hay que iniciar sesión.'; end if;
  select * into c from cargas_web where id = p_id and usuario = auth.uid() for update;
  if not found then raise exception 'La carga no existe.'; end if;
  if c.estado <> 'preparada' then raise exception 'Esta carga ya se hizo.'; end if;

  if c.tipo = 'contanet' then
    select count(*), coalesce(sum(total), 0) into rf, rv from contanet_venta where fecha between c.desde and c.hasta;
    delete from contanet_venta where fecha between c.desde and c.hasta;
    insert into contanet_venta (fecha, fecha_hora, comprobante, tipo_comprobante, serie, numero, doc_cliente, tipo_doc_cliente,
                                cliente, codigo, sku, producto, und, precio_unit, total, cond_pago, medio_pago, usuario, tienda,
                                vendedor, archivo, carga)
    select r.fecha, r.fecha_hora, r.comprobante, r.tipo_comprobante, r.serie, r.numero, r.doc_cliente, r.tipo_doc_cliente,
           r.cliente, r.codigo, r.sku, r.producto, r.und, r.precio_unit, r.total, r.cond_pago, r.medio_pago, r.usuario, r.tienda,
           r.vendedor, c.archivo, c.id
    from cargas_web_filas f cross join lateral jsonb_to_recordset(f.filas) r(
      fecha date, fecha_hora timestamp, comprobante text, tipo_comprobante text, serie text, numero text, doc_cliente text,
      tipo_doc_cliente text, cliente text, codigo text, sku text, producto text, und numeric, precio_unit numeric, total numeric,
      cond_pago text, medio_pago text, usuario text, tienda text, vendedor text)
    where f.carga = p_id;
    select count(*), coalesce(sum(und), 0), coalesce(sum(total), 0) into n, su, sv from contanet_venta where carga = p_id;
  else
    select count(*), coalesce(sum(v.venta), 0) into rf, rv
    from tiendas_venta v join jsonb_to_recordset(c.rangos) r(tienda text, desde date, hasta date)
      on v.tienda = r.tienda and v.fecha between r.desde and r.hasta;
    delete from tiendas_venta v using jsonb_to_recordset(c.rangos) r(tienda text, desde date, hasta date)
    where v.tienda = r.tienda and v.fecha between r.desde and r.hasta;
    insert into tiendas_venta (fecha, tienda, canal, codigo, codigo_corto, sku, origen_sku, tipo_precio, categoria_cliente,
                               und, venta, archivo, carga)
    select r.fecha, r.tienda, r.canal, r.codigo, r.codigo_corto, r.sku, r.origen_sku, coalesce(r.tipo_precio, ''), r.categoria_cliente,
           r.und, r.venta, c.archivo, c.id
    from cargas_web_filas f cross join lateral jsonb_to_recordset(f.filas) r(
      fecha date, tienda text, canal text, codigo text, codigo_corto text, sku text, origen_sku text, tipo_precio text,
      categoria_cliente text, und numeric, venta numeric)
    where f.carga = p_id;
    select count(*), coalesce(sum(und), 0), coalesce(sum(venta), 0) into n, su, sv from tiendas_venta where carga = p_id;
  end if;

  if n <> c.filas or abs(su - c.und) > 0.001 or abs(sv - c.venta) > 0.005 then
    raise exception 'No cuadra: se leyeron % filas, % und y S/ % del archivo, pero se guardaron % filas, % und y S/ %. No se cambió nada.',
      c.filas, c.und, c.venta, n, su, sv;
  end if;
  update cargas_web set estado = 'cargada', cargada = now(), reemplazo_filas = rf, reemplazo_venta = rv where id = p_id;
  delete from cargas_web_filas where carga = p_id;
  return jsonb_build_object('filas', n, 'und', su, 'venta', sv, 'reemplazo_filas', rf, 'reemplazo_venta', rv);
end;
$$;
revoke all on function confirmar_carga(uuid) from public, anon;
grant execute on function confirmar_carga(uuid) to authenticated;
grant execute on function cargas_existente(text, jsonb) to authenticated;
drop policy if exists "borrar la propia sin cargar" on cargas_web;
create policy "borrar la propia sin cargar" on cargas_web for delete to authenticated
  using (usuario = auth.uid() and estado = 'preparada');
