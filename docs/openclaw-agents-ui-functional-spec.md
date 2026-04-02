# OpenClaw_agents_UI — Functional Specification

## 1. Purpose

OpenClaw_agents_UI is a locally run web application for monitoring and maintaining a small OpenClaw multi-agent setup.

The application must provide three main functions:
1. A default dashboard showing per-agent usage/cost summaries over recent time windows.
2. A prompt management page for editing agent prompt source files and releasing them to live OpenClaw workspaces.
3. A runtime summary page showing current agent/runtime facts such as model assignment and other operational status details.

This specification is functional only. It defines user-visible behaviour, data expectations, constraints, and acceptance criteria. It does **not** prescribe implementation details such as framework, schema technology, or deployment internals.

---

## 2. Scope

### In scope
- A website that runs locally on the host machine.
- Three pages with a persistent menu/navigation system.
- Read/write access to local project files required by the UI.
- Local-only persistence for any application state, cached metrics, draft edits, or remembered preferences.
- A top-level action to release prompt changes to live OpenClaw workspaces by invoking:
  - `./scripts/sync-agent-prompts.sh`
- Clear handling of what usage/cost data is real, estimated, or unavailable.

### Out of scope
- External hosting.
- External database services.
- Multi-user collaboration, permissions, or authentication unless later requested.
- Billing-grade cost reporting.
- Full technical design or implementation plan.

---

## 3. Context and Current Reality

### 3.1 Known local repo structure
The current repository structure indicates:
- Prompt source files are stored in:
  - `agent-templates/main.md`
  - `agent-templates/alpha.md`
  - `agent-templates/delta.md`
  - `agent-templates/charlie.md`
  - `agent-templates/tango.md`
  - `agent-templates/romeo.md`
  - `agent-templates/india.md`
- Live prompt files are synced into OpenClaw workspaces as `AGENTS.md`.
- `./scripts/sync-agent-prompts.sh` copies the source files from `agent-templates/*.md` into `~/.openclaw/workspace*/AGENTS.md`.

### 3.2 Naming mismatch to account for
The request refers to editable `AGENT.MD` files from the `agents-templates` folders. The actual repo currently uses:
- folder: `agent-templates/`
- files: `*.md`
- destination live filename: `AGENTS.md`

**Functional requirement:** the UI must work with the actual repo structure, while presenting labels that are understandable to the user. If helpful, the UI may describe these as “agent prompt templates” rather than strictly mirroring the on-disk filename.

### 3.3 Usage/cost data limitation
The agents are currently running on a ChatGPT Plus account via `openai-codex/...` authenticated workflow rather than direct OpenAI API billing usage.

This has a major consequence:
- precise API-style token accounting and exact cost data may **not** be available from the runtime in the same way as standard API calls.
- any cost figures may need to be marked as estimated or unavailable.

The UI must not falsely imply that exact token/cost accounting exists if it does not.

---

## 4. Primary Users and Goals

### Primary user
The operator/owner of the local OpenClaw installation.

### User goals
- Quickly see which agents are active and how much usage they have accumulated.
- Understand which figures are trustworthy versus estimated.
- Edit agent prompts in one place.
- Save changes per agent without immediately pushing them live.
- Release all prompt changes to live workspaces when ready.
- Inspect core runtime facts without digging through config files.

---

## 5. High-Level Functional Requirements

The application must provide:
1. A local web UI with a menu system.
2. Exactly three top-level pages.
3. Local persistence only.
4. Safe handling of file edits and release actions.
5. A consistent distinction between:
   - actual measured values,
   - estimated values,
   - unavailable values.

---

## 6. Navigation / Information Architecture

The UI must expose three menu items that are always reachable:

1. **Dashboard** (default landing page)
2. **Prompt Editor**
3. **Runtime Summary**

### Navigation requirements
- The menu must be visible on every page.
- The currently active page must be visually indicated.
- The default route must open the Dashboard.
- Navigation must not discard unsaved prompt edits without a warning.

---

## 7. Page 1 — Dashboard (Default)

