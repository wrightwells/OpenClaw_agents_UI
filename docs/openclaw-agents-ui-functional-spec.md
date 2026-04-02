# OpenClaw_agents_UI — Functional Specification

## 1. Purpose

OpenClaw_agents_UI is a locally run web application for monitoring and maintaining a small OpenClaw multi-agent setup.

The application must provide five main functions:
1. A landing page for the operator with menu access to the core areas.
2. A dashboard showing per-agent usage/cost summaries over recent time windows.
3. A workflow page for project-scoped task submission, orchestration status, task logs, remote-update preference, and agent Q&A.
4. A prompt management page for editing agent prompt source files and releasing them to live OpenClaw workspaces.
5. A runtime summary page showing current agent/runtime facts such as model assignment and other operational status details.
6. A working-context page for browsing per-project continuity documents and creating/selecting project context workspaces.

This specification is functional only. It defines user-visible behaviour, data expectations, constraints, and acceptance criteria. It does **not** prescribe implementation details such as framework, schema technology, or deployment internals.

---

## 2. Scope

### In scope
- A website that runs locally on the host machine.
- Six pages with a persistent menu/navigation system.
- A workflow/orchestration task surface for project-scoped requests.
- A project-scoped local working-context folder structure under `~/.openclaw/dev-context/projects/`.
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
2. Exactly six top-level pages.
3. Local persistence only.
4. Safe handling of file edits and release actions.
5. Project-scoped working-context management under `~/.openclaw/dev-context/projects/`.
6. A project-scoped workflow/orchestration surface for HAL-led task handling.
7. A consistent distinction between:
   - actual measured values,
   - estimated values,
   - unavailable values.

---

## 6. Navigation / Information Architecture

The UI must expose six menu items that are always reachable:

1. **Home** (default landing page)
2. **Dashboard**
3. **Workflow**
4. **Prompt Editor**
5. **Runtime Summary**
6. **Working Context**

### Navigation requirements
- The menu must be visible on every page.
- The currently active page must be visually indicated.
- The default route must open the Home landing page.
- Navigation must not discard unsaved prompt edits without a warning.

---

## 7. Page 1 — Home (Default Landing Page)

## 7.1 Purpose
Provide an operator landing page that introduces the app, shows the core navigation clearly, and acts as the default entry point.

## 7.2 Required behaviour
The landing page must:
- load by default
- keep the main menu visible
- include branded headline text and supporting copy
- support a hero image area or image slot
- provide quick actions into key app areas such as Workflow, Prompt Editor, Runtime Summary, or Working Context

## 7.3 Image handling
If a specific local landing-page image asset is available, the UI should display it.
If no image asset is available, the page must still render cleanly with a placeholder image area rather than breaking the layout.

---

## 8. Page 2 — Dashboard

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

## 9. Page 3 — Workflow

## 9.1 Purpose
Provide a project-scoped orchestration page where the operator can submit a new request for HAL to coordinate, monitor the currently active worker, review task output/log updates, choose whether remote updates should go to Telegram, and answer agent questions.

## 9.2 Project selection
The Workflow page must let the operator choose the target project from a dropdown sourced from the Working Context project list.
The currently selected project should be obvious in the UI and used as the scope for new task submissions.

## 9.3 Request submission
The page must include a request-entry section where the operator can type and submit a task request for the selected project.
Examples include:
- functional-spec updates
- code iteration requests
- design refinement requests
- bug-fix tasks

The request must be stored locally and treated as a project-scoped workflow item.

## 9.4 Worker status bar
The page must show a visible status bar for the active task indicating at minimum:
- current task status
- which team member is currently working on it, such as HAL, Alpha, Delta, Charlie, Tango, Romeo, or India
- latest update time if known

## 9.5 Output/log area
The page must include an output/log section for the active task.
This log should show step-by-step status messages or progress updates for the current task.
If the task is still active, the UI should show a moving or spinning visual indicator so the operator can tell updates are still expected.

## 9.6 Remote update preference
The page must include a radio-button choice controlling whether long-running updates should be sent to Telegram.
At minimum the UI must support:
- `No remote updates`
- `Send updates to Telegram`

If end-to-end Telegram delivery is not fully implemented in the first version, the preference must still be captured and attached to the task metadata or handoff state so the workflow remains forward-compatible.

## 9.7 Q&A table
The page must include a question-and-answer area in table form.
This area must:
- show any questions coming from the agent/team for the active task
- allow the operator to enter and submit a reply for each question
- preserve both the question and the answer in local task state

## 9.8 Local-first orchestration requirement
The workflow system must be operable locally even if deep live agent orchestration is not fully automatic in the first version.
It is acceptable for the first version to support a local-first handoff/logging model as long as the UI clearly represents task state, assigned worker, log output, and Q&A.

---

## 10. Page 4 — Prompt Editor

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
- `Release to Live + Restart OpenClaw`

This action must run:
- `./scripts/sync-agent-prompts.sh`
- then restart OpenClaw so the released prompt changes take effect in runtime

