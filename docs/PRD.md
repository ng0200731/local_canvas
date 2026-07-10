# PRD — Infinite Canvas AI Agent

## Vision

A web-based, **node-based infinite canvas for AI image generation**. Users arrange nodes
(notes, prompts, reference images, model settings, outputs) on an infinite canvas, wire
reference images into generation nodes, and produce images via AI providers — think a
polished, shareable ComfyUI/Krea for the web.

## MVP scope (this build)

1. **Auth** — email/password via Supabase (graceful demo mode without it).
2. **Dashboard** — list, create, delete **projects**; each project holds **canvases**.
3. **Canvas** — React Flow infinite canvas: pan/zoom/minimap, drag-from-palette nodes,
   autosave. Independent-node model (no graph execution in MVP).
4. **Nodes** — `Note`, `Image`, `Group`, and `Generate` (prompt + model + reference slots).
5. **Image upload** — upload images to a node; drag an image onto a Generate node's
   reference slot.
6. **AI generation** — Generate node calls Xiangsu AI server-side with a selectable
   image model; the result is written to a connected Output node.

## Explicitly out of scope (future milestones)

- Graph-pipeline execution, agent / loop / condition nodes
- History & versioning
- Sharing & permissions
- Deployment / monitoring / analytics

## Core UX flows

- **New user:** sign up → land on empty dashboard → create a project → open a canvas →
  drop a Generate node → type a prompt → generate → image appears.
- **Reference-image flow:** connect or drop up to 14 image references, describe the
  desired edit/composition, and generate a result guided by those images.
- **Persistence:** edits autosave; reloading restores the canvas (localStorage in demo
  mode, Supabase Postgres when configured).

## Success criteria (manual checklist)

- Signup / login; create + delete a project; open a canvas.
- Add, drag, resize nodes; connect image → generate reference.
- Upload an image; generate from a prompt alone or from connected reference images.
- Reload → canvas state is restored.
- App runs with **zero env keys** (local mode) and upgrades cleanly as keys are added.