## 7.1 Purpose
Provide a per-agent summary of recent usage and associated cost for:
- last day
- week total
- month total

## 7.2 Agents covered
The dashboard must at minimum support these agents if present in local configuration/repo:
- main
- alpha
- delta
- charlie
- tango
- romeo
- india

If additional agents are later added locally, the UI should be able to include them if discoverable from local config.

## 7.3 Required per-agent display
For each agent, the dashboard must show:
- agent name
- usage summary for last day
- usage summary for week total
- usage summary for month total
- associated cost for each of those time windows
- data quality/status indicator for each metric set:
  - Actual
  - Estimated
  - Unavailable
- last refresh/update time

## 7.4 Required metric semantics
Because exact token/cost data may not exist, the dashboard must support these states:

### A. Actual
Used only when a metric can be derived directly from local machine-readable evidence with acceptable confidence.
Examples could include locally recorded token counts if OpenClaw or related logs expose them.

### B. Estimated
Used when the system derives an approximation from partial evidence.
Examples might include:
- approximate token counts inferred from locally stored conversation text size,
- approximate cost mapped from model assumptions,
- proxy measures such as request counts multiplied by configurable heuristics.

### C. Unavailable
Used when no defensible value can be determined from local data.
In this case the UI must show a clear placeholder such as:
- `Unavailable`
- `Not measurable with current runtime`

## 7.5 Functional behaviour for usage figures
The system must calculate or present per-agent values for three time windows:
- **Last day**: rolling previous 24 hours
- **Week total**: rolling previous 7 days
- **Month total**: rolling previous 30 days

The UI must make clear whether these are rolling windows or calendar periods. For this product, they should be treated as **rolling windows** unless later changed by user request.

## 7.6 Cost reporting rules
The dashboard must not present any cost number without also indicating its basis.

Each cost figure must be one of:
- actual cost
- estimated cost
- unavailable

If estimated, the UI must expose the basis in plain language, for example:
- “Estimated from inferred tokens and configured model pricing assumptions.”
- “Estimated from session counts only; low confidence.”

If unavailable, the UI must say why, for example:
- “ChatGPT Plus runtime does not expose billable API token usage here.”

## 7.7 Dashboard summary/header
Above the per-agent list, the page should show a compact overall summary including:
- total number of agents tracked
- how many have actual metrics
- how many have estimated metrics
- how many are unavailable
- timestamp of last dashboard refresh

## 7.8 Empty/error states
The dashboard must handle:
- no agents found
- no recent activity found
- local metrics source missing or unreadable
- partial data available for some agents only

The page must remain usable even if all cost/token values are unavailable.

---

## 8. What Is Actually Possible for Tokens and Cost

This is a key product requirement.

## 8.1 Must be supported in the UI copy and logic
The product must explicitly acknowledge that the current runtime is using a ChatGPT Plus-authenticated workflow, not a standard per-request OpenAI API billing path.

Therefore:
- **Exact billable token counts may be unavailable.**
- **Exact monetary cost per agent may be unavailable.**
- **Model names may still be known.**
- **Session/run counts and timestamps may still be knowable from local files/logs.**
- **Estimation may be possible only if the product intentionally introduces heuristics.**

## 8.2 Minimum acceptable product behaviour
The first release must be acceptable if it provides:
- actual values where local evidence exists,
- estimated values only when clearly marked,
- unavailable status where neither actual nor credible estimate exists.

It is preferable to show honest unavailability rather than fabricated precision.

## 8.3 User-configurable estimation basis
If estimation is supported, the product must allow locally persisted configuration for:
- model pricing assumptions
- estimation method version/label
- confidence level or quality label

This does not require a database; local file persistence is sufficient.

---

## 9. Page 2 — Prompt Editor

## 9.1 Purpose
Provide a single place to review and edit the agent prompt source files currently stored in the repo’s `agent-templates/` directory, with separate save/update controls per agent and a top-level release-to-live action.

## 9.2 Source files to manage
The page must detect and display the editable template files used as source-of-truth for agents.
Based on the current repo, this includes at minimum:
- `agent-templates/main.md`
- `agent-templates/alpha.md`
- `agent-templates/delta.md`
- `agent-templates/charlie.md`
- `agent-templates/tango.md`
- `agent-templates/romeo.md`
- `agent-templates/india.md`

