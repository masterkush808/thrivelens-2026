# ThriveLens 2026

> **Team project** — a full-stack wellness application with an AI health coach, real-time fitness and nutrition tracking, and live food identification.

ThriveLens 2026 is the finalized main build of a mobile wellness app built as a team effort. It combines an Expo (React Native) mobile app, a Supabase-backed data layer, and self-hosted AI inference (Hugging Face transformers on ZeroGPU) that powers the coach chat, meal photo analysis, and nutrition lookup.

## Highlights
- **AI health coach** — conversational assistant that can *do things*: schedule workouts, log meals, find nearby healthy-food stores, and answer nutrition questions.
- **Real maps** — OpenStreetMap (Overpass) querying with device auto-location, closest-first results, and auto-centering.
- **Food identification** — camera scanner using a fine-tuned image model (QLoRA FineWeb/Food-R1 based), served server-side with vision-language fallback.
- **Fitness & nutrition tracking** — workouts, meals, cheat days, gym schedules, fridge inventory, barcode lookup (Open Food Facts), adherence and progress reporting.
- **Reduced-motion & accessibility support** — theme-aware gold-and-obsidian design system with motion preferences.

## Repository layout
```
omni-fitness-ai/      Expo React Native app (TypeScript, expo-router, NativeWind, SQLite + Supabase sync)
serving/              Python FastAPI inference service (coach chat, image analysis, nutrition lookup, Open Food Facts proxy)
Training and Validation Model/   ML training notebooks & build scripts (fine-tuned food-identification model)
Documentation and ResrearcH Papers/   Research blueprint and papers backing the project
```

## Tech stack
| Layer | Technology |
| --- | --- |
| Mobile | Expo SDK 57, React Native, expo-router, NativeWind/Tailwind, expo-sqlite |
| Backend | Supabase (Postgres), FastAPI serving, Hugging Face ZeroGPU, OpenStreetMap Overpass, Open Food Facts |
| ML | PyTorch/train.py pipelines, QLoRA fine-tuning, vision-language inference |
| Tooling | TypeScript, ESLint (expo), pytest, Drizzle ORM |

## Getting started
1. `npm install` inside `omni-fitness-ai/`.
2. Copy `omni-fitness-ai/.env.example` to `.env` and fill in what you use (the app runs fully offline without any backend).
3. `npx expo start` for the app; see `serving/README.md` for running the local inference service.

## Security & licensing
- **No secrets are committed.** Real keys live only in local `.env` files (gitignored). `.env.example` files document placeholders.
- The repository is shared publicly as a portfolio artifact. Content is protected by the [LICENSE](LICENSE) (all rights reserved) — no part of this project may be reproduced, reused, or republished as one's own work without permission. Use for personal reference only.

© 2026 ThriveLens team. All rights reserved.