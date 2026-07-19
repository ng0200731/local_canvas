# Milvus Match Sidecar

Thin FastAPI service for reverse image search using **CLIP embeddings** + a vector index:

1. Embed query + catalog with CLIP (`openai/clip-vit-base-patch32`)
2. Rank with either:
   - **numpy** (default on Windows) — in-process cosine, same API contract, **no Docker image**
   - **milvus** — Milvus Lite / `pymilvus` (prefer Linux Docker when Hub works)
3. Return ranked matches

This is the engine behind the supplier-node **Database** icon.

## Windows (recommended when you cannot pull new Docker images)

You already run Postgres in Docker; this sidecar runs **on the host** like Picture Sherlock.

```powershell
cd services\milvus-match
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
# numpy backend: no pymilvus, no new container
$env:MILVUS_MATCH_BACKEND = "numpy"
$env:MILVUS_MATCH_HOST = "127.0.0.1"
$env:MILVUS_MATCH_PORT = "8092"
uvicorn app.main:app --host 127.0.0.1 --port 8092
```

Or from repo root after the venv exists:

```powershell
pnpm match:milvus
```

Health:

```powershell
curl http://127.0.0.1:8092/health
```

Expect something like:

```json
{
  "status": "ok",
  "model": "milvus-clip-vit-base-patch32+numpy",
  "device": "cpu"
}
```

First start downloads CLIP from Hugging Face (network required once).

## Docker (optional — only if Docker Hub works)

```powershell
pnpm match:milvus:docker
# docker compose --profile milvus up -d --build milvus-match
```

Requires pulling `python:3.11-slim-bookworm` and building the image. Skip this if Hub is blocked.

## Match API

`POST /v1/match` — same shape as Picture Sherlock:

```json
{
  "queryImage": { "url": "https://example.com/query.png" },
  "catalog": [
    { "catalogItemId": "product-1:variant-1", "imageUrl": "https://example.com/a.png" }
  ],
  "topK": 10
}
```

Response model id stays `milvus-clip-vit-base-patch32` for the Next.js client.

## Wire into the Next.js app

In `.env.local`:

```env
MILVUS_MATCH_URL=http://127.0.0.1:8092
MILVUS_MATCH_TIMEOUT_MS=90000
MILVUS_MATCH_FALLBACK_TO_LOCAL=true
```

## Environment (sidecar)

| Variable | Default | Meaning |
|----------|---------|---------|
| `MILVUS_MATCH_BACKEND` | `numpy` on Windows, `auto` elsewhere | `numpy` \| `milvus` \| `auto` |
| `MILVUS_MATCH_MODEL_ID` | `openai/clip-vit-base-patch32` | Hugging Face model id |
| `MILVUS_MATCH_MODEL_NAME` | `milvus-clip-vit-base-patch32` | Model id returned to Node |
| `MILVUS_MATCH_URI` | local `data/milvus.db` or `/data/milvus.db` | Milvus Lite path (milvus backend) |
| `MILVUS_MATCH_DEVICE` | auto | Torch device |
| `MILVUS_MATCH_ALLOW_HOSTS` | `localhost,127.0.0.1` | Private hosts allowed for image fetch |
| `MILVUS_MATCH_EMBED_WORKERS` | `2` on Windows | Parallel embed threads |