## 9.3 Per-agent editor requirements
For each agent template shown, the page must provide:
- agent name/label
- file path
- editable text box containing current file contents
- separate **Save/Update** action for that agent only
- visible save result/status for that agent
- last saved time/status if known in the UI session or persisted locally

## 9.4 Save behaviour
When the user saves one agent:
- only that agent’s template source file is updated
- other unsaved editors must remain untouched
- the user must receive success/failure feedback scoped to that agent

A successful save to the template file does **not** automatically mean the prompt is live in OpenClaw workspaces.

## 9.5 Unsaved-change behaviour
The page must detect unsaved changes per agent editor.
The UI must clearly distinguish between:
- saved to template source
- modified but not saved
- saved to template but not yet released live

## 9.6 Release to live action
A top-level action must be provided, labelled clearly, for example:
- `Release to Live`
- `Sync Prompt Templates to Live`

This action must run:
- `./scripts/sync-agent-prompts.sh`

## 9.7 Release action functional requirements
When triggered, the UI must:
- indicate that a release is in progress
- execute the sync script from the repo root context
- capture success/failure outcome
- show a human-readable result summary
- show script output or a concise log excerpt
- record the latest release timestamp and result in local persistence

## 9.8 Preconditions for release
If there are known unsaved edits in the UI, the user must be warned before release.
At minimum, the product must prevent accidental release of stale files by telling the user that some editor contents have not been saved to disk yet.

## 9.9 Failure handling
If the release script fails, the UI must:
- keep existing editor content intact
- report failure clearly
- not claim that prompts are live
- preserve enough output for the operator to understand what failed

## 9.10 Optional but useful supporting indicators
The page should also show:
- whether the template file currently differs from the live workspace file, if this can be checked locally
- last release timestamp
- last release result

---

## 10. Page 3 — Runtime Summary

## 10.1 Purpose
Provide a concise operational summary of the current OpenClaw multi-agent runtime.

## 10.2 Minimum required information
For each agent, where locally knowable, the page must show:
- agent name
- configured primary model
- workspace path
- agent directory path if available
- whether the agent appears configured/enabled
- any recent activity indicator if derivable from local state

## 10.3 Global runtime facts
The page must also show relevant top-level information such as:
- OpenClaw config file location/status
- default model
- subagent depth limit
- subagent timeout
- list of allowed delegation targets for main, if available
- last config touch/update time if knowable
- local gateway/runtime mode if available

## 10.4 Important facts to prioritise
The runtime page should prioritise facts that help an operator answer:
- Which agents exist?
- Which model is each agent using?
- Where does each agent live on disk?
- Are prompt templates synced into workspaces?
- What global constraints are active?
- Is anything obviously missing or misconfigured?

## 10.5 Status classification
Each runtime fact block should support a simple status such as:
- OK
- Warning
- Unknown

Examples:
- Warning if an expected workspace path is missing.
- Warning if a template source file exists but live `AGENTS.md` is missing.
- Unknown if a local file cannot be read.

---

## 11. Local Persistence Requirements

## 11.1 No external database
The product must use local persistence only.
No external DB service is permitted.

## 11.2 What may need to be persisted locally
The application may persist any of the following locally:
- cached usage summaries
- estimation assumptions/pricing inputs
- last dashboard refresh time
- last successful release time/result
- unsaved draft recovery state if supported
- UI preferences such as sort order or expanded/collapsed panels

## 11.3 Persistence qualities required
Local persistence must be:
- readable after application restart
- scoped to this local installation
- resilient to partial UI refresh/reload
- understandable enough for an operator to back up or remove if needed

## 11.4 Source of truth boundaries
The product must distinguish between:
- source-of-truth repo files (prompt templates)
- live synced workspace files (`~/.openclaw/workspace*/AGENTS.md`)
- UI-owned local persisted state/cache

The UI must not blur these together.

---

## 12. Data Sources and Trust Model

