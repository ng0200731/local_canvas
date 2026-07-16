-- Local Postgres bootstrap for infinite-canvas dev (no Supabase auth/storage).
-- Idempotent. No RLS, no auth.users FKs. Single fixed LOCAL_USER_ID owns all rows.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Profiles ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id           uuid PRIMARY KEY,
  display_name text,
  avatar_url   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Projects ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name                      text NOT NULL,
  description               text,
  customer_id               uuid,
  customer_name             text,
  employee_id               text,
  employee_name             text,
  employee_title            text,
  employee_email            text,
  employee_tel              text,
  currency_code             text,
  currency_name             text,
  currency_symbol           text,
  destination_country_code  text,
  destination_country_name  text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_user_id_idx ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS projects_customer_id_idx ON public.projects(customer_id);

-- ── Canvases ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.canvases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        text NOT NULL,
  content     jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  status      text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'awaiting_approval', 'approved', 'rejected')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canvases_content_shape CHECK (
    jsonb_typeof(content) = 'object'
    AND jsonb_typeof(coalesce(content->'nodes', '[]'::jsonb)) = 'array'
    AND jsonb_typeof(coalesce(content->'edges', '[]'::jsonb)) = 'array'
  )
);
CREATE INDEX IF NOT EXISTS canvases_project_id_idx ON public.canvases(project_id);
CREATE INDEX IF NOT EXISTS canvases_user_id_idx ON public.canvases(user_id);

-- ── Canvas graph ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.canvas_nodes (
  canvas_id  uuid NOT NULL REFERENCES public.canvases(id) ON DELETE CASCADE,
  id         text NOT NULL,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (
    type IN (
      'note', 'image', 'group', 'imageInput', 'generate', 'imageOutput',
      'suppler', 'product', 'action', 'pantone'
    )
  ),
  position   jsonb NOT NULL,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  parent_id  text,
  raw        jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (canvas_id, id),
  CONSTRAINT canvas_nodes_position_shape CHECK (
    jsonb_typeof(position) = 'object'
    AND jsonb_typeof(position->'x') = 'number'
    AND jsonb_typeof(position->'y') = 'number'
  ),
  CONSTRAINT canvas_nodes_data_shape CHECK (jsonb_typeof(data) = 'object')
);
CREATE INDEX IF NOT EXISTS canvas_nodes_user_id_idx ON public.canvas_nodes(user_id);
CREATE INDEX IF NOT EXISTS canvas_nodes_canvas_id_sort_idx ON public.canvas_nodes(canvas_id, sort_index);

CREATE TABLE IF NOT EXISTS public.canvas_edges (
  canvas_id     uuid NOT NULL REFERENCES public.canvases(id) ON DELETE CASCADE,
  id            text NOT NULL,
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source        text NOT NULL,
  target        text NOT NULL,
  source_handle text,
  target_handle text,
  type          text,
  data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw           jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_index    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (canvas_id, id),
  CONSTRAINT canvas_edges_data_shape CHECK (jsonb_typeof(data) = 'object')
);
CREATE INDEX IF NOT EXISTS canvas_edges_user_id_idx ON public.canvas_edges(user_id);
CREATE INDEX IF NOT EXISTS canvas_edges_canvas_id_sort_idx ON public.canvas_edges(canvas_id, sort_index);

