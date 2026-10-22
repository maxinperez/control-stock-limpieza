-- Control de Stock · esquema de base de datos (Supabase / Postgres)
-- Ejecutar completo en: Supabase > SQL Editor > New query > Run

create extension if not exists pgcrypto;

-- ============ TABLAS ============

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default '',
  rol text not null default 'contador' check (rol in ('admin','contador')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Copia de los productos del sistema principal (se actualiza importando la planilla)
create table public.productos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,          -- clave de enlace con el sistema principal
  barcode text,
  nombre text not null,
  unidad text not null default 'un' check (unidad in ('un','kg','lt')),  -- unidad, kilo, litro
  categoria text,
  stock_actual numeric(14,3) not null default 0,  -- stock "base" de la app
  stock_minimo numeric(14,3) not null default 0,
  activo boolean not null default true,
  origen text not null default 'importado' check (origen in ('importado','alta_rapida')),
  created_at timestamptz not null default now()
);
create index productos_barcode_idx on public.productos(barcode);

create table public.conteos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  estado text not null default 'abierto' check (estado in ('abierto','cerrado')),
  creado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  cerrado_at timestamptz,
  continua_de uuid references public.conteos(id) on delete set null  -- conteo anterior que este continúa
);
-- Solo puede haber un conteo abierto a la vez
create unique index conteos_un_abierto on public.conteos(estado) where estado = 'abierto';

-- Foto del stock de cada producto al iniciar el conteo
create table public.conteo_base (
  conteo_id uuid not null references public.conteos(id) on delete cascade,
  producto_id uuid not null references public.productos(id),
  stock_sistema numeric(14,3) not null default 0,
  primary key (conteo_id, producto_id)
);

-- Cada carga es un registro que SUMA (o resta si es corrección). El id lo genera
-- el cliente, por eso reenviar una carga offline nunca se duplica.
create table public.conteo_movimientos (
  id uuid primary key,
  conteo_id uuid not null references public.conteos(id) on delete cascade,
  producto_id uuid not null references public.productos(id),
  cantidad numeric(14,3) not null,
  usuario_id uuid not null references auth.users(id),
  nota text,
  created_at timestamptz not null default now()
);
create index mov_conteo_prod_idx on public.conteo_movimientos(conteo_id, producto_id);

-- ============ VISTA RESUMEN ============

create view public.conteo_resumen with (security_invoker = true) as
select
  b.conteo_id,
  p.id as producto_id,
  p.codigo, p.barcode, p.nombre, p.unidad, p.categoria,
  p.stock_minimo,
  b.stock_sistema,
  coalesce(sum(m.cantidad), 0) as contado,
  count(m.id) as movimientos,
  coalesce(sum(m.cantidad), 0) - b.stock_sistema as diferencia,
  max(m.created_at) as ultimo_mov
from public.conteo_base b
join public.productos p on p.id = b.producto_id
left join public.conteo_movimientos m
  on m.conteo_id = b.conteo_id and m.producto_id = b.producto_id
group by b.conteo_id, p.id, b.stock_sistema;

-- ============ SEGURIDAD (RLS) ============

create function public.is_active() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and activo)
$$;

create function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and activo and rol = 'admin')
$$;

alter table public.profiles enable row level security;
alter table public.productos enable row level security;
alter table public.conteos enable row level security;
alter table public.conteo_base enable row level security;
alter table public.conteo_movimientos enable row level security;

create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

create policy productos_select on public.productos for select using (public.is_active());
create policy productos_insert on public.productos for insert with check (public.is_admin());
create policy productos_update on public.productos for update
  using (public.is_admin()) with check (public.is_admin());

create policy conteos_select on public.conteos for select using (public.is_active());

create policy base_select on public.conteo_base for select using (public.is_active());

create policy mov_select on public.conteo_movimientos for select using (public.is_active());
create policy mov_insert on public.conteo_movimientos for insert with check (
  usuario_id = auth.uid()
  and public.is_active()
  and exists (select 1 from public.conteos c where c.id = conteo_id and c.estado = 'abierto')
);

-- ============ FUNCIONES (RPC) ============

