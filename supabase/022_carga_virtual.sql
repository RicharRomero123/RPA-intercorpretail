-- Carga del Excel de ventas virtuales desde la web (tipo 'virtual'), por el mismo camino que las demás cargas:
-- cargas_web → cargas_web_filas → confirmar_carga (reemplaza las fechas del archivo, deja respaldo, verifica al céntimo) y
-- deshacer_carga. Al confirmar, el cruce con ContaNet (digital_canal, digital_cuadre) se recalcula solo. Es repetible.
alter table digital_ventas add column if not exists carga uuid;
create index if not exists digital_ventas_carga on digital_ventas (carga);

alter table cargas_web drop constraint if exists cargas_web_tipo_check;
alter table cargas_web add constraint cargas_web_tipo_check check (tipo in ('contanet', 'tiendas', 'retail', 'virtual'));

do $$
declare def text; nuevo text;
begin
  -- tabla y filtro de la carga
  def := pg_get_functiondef('tabla_de_carga(text)'::regprocedure);
  if position('virtual' in def) = 0 then
    execute replace(def, $x$when 'retail' then 'retail_ventas'$x$, $x$when 'retail' then 'retail_ventas' when 'virtual' then 'digital_ventas'$x$);
  end if;
  def := pg_get_functiondef('filtro_de_carga(text)'::regprocedure);
  if position('virtual' in def) = 0 then
    nuevo := replace(def, $x$when 'contanet' then 'v.fecha between $1 and $2'$x$,
                          $x$when 'contanet' then 'v.fecha between $1 and $2' when 'virtual' then 'v.fecha between $1 and $2'$x$);
    if nuevo = def then raise exception 'No pude extender filtro_de_carga'; end if;
    execute nuevo;
  end if;
  -- confirmar_carga: columna de venta e inserción de las filas
  def := pg_get_functiondef('confirmar_carga(uuid)'::regprocedure);
  if position('digital_ventas' in def) = 0 then
    nuevo := replace(def, $x$col_venta := case c.tipo when 'contanet' then 'total' when 'retail' then 'monto' else 'venta' end;$x$,
                          $x$col_venta := case c.tipo when 'contanet' then 'total' when 'virtual' then 'total' when 'retail' then 'monto' else 'venta' end;$x$);
    nuevo := replace(nuevo, E'  else\n    insert into retail_ventas', E'  elsif c.tipo = ''virtual'' then
    insert into digital_ventas (fecha, comprobante, serie, numero, tipo_comprobante, cliente, doc_cliente, codigo, sku, producto, und,
                                precio_unit, total, medio_pago, canal, distrito, provincia, departamento, salio_de, observacion, archivo, carga)
    select r.fecha, r.comprobante, r.serie, r.numero, r.tipo_comprobante, r.cliente, r.doc_cliente, r.codigo, r.sku, r.producto, r.und,
           r.precio_unit, r.total, r.medio_pago, r.canal, r.distrito, r.provincia, r.departamento, r.salio_de, r.observacion, c.archivo, c.id
    from cargas_web_filas f cross join lateral jsonb_to_recordset(f.filas) r(
      fecha date, comprobante text, serie text, numero integer, tipo_comprobante text, cliente text, doc_cliente text, codigo text, sku text,
      producto text, und numeric, precio_unit numeric, total numeric, medio_pago text, canal text, distrito text, provincia text,
      departamento text, salio_de text, observacion text)
    where f.carga = p_id;
  else
    insert into retail_ventas');
    if position('digital_ventas' in nuevo) = 0 or position($x$when 'virtual' then 'total'$x$ in nuevo) = 0 then
      raise exception 'No pude extender confirmar_carga';
    end if;
    execute nuevo;
  end if;
end $$;

-- Vista previa: lo que hoy tiene la base en las fechas del archivo, por canal (LIMA / PROVINCIA).
do $$
declare def text;
begin
  def := pg_get_functiondef('cargas_existente(text, jsonb)'::regprocedure);
  if position('digital_ventas' in def) = 0 then
    execute replace(def, E'    where p_tipo = ''retail'' group by v.cliente\n  ) x;', E'    where p_tipo = ''retail'' group by v.cliente
    union all
    select v.canal, count(*), coalesce(sum(v.und), 0), coalesce(sum(v.total), 0)
    from digital_ventas v join jsonb_to_recordset(p_rangos) r(tienda text, desde date, hasta date) on v.fecha between r.desde and r.hasta
    where p_tipo = ''virtual'' group by v.canal
  ) x;');
  end if;
end $$;