-- ── Images ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.images (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  canvas_id     uuid REFERENCES public.canvases(id) ON DELETE SET NULL,
  source        text NOT NULL CHECK (source IN ('upload', 'generated')),
  url           text NOT NULL,
  storage_path  text,
  prompt        text,
  model         text,
  model_details jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS images_user_id_idx ON public.images(user_id);
CREATE INDEX IF NOT EXISTS images_canvas_id_idx ON public.images(canvas_id);

-- ── Canvas sends (local only; public token pages out of scope) ──────────────
CREATE SEQUENCE IF NOT EXISTS public.canvas_send_sequence START 1;

CREATE TABLE IF NOT EXISTS public.canvas_sends (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  canvas_id          uuid NOT NULL REFERENCES public.canvases(id) ON DELETE CASCADE,
  sequence           text NOT NULL UNIQUE
    DEFAULT ('CA' || lpad(nextval('public.canvas_send_sequence')::text, 6, '0')),
  status             text NOT NULL DEFAULT 'awaiting_approval'
    CHECK (status IN ('awaiting_approval', 'approved', 'rejected')),
  recipient_email    text NOT NULL,
  approval_token     text NOT NULL UNIQUE,
  report_url         text NOT NULL,
  approval_url       text NOT NULL,
  rejection_url      text NOT NULL,
  qr_code_data_url   text,
  selected_image_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  report_snapshot    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  responded_at       timestamptz
);
CREATE INDEX IF NOT EXISTS canvas_sends_user_id_idx ON public.canvas_sends(user_id);
CREATE INDEX IF NOT EXISTS canvas_sends_canvas_id_idx ON public.canvas_sends(canvas_id);

-- ── Customers / suppliers / products ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_name        text NOT NULL,
  email_domain_suffix text NOT NULL,
  customer_type       text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_user_id_idx ON public.customers(user_id);

CREATE TABLE IF NOT EXISTS public.customer_employees (
  id           text NOT NULL,
  customer_id  uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_name    text NOT NULL,
  email_prefix text NOT NULL,
  title        text NOT NULL,
  tel          text NOT NULL,
  sort_index   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, id)
);

CREATE TABLE IF NOT EXISTS public.suppliers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_name        text NOT NULL,
  email_domain_suffix text NOT NULL,
  product_types       text[] NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS suppliers_user_id_idx ON public.suppliers(user_id);

CREATE TABLE IF NOT EXISTS public.supplier_employees (
  id           text NOT NULL,
  supplier_id  uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_name    text NOT NULL,
  email_prefix text NOT NULL,
  title        text NOT NULL,
  tel          text NOT NULL,
  sort_index   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (supplier_id, id)
);

CREATE TABLE IF NOT EXISTS public.products (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_kind         text NOT NULL DEFAULT 'supplier' CHECK (owner_kind IN ('supplier', 'customer')),
  supplier_id        uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  customer_id        uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  project_id         uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  product_type       text NOT NULL DEFAULT 'woven-label',
  subject            text NOT NULL,
  detail             text NOT NULL,
  material           text NOT NULL DEFAULT '',
  color_notes        text NOT NULL DEFAULT '',
  parameters         jsonb NOT NULL DEFAULT '{}'::jsonb,
  unit_price         text NOT NULL DEFAULT '0',
  price_unit         text NOT NULL DEFAULT 'per pc',
  image_name         text,
  image_url          text,
  image_storage_path text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_user_id_idx ON public.products(user_id);
CREATE INDEX IF NOT EXISTS products_supplier_id_idx ON public.products(supplier_id);
CREATE INDEX IF NOT EXISTS products_customer_id_idx ON public.products(customer_id);

CREATE TABLE IF NOT EXISTS public.product_variants (
  id                 text NOT NULL,
  product_id         uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sort_index         integer NOT NULL DEFAULT 0,
  material           text NOT NULL DEFAULT '',
  color_notes        text NOT NULL DEFAULT '',
  parameters         jsonb NOT NULL DEFAULT '{}'::jsonb,
  unit_price         text NOT NULL DEFAULT '0',
  price_unit         text NOT NULL DEFAULT 'per pc',
  image_name         text,
  image_url          text,
  image_storage_path text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, id)
);

-- ── Workspace options + generic nodes ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workspace_options (
  id          text NOT NULL,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('currency', 'destination-country', 'address-book')),
  code        text NOT NULL,
  name        text NOT NULL,
  symbol      text,
  is_favorite boolean NOT NULL DEFAULT false,
  sort_index  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, id),
  UNIQUE (user_id, kind, code)
);

CREATE TABLE IF NOT EXISTS public.generic_node_definitions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name         text NOT NULL,
  image_url    text NOT NULL,
  storage_path text,
  images       jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_index   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

-- ── updated_at helper ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'projects', 'canvases', 'canvas_nodes', 'canvas_edges',
    'customers', 'customer_employees', 'suppliers', 'supplier_employees',
    'products', 'product_variants', 'workspace_options', 'generic_node_definitions'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_touch_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()',
      t, t
    );
  END LOOP;
END;
$$;

-- FK from projects.customer_id once customers exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_customer_id_fkey'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
  END IF;
END;
$$;
