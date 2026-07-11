# Setup

The app runs with **zero configuration** in local/demo mode. Add environment keys to
switch capabilities on.

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Without any keys you get: local projects/canvases (browser storage), no auth, no AI
generation. This is only demo mode. For durable multi-device saves, enable
Supabase so canvases are written to Postgres.

## Environment

Copy `.env.example` → `.env.local` and fill in what you need (all optional):

| Variable                                                     | Effect                                                      |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Enables auth + cloud Postgres persistence + Storage uploads |
| `SUPABASE_SERVICE_ROLE_KEY`                                  | Server-only admin access (storage deletes, etc.)            |
| `XIANGSU_API_KEY`                                            | Enables server-side image generation via Xiangsu AI         |
| `NEXT_PUBLIC_APP_URL`                                        | Public app URL (defaults to `http://localhost:3000`)        |

## Enabling Supabase

1. Create a project at https://supabase.com.
2. Project Settings → API → copy the **URL** and **anon** key into `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Add the
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

## Enabling AI generation

1. Obtain a Xiangsu API key and rotate any key that has been exposed publicly.
2. Add `XIANGSU_API_KEY=...` to `.env.local`.
3. Restart. Generate nodes now produce images.

## Scripts

```bash
pnpm dev      # dev server
pnpm build    # production build
pnpm lint     # eslint
pnpm format   # prettier --write .
pnpm test     # vitest (pure-logic unit tests)
```
