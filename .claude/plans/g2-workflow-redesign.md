# G2 Node Workflow Redesign

Redesign the G2 node so the main image and reference images come from **drag-in drop zones** (not the wired input-port system the Generate node uses), region drawing moves into a **full-screen overlay editor** with redo/undo + thickness + auto-close, and the **prompt** gains `@alias` mention support for the main image and each reference/region.

The user picked: **drop zones inside the G2 node** for both main image and references, and a **full-screen overlay dialog** for drawing.

---

## 1. Data model changes — `lib/nodes/types.ts` + `lib/nodes/registry.ts`

### `G2Region` (enrich, reuse existing fields)

```ts
export interface G2Region {
  id: string;
  name: string;                          // editable in overlay; this is the "alias" referenced by @
  type: "rect" | "freehand";
  // rect:    { left, top, width, height }                 (image pixel coords)
  // freehand: { points: {x,y}[], thickness, closed }      (closed = auto-filled loop)
  data: Record<string, unknown>;
  color: string;
  thickness: number;                    // NEW — rect border width + brush stroke width
}
```

### `G2NodeData` — add drag-source tracking, generation controls, history

```ts
export interface G2NodeData {
  mainImageUrl: string | null;
  mainImageStoragePath: string | null;
  mainImageSourceNodeId: string | null;  // NEW — node the main image was dragged from (for alias)
  mainImageAlias: string | null;         // NEW — alias shown on the thumbnail (e.g. "@shoe")

  g2Regions: G2Region[];
  // NEW — undo/redo stacks of g2Regions (overlay-only, persisted so reopening keeps history)
  undoStack: G2Region[][];
  redoStack: G2Region[][];

  references: G2Reference[];             // CHANGED from string[] -> structured
  prompt: string;
  systemPrompt: string;

  // NEW — user-editable generation options (defaults match the old hardcoded values)
  // Reuse types from lib/image-generation-models.ts:
  //   model: ImageGenerationModelId (default "gpt-image-2")
  //   size: ImageGenerationSize       (default "1024x1024")
  //   outputFormat: ImageGenerationOutputFormat
  //   resolution: ImageGenerationResolution (default "preview")
  model?: ImageGenerationModelId;
  size?: ImageGenerationSize;
  outputFormat?: ImageGenerationOutputFormat;
  resolution?: ImageGenerationResolution;

  status, resultUrl, error, width, height... (unchanged)
}

export interface G2Reference {
  url: string;
  sourceNodeId: string | null;           // node it was dragged from (for @alias)
  alias: string | null;                  // "@alias" label on the thumbnail
}
```

Migration: treat a non-array / string-array `references` as legacy and coerce in the node (a `string` → `{ url, sourceNodeId: null, alias: null }`). **No migration for region coords** — G2 is separate/disposable, old nodes are allowed to break (confirmed).

`registry.ts` `g2.defaultData` — add `mainImageSourceNodeId: null`, `mainImageAlias: null`, `undoStack: []`, `redoStack: []`; `references: []` (already []); `model: "gpt-image-2"`, `size: "1024x1024"`, `outputFormat: "png"`, `resolution: "preview"` (preserve the old behavior by default; the old code hardcoded model `gpt-image-2`, size `1024x1024`, format `png`, resolution `preview`).

---

## 2. Drop zones — `components/canvas/nodes/g2-node.tsx`

Both zones accept drags carrying the existing MIME `"application/ica-image-url"` (already emitted by `image-node.tsx` and `output-node.tsx` via the Link2 drag button). **But that MIME only carries a URL, not the source node/alias** — which we need for the thumbnail alias and the `@` mention.

### 2a. Extend the drag payload — `components/canvas/nodes/image-node.tsx`, `output-node.tsx`
Add a second, richer MIME alongside the existing one:

```ts
e.dataTransfer.setData("application/ica-image-url", url);
e.dataTransfer.setData(
  "application/ica-image-ref",
  JSON.stringify({ url, sourceNodeId: data.id, alias: data.alias ?? null, label: ... })
);
```

Decoders read the rich one first, fall back to the plain URL (keeps the existing Generate-node drop working untouched).

