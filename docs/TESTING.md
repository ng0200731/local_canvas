# Testing checklist

The app runs with **zero keys** in local/demo mode (data in `localStorage`).
Run through this checklist in a browser after `pnpm dev`. Items marked 🔑 need the
matching key in `.env.local`.

> Note: automated browser (E2E) testing is intentionally not included in this
> repo. The local persistence layer is covered by unit tests (`pnpm test`); the
> canvas interactions below should be verified manually.

## Local / demo mode (no keys)

- [ ] `/` landing renders with a “Local/demo mode” + “AI generation off” line.
- [ ] `/login` and `/signup` show the “No authentication in demo mode” notice with a link into the app.
- [ ] `/projects` dashboard shows the empty state, then a project after creating one.
- [ ] Create a project → redirected to the project page.
- [ ] Create a canvas → redirected into the canvas editor.
- [ ] Canvas: click palette items to drop **Note / Image / Group / Generate** nodes; drag them around; pan/zoom; minimap + controls work.
- [ ] Type in a Note node; the text persists after a full page reload (autosave → localStorage).
- [ ] **Image node**: click or drop an image file → it appears (resized); reload persists it.
- [ ] Drag an Image node’s reference handle (top-right link icon) onto a **Generate** node’s reference slot → it’s listed there.
- [ ] **Generate** node: with no `XIANGSU_API_KEY`, generation returns a clear setup error.
- [ ] Delete a project from the dashboard → its canvases are gone too.

## With `XIANGSU_API_KEY`

- [ ] Generate node: all supplied aliases appear; text/video entries are visible but disabled.
- [ ] Generate node: select an image model, enter a prompt, connect Output, then Generate.
- [ ] Output node: generated image appears with drag-reference and download actions.
- [ ] Generate node: connected/dropped reference images are forwarded to image generation.

## With Supabase keys 🔑 (run all `supabase/migrations/*.sql` first)

- [ ] Sign up / log in / sign out round-trips; protected routes redirect to `/login`.
- [ ] Projects & canvases persist to Postgres across reloads and a second device.
- [ ] Canvas edits create/update rows in `canvas_nodes` and `canvas_edges`.
- [ ] Reloading a canvas fetches those database rows and keeps nodes editable.
- [ ] Customer create/edit saves rows in `customers` and `customer_employees`.
- [ ] Supplier create/edit saves rows in `suppliers` and `supplier_employees`.
- [ ] Product create/edit saves rows in `products`.
- [ ] Uploaded images are stored in the private-per-user `uploads` bucket.

## Automated

- [ ] `pnpm test` — unit tests for local stores, store selector, and canvas
      content validation pass.
- [ ] `pnpm lint` — eslint passes.
- [ ] `pnpm build` — production build succeeds.
