# OpenClaw_agents_UI

Local web UI for monitoring and managing an OpenClaw multi-agent setup.

## Features

- **Dashboard** for per-agent rolling day/week/month usage and cost status, with honest `Actual` / `Estimated` / `Unavailable` labelling.
- **Prompt Editor** for editing `agent-templates/*.md`, saving each agent separately, and releasing prompts live via `scripts/sync-agent-prompts.sh` plus `openclaw gateway restart`.
- **Runtime Summary** for local agent/runtime facts from `~/.openclaw/openclaw.json` and `openclaw status`.
- **Working Context** for project-scoped continuity docs under `~/.openclaw/dev-context/projects/<project>/docs`.

## Working Context model

The app now treats working context as project-scoped data rooted at:

- `~/.openclaw/dev-context/projects/<project>/docs/current-status.md`
- `~/.openclaw/dev-context/projects/<project>/docs/decisions.md`
- `~/.openclaw/dev-context/projects/<project>/docs/next-steps.md`
- `~/.openclaw/dev-context/projects/<project>/docs/dev-workflow.md`

The Working Context page supports:

- listing existing projects
- selecting a current project
- creating a new project
- optionally copying docs from another project
- generating the project-specific kickoff prompt
- triggering a repo-init handoff for Alpha

## Repo-init handoff behaviour

The backend exposes a project repo-init action intended to hand work off for Alpha to initialize a repo under `~/srv/<project>`.

Implementation path:

1. If `~/.openclaw/dev-context/hooks/init-project-repo.sh` exists, the server executes it as:
   - `bash ~/.openclaw/dev-context/hooks/init-project-repo.sh <project> <repoRoot>`
2. If no hook exists, the app falls back to writing a handoff note under:
   - `~/.openclaw/dev-context/projects/<project>/handoff/`

That fallback is deliberate: it gives a robust local-first path without inventing unsupported OpenClaw CLI subcommands for automated Alpha spawning.

## Kickoff prompt helper

`~/.openclaw/dev-context/print-kickoff-prompt.sh` now accepts a project name argument:

```bash
~/.openclaw/dev-context/print-kickoff-prompt.sh OpenClaw_agents_UI
```

If no project name is given, the script prints usage guidance unless a default project folder is available.

## Run locally

```bash
npm install
npm start
```

Default URL:

- `http://127.0.0.1:4321`

## Docs

- `docs/openclaw-agents-ui-functional-spec.md`
- `docs/implementation-plan.md`
