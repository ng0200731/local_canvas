# Setup

The app runs with **zero configuration** in local/demo mode. Add environment keys to
switch capabilities on.

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Without any keys you get: local projects/canvases (localStorage), no auth, no AI
generation. The canvas, notes, image uploads (as data URLs), and persistence all work.

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
3. Run the SQL migration in `supabase/migrations/` via the Supabase SQL editor (or CLI).
4. Restart `pnpm dev`. Auth, projects, and canvases now persist to Postgres.

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
