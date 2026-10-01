-- Avance del día: corridas del robot durante el día (solo «hoy») sin perder el respaldo del cierre, y la consulta del avance.
--  - Respaldos: se guardan las 2 últimas cargas de varios días y las 4 últimas de un solo día, por tipo.
--  - Deshacer: se puede deshacer una carga si ninguna posterior del mismo tipo cubre sus fechas.
-- Reemplaza confirmar_carga() y deshacer_carga() de 005. Es repetible.

create or replace function confirmar_carga(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '120s' as $$
declare
  c cargas_web;
  tabla text; filtro text; col_venta text; col_und text;
  n integer; su numeric; sv numeric; rf integer; rv numeric;
begin
  if auth.uid() is null then raise exception 'Hay que iniciar sesión.'; end if;
  select * into c from cargas_web where id = p_id and usuario = auth.uid() for update;
  if not found then raise exception 'La carga no existe.'; end if;
  if c.estado <> 'preparada' then raise exception 'Esta carga ya se hizo.'; end if;
  tabla := tabla_de_carga(c.tipo); filtro := filtro_de_carga(c.tipo);
  col_venta := case c.tipo when 'contanet' then 'total' when 'retail' then 'monto' else 'venta' end;
  col_und := case c.tipo when 'retail' then 'cantidad' else 'und' end;

  if c.tipo = 'retail' then
    insert into retail_tipos (tipo, slug)
    select distinct trim(x.tipo), slug_de(x.tipo) from jsonb_to_recordset(c.clientes) x(cliente text, ruc text, tipo text)
    where coalesce(trim(x.tipo), '') <> '' on conflict (tipo) do nothing;
    insert into retail_clientes (cliente, ruc, tipo)
    select x.cliente, nullif(x.ruc, ''), trim(x.tipo) from jsonb_to_recordset(c.clientes) x(cliente text, ruc text, tipo text)
    on conflict (cliente) do update set tipo = excluded.tipo, ruc = coalesce(excluded.ruc, retail_clientes.ruc);
    if exists (select 1 from jsonb_to_recordset(c.rangos) r(tienda text) where not exists (select 1 from retail_clientes k where k.cliente = r.tienda)) then
      raise exception 'Hay clientes sin tipo de retail asignado.';
    end if;
  end if;

  -- 1. Copia de respaldo de lo que se va a reemplazar, y 2. se borra.
  execute format('insert into cargas_respaldo (carga, fila) select $4, to_jsonb(v) - ''id'' from %I v where %s', tabla, filtro)
    using c.desde, c.hasta, c.rangos, p_id;
  execute format('select count(*), coalesce(sum(%I), 0) from %I v where %s', col_venta, tabla, filtro)
    into rf, rv using c.desde, c.hasta, c.rangos;
  execute format('delete from %I v where %s', tabla, filtro) using c.desde, c.hasta, c.rangos;

  -- 3. Se insertan las filas del archivo.
  if c.tipo = 'contanet' then
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
  elsif c.tipo = 'tiendas' then
    insert into tiendas_venta (fecha, tienda, canal, codigo, codigo_corto, sku, origen_sku, tipo_precio, categoria_cliente,
                               und, venta, archivo, carga)
    select r.fecha, r.tienda, r.canal, r.codigo, r.codigo_corto, r.sku, r.origen_sku, coalesce(r.tipo_precio, ''), r.categoria_cliente,
           r.und, r.venta, c.archivo, c.id
    from cargas_web_filas f cross join lateral jsonb_to_recordset(f.filas) r(
      fecha date, tienda text, canal text, codigo text, codigo_corto text, sku text, origen_sku text, tipo_precio text,
      categoria_cliente text, und numeric, venta numeric)
    where f.carga = p_id;
  else
    insert into retail_ventas (fecha, emisor, ruc, cliente, cantidad, precio_unitario, tipo_venta, codigo, sku, producto, monto,
                               condicion_pago, direccion, detalle_despacho, status, archivo, carga)
    select r.fecha, r.emisor, r.ruc, r.cliente, r.und, r.precio_unitario, r.tipo_venta, r.codigo, r.sku, r.producto, r.venta,
           r.condicion_pago, r.direccion, r.detalle_despacho, r.status, c.archivo, c.id
    from cargas_web_filas f cross join lateral jsonb_to_recordset(f.filas) r(
      fecha date, emisor text, ruc text, cliente text, und numeric, precio_unitario numeric, tipo_venta text, codigo text, sku text,
      producto text, venta numeric, condicion_pago text, direccion text, detalle_despacho text, status text)
    where f.carga = p_id;
  end if;

  -- 4. Verificación: lo guardado debe ser idéntico a lo leído; si no, se deshace todo.
  execute format('select count(*), coalesce(sum(%I), 0), coalesce(sum(%I), 0) from %I where carga = $1', col_und, col_venta, tabla)
    into n, su, sv using p_id;
  if n <> c.filas or abs(su - c.und) > 0.001 or abs(sv - c.venta) > 0.005 then
    raise exception 'No cuadra: se leyeron % filas, % und y S/ % del archivo, pero se guardaron % filas, % und y S/ %. No se cambió nada.',
      c.filas, c.und, c.venta, n, su, sv;
  end if;
  update cargas_web set estado = 'cargada', cargada = now(), reemplazo_filas = rf, reemplazo_venta = rv where id = p_id;
  delete from cargas_web_filas where carga = p_id;
  -- Respaldos que se guardan por tipo: las 2 últimas cargas de varios días (p. ej. el cierre del mes) y las 4 últimas
  -- de un solo día (los avances del día), para que los avances no borren el respaldo del cierre.
  delete from cargas_respaldo where carga in (
    select id from (select id, (desde = hasta) un_dia, row_number() over (partition by (desde = hasta) order by cargada desc) orden
                    from cargas_web where tipo = c.tipo and estado = 'cargada') x
    where (un_dia and orden > 4) or (not un_dia and orden > 2));
  return jsonb_build_object('filas', n, 'und', su, 'venta', sv, 'reemplazo_filas', rf, 'reemplazo_venta', rv);
end;
$$;
revoke all on function confirmar_carga(uuid) from public, anon;
grant execute on function confirmar_carga(uuid) to authenticated;

-- Deshace una carga: quita sus filas y devuelve las que había antes. Solo la última carga de cada tipo.
create or replace function deshacer_carga(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '120s' as $$
declare
  c cargas_web; tabla text; cols text; quitadas integer; devueltas integer; respaldadas integer;
begin
  if auth.uid() is null then raise exception 'Hay que iniciar sesión.'; end if;
  select * into c from cargas_web where id = p_id for update;
  if not found or c.estado <> 'cargada' then raise exception 'Esa carga no está vigente.'; end if;
  -- Se puede deshacer si ninguna carga posterior del mismo tipo cubre alguna de sus fechas.
  if exists (select 1 from cargas_web w where w.tipo = c.tipo and w.estado = 'cargada' and w.cargada > c.cargada
             and w.desde <= c.hasta and w.hasta >= c.desde) then
    raise exception 'Hay una carga posterior que cubre esas mismas fechas: deshaz primero esa.';
  end if;
  select count(*) into respaldadas from cargas_respaldo where carga = p_id;
  if respaldadas <> coalesce(c.reemplazo_filas, 0) then raise exception 'Ya no está el respaldo de esta carga; no se puede deshacer.'; end if;

  tabla := tabla_de_carga(c.tipo); cols := columnas_de(tabla);
  execute format('delete from %I where carga = $1', tabla) using p_id;
  get diagnostics quitadas = row_count;
  execute format('insert into %I (%s) select %s from cargas_respaldo x, jsonb_populate_record(null::%I, x.fila) r where x.carga = $1',
                 tabla, cols, 'r.' || replace(cols, ', ', ', r.'), tabla) using p_id;
  get diagnostics devueltas = row_count;
  if quitadas <> c.filas or devueltas <> respaldadas then
    raise exception 'No cuadra al deshacer (quitadas %, esperadas %; devueltas %, respaldo %). No se cambió nada.', quitadas, c.filas, devueltas, respaldadas;
  end if;
  update cargas_web set estado = 'deshecha', deshecha = now() where id = p_id;
  delete from cargas_respaldo where carga = p_id;
  return jsonb_build_object('quitadas', quitadas, 'devueltas', devueltas);
end;
$$;
revoke all on function deshacer_carga(uuid) from public, anon;
grant execute on function deshacer_carga(uuid) to authenticated;


-- ---------------------------------------------------------------- Avance del día (ContaNet)
-- Venta por hora del día pedido (por defecto, el último día cargado del canal) y del mismo día de la semana anterior,
-- por tienda hasta la misma hora, y la venta del mes hasta ese día (para el ritmo de la meta).
create or replace function contanet_avance(p_canal text, p_fecha date default null) returns jsonb
language sql stable security invoker set search_path = public as $$
  with dia as (select coalesce(p_fecha, (select max(fecha) from contanet_venta where en_canal(p_canal, usuario, medio_pago))) d),
  v as (
    select v.fecha, v.fecha_hora, v.tienda, v.total, v.und,
           case when v.tipo_comprobante <> 'Nota de crédito' then v.comprobante end ticket
    from contanet_venta v, dia
    where en_canal(p_canal, v.usuario, v.medio_pago) and v.fecha in (dia.d, dia.d - 7)
  ),
  corte as (select max(fecha_hora)::time t from v, dia where fecha = dia.d)
  select jsonb_build_object(
    'fecha', (select d from dia),
    'corte', (select t from corte),
    'actualizado', (select max(cargada) from cargas_web where tipo = 'contanet' and estado = 'cargada' and hasta >= (select d from dia)),
    'horas', (select coalesce(jsonb_agg(x order by hora), '[]') from (
                select extract(hour from fecha_hora)::int hora,
                       coalesce(sum(total) filter (where fecha = d), 0) hoy, coalesce(sum(total) filter (where fecha = d - 7), 0) antes,
                       count(distinct ticket) filter (where fecha = d) tickets
                from v, dia group by 1) x),
    'tiendas', (select coalesce(jsonb_agg(x), '[]') from (
                select tienda, coalesce(sum(total) filter (where fecha = d), 0) hoy,
                       coalesce(sum(total) filter (where fecha = d - 7 and fecha_hora::time <= (select t from corte)), 0) antes_corte,
                       coalesce(sum(total) filter (where fecha = d - 7), 0) antes_dia,
                       count(distinct ticket) filter (where fecha = d) tickets,
                       count(distinct ticket) filter (where fecha = d - 7 and fecha_hora::time <= (select t from corte)) tickets_antes,
                       to_char(max(fecha_hora) filter (where fecha = d), 'HH24:MI') ultima
                from v, dia group by tienda) x),
    'mes', (select coalesce(sum(total), 0) from contanet_venta, dia
            where en_canal(p_canal, usuario, medio_pago) and fecha between date_trunc('month', dia.d)::date and dia.d - 1),
    'dias_mes', (select count(distinct fecha) from contanet_venta, dia
                 where en_canal(p_canal, usuario, medio_pago) and fecha between date_trunc('month', dia.d)::date and dia.d - 1)
  );
$$;
grant execute on function contanet_avance(text, date) to authenticated;
