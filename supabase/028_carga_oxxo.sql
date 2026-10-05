-- Carga de los reportes diarios de OXXO (sell-out por tienda) desde la web, tipo 'oxxo', por el mismo camino que las demás
-- cargas: cargas_web → cargas_web_filas → confirmar_carga (reemplaza los días del archivo, deja respaldo, verifica) y
-- deshacer_carga. Mismas reglas que rpa/oxxo_excel.py: cliente = 'OXXO', tienda → locales (código que se conserva),
-- EAN → productos, venta y stock por día, tienda y EAN; «costo» = und × precio de despacho a OXXO (Excel Ventas RETAIL).
-- Una carga de OXXO escribe en tres tablas (venta_local_dia, inventario_local y venta_producto_dia, que es la suma por EAN),
-- por eso tiene su propia rama en lugar de la de una sola tabla. Es repetible.

alter table cargas_web drop constraint if exists cargas_web_tipo_check;
alter table cargas_web add constraint cargas_web_tipo_check check (tipo in ('contanet', 'tiendas', 'retail', 'virtual', 'oxxo'));

create or replace function confirmar_carga_oxxo(c cargas_web) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '120s' as $$
declare
  n integer; su numeric; sv numeric; ss numeric; fu numeric; fs numeric; rf integer; rv numeric; mx integer;
