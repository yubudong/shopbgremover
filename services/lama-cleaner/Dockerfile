FROM python:3.11-slim

WORKDIR /app

RUN addgroup --system shopbg \
    && adduser --system --ingroup shopbg --home /app shopbg

RUN pip install --no-cache-dir \
        torch==2.4.1 torchvision==0.19.1 \
        --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir --force-reinstall --no-deps \
        torch==2.4.1 torchvision==0.19.1 \
        --index-url https://download.pytorch.org/whl/cpu

COPY app.py inpaint.py processing.py ./

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    INPAINT_ENGINE=lama \
    LAMA_DEVICE=cpu \
    TORCH_HOME=/models \
    TORCH_NUM_THREADS=4 \
    MAX_FILE_MB=10 \
    MAX_SIDE=2048 \
    MAX_DECODED_PIXELS=4194304 \
    MAX_CONCURRENCY=2 \
    CROP_MAX=512 \
    MASK_DILATION=3 \
    MASK_FEATHER=3 \
    MAX_MASK_RATIO=0.85

RUN mkdir -p /models \
    && chown -R shopbg:shopbg /app /models

USER shopbg
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=3)"]

CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--no-server-header"]
