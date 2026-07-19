# Setup

The app runs with **zero configuration** in local/demo mode. Add environment keys to
switch capabilities on.

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Without any keys you get: local projects/canvases (browser storage), no auth, no AI
generation. This is only demo mode.

For durable SQL on this machine during development, use **local Postgres** (Docker).
For durable multi-device cloud saves with auth, enable **Supabase**.

Priority: **cloud Supabase > local Postgres > browser localStorage**.

## Environment

Copy `.env.example` → `.env.local` and fill in what you need (all optional):

| Variable                                                            | Effect                                                      |
| ------------------------------------------------------------------- | ----------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Enables auth + cloud Postgres persistence + Storage uploads |
| `SUPABASE_SERVICE_ROLE_KEY`                                         | Server-only admin access (storage deletes, etc.)            |
| `DATABASE_URL` + `NEXT_PUBLIC_LOCAL_POSTGRES=true`                  | Local Docker Postgres (no auth; ignored if Supabase is set) |
| `LOCAL_USER_ID`                                                     | Fixed owner UUID for local Postgres rows (optional)         |
| `XIANGSU_API_KEY`                                                   | Enables server-side image generation via Xiangsu AI         |
| `NEXT_PUBLIC_APP_URL`                                               | Public app URL (defaults to `http://localhost:3000`)        |

## Local Postgres (dev, no auth)

Use this when you want real SQL durability on your machine without cloud Supabase.

1. Install Docker Desktop (or another Docker engine with Compose).
2. Clear or comment out Supabase keys in `.env.local` so cloud mode is off.
3. Set:

   ```bash
   DATABASE_URL=postgresql://canvas:canvas@localhost:15432/canvas_dev
   NEXT_PUBLIC_LOCAL_POSTGRES=true
   # optional:
   LOCAL_USER_ID=00000000-0000-4000-8000-000000000001
   ```

   Host `15432` maps to container `5432` because Windows often reserves host `5432`
   via Hyper-V excluded port ranges. If you use another free host port, keep
   `DATABASE_URL` and `docker-compose.yml` in sync.

4. Start Postgres and apply the local schema:

   ```bash
   pnpm db:up
   pnpm db:migrate
   ```

5. Run the app:

   ```bash
   pnpm dev
   ```

What you get:

- `/projects` opens with **no login**
- Projects, canvases, graph nodes/edges, images metadata, and workspace CRM
  (customers / suppliers / products / options / generic nodes) persist in Postgres
- Uploads go to `.data/uploads/` and are served from `/api/uploads/...`
- Sample-order public token flows are **out of scope** in this mode (stubbed)

Inspect data with:

```bash
docker compose exec postgres psql -U canvas -d canvas_dev
# \dt
# select id, name from projects;
```

Switch back to cloud later by putting Supabase keys back into `.env.local`
(local Postgres is ignored when Supabase is configured).

## Enabling Supabase

1. Create a project at https://supabase.com.
2. Project Settings → API → copy the **URL** and **anon** key into `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). Add the
   **service_role** key as `SUPABASE_SERVICE_ROLE_KEY`.
3. Run every SQL migration in `supabase/migrations/` in filename order via the
   Supabase SQL editor or CLI.
4. Restart `pnpm dev`. Auth, projects, and canvases now persist to Postgres.

Canvas persistence uses structured database tables:

- `projects` and `canvases` store the workspace and canvas records.
- `canvas_nodes` stores each editable canvas node with type, position, data,
  parent, and order.
- `canvas_edges` stores each editable wire with source, target, handles, data,
  and order.
- `canvases.content` remains a JSONB compatibility mirror of `{ nodes, edges }`.
  The app saves through `replace_canvas_graph(...)`, which updates the mirror
  and replaces node/edge rows atomically.

Customer, supplier, and product records also use structured database tables:

- `customers` and `customer_employees` store customer companies and contacts.
- `suppliers` and `supplier_employees` store supplier companies, contacts, and
  typed product categories.
- `products` stores product subject, detail, material, color notes, and image
  URL metadata.
- Customer and supplier saves use database functions that update the company
  and replace employee rows in one transaction.

## Enabling AI generation

1. Obtain a Xiangsu API key and rotate any key that has been exposed publicly.
2. Add `XIANGSU_API_KEY=...` to `.env.local`.
3. Restart. Generate nodes now produce images.

## Scripts

```bash
pnpm dev         # dev server
pnpm build       # production build
pnpm lint        # eslint
pnpm format      # prettier --write .
pnpm test        # vitest (pure-logic unit tests)
pnpm db:up       # docker compose up -d (local Postgres)
pnpm db:down     # docker compose down
pnpm db:migrate  # apply db/local-init.sql + seed LOCAL_USER_ID profile
```