begin
  create temp table _ox on commit drop as
  select r.fecha, trim(r.tienda) tienda, r.distrito, r.cluster, trim(r.ean) ean, trim(r.descripcion) descripcion, r.estado,
         coalesce(r.und, 0) und, coalesce(r.venta, 0) venta, coalesce(r.stock, 0) stock
  from cargas_web_filas f cross join lateral jsonb_to_recordset(f.filas) r(
    fecha date, tienda text, distrito text, cluster text, ean text, descripcion text, estado text, und numeric, venta numeric, stock numeric)
  where f.carga = c.id;
  if exists (select 1 from _ox group by fecha, tienda, ean having count(*) > 1) then
    raise exception 'El archivo tiene filas repetidas (mismo día, tienda y EAN). No se cambió nada.';
  end if;

  -- Tiendas: código nuevo (siguiente número) solo para las que no existen; nombre, cluster y distrito del último día.
  select coalesce(max(cod_local), 0) into mx from locales where cliente = 'OXXO';
  insert into locales (cliente, cod_local, local, nombre, cadena, zona, formato, tipo, estado)
  select 'OXXO', mx + row_number() over (order by t.tienda), t.tienda, t.tienda, 'Sin cluster', 'Sin distrito', 'OXXO', 'Tienda de conveniencia', 'ACTIVO'
  from (select distinct tienda from _ox) t
  where not exists (select 1 from locales l where l.cliente = 'OXXO' and l.nombre = t.tienda);
  update locales l set cadena = u.cluster, zona = coalesce(u.distrito, 'Sin distrito'), local = u.tienda
  from (select distinct on (tienda) tienda, cluster, distrito from _ox order by tienda, fecha desc) u
  where l.cliente = 'OXXO' and l.nombre = u.tienda;
  insert into productos (cliente, sku, producto, nombre, marca, umb, estado)
  select distinct on (ean) 'OXXO', ean, descripcion, initcap(lower(descripcion)), 'CALDERON', 'UN', coalesce(nullif(upper(estado), ''), 'ACTIVO')
  from _ox order by ean, fecha desc
  on conflict (cliente, sku) do update set producto = excluded.producto, nombre = excluded.nombre, estado = excluded.estado;

  -- Precio de despacho a OXXO por SKU de Calderón (promedio ponderado): ingreso Calderón estimado.
  create temp table _precio on commit drop as
  select e.codigo ean, p.precio from sku_equivalencia e
  join (select coalesce(v.sku, v.codigo) sku, sum(v.monto) / nullif(sum(v.cantidad), 0) precio
        from retail_ventas v join retail_clientes k on k.cliente = v.cliente where k.tipo = 'OXXO' group by 1) p on p.sku = e.sku
  where e.sistema = 'OXXO';

  -- 1. Respaldo de lo que se reemplaza (venta 'v' e inventario 'i') y 2. se borra.
  insert into cargas_respaldo (carga, fila)
  select c.id, jsonb_build_object('_t', 'v') || to_jsonb(v) from venta_local_dia v where v.cliente = 'OXXO' and v.fecha between c.desde and c.hasta
  union all
  select c.id, jsonb_build_object('_t', 'i') || to_jsonb(i) from inventario_local i where i.cliente = 'OXXO' and i.fecha_inv between c.desde and c.hasta;
  select count(*), coalesce(sum(venta), 0) into rf, rv from venta_local_dia where cliente = 'OXXO' and fecha between c.desde and c.hasta;
  delete from venta_local_dia where cliente = 'OXXO' and fecha between c.desde and c.hasta;
  delete from venta_producto_dia where cliente = 'OXXO' and fecha between c.desde and c.hasta;
  delete from inventario_local where cliente = 'OXXO' and fecha_inv between c.desde and c.hasta;

  -- 3. Filas del archivo.
  insert into venta_local_dia (cliente, fecha, sku, cod_local, und, venta, costo)
  select 'OXXO', x.fecha, x.ean, l.cod_local, x.und, round(x.venta, 4), round(x.und * coalesce(p.precio, 0), 4)
  from _ox x join locales l on l.cliente = 'OXXO' and l.nombre = x.tienda left join _precio p on p.ean = x.ean;
  insert into inventario_local (cliente, fecha_inv, sku, cod_local, inv_und, inv_costo)
  select 'OXXO', x.fecha, x.ean, l.cod_local, x.stock, round(x.stock * coalesce(p.precio, 0), 4)
  from _ox x join locales l on l.cliente = 'OXXO' and l.nombre = x.tienda left join _precio p on p.ean = x.ean;
  insert into venta_producto_dia (cliente, fecha, sku, und, venta, costo)
  select 'OXXO', fecha, sku, sum(und), sum(venta), sum(costo) from venta_local_dia
  where cliente = 'OXXO' and fecha between c.desde and c.hasta group by fecha, sku;

  -- 4. Verificación contra lo leído del archivo; si no cuadra, se deshace todo.
  select count(*), coalesce(sum(und), 0), coalesce(sum(venta), 0) into n, su, sv from venta_local_dia where cliente = 'OXXO' and fecha between c.desde and c.hasta;
  select coalesce(sum(inv_und), 0) into ss from inventario_local where cliente = 'OXXO' and fecha_inv between c.desde and c.hasta;
  select coalesce(sum(stock), 0) into fs from _ox;
  if n <> c.filas or abs(su - c.und) > 0.001 or abs(sv - c.venta) > 0.005 or abs(ss - fs) > 0.001 then
    raise exception 'No cuadra: se leyeron % filas, % und y S/ % del archivo, pero se guardaron % filas, % und y S/ % (stock % vs %). No se cambió nada.',
      c.filas, c.und, c.venta, n, su, sv, fs, ss;
  end if;
  insert into cargas (cliente, fecha, nivel, estado, filas, und, venta, detalle)
  select 'OXXO', fecha, 'local', 'ok', count(*), sum(und), round(sum(venta), 2), 'reporte diario de OXXO (web)' from _ox group by fecha;

  update cargas_web set estado = 'cargada', cargada = now(), reemplazo_filas = rf, reemplazo_venta = rv where id = c.id;
  delete from cargas_web_filas where carga = c.id;
  -- Respaldos: se guardan las 10 últimas cargas de OXXO (llegan de a un día).
  delete from cargas_respaldo where carga in (
    select id from (select id, row_number() over (order by cargada desc) orden from cargas_web where tipo = 'oxxo' and estado = 'cargada') x
    where orden > 10);
  return jsonb_build_object('filas', n, 'und', su, 'venta', sv, 'reemplazo_filas', rf, 'reemplazo_venta', rv);
end;
$$;
revoke all on function confirmar_carga_oxxo(cargas_web) from public, anon, authenticated;