### 2b. Main-image drop zone (replaces the file-upload box)
- When no main image: dashed drop zone ("Drag an image/Input node here"), keep the existing file `<input>` as a fallback via a small upload icon.
- On drop: parse `ica-image-ref` (or `ica-image-url`), set `mainImageUrl`, `mainImageStoragePath: null`, `mainImageSourceNodeId`, `mainImageAlias`.
- When main image present: show the thumbnail img. **Overlay the alias badge** `@{mainImageAlias}` (bottom-left) — "thumbnail will show on the main image (follow the node with the alias)".
- Clicking the thumbnail **opens the full-screen drawing overlay** (item 3). Remove the in-node `Rect`/`Brush`/`Select` buttons and the SVG `RegionOverlay` — that logic moves into the overlay.
- Keep a replace-image (upload icon) and a "clear" control.

### 2c. Reference drop zone (B, C, D…)
- Dashed area "Drag line from a node to add a reference". On drop of `ica-image-ref`/`ica-image-url`, push a `G2Reference` (dedupe by url).
- Render each reference as a thumbnail with `@{alias}` badge (bottom strip) + remove (×). Clicking opens `ImagePreviewDialog` (zoom only, no mask editing) — reuse the existing component with no `onMasksChange`.
- Keep the `+` upload fallback.

---

## 3. Full-screen drawing overlay — new component `components/canvas/nodes/g2-draw-overlay.tsx`

A full-viewport dialog (reuse the `Dialog`/`DialogContent` shadcn/base-ui pattern from `image-preview-dialog.tsx`, sized `h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)]`). Opened from the main-image thumbnail.

### Layout
- **Center**: the main image, rendered at contained size inside a relative container; an SVG overlay on top renders all regions + the in-progress draw.
- **Left toolbar (tool + thickness + actions)**:
  - Tool buttons: **Rect**, **Brush** (the user said "for RECT BRUSH, remove" in the *node* — the tool choice moves here; Select is implicit/cursor default).
  - Thickness slider (rect border width / brush stroke width), value 2–80, default 12. Drives `region.thickness`.
  - Undo / Redo buttons.
  - Clear-all.
- **Right panel (regions list)**:
  - List of regions; each row: color swatch, **editable name input** (the "alias" — used by `@`), delete.
  - "Save region" = name persists to `region.name` on blur/Enter.

