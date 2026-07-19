# Picture Sherlock Match Sidecar

Thin FastAPI service for reverse image search (Picture Sherlock–style):

1. Embed query + catalog with CLIP image features (`openai/clip-vit-base-patch32`)
2. Catalog uses **dense multi-scale tiles** so detail crops can hit a region
3. Run **ORB local-feature matching** (crop → parent geometry) — critical when the
   target is a crop of a product photo and whole-image CLIP ranks the wrong item
4. Fuse CLIP + local (+ very light color) and rank

This is **not** the Streamlit desktop app. It only exposes the match API used by the Next.js app.

## Requirements

- Python 3.10 or 3.11
- ~2 GB disk for the venv + first CLIP model download
- CPU is fine (no GPU required). First match after boot is slower while the model warms up.

## Windows setup

```powershell
cd services\picture-sherlock
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8091
```

First start downloads CLIP weights into the Hugging Face cache.

## Health check

```powershell
curl http://127.0.0.1:8091/health
```

Expected:

```json
{
  "status": "ok",
  "model": "picture-sherlock-clip-vit-base-patch32",
  "device": "cpu"
}
```

## Match API

`POST /v1/match`

```json
{
  "queryImage": { "url": "https://example.com/query.png" },
  "catalog": [
    { "catalogItemId": "product-1:variant-1", "imageUrl": "https://example.com/a.png" }
  ],
  "topK": 10
}
```

`url` / `imageUrl` may also be `data:image/...;base64,...` sources.

Response:

```json
{
  "matches": [{ "catalogItemId": "product-1:variant-1", "cosine": 0.83 }],
  "searchedCount": 1,
  "model": "picture-sherlock-clip-vit-base-patch32"
}
```

## Wire into the Next.js app

In `.env.local`:

```env
PICTURE_SHERLOCK_URL=http://127.0.0.1:8091
PICTURE_SHERLOCK_TIMEOUT_MS=90000
PICTURE_SHERLOCK_FALLBACK_TO_LOCAL=true
```

When the sidecar is down and fallback is `true`, the app uses the local histogram matcher instead.

## Environment (sidecar)

| Variable | Default | Meaning |
|----------|---------|---------|
| `PICTURE_SHERLOCK_MODEL_ID` | `openai/clip-vit-base-patch32` | Hugging Face model id |
| `PICTURE_SHERLOCK_MODEL_NAME` | `picture-sherlock-clip-vit-base-patch32` | Model id returned to Node |
| `PICTURE_SHERLOCK_DEVICE` | auto (`cuda` if available else `cpu`) | Torch device |
| `PICTURE_SHERLOCK_ALLOW_HOSTS` | `localhost,127.0.0.1` | Private hosts allowed for image fetch |
| `PICTURE_SHERLOCK_EMBED_WORKERS` | `4` | Parallel embed threads |
| `PICTURE_SHERLOCK_MAX_IMAGE_BYTES` | `12582912` | 12 MB limit |