## 9.7 Release action functional requirements
When triggered, the UI must:
- indicate that a release is in progress
- execute the sync script from the repo root context
- restart OpenClaw after a successful sync
- capture success/failure outcome for both sync and restart steps
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

If the sync succeeds but restart fails, the UI must:
- report that prompt files were copied but runtime activation failed
- preserve output from both steps
- not present the release as fully successful

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

## 11. Page 4 — Working Context

## 11.1 Purpose
Provide a project-aware view of local continuity documents so the operator can browse, create, seed, and activate working context for multiple projects without relying on ad hoc shell commands.

## 11.2 Folder structure requirement
The working context must move from a single flat doc set to a project-scoped structure rooted at:
- `~/.openclaw/dev-context/projects/`

Each project must have its own folder, for example:
- `~/.openclaw/dev-context/projects/OpenClaw_agents_UI/`

Within each project folder, the UI must support a `docs/` subfolder containing at minimum:
- `current-status.md`
- `decisions.md`
- `next-steps.md`
- `dev-workflow.md`

The existing top-level docs may continue temporarily for backward compatibility, but project-scoped docs are the desired source of truth going forward.

## 11.3 Project list behaviour
The Working Context page must allow the operator to:
- view available project names discovered under `~/.openclaw/dev-context/projects/`
- choose an existing project
- see that project's context docs
- understand which project is currently selected in the UI session

## 11.4 Create project behaviour
The Working Context page must provide a way to enter a new project name and create a new project context structure.

Creating a new project must:
- validate and normalise the project name for safe folder creation
- create the project folder under `~/.openclaw/dev-context/projects/<project-name>/`
- create the standard `docs/` files for that project
- provide success/failure feedback

## 11.5 Create project repo handoff
After a new project context is created, the product must support invoking **Alpha** to build/init the project repo under:
- `~/srv/`

This is a workflow requirement, not merely a static file-generation step.
The UI must therefore be able to trigger an application-side workflow/handoff for project creation rather than only editing local markdown files.

## 11.6 Seed from existing project behaviour
When creating a new project context, the user must be able to optionally choose an existing project and copy its context docs into the new project structure.

This feature exists to support bootstrapping a new effort from an existing context baseline rather than always starting from empty templates.

The UI must:
- offer a selectable list of existing projects as optional source templates
- copy the chosen project's context docs into the new project's `docs/` folder
- make it clear whether the new project was seeded from blank templates or copied from another project

## 11.7 Context injection prompt
The Working Context page must provide a button/action that injects or presents the correct kickoff prompt for the currently selected project context.

The purpose of this action is to remove the need for the operator to manually run `~/.openclaw/dev-context/print-kickoff-prompt.sh` for every chat.

At minimum, the UI must support:
- generating the project-specific kickoff prompt text
- presenting it in a form suitable for copy/paste or direct insertion into chat
- ensuring the prompt references the selected project's context doc paths

## 11.8 External helper script support
The helper script:
- `~/.openclaw/dev-context/print-kickoff-prompt.sh`

must be updated so that a project name can be passed as an argument when used outside the web page.

Expected behaviour:
- if a project name is provided, print a kickoff prompt that references that project's context docs
- if no project name is provided, print a sensible default prompt or usage guidance

## 11.9 Read-only vs editable behaviour
For the first release of this working-context expansion, it is acceptable for the Working Context page to prioritise:
- project selection
- project creation
- project seeding/copying
- project-specific kickoff-prompt injection
- document viewing

Direct editing of those docs inside the Working Context page is optional unless later requested.

---

## 12. Local Persistence Requirements

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
- It has exactly four top-level pages accessible via a visible menu.
- The default page is the Dashboard.
- No external database is required.
- Project-scoped working context folders are supported under `~/.openclaw/dev-context/projects/`.

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
- The release flow restarts OpenClaw after successful sync.
- The UI shows success/failure feedback for release.

### 16.4 Runtime Summary
- The Runtime Summary shows per-agent model and other key runtime facts where locally knowable.
- It shows global runtime facts relevant to operator understanding.
- Missing/unknown values are handled explicitly rather than silently omitted.

### 16.5 Working Context
- The Working Context page lists available projects from `~/.openclaw/dev-context/projects/`.
- The user can create a new project context folder structure.
- The user can optionally seed a new project from an existing project's docs.
- The user can generate or inject a project-specific kickoff prompt from the UI.
- `~/.openclaw/dev-context/print-kickoff-prompt.sh` accepts a project name argument.

### 16.6 Persistence
- Any required app state is stored locally.
- Stored state remains available after app restart.

---

## 17. Recommended Functional Positioning

The right product posture for version 1 is:
- **operations dashboard + prompt editor for a local OpenClaw team**
- **transparent about uncertainty in usage/cost metrics**
- **strong on file-based control and runtime visibility**

The dashboard should be useful even if exact token/cost data remain partly or wholly unavailable. The honesty is part of the product quality, not a defect.
