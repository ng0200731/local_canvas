-- Structured canvas persistence.
-- Keeps public.canvases.content as a compatibility mirror, while storing the
-- editable graph in relational tables that can be queried and updated directly.

alter table public.projects
  alter column user_id set default auth.uid();

alter table public.canvases
  alter column user_id set default auth.uid(),
  alter column content set default '{"nodes":[],"edges":[]}'::jsonb;

alter table public.images
  alter column user_id set default auth.uid();

alter table public.canvases
  drop constraint if exists canvases_content_shape,
  add constraint canvases_content_shape
    check (
      jsonb_typeof(content) = 'object'
      and jsonb_typeof(coalesce(content->'nodes', '[]'::jsonb)) = 'array'
      and jsonb_typeof(coalesce(content->'edges', '[]'::jsonb)) = 'array'
    );

create table if not exists public.canvas_nodes (
  canvas_id  uuid not null references public.canvases(id) on delete cascade,
  id         text not null,
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  type       text not null check (
    type in (
      'note',
      'image',
      'group',
      'imageInput',
      'generate',
      'imageOutput',
      'suppler',
      'action',
      'pantone'
    )
  ),
  position   jsonb not null,
  data       jsonb not null default '{}'::jsonb,
  parent_id  text,
  raw        jsonb not null default '{}'::jsonb,
  sort_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (canvas_id, id),
  constraint canvas_nodes_position_shape
    check (
      jsonb_typeof(position) = 'object'
      and jsonb_typeof(position->'x') = 'number'
      and jsonb_typeof(position->'y') = 'number'
    ),
  constraint canvas_nodes_data_shape check (jsonb_typeof(data) = 'object')
);

create index if not exists canvas_nodes_user_id_idx on public.canvas_nodes(user_id);
create index if not exists canvas_nodes_canvas_id_sort_idx
  on public.canvas_nodes(canvas_id, sort_index);
create index if not exists canvas_nodes_type_idx on public.canvas_nodes(type);
create index if not exists canvas_nodes_parent_id_idx on public.canvas_nodes(canvas_id, parent_id);

create table if not exists public.canvas_edges (
  canvas_id     uuid not null references public.canvases(id) on delete cascade,
  id            text not null,
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  source        text not null,
  target        text not null,
  source_handle text,
  target_handle text,
  type          text,
  data          jsonb not null default '{}'::jsonb,
  raw           jsonb not null default '{}'::jsonb,
  sort_index    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (canvas_id, id),
  constraint canvas_edges_data_shape check (jsonb_typeof(data) = 'object')
);

create index if not exists canvas_edges_user_id_idx on public.canvas_edges(user_id);
create index if not exists canvas_edges_canvas_id_sort_idx
  on public.canvas_edges(canvas_id, sort_index);
create index if not exists canvas_edges_source_idx on public.canvas_edges(canvas_id, source);
create index if not exists canvas_edges_target_idx on public.canvas_edges(canvas_id, target);

drop trigger if exists canvas_nodes_touch_updated_at on public.canvas_nodes;
create trigger canvas_nodes_touch_updated_at
  before update on public.canvas_nodes
  for each row execute function public.touch_updated_at();

drop trigger if exists canvas_edges_touch_updated_at on public.canvas_edges;
create trigger canvas_edges_touch_updated_at
  before update on public.canvas_edges
  for each row execute function public.touch_updated_at();

alter table public.canvas_nodes enable row level security;
alter table public.canvas_edges enable row level security;

drop policy if exists "canvas nodes are owned by user" on public.canvas_nodes;
create policy "canvas nodes are owned by user"
  on public.canvas_nodes for all
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.canvases c
      where c.id = canvas_nodes.canvas_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.canvases c
      where c.id = canvas_nodes.canvas_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists "canvas edges are owned by user" on public.canvas_edges;
create policy "canvas edges are owned by user"
  on public.canvas_edges for all
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.canvases c
      where c.id = canvas_edges.canvas_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.canvases c
      where c.id = canvas_edges.canvas_id
        and c.user_id = auth.uid()
    )
  );

