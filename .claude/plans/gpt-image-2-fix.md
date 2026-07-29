# Plan: GPT Image 2 not working — align canvas with API doc

## Problem

The user's GPT Image 2 generations on the canvas are failing. The current `lib/xiangsu.ts` request schema diverges from the working API contract documented for `gpt-image-2` on the Xiangsu endpoint.

Key divergences from the documented contract:

1. **`response_format` is never sent.** The doc says requests must send `response_format: "b64_json"` for both generations and edits. Current code omits it entirely in both paths. Many OpenAI-compatible relays require this field to return base64 — its absence can cause the relay to return a URL the canvas can't load, or reject the request.
2. **`output_format` should be fixed `"png"`.** The current code lets the client pick `webp`/`jpeg`/`png` (default `webp`). The doc says the canvas pins `output_format: "png"` for GPT Image 2. Sending `webp` to some relays causes a 400/502.
3. **`quality: "auto"` is sent.** The doc says `quality` should be one of `low|medium|high`; `auto` or invalid values should be **omitted**, not sent. Current code always sends `quality: "auto"`.
4. **`background: "auto"` is sent to `/v1/images/edits`.** The doc's edit example does NOT send `background`. Some relays reject unknown fields on the multipart endpoint.
5. **Size mapping is wrong for `gpt-image-2`.** The doc gives a fixed mapping table (e.g. 2K medium · 1:1 → `2048x2048`, 3:2 → `2160x1440`). The current canvas only ever sends `1024x1024|1536x1024|1024x1536`. The model may reject these for 2K/4K resolutions or produce wrong-aspect results.
6. **Prompt spec suffix missing.** The doc says the canvas should append `图像输出规格：必须严格按 <ratio> 宽高比生成，输出分辨率必须为 <WxH>。不要因为参考图尺寸改变最终画幅。` to the prompt when a definite size is selected. Currently not appended anywhere.
7. **No system-prompt support.** The doc says model config can carry a system prompt that is prefixed as `systemPrompt + "\n\n" + prompt`. Canvas has no system-prompt field today — the user didn't ask for this in the settings panel, but the doc lists it. I'll defer this unless it's trivial; it's not the cause of the 502s.

## Hypothesis for the 502s in the dev log

`POST /api/generate 502` is the canvas route wrapping a thrown provider error. Most likely cause: the relay rejects the request because of `quality: "auto"` or `output_format: "webp"` on `gpt-image-2`, or returns a body the canvas parser doesn't recognize (because `response_format` wasn't requested, the relay may return only `url`, which we DO handle — so this is less likely the cause, but still worth fixing).

## Changes

### `lib/xiangsu.ts`

- Add `response_format: "b64_json"` to both the generations JSON body and the edits FormData.
- Drop `background: "auto"` from the edits FormData (it's not in the documented contract).
- For GPT Image models, pin `output_format` to `"png"` regardless of the client's `outputFormat` selection. (Gemini path is unaffected — it doesn't use this field.)
- For GPT Image models, **omit** `quality` when the resolved quality is `auto`; otherwise send `low|medium|high`. Resolution (preview/2K/4K) maps to quality: preview=low, 2K=medium, 4K=high — matching the doc's UI mapping (1K/2K/4K → low/medium/high).
- Compute the **actual** `size` string for `gpt-image-2` from the resolution + aspect ratio using the doc's fixed mapping table (1:1, 3:2, 2:3, 16:9, 9:16, 4:3, 3:4, 21:9, 9:21) and a 16-aligned dynamic fallback for unmapped ratios. The canvas's three size options (`1024x1024`, `1536x1024`, `1024x1536`) map to aspect ratios 1:1, 3:2, 2:3. For each (ratio, resolution) pair, look up the documented pixel size. Send that as `size`.
- Append the `图像输出规格...` suffix to the prompt for GPT Image models when a definite size is selected.
- Update the success parser to also accept `image_url`, `result_url`, `output_url`, and recursing into `data/result/output/images/image/content` per the doc. (Currently only `b64_json` and `url` inside `data`.)

### `lib/image-generation-models.ts`

- Add a `gptImageSizeForResolution(aspect, resolution)` helper implementing the doc's fixed mapping table.
- Add `gptImageQualityForResolution(resolution)` returning `low|medium|high` (preview/2K/4K → low/medium/high).
- Keep `ImageGenerationSize` enum as the canvas-facing aspect (1024x1024/1536x1024/1024x1536) — its role becomes "aspect ratio choice", not raw output pixels. Add an `aspectRatioForImageGenerationSize` already exists; reuse it.
- The catalog/UI labels can stay; only the wire-level `size` string changes.

### Tests

- Update `lib/xiangsu.test.ts` to assert `response_format: "b64_json"` is sent in both paths, that `quality` is omitted or sent as `low/medium/high`, that `output_format` is `png` for GPT Image, and that the `background` field is NOT sent on edits.
- Update the existing test that expects `output_format: "webp"` and `quality: "auto"` and `background: "auto"` — these change.
- Add a test that the wire `size` for `gpt-image-2` at resolution `2K`, aspect `3:2` is `2160x1440`.
- Update `app/api/generate/route.test.ts` if it asserts on `outputFormat: "webp"` defaults being forwarded — they still are forwarded from the schema, but the generator now pins `png` over the wire for GPT Image.

### Out of scope

- System prompt scaffolding — defer unless the user asks.
- Gemini path — unchanged.
- Adding new sizes (16:9 etc.) to the canvas UI Size dropdown — the doc lists many ratios, but the canvas only exposes 1:1/3:2/2:3. Keeping scope tight; the three existing options still cover the common cases. Defer new aspect options to a separate change.
