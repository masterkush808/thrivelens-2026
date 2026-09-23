# Deploy ThriveLens Food-R1 to Hugging Face Spaces

Cloud-hosted inference: the trained QLoRA adapter + base VLM run **server-side**
on an HF Space; the phone app never holds the model. The app calls HTTPS
endpoints with an `X-API-Key`. This file walks the whole thing end to end.

Deploy artifacts already live in `serving/space/` (Dockerfile, requirements,
Space README metadata) and `serving/scripts/push_adapter.py`.

---

## 0. What you need (checklist)

| Item | Notes |
| --- | --- |
| HF account (free) | huggin gface.co signup; free tier fine |
| HF access token | Settings -> Access Tokens -> new token, scope `read` is enough to *consume*; you need `write` to *push* the adapter. Rotation risk: use two tokens if you like |
| Adapter weights | local `adapter_and_reports/` dir (adapter_config.json + adapter_model.safetensors) |
| Base model stays public | `zy12123/Food-R1` is public; adapter repo you will make **private** |
| A credit card (optional) | only if you want paid GPU; free Hardware=CPU is too slow for an 8B VLM |

Nothing else. No Kaggle, no VPN, no local GPU required after upload.

---

## 1. Push the adapter to a private HF repo

One command (run from `serving/`):

    $env:HF_TOKEN="hf_..."   # or pass --token
    python scripts/push_adapter.py --adapter "C:\Users\thaba\AppData\Local\Temp\opencode\foodr1_final\adapter_and_reports" --repo <your-user>/thrivelens-foodr1-adapter

- Creates repo *private* (add `--public` only if you decided otherwise).
- Uploads adapter_config.json + adapter_model.safetensors (+ any reports).
- Prints the exact Space env block to copy, including `THRIVELENS_ADAPTER_SHA256`.

> The Space pulls this repo at startup using the `HF_TOKEN` secret. You never
> make these weights public, and the app never sees them.

---

## 2. Create the Space

1. https://huggingface.co/new-space
2. Name: `thrivelens-foodr1-api`
3. License: Apache 2.0
4. SDK: **Docker** (not Gradio/Streamlit — we serve FastAPI via uvicorn)
5. Visibility: **Public** (public Space = free tier / any GPU tier available;
   private Spaces are paid-only on a pro plan). The API itself stays locked by
   the API key, "public" only means the Space page URL type.
6. Create Space.

Then in **Settings**:
- **Hardware**: `T4 medium` recommended ($0.60/hr while awake). T4 small
  ($0.40/hr, 15GB RAM) usually OOMs while 4-bit-quantizing the ~16GB bf16 base
  into host RAM at first load. If you must save money, start small and watch
  logs; expect to bump up.
- **Sleep time**: set **10 minutes**. Paid Spaces billed per-minute only while
  awake — a demo day running ~4h costs ~$2.40 on T4 medium; idle gaps cost $0.
- **Variables and secrets** (all required):
  - `HF_TOKEN` = `hf_...` (read token; the Space uses it to open the private adapter repo)
  - `THRIVELENS_ADAPTER_REPO` = `<your-user>/thrivelens-foodr1-adapter`
  - `THRIVELENS_SERVING_AUTH` = `token`
  - `THRIVELENS_SERVING_API_KEY` = a long random key (generate with `python -c "import secrets; print(secrets.token_urlsafe(32))"`). This exact string goes into the app's env.
  - `THRIVELENS_ADAPTER_SHA256` = the sha printed by the push script
  - (optional) `THRIVELENS_MAX_NEW_TOKENS`=192, `THRIVELENS_ABSTAIN_CONFIDENCE`=0.45

---

## 3. Upload the serving code

Everything under `serving/space/` plus `app/` must end up in the Space repo:

    serving/space/README.md      <- the Space's README (sdk: docker, app_port: 7860)
    serving/space/Dockerfile
    serving/space/requirements.txt
    serving/app/**               <- the FastAPI service (imported as app.main)

Push either with git or the web Upload UI:

```
huggingface.co/<user>/thrivelens-foodr1-api -> Files -> Upload files
  - drag in space/README.md, space/Dockerfile, space/requirements.txt
  - drag in the whole app/ folder
```

First build ~10–20 min (pip installs transformers stack; weights download during
startup, not build). Status shows `Building` -> `Running`. Check **Settings ->
Storage** if you need to see the model cache; T4 medium has 100GB.

---

## 4. Test the running Space

Wait for Running + green, then:

    # health
    Invoke-RestMethod https://<your-user>-thrivelens-foodr1-api.hf.space/healthz

    # analyze with a real photo
    curl -s -X POST https://<your-user>-thrivelens-foodr1-api.hf.space/v1/food/analyze `
      -H "X-API-Key: <API_KEY>" -F "image=@meal.jpg"

Expect macOS/Windows-first cold-ish first call (weights load once, ~10–20s on
T4 for the VLM). Later calls are fast. If a 401: wrong API key. If a 502/`SLEEPING`,
you caught the Space between sleep and wake — first request wakes it.

---

## 5. Point the app at it

`omni-fitness-ai/.env`:

    EXPO_PUBLIC_INFERENCE_URL=https://<your-user>-thrivelens-foodr1-api.hf.space
    EXPO_PUBLIC_INFERENCE_TOKEN=<the API key>

Rebuild the dev client / `expo start`. The food scanner now talks to the real
model (candidates + confidence + disclaimer + abstention), not mock data.

---

## 6. Cost & hygiene notes (2026)

- Free tier = CPU only and Spaces on free hardware auto-sleep (~48h idle);
  an 8B model cold-starts for minutes. Fine to keep the Space as a page, not a
  live API. Real demos: paid T4 and you pay only for awake time with a sleep-time set.
- T4 medium ~$0.60/hr awake; a week of a few hours/day of demos ≈ a few dollars.
- `HUGGING_FACE_HUB_TOKEN` and `HF_TOKEN` are both honored as secret names for
  pulling private/gated repos from a Space (the code reads `HF_TOKEN`).
- Tear down: Settings -> Delete Space (or switch hardware to `CPU basic`
  between demo days so it stops billing).

## 7. Rollback

`model_revision` in every response carries `base@sha16`. If a Space runs a bad
adapter, reset `THRIVELENS_ADAPTER_REPO`/`THRIVELENS_ADAPTER_SHA256` to the last
good pair and restart the Space — the API surface doesn't change, so the app is
never forced to redeploy.