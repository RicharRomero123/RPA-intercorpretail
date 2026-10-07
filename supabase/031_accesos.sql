-- Accesos por usuario: quién ve qué módulo. Sin fila en usuario_acceso = acceso completo (como hasta ahora); con fila, solo los
-- módulos de la lista. Se aplica en la base (reglas de lectura de cada tabla), no solo en la web: un usuario limitado no puede leer
-- otros datos ni llamando a la API directamente. Módulos: consolidado, retail, tiendas, digital, rappi, configuracion.
-- Es repetible.
create table if not exists usuario_acceso (
  email    text primary key,
  modulos  text[] not null,
  nota     text,
  creado   timestamptz not null default now()
);
alter table usuario_acceso enable row level security;
drop policy if exists usuario_acceso_propio on usuario_acceso;
create policy usuario_acceso_propio on usuario_acceso for select to authenticated using (lower(email) = lower(auth.jwt() ->> 'email'));

-- true si el usuario no tiene restricciones (o si es el robot/servidor, que no trae correo).
create or replace function acceso_total() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from usuario_acceso where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
create or replace function puede_modulo(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select acceso_total() or exists (select 1 from usuario_acceso where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) and p = any(modulos));
$$;
grant execute on function acceso_total() to authenticated;
grant execute on function puede_modulo(text) to authenticated;

-- Reglas de lectura por módulo. «(select …)» hace que se evalúe una vez por consulta y no por fila.
do $$
declare t text; regla text;
begin
  for t, regla in values
    -- ContaNet: el canal digital es el usuario VENTAS01; el resto (tiendas y lo cobrado con Rappi) es de tiendas/rappi.
    ('contanet_venta', '(select acceso_total()) or (usuario = ''VENTAS01'' and (select puede_modulo(''digital''))) or (usuario <> ''VENTAS01'' and ((select puede_modulo(''tiendas'')) or (select puede_modulo(''rappi''))))'),
    ('digital_ventas', '(select puede_modulo(''digital''))'),
    ('tiendas_venta', '(select puede_modulo(''tiendas''))'),
    ('tiendas_cargas', '(select puede_modulo(''tiendas''))'),
    ('meta_tienda', '(select puede_modulo(''tiendas''))'),
    ('retail_ventas', '(select puede_modulo(''retail''))'),
    ('retail_clientes', '(select puede_modulo(''retail''))'),
    ('retail_tipos', '(select puede_modulo(''retail''))'),
    ('venta_local_dia', '(select puede_modulo(''retail''))'),
    ('venta_producto_dia', '(select puede_modulo(''retail''))'),
    ('inventario_local', '(select puede_modulo(''retail''))'),
    ('locales', '(select puede_modulo(''retail''))'),
    ('productos', '(select puede_modulo(''retail''))'),
    ('cargas', '(select acceso_total())'),
    ('consolidado_cargas', '(select puede_modulo(''consolidado''))'),
    -- El canal digital usa las metas LIMA y PROVINCIA del consolidado.
    ('consolidado_mensual', '(select puede_modulo(''consolidado'')) or (canal in (''LIMA'', ''PROVINCIA'') and (select puede_modulo(''digital'')))')
  loop
    execute format('drop policy if exists "leer con sesion" on %I', t);
    execute format('drop policy if exists %I on %I', t || '_lectura', t);
    execute format('drop policy if exists acceso_modulo on %I', t);
    execute format('create policy acceso_modulo on %I for select to authenticated using (%s)', t, regla);
  end loop;
end $$;

-- Cargas hechas desde la web: cada uno ve las suyas; con acceso completo, todas.
drop policy if exists "leer con sesion" on cargas_web;
drop policy if exists acceso_modulo on cargas_web;
create policy acceso_modulo on cargas_web for select to authenticated using ((select acceso_total()) or usuario = auth.uid());

-- Funciones que cargan, deshacen o reclasifican datos (saltan las reglas de lectura): solo usuarios con acceso completo.
do $$
declare f regprocedure; def text; nuevo text;
begin
  foreach f in array array['confirmar_carga(uuid)'::regprocedure, 'deshacer_carga(uuid)'::regprocedure,
                           (select oid::regprocedure from pg_proc where proname = 'retail_asignar_tipo' and pronamespace = 'public'::regnamespace limit 1)]
  loop
    def := pg_get_functiondef(f);
    if position('acceso_total()' in def) > 0 then continue; end if;
    nuevo := regexp_replace(def, '(\nbegin\n)', E'\\1  if not public.acceso_total() then raise exception ''Tu usuario no tiene permiso para cargar o cambiar datos.''; end if;\n');
    if nuevo = def then raise exception 'No encontré el inicio de %', f; end if;
    execute nuevo;
  end loop;
end $$;

-- Usuario limitado: publicidad solo ve el canal digital.
insert into usuario_acceso (email, modulos, nota) values ('publicidad@productoscalderon.pe', array['digital'], 'Solo Canal digital (pedido 2026-10-07)')
on conflict (email) do update set modulos = excluded.modulos, nota = excluded.nota;