-- El primer usuario que se crea queda como admin; el resto como contador.
-- (El rol real se asigna luego desde la función create-user, nunca desde el cliente.)
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, nombre, rol)
  values (
    new.id,
    coalesce(split_part(new.email, '@', 1), ''),
    case when exists (select 1 from profiles) then 'contador' else 'admin' end
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Inicia un conteo. Con p_continuar_de (un conteo CERRADO) el nuevo arranca con lo ya contado
-- y conserva el stock de referencia original; sin él, parte de cero con el stock actual.
-- Si no se da nombre, se genera: 'Conteo dd/mm/aaaa · XXXXXX' (código = comienzo del id).
create function public.iniciar_conteo(p_nombre text default null, p_continuar_de uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
  v_prev conteos%rowtype;
  v_nombre text;
begin
  if not is_admin() then raise exception 'Solo el administrador puede iniciar un conteo'; end if;

  if p_continuar_de is not null then
    select * into v_prev from conteos where id = p_continuar_de;
    if not found then raise exception 'El conteo a continuar no existe'; end if;
    if v_prev.estado <> 'cerrado' then raise exception 'Solo se puede continuar un conteo cerrado'; end if;
  end if;

  if exists (select 1 from conteos where estado = 'abierto') then
    raise exception 'Ya hay un conteo abierto: cerralo antes de iniciar otro';
  end if;

  v_nombre := coalesce(
    nullif(trim(p_nombre), ''),
    'Conteo ' || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY')
      || ' · ' || upper(substr(v_id::text, 1, 6))
  );

  insert into conteos (id, nombre, creado_por, continua_de)
  values (v_id, v_nombre, auth.uid(), p_continuar_de);

  if p_continuar_de is null then
    insert into conteo_base (conteo_id, producto_id, stock_sistema)
      select v_id, id, stock_actual from productos where activo;
  else
    -- Se conserva el stock de referencia ORIGINAL del conteo que se continúa
    insert into conteo_base (conteo_id, producto_id, stock_sistema)
      select v_id, b.producto_id, b.stock_sistema
      from conteo_base b join productos p on p.id = b.producto_id
      where b.conteo_id = p_continuar_de
        and (p.activo or exists (
          select 1 from conteo_movimientos m
          where m.conteo_id = p_continuar_de and m.producto_id = b.producto_id));
    -- Productos dados de alta después
    insert into conteo_base (conteo_id, producto_id, stock_sistema)
      select v_id, p.id, p.stock_actual from productos p
      where p.activo and not exists (
        select 1 from conteo_base x where x.conteo_id = v_id and x.producto_id = p.id);
    -- Lo ya contado se arrastra como un movimiento por producto (el total se conserva)
    insert into conteo_movimientos (id, conteo_id, producto_id, cantidad, usuario_id, nota)
      select gen_random_uuid(), v_id, m.producto_id, sum(m.cantidad), auth.uid(),
             'Arrastre de «' || v_prev.nombre || '»'
      from conteo_movimientos m where m.conteo_id = p_continuar_de
      group by m.producto_id;
  end if;

  return v_id;
end $$;

create function public.alta_rapida(
  p_conteo uuid, p_nombre text, p_unidad text, p_codigo text, p_barcode text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_active() then raise exception 'Usuario no autorizado'; end if;
  if not exists (select 1 from conteos where id = p_conteo and estado = 'abierto') then
    raise exception 'El conteo no está abierto';
  end if;
  insert into productos (codigo, barcode, nombre, unidad, stock_actual, origen)
  values (
    coalesce(nullif(trim(p_codigo), ''), 'NUEVO-' || substr(gen_random_uuid()::text, 1, 6)),
    nullif(trim(p_barcode), ''), trim(p_nombre), coalesce(nullif(trim(p_unidad), ''), 'un'),
    0, 'alta_rapida'
  ) returning id into v_id;
  insert into conteo_base (conteo_id, producto_id, stock_sistema) values (p_conteo, v_id, 0);
  return v_id;
end $$;

-- Cierra el conteo: lo contado pasa a ser el nuevo stock base de la app.
create function public.cerrar_conteo(p_conteo uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el administrador puede cerrar un conteo'; end if;
  update productos p set stock_actual = s.total
  from (select producto_id, sum(cantidad) as total
        from conteo_movimientos where conteo_id = p_conteo group by producto_id) s
  where p.id = s.producto_id;
  update conteos set estado = 'cerrado', cerrado_at = now()
  where id = p_conteo and estado = 'abierto';
end $$;

-- Importación masiva de productos desde la planilla (solo admin)
create function public.importar_productos(p_rows jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not is_admin() then raise exception 'Solo el administrador puede importar'; end if;
  if exists (select 1 from conteos where estado = 'abierto') then
    raise exception 'Hay un conteo abierto: cerralo antes de importar';
  end if;
  insert into productos (codigo, barcode, nombre, unidad, categoria, stock_actual, stock_minimo)
  select r->>'codigo', r->>'barcode', r->>'nombre',
         coalesce(r->>'unidad', 'un'), r->>'categoria',
         coalesce((r->>'stock')::numeric, 0),
         coalesce((r->>'stock_minimo')::numeric, 0)
  from jsonb_array_elements(p_rows) r
  on conflict (codigo) do update set
    nombre = excluded.nombre,
    barcode = coalesce(excluded.barcode, productos.barcode),
    unidad = excluded.unidad,
    categoria = coalesce(excluded.categoria, productos.categoria),
    stock_actual = excluded.stock_actual,
    -- el mínimo solo se pisa si la planilla trae esa columna
    stock_minimo = case when p_rows->0 ? 'stock_minimo' then excluded.stock_minimo else productos.stock_minimo end,
    activo = true;
  get diagnostics n = row_count;
  return n;
end $$;

-- Alta manual de un producto (solo admin, sin conteo abierto)
create function public.crear_producto(
  p_codigo text, p_nombre text, p_unidad text, p_categoria text,
  p_stock numeric, p_minimo numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_admin() then raise exception 'Solo el administrador puede crear productos'; end if;
  if exists (select 1 from conteos where estado = 'abierto') then
    raise exception 'Hay un conteo abierto: usá "Producto nuevo" dentro del conteo o cerralo antes';
  end if;
  if nullif(trim(p_codigo), '') is null or nullif(trim(p_nombre), '') is null then
    raise exception 'Código y nombre son obligatorios';
  end if;
  if p_unidad not in ('un','kg','lt') then raise exception 'Unidad inválida'; end if;
  if coalesce(p_stock,0) < 0 or coalesce(p_minimo,0) < 0 then
    raise exception 'Los valores no pueden ser negativos';
  end if;
  if p_unidad = 'un' and coalesce(p_stock,0) <> trunc(coalesce(p_stock,0)) then
    raise exception 'Las unidades se cargan en números enteros';
  end if;
  if exists (select 1 from productos where codigo = trim(p_codigo)) then
    raise exception 'Ya existe un producto con ese código';
  end if;
  insert into productos (codigo, nombre, unidad, categoria, stock_actual, stock_minimo)
  values (trim(p_codigo), trim(p_nombre), p_unidad, nullif(trim(p_categoria), ''),
          coalesce(p_stock,0), coalesce(p_minimo,0))
  returning id into v_id;
  return v_id;
end $$;

-- Edición de un producto (solo admin). Reglas: código único, la unidad no cambia si ya tiene
-- cantidades contadas y el stock del sistema no se toca con un conteo abierto.
create function public.editar_producto(
  p_id uuid, p_codigo text, p_nombre text, p_unidad text, p_categoria text,
  p_stock numeric, p_minimo numeric
) returns void
language plpgsql security definer set search_path = public as $$
declare v productos%rowtype;
begin
  if not is_admin() then raise exception 'Solo el administrador puede editar productos'; end if;
  select * into v from productos where id = p_id;
  if not found then raise exception 'El producto no existe'; end if;
  if nullif(trim(p_codigo), '') is null or nullif(trim(p_nombre), '') is null then
    raise exception 'Código y nombre son obligatorios';
  end if;
  if p_unidad not in ('un','kg','lt') then raise exception 'Unidad inválida'; end if;
  if coalesce(p_stock,0) < 0 or coalesce(p_minimo,0) < 0 then
    raise exception 'Los valores no pueden ser negativos';
  end if;
  if p_unidad = 'un' and coalesce(p_stock,0) <> trunc(coalesce(p_stock,0)) then
    raise exception 'Las unidades se cargan en números enteros';
  end if;
  if exists (select 1 from productos where codigo = trim(p_codigo) and id <> p_id) then
    raise exception 'Ya existe otro producto con ese código';
  end if;
  if p_unidad <> v.unidad and exists (select 1 from conteo_movimientos where producto_id = p_id) then
    raise exception 'No se puede cambiar la unidad: el producto ya tiene cantidades contadas';
  end if;
  if coalesce(p_stock,0) <> v.stock_actual and exists (select 1 from conteos where estado = 'abierto') then
    raise exception 'El stock del sistema no se puede modificar con un conteo abierto';
  end if;
  update productos set
    codigo = trim(p_codigo), nombre = trim(p_nombre), unidad = p_unidad,
    categoria = nullif(trim(p_categoria), ''),
    stock_actual = coalesce(p_stock,0), stock_minimo = coalesce(p_minimo,0)
  where id = p_id;
end $$;

-- Nunca contado → se borra. Con historial → se archiva (activo = false). Devuelve 'eliminado' o 'archivado'.
create function public.eliminar_producto(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el administrador puede eliminar productos'; end if;
  if not exists (select 1 from productos where id = p_id) then raise exception 'El producto no existe'; end if;

  -- Si hay un conteo abierto y el producto todavía no tiene cargas ahí, se lo saca de ese conteo
  delete from conteo_base b using conteos c
  where b.conteo_id = c.id and c.estado = 'abierto' and b.producto_id = p_id
    and not exists (select 1 from conteo_movimientos m where m.conteo_id = b.conteo_id and m.producto_id = p_id);

  if exists (select 1 from conteo_base where producto_id = p_id)
     or exists (select 1 from conteo_movimientos where producto_id = p_id) then
    update productos set activo = false where id = p_id;
    return 'archivado';
  end if;
  delete from productos where id = p_id;
  return 'eliminado';
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.editar_producto(uuid,text,text,text,text,numeric,numeric) to authenticated;
grant execute on function public.eliminar_producto(uuid) to authenticated;
grant execute on function public.crear_producto(text,text,text,text,numeric,numeric) to authenticated;
revoke execute on function public.handle_new_user() from authenticated;
grant execute on function public.is_active() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.iniciar_conteo(text, uuid) to authenticated;
grant execute on function public.alta_rapida(uuid, text, text, text, text) to authenticated;
grant execute on function public.cerrar_conteo(uuid) to authenticated;
grant execute on function public.importar_productos(jsonb) to authenticated;

-- Actualización en vivo entre los distintos usuarios
alter publication supabase_realtime add table public.conteo_movimientos;
