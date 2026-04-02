# OpenClaw_agents_UI — Technical Plan

## Chosen approach
Build a local-first Node.js + Express application with a simple server-rendered API layer and a static front end (HTML/CSS/JS).

## Why this approach
- minimal setup
- easy to run locally
- no external database required
- direct integration with existing local files and scripts
- fast path to a usable first version for operator testing

## Core architecture
- **Server:** Express app exposing JSON endpoints and serving static files
- **Frontend:** plain HTML/CSS/JavaScript single-page shell with three views
- **Persistence:** local JSON files inside `data/`
- **Integrations:** read OpenClaw config from `~/.openclaw/openclaw.json`, read/write prompt templates from `~/.openclaw/workspace/OpenClaw_Team/agent-templates`, run `~/.openclaw/workspace/OpenClaw_Team/scripts/sync-agent-prompts.sh`

## Pages
1. **Dashboard**
   - per-agent day/week/month usage and cost cards
   - explicit quality labels: Actual / Estimated / Unavailable
   - initial implementation should default to honest `Unavailable` when exact usage/cost is not derivable from local evidence
2. **Prompt Editor**
   - load each agent template into its own editor
   - save each file individually
   - top-level Release to Live button that runs the sync script
3. **Runtime Summary**
   - show configured model, workspace path, agent directory, and related runtime facts derived from local config

## Data model
- `data/ui-state.json`
  - cached notes and optional manual overrides for dashboard metrics
  - release history metadata
  - operator preferences if needed later

## Usage/cost strategy
- Do not invent precise numbers for ChatGPT Plus / Codex OAuth runtime.
- First version should show:
  - model name when known
  - `Unavailable` token/cost values when no defensible local measurement exists
  - explanatory basis text per metric set
- Structure the API so later improvements can add estimated or actual metrics without redesigning the UI.

## Key endpoints
- `GET /api/summary`
- `GET /api/prompts`
- `POST /api/prompts/:agent`
- `POST /api/release`
- `GET /api/runtime`

## Validation focus
- prompt save round-trip
- release script execution and error surfacing
- runtime summary correctness against local config
- graceful empty/unavailable dashboard behaviour

## Run model
- local process bound to localhost
- operator opens local URL in browser
- no auth in first version because it is intended for single-user local use