### Drawing mechanics (port the existing rect/freehand logic, add features)
- Rect: drag from point A→B; store `{ left, top, width, height }` in **image pixel space** (convert container-space via the img's natural size / displayed size ratio — needed so `createMaskFromG2Regions` still maps correctly; the current code uses container-space coords directly against the mask canvas sized `width`×`height`, which already works if we keep the same convention — see §4 before changing).
- Brush: collect pointer points; **auto-close + auto-fill**: when the pointer lifts near the start point (within `thickness * 1.5` px, reuse the pattern from `lib/image-mask.ts` `shouldCloseFreehandLoop`), set `closed: true` and fill the polygon. Otherwise render as an open thick stroke.
- On every committed region, push the previous `g2Regions` onto `undoStack`, clear `redoStack`, then `updateNodeData`.
- **Undo**: pop last from `undoStack`, push current to `redoStack`, restore.
- **Redo**: reverse.
- Thickness applied: rect → stroke width of the rectangle outline (so a thick rect fills a band, not just a 1px line); brush → stroke width, or solid fill when closed.

### Coordinate / mask note
The mask helper `createMaskFromG2Regions` currently draws using **container-space pixel coordinates** because the G2 node sized the mask canvas to the *node's* `width`/`height`. After the redesign, drawing happens inside an overlay whose container size differs from the node. Decision: **store region coords in image-natural-pixel space** (normalize at draw time: `px = (containerPos / containerSize) * naturalSize`), and update `createMaskFromG2Regions` to **size the mask canvas to the image's natural dimensions** (passed in) instead of node `width`/`height`. This keeps masks resolution-correct regardless of view size. Generation already fetches the main image blob to read natural dims (`matchSourceSize`) — reuse that dimension tuple and pass it into the mask call.

---

## 4. Mask helper update — `lib/nodes/g2.ts`

```ts
createMaskFromG2Regions(imageNaturalWidth, imageNaturalHeight, regions)
```
- Canvas sized to natural dims.
- For each region (white=keep, transparent=edit, same convention):
  - `rect`: `ctx.lineWidth = region.thickness`; `ctx.strokeRect(...)` (thick outline = edit band). If you want the whole rect interior to be edit, fill instead — **decision: fill the rect** (most common "edit this area" intent), thickness only matters for `freehand`. We'll fill rects and ignore thickness for them, and apply thickness to freehand strokes. (Confirming in §3: rect thickness slider then only affects the *visual* preview width, not the mask. To avoid confusion, hide the thickness slider when Rect tool active.)
  - `freehand` with `closed`: `closePath` + `fill`.
  - `freehand` open: stroke with `lineWidth = thickness`, `lineCap/lineJoin = "round"`.

---

## 5. Generation flow — update `onGenerate` in `g2-node.tsx`

- Validate: main image present, ≥1 region, prompt non-empty.
- Resolve selection from the **user-editable** option fields (with defaults for absent/legacy values):
  - `model = normalizeImageGenerationModel(data.model ?? "gpt-image-2")`
  - `size = normalizeImageGenerationSize(data.size ?? "1024x1024")`
  - `outputFormat = normalizeImageGenerationOutputFormat(data.outputFormat ?? "png")`
  - `resolution = normalizeImageGenerationResolution(data.resolution ?? "preview")`
  - `matchSourceSize`: keep `true` whenever a mask is present (current behavior) — a checkbox will be offered near the generation controls when a region/mask exists, defaulting on.
- Fetch main image blob → natural dims → pass to `createMaskFromG2Regions`.
- Upload mask → `maskUrl`.
- Build `referenceList`:
  - Main: `{ kind: "image", alias: mainImageAlias ?? "main", url: mainImageUrl, maskUrl }`.
  - Each `G2Reference`: `{ kind: "image", alias: ref.alias ?? "ref-N", url: ref.url }`.
- POST `/api/generate` with the resolved `model`, `size`, `outputFormat`, `resolution`, `matchSourceSize`, `references`, `prompt`, `systemPrompt`.
- Save `outputFormat` used to `persistGeneratedImage(parsed.data.url, outputFormat, run.signal)` (was hardcoded `"png"`).
- `writeGeneratedImageToOutput` meta: pass resolved `model`, `size`, `resolution`, `outputFormat`.
- Everything else (run lifecycle, persist, write to output, error handling) unchanged.

---

## 6. Prompt `@alias` mention — `g2-node.tsx`

Replace the plain `<textarea>` with a **local `AliasMentionTextarea`-style input**. Reuse the helper functions from `generate-node.tsx`-area `lib/generate-prompt.ts`? They're coupled to prompt rows — instead, **extract the mention primitives** (`mentionAtCaret`, `aliasAtOffset`, `renderHighlightedAliases`, and the `AliasMentionTextarea` component) into a shared module `lib/prompt-mention.tsx` (or inline a lighter copy in g2-node). Recommend **extracting + sharing** to avoid drift, but if that risks touching the Generate node, do a **standalone lighter copy** first.

Mention candidates for G2:
- The main image alias (`@{mainImageAlias}`, plus always-available `@main`).
- Each reference alias (`@{ref.alias}`).
- Each region name (`@{region.name}`) — so the prompt can say "@collar change to leather texture".

Behavior matches Generate's: typing `@` opens a dropdown filtered by query, arrow-nav + Enter/Tab inserts `@alias `, hover in the textarea highlights the referenced thumbnail/region.

---

## 6b. Generation controls UI — `g2-node.tsx`

Editable model/size/format/resolution + matchSourceSize, modeled on the Generate node's controls (lines ~1289–1447 of `generate-node.tsx`) but **simplified for G2** (G2 only ever uses gpt-image-family models with mask references in practice, but the user wants the freedom to switch).

Add a compact controls block (above the Generate button):

- **Model** `Select`: GPT model options filtered to `status === "current"` (use `GPT_MODEL_OPTIONS`, defined in `generate-node.tsx` — but since we're **isolating G2** and not importing the Generate node, **duplicate the small `GPT_MODEL_OPTIONS` array** in `g2-node.tsx` referencing `ImageGenerationModelId` from `lib/image-generation-models.ts`). Latest-first grouping current/legacy as in Generate. (G2 does not need Gemini — but if we want parity we keep it gpt-only to match the mask workflow. Decision: **gpt-only** for now.)
- **Resolution / Size / Format** as three `Select`s in a `grid-cols-3` row, exactly mirroring Generate's:
  - `IMAGE_GENERATION_RESOLUTIONS` + `RESOLUTION_LABELS`
  - `IMAGE_GENERATION_SIZES` + `SIZE_LABELS`
  - `IMAGE_GENERATION_OUTPUT_FORMATS` + `FORMAT_LABELS`
  - `SIZE_LABELS` / `FORMAT_LABELS` / `RESOLUTION_LABELS` are tiny `Record<…, string>` maps — duplicate them in `g2-node.tsx` (do not import from `generate-node.tsx` to honor G2 isolation).
  - Use the `normalizeImageGeneration*` helpers from `lib/image-generation-models.ts` on change.
- **Format** locked to PNG when `provider === "gpt"` (GPT Image pins output to PNG — mirror Generate's `disabled={… provider === "gpt"}` and a note "GPT · output pinned to PNG").
- **Match source size** checkbox appears when a region/mask exists (`g2Regions.length > 0`), default checked — same semantics as Generate's mask-attached branch.
- All controls `disabled={isGenerating}` and carry `nodrag nopan` so they don't drag the canvas node.

`Select` components come from `@/components/ui/select` (shadcn/base-ui) — already used by Generate.



| File | Change |
|---|---|
| `lib/nodes/types.ts` | `G2Region` + `G2NodeData` + new `G2Reference` |
| `lib/nodes/registry.ts` | `g2.defaultData` new fields |
| `lib/nodes/g2.ts` | `createMaskFromG2Regions` natural-dim + thickness/closed |
| `components/canvas/nodes/g2-node.tsx` | drop zones, overlay trigger, prompt mention, generation refs |
| `components/canvas/nodes/g2-draw-overlay.tsx` | **NEW** full-screen drawing overlay |
| `lib/prompt-mention-g2.tsx` | **NEW** self-contained mention primitives for G2 (isolated copy, not shared with Generate) |
| `components/canvas/nodes/image-node.tsx` | add `ica-image-ref` rich MIME on drag |
| `components/canvas/nodes/output-node.tsx` | add `ica-image-ref` rich MIME on drag |
| (optional) `components/canvas/nodes/suppler-node.tsx`, `product-node.tsx` | add drag button + `ica-image-ref` so supplier/product can be dragged in too |

---

## 8. Build order (incremental, each step compiles)

1. Types + registry defaultData (coerce legacy `references`; add model/size/format/resolution defaults). No region migration (G2 disposable).
2. `lib/nodes/g2.ts` mask helper (natural dims, thickness, closed).
3. `g2-draw-overlay.tsx` (drawing + undo/redo + name + thickness), opened with a temp button, using legacy main-image upload still — verify draw + mask.
4. g2-node main-image drop zone + thumbnail (replace upload box; keep file fallback); wire overlay open.
5. g2-node reference drop zone + thumbnails; migrate to `G2Reference[]`.
6. `image-node.tsx` / `output-node.tsx` rich drag MIME; verify drag-in shows alias.
7. Add isolated mention primitives `lib/prompt-mention-g2.tsx`; replace g2 prompt textarea with mention textarea.
8. Add generation controls block (model/size/format/resolution + matchSourceSize) to g2-node; duplicate the small label/option maps locally.
9. Update `onGenerate` for new masks + reference list + resolved model/size/format/resolution.
10. Remove old in-node Rect/Brush/Select UI + SVG overlay; clean up.

Verify with `pnpm typecheck` (or the project's lint/typecheck command) after each step; dev-run the canvas to drag an Input node onto G2, draw a region in the overlay, and run a generation.

---

## Decisions confirmed with the user

- **Region coordinate migration**: none. G2 is separate/disposable; old saved G2 nodes may break. (Decision: none.)
- **Mention primitives**: self-contained isolated copy in `lib/prompt-mention-g2.tsx`, not shared with the Generate node. (Decision: isolate.)
- **Generation options**: user-editable — model / size / format / resolution `Select`s + matchSourceSize checkbox, modeled on the Generate node's controls but duplicated locally (G2-isolated). Defaults preserve the old hardcoded values (`gpt-image-2`, `1024x1024`, `png`, `preview`, matchSourceSize on with mask). (Decision: give the user the option.)

## Open decisions (low risk, will default if not asked)

- **Rect thickness**: I'll hide the thickness slider in Rect mode and fill the rect (whole interior = edit). Brush uses thickness.
- **Auto-close threshold**: `thickness * 1.5`, reusing `shouldCloseFreehandLoop`'s idea.
- **G2 model set**: gpt-image-family only (no Gemini) in the model dropdown, since the mask-editing workflow targets GPT Image. If you want Gemini in G2 too, say so.
