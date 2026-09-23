FROM ghcr.io/huggingface/transformers-pytorch-gpu:latest

RUN useradd -m -u 1000 user

ENV HF_HOME=/data/hf \
    HF_HUB_ENABLE_HF_TRANSFER=1 \
    PIP_CACHE_DIR=/data/.cache

USER user
WORKDIR /app

COPY --chown=user requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=user . /app

EXPOSE 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]