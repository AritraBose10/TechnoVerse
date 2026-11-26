---
name: omniroute
description: "OmniRoute AI gateway: one OpenAI-compatible endpoint (default http://localhost:20128/v1) that routes to 200+ LLM providers with fallback, budgets and token compression. Use when TechnoVerse code needs an LLM call (NPC dialogue, chat moderation, voice STT/TTS, embeddings), when wiring graphify's semantic extraction to a cheap model, or when the user mentions OmniRoute, OMNIROUTE_URL, model routing, fallback or LLM cost."
license: MIT (upstream diegosouzapw/OmniRoute @ d89f84ad)
---

# OmniRoute

OmniRoute is a gateway Captain runs himself (`npx omniroute` or the desktop app). It is not a Claude feature: nothing routes through it unless code calls it.

## Rules for this repo

- Any LLM/AI call from TechnoVerse goes through OmniRoute, never straight to a provider SDK. Base URL from `OMNIROUTE_URL` (default `http://localhost:20128/v1`), key from `OMNIROUTE_API_KEY`. Both live in `.env` (gitignored), read in `server.js` only. The browser never sees the key: the client calls our own `server.js` route, which proxies to OmniRoute.
- Use plain `fetch` against the OpenAI-compatible endpoints. No new npm dependency (house rule + ponytail).
- Pick a combo/model name, not a hard-coded provider, so fallback works.
- If the gateway is down, the feature degrades (NPC goes silent, canned line), the world keeps running.

## graphify semantic extraction via OmniRoute

```
OPENAI_BASE_URL=$OMNIROUTE_URL OPENAI_API_KEY=$OMNIROUTE_API_KEY OPENAI_MODEL=<combo> graphify extract . --backend openai
```
AST-only `graphify update .` needs no LLM at all.

## Reference (load only what the task needs)

Start with `references/CATALOG.md`. Most used: `references/omni-inference` (chat/embeddings/audio endpoints), `references/omni-auth`, `references/cli-serve` (start/stop the server), `references/omni-combos-routing` (fallback chains), `references/omni-budget`, `references/cli-health`.