create or replace function deshacer_carga_oxxo(c cargas_web) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '120s' as $$
declare quitadas integer; devueltas integer; respaldadas integer;
begin
  select count(*) into respaldadas from cargas_respaldo where carga = c.id and fila->>'_t' = 'v';
  if respaldadas <> coalesce(c.reemplazo_filas, 0) then raise exception 'Ya no está el respaldo de esta carga; no se puede deshacer.'; end if;
  delete from venta_local_dia where cliente = 'OXXO' and fecha between c.desde and c.hasta;
  get diagnostics quitadas = row_count;
  delete from venta_producto_dia where cliente = 'OXXO' and fecha between c.desde and c.hasta;
  delete from inventario_local where cliente = 'OXXO' and fecha_inv between c.desde and c.hasta;
  insert into venta_local_dia (cliente, fecha, sku, cod_local, und, venta, costo)
  select r.cliente, r.fecha, r.sku, r.cod_local, r.und, r.venta, r.costo
  from cargas_respaldo x, jsonb_populate_record(null::venta_local_dia, x.fila - '_t') r where x.carga = c.id and x.fila->>'_t' = 'v';
  get diagnostics devueltas = row_count;
  insert into inventario_local (cliente, fecha_inv, sku, cod_local, inv_und, inv_costo)
  select r.cliente, r.fecha_inv, r.sku, r.cod_local, r.inv_und, r.inv_costo
  from cargas_respaldo x, jsonb_populate_record(null::inventario_local, x.fila - '_t') r where x.carga = c.id and x.fila->>'_t' = 'i';
  insert into venta_producto_dia (cliente, fecha, sku, und, venta, costo)
  select 'OXXO', fecha, sku, sum(und), sum(venta), sum(costo) from venta_local_dia
  where cliente = 'OXXO' and fecha between c.desde and c.hasta group by fecha, sku;
  if quitadas <> c.filas or devueltas <> respaldadas then
    raise exception 'No cuadra al deshacer (quitadas %, esperadas %; devueltas %, respaldo %). No se cambió nada.', quitadas, c.filas, devueltas, respaldadas;
  end if;
  update cargas_web set estado = 'deshecha', deshecha = now() where id = c.id;
  delete from cargas_respaldo where carga = c.id;
  return jsonb_build_object('quitadas', quitadas, 'devueltas', devueltas);
end;
$$;
revoke all on function deshacer_carga_oxxo(cargas_web) from public, anon, authenticated;

-- confirmar_carga y deshacer_carga derivan a la rama de OXXO (después de sus controles de usuario y estado).
do $$
declare def text; nuevo text;
begin
  def := pg_get_functiondef('confirmar_carga(uuid)'::regprocedure);
  if position('confirmar_carga_oxxo' in def) = 0 then
    nuevo := replace(def, E'  if c.estado <> ''preparada'' then raise exception ''Esta carga ya se hizo.''; end if;\n',
                          E'  if c.estado <> ''preparada'' then raise exception ''Esta carga ya se hizo.''; end if;\n  if c.tipo = ''oxxo'' then return confirmar_carga_oxxo(c); end if;\n');
    if nuevo = def then raise exception 'No pude extender confirmar_carga'; end if;
    execute nuevo;
  end if;
  def := pg_get_functiondef('deshacer_carga(uuid)'::regprocedure);
  if position('deshacer_carga_oxxo' in def) = 0 then
    nuevo := replace(def, E'  select count(*) into respaldadas from cargas_respaldo where carga = p_id;\n',
                          E'  if c.tipo = ''oxxo'' then return deshacer_carga_oxxo(c); end if;\n  select count(*) into respaldadas from cargas_respaldo where carga = p_id;\n');
    if nuevo = def then raise exception 'No pude extender deshacer_carga'; end if;
    execute nuevo;
  end if;
  -- Vista previa: lo que hoy tiene la base de OXXO en los días del archivo.
  def := pg_get_functiondef('cargas_existente(text, jsonb)'::regprocedure);
  if position('venta_local_dia' in def) = 0 then
    nuevo := replace(def, E'    where p_tipo = ''virtual'' group by v.canal\n  ) x;', E'    where p_tipo = ''virtual'' group by v.canal
    union all
    select ''OXXO'', count(*), coalesce(sum(v.und), 0), coalesce(sum(v.venta), 0)
    from venta_local_dia v join jsonb_to_recordset(p_rangos) r(tienda text, desde date, hasta date) on v.fecha between r.desde and r.hasta
    where p_tipo = ''oxxo'' and v.cliente = ''OXXO'' having count(*) > 0
  ) x;');
    if nuevo = def then raise exception 'No pude extender cargas_existente'; end if;
    execute nuevo;
  end if;
end $$;
