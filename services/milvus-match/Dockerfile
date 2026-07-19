# Optional Linux container for real Milvus Lite + CLIP.
# Only needed when Docker Hub is available. On Windows without Hub, run the host
# venv instead (MILVUS_MATCH_BACKEND=numpy) — see README.md.

FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    MILVUS_MATCH_HOST=0.0.0.0 \
    MILVUS_MATCH_PORT=8092 \
    MILVUS_MATCH_URI=/data/milvus.db \
    MILVUS_MATCH_BACKEND=milvus \
    HF_HOME=/data/hf-cache \
    TRANSFORMERS_CACHE=/data/hf-cache

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip \
    && pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install -r requirements.txt \
    && pip install "pymilvus>=2.4.0"

COPY app ./app

RUN mkdir -p /data /data/hf-cache

EXPOSE 8092

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8092/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8092"]