## 12.1 Approved data source classes
The UI may rely on local sources such as:
- repo files in `OpenClaw_Team/`
- local OpenClaw config files
- local workspace files
- local session/run metadata and logs where available
- UI-local persisted cache/config files

## 12.2 Data trust requirements
Every displayed metric or fact should be attributable to one of these categories:
- direct local evidence
- derived local estimate
- unavailable/unknown

## 12.3 Transparency requirement
Where the meaning may be ambiguous, the UI must make the data origin/basis understandable to a technically literate operator without forcing them to inspect code.

---

## 13. Non-Functional Requirements

## 13.1 Local-first operation
The application must function without internet access for core monitoring/editing of local files.

## 13.2 Performance
On a normal local machine and current agent count, page loads and common actions should feel near-immediate. Exact performance budgets are not mandated in this spec, but the UI should be lightweight enough for local operational use.

## 13.3 Safety
Potentially destructive actions are limited here, but the product must still:
- avoid overwriting the wrong prompt file
- scope save actions correctly per agent
- avoid claiming a successful live release if the sync command failed

## 13.4 Clarity over cleverness
Given the uncertainty of token/cost data, the UI must prefer plain, honest labelling over overly polished but misleading summaries.

---

## 14. Assumptions

These are assumptions, not confirmed facts:

1. The application will run on the same machine that has access to the repo and the `~/.openclaw` directory.
2. The operator has filesystem permission to read/write prompt source files and run the sync script.
3. Token and cost data are not natively available in billing-grade form from the current ChatGPT Plus-based runtime.
4. Some runtime information can be derived from local OpenClaw config/state files.
5. The current set of agents is stable but may grow later.

---

## 15. Open Questions / Decisions Still Needed

These do not block the functional spec, but should be resolved before implementation is considered complete:

1. **Usage basis:** What exact local files/logs should count as the authoritative source for “usage” per agent?
2. **Estimation policy:** If token/cost data are unavailable, should the first version show only “Unavailable”, or should it support heuristics from day one?
3. **Confidence labelling:** Does the owner want one generic “Estimated” label, or graded confidence such as high/medium/low?
4. **Release scope:** Should `Release to Live` only sync templates, or should the UI eventually also offer `./config/agents-config.sh` / restart actions? Current request says sync only.
5. **Draft persistence:** Should unsaved editor contents survive browser refresh/crash, or is file-save-only enough for version 1?
6. **Runtime activity signal:** What qualifies as “recent activity” for page 3 if only sparse local metadata exists?

---

## 16. Acceptance Criteria

The feature is functionally acceptable when all of the following are true:

### 16.1 General
- A locally run website exists.
- It has exactly three top-level pages accessible via a visible menu.
- The default page is the Dashboard.
- No external database is required.

### 16.2 Dashboard
- The Dashboard lists agents individually.
- For each agent, the UI shows values or statuses for last day, week total, and month total.
- Cost is shown per time window.
- Each metric set is clearly labelled as Actual, Estimated, or Unavailable.
- The UI does not imply exact API billing data where none exists.

### 16.3 Prompt Editor
- The Prompt Editor shows an editable box for each agent template file in `agent-templates/`.
- Each agent has its own Save/Update action.
- Saving one agent updates only that agent’s template file.
- A top-level release action exists and runs `./scripts/sync-agent-prompts.sh`.
- The UI shows success/failure feedback for release.

### 16.4 Runtime Summary
- The Runtime Summary shows per-agent model and other key runtime facts where locally knowable.
- It shows global runtime facts relevant to operator understanding.
- Missing/unknown values are handled explicitly rather than silently omitted.

### 16.5 Persistence
- Any required app state is stored locally.
- Stored state remains available after app restart.

---

## 17. Recommended Functional Positioning

The right product posture for version 1 is:
- **operations dashboard + prompt editor for a local OpenClaw team**
- **transparent about uncertainty in usage/cost metrics**
- **strong on file-based control and runtime visibility**

The dashboard should be useful even if exact token/cost data remain partly or wholly unavailable. The honesty is part of the product quality, not a defect.