create or replace function public.replace_canvas_graph(
  p_canvas_id uuid,
  p_content jsonb,
  p_nodes jsonb default '[]'::jsonb,
  p_edges jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_nodes jsonb := coalesce(p_nodes, '[]'::jsonb);
  v_edges jsonb := coalesce(p_edges, '[]'::jsonb);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to save a canvas.'
      using errcode = '28000';
  end if;

  if jsonb_typeof(v_nodes) <> 'array' then
    raise exception 'Canvas nodes must be a JSON array.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(v_edges) <> 'array' then
    raise exception 'Canvas edges must be a JSON array.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.canvases
    where id = p_canvas_id
      and user_id = auth.uid()
  ) then
    raise exception 'Canvas not found or not owned by current user.'
      using errcode = 'P0002';
  end if;

  update public.canvases
  set content = jsonb_build_object('nodes', v_nodes, 'edges', v_edges)
  where id = p_canvas_id
    and user_id = auth.uid();

  delete from public.canvas_edges where canvas_id = p_canvas_id;
  delete from public.canvas_nodes where canvas_id = p_canvas_id;

  insert into public.canvas_nodes (
    canvas_id,
    user_id,
    id,
    type,
    position,
    data,
    parent_id,
    raw,
    sort_index
  )
  select
    p_canvas_id,
    auth.uid(),
    node_value->>'id',
    node_value->>'type',
    coalesce(node_value->'position', '{"x":0,"y":0}'::jsonb),
    coalesce(node_value->'data', '{}'::jsonb),
    nullif(node_value->>'parentId', ''),
    node_value,
    (ordinality - 1)::integer
  from jsonb_array_elements(v_nodes) with ordinality as nodes(node_value, ordinality);

  insert into public.canvas_edges (
    canvas_id,
    user_id,
    id,
    source,
    target,
    source_handle,
    target_handle,
    type,
    data,
    raw,
    sort_index
  )
  select
    p_canvas_id,
    auth.uid(),
    edge_value->>'id',
    edge_value->>'source',
    edge_value->>'target',
    nullif(edge_value->>'sourceHandle', ''),
    nullif(edge_value->>'targetHandle', ''),
    nullif(edge_value->>'type', ''),
    coalesce(edge_value->'data', '{}'::jsonb),
    edge_value,
    (ordinality - 1)::integer
  from jsonb_array_elements(v_edges) with ordinality as edges(edge_value, ordinality);
end;
$$;

grant execute on function public.replace_canvas_graph(uuid, jsonb, jsonb, jsonb) to authenticated;

insert into public.canvas_nodes (
  canvas_id,
  user_id,
  id,
  type,
  position,
  data,
  parent_id,
  raw,
  sort_index
)
select
  c.id,
  c.user_id,
  node_value->>'id',
  case node_value->>'type'
    when 'output' then 'imageOutput'
    else node_value->>'type'
  end,
  coalesce(node_value->'position', '{"x":0,"y":0}'::jsonb),
  coalesce(node_value->'data', '{}'::jsonb),
  nullif(node_value->>'parentId', ''),
  node_value,
  (ordinality - 1)::integer
from public.canvases c
cross join lateral jsonb_array_elements(coalesce(c.content->'nodes', '[]'::jsonb))
  with ordinality as nodes(node_value, ordinality)
where jsonb_typeof(c.content) = 'object'
  and node_value ? 'id'
  and node_value ? 'type'
  and (node_value->>'type') in (
    'note',
    'image',
    'group',
    'imageInput',
    'generate',
    'imageOutput',
    'output',
    'suppler',
    'action',
    'pantone'
  )
  and jsonb_typeof(coalesce(node_value->'position', '{"x":0,"y":0}'::jsonb)) = 'object'
  and jsonb_typeof(coalesce(node_value->'position', '{"x":0,"y":0}'::jsonb)->'x') = 'number'
  and jsonb_typeof(coalesce(node_value->'position', '{"x":0,"y":0}'::jsonb)->'y') = 'number'
  and jsonb_typeof(coalesce(node_value->'data', '{}'::jsonb)) = 'object'
on conflict (canvas_id, id) do nothing;

insert into public.canvas_edges (
  canvas_id,
  user_id,
  id,
  source,
  target,
  source_handle,
  target_handle,
  type,
  data,
  raw,
  sort_index
)
select
  c.id,
  c.user_id,
  edge_value->>'id',
  edge_value->>'source',
  edge_value->>'target',
  nullif(edge_value->>'sourceHandle', ''),
  nullif(edge_value->>'targetHandle', ''),
  nullif(edge_value->>'type', ''),
  coalesce(edge_value->'data', '{}'::jsonb),
  edge_value,
  (ordinality - 1)::integer
from public.canvases c
cross join lateral jsonb_array_elements(coalesce(c.content->'edges', '[]'::jsonb))
  with ordinality as edges(edge_value, ordinality)
where jsonb_typeof(c.content) = 'object'
  and edge_value ? 'id'
  and edge_value ? 'source'
  and edge_value ? 'target'
  and jsonb_typeof(coalesce(edge_value->'data', '{}'::jsonb)) = 'object'
on conflict (canvas_id, id) do nothing;
