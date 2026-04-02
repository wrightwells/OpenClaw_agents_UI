# OpenClaw_agents_UI — Working Context Addendum

This addendum extends the existing `docs/implementation-plan.md` for the new project-scoped working-context model. It stays within the current local-first Node.js + Express architecture and adds only the file, API, and UI pieces needed for project-aware continuity management.

## 1. Design goals

Add a project-aware working-context system that:
- stores context docs under `~/.openclaw/dev-context/projects/<project>/docs/`
- lets the operator select an existing project in the UI
- lets the operator create a new project, optionally seeded from another project
- generates a project-specific kickoff prompt from the UI and from the helper shell script
- supports a handoff action to Alpha so Alpha can initialize a repo under `~/srv/`
- remains compatible with the old flat `~/.openclaw/dev-context/docs/*.md` layout during transition

## 2. Filesystem model

### 2.1 New source-of-truth layout

Primary layout:

- `~/.openclaw/dev-context/projects/<project>/`
  - `docs/`
    - `current-status.md`
    - `decisions.md`
    - `next-steps.md`
    - `dev-workflow.md`

Recommended reserved expansion points:

- `~/.openclaw/dev-context/projects/<project>/meta.json`
  - optional machine-readable metadata for later use
  - example fields: `displayName`, `createdAt`, `seededFrom`, `repoPath`, `status`

For v1, `meta.json` is optional; the UI can derive most state from directory names and doc files.

### 2.2 Project naming rules

The backend should accept a user-entered display name, then normalize it to a safe project key for directory creation.

Recommended normalization:
- trim whitespace
- replace spaces with `_`
- allow only `[A-Za-z0-9._-]`
- collapse repeated separators where practical
- reject empty names after normalization
- reject names that would escape the projects root (`..`, `/`, null bytes, etc.)

Response shape should include both:
- `inputName`: raw user input
- `projectId`: normalized folder-safe key

### 2.3 Compatibility with existing flat docs

Legacy layout:
- `~/.openclaw/dev-context/docs/current-status.md`
- `~/.openclaw/dev-context/docs/decisions.md`
- `~/.openclaw/dev-context/docs/next-steps.md`
- `~/.openclaw/dev-context/docs/dev-workflow.md`

Compatibility approach:
- If project-scoped folders exist, the Working Context page should default to project mode.
- If no project is selected but flat docs exist, expose them as a pseudo-project, e.g. `legacy-default` or `Flat docs (legacy)`.
- The backend should provide one compatibility resolver that returns a resolved doc set for either:
  - a real project under `projects/<project>/docs/`, or
  - the legacy flat docs directory.
- Do not auto-migrate legacy docs on first load.
- Offer read compatibility first; migration/copy into a named project can remain an explicit user action.

This avoids breaking existing workflows while making the project structure the preferred path.

## 3. Backend/service design

### 3.1 New server-side constants

Add constants alongside the existing prompt/runtime paths:

- `DEV_CONTEXT_ROOT = ~/.openclaw/dev-context`
- `PROJECTS_ROOT = ~/.openclaw/dev-context/projects`
- `LEGACY_DOCS_ROOT = ~/.openclaw/dev-context/docs`
- `KICKOFF_SCRIPT = ~/.openclaw/dev-context/print-kickoff-prompt.sh`
- `SRV_ROOT = ~/srv`

### 3.2 Internal service responsibilities

Keep the Express app simple, but split logic conceptually into small helpers:

- `listProjects()`
  - enumerate valid project directories under `PROJECTS_ROOT`
  - optionally append a legacy pseudo-project when flat docs exist
- `resolveProjectDocs(projectId)`
  - map project id to docs root and file list
  - handle legacy pseudo-project
- `createProject({ name, seedFrom })`
  - normalize name
  - create project folder and `docs/`
  - either create blank standard docs or copy docs from `seedFrom`
  - optionally write `meta.json`
- `generateKickoffPrompt(projectId)`
  - call the helper script with the project id argument
  - return text and resolved source info
- `handoffProjectToAlpha(projectId, options)`
  - construct the Alpha initialization request/prompt
  - trigger the handoff mechanism used by the app

These can live in `server.js` initially, but should be written as isolated helper functions so the route layer stays thin.

### 3.3 API additions

Recommended endpoints:

#### `GET /api/context/projects`
Returns:
- discovered project list
- optional legacy pseudo-project
- optional last-selected project from UI state

Example response:

```json
{
  "projects": [
    {
      "id": "OpenClaw_agents_UI",
      "label": "OpenClaw_agents_UI",
      "type": "project",
      "docsPath": "/home/ww/.openclaw/dev-context/projects/OpenClaw_agents_UI/docs"
    },
    {
      "id": "__legacy__",
      "label": "Flat docs (legacy)",
      "type": "legacy",
      "docsPath": "/home/ww/.openclaw/dev-context/docs"
    }
  ],
  "selectedProjectId": "OpenClaw_agents_UI"
}
```

#### `GET /api/context/projects/:projectId`
Returns:
- resolved doc set for the selected project
- compatibility metadata (`type: project|legacy`)

#### `POST /api/context/projects`
Creates a project.

Request:

```json
{
  "name": "My New Project",
  "seedFrom": "OpenClaw_agents_UI"
}
```

Behaviour:
- normalize to `projectId`
- reject duplicates unless later extended with overwrite semantics
- create blank or seeded docs
- persist selected project in local UI state

Response should include:
- `projectId`
- `created`
- `seededFrom`
- created file paths

#### `POST /api/context/select`
Persists the currently selected project in local UI state.

Request:

```json
{ "projectId": "OpenClaw_agents_UI" }
```

This is lightweight but useful so the UI reopens to the last active project.

#### `POST /api/context/kickoff-prompt`
Request:

```json
{ "projectId": "OpenClaw_agents_UI" }
```

Behaviour:
- execute `print-kickoff-prompt.sh <projectId>`
- return prompt text and resolved project info

#### `POST /api/context/projects/:projectId/init-repo`
Triggers the Alpha repo-init handoff.

Request may optionally include:

```json
{
  "repoName": "OpenClaw_agents_UI",
  "srvPath": "/home/ww/srv/OpenClaw_agents_UI"
}
```

Response should be explicit that this is a handoff/request, not silent local repo creation by the UI.

### 3.4 Local persistence updates

Extend `data/ui-state.json` with working-context state, e.g.:

```json
{
  "selectedProjectId": "OpenClaw_agents_UI",
  "workingContext": {
    "lastKickoffPromptAt": "2026-04-02T09:00:00.000Z",
    "recentProjects": ["OpenClaw_agents_UI"],
    "lastInitRepoRequest": {
      "projectId": "OpenClaw_agents_UI",
      "at": "2026-04-02T09:05:00.000Z",
      "status": "requested"
    }
  }
}
```

This remains local-only and consistent with the existing persistence model.

## 4. UI flow design

### 4.1 Working Context page layout

Recommended structure:

1. **Project selector panel**
   - dropdown or list of existing projects
   - clear indicator of current selection
   - support selecting legacy flat docs if present

2. **Project actions bar**
   - `Create Project`
   - `Generate Kickoff Prompt`
   - `Ask Alpha to Init Repo`

3. **Project docs viewer**
   - tabs or stacked sections for the four standard docs
   - read-only in v1 is acceptable

4. **Status/feedback area**
   - project creation result
   - kickoff prompt generation result
   - Alpha handoff status/result excerpt

### 4.2 Create project flow

Recommended flow:

1. User clicks `Create Project`.
2. Modal/form opens with:
   - `Project name` text input
   - optional `Seed from existing project` dropdown with `Blank template` default
   - optional read-only preview of normalized folder name
3. On submit, backend validates and creates:
   - `~/.openclaw/dev-context/projects/<projectId>/docs/`
   - standard docs, blank or copied
4. UI selects the newly created project automatically.
5. Success state tells the user:
   - created project id
   - whether it was blank or seeded
   - doc path
   - next available action: `Generate Kickoff Prompt` or `Ask Alpha to Init Repo`

### 4.3 Project selection flow

On page load:
- fetch project list
- fetch the locally persisted `selectedProjectId`
- if valid, load it automatically
- otherwise select the first discovered project or legacy pseudo-project

On change:
- call `POST /api/context/select`
- then load project docs via `GET /api/context/projects/:projectId`

### 4.4 Kickoff prompt flow

When `Generate Kickoff Prompt` is clicked:
- call `POST /api/context/kickoff-prompt`
- render the returned prompt in a copyable text area or modal
- clearly label which project it references
- optionally include a `Copy` button

The UI should not hardcode prompt text generation logic if the shell helper remains the canonical formatter.

## 5. Kickoff prompt generation design

### 5.1 Why keep the shell script as the formatter

The helper script already exists and is part of the operator workflow. The least risky design is:
- keep the script as the canonical prompt formatter
- make the backend call it with a project argument
- have the UI display the result

This avoids duplicating prompt text templates in both shell and JavaScript.

### 5.2 Script contract update

Update `~/.openclaw/dev-context/print-kickoff-prompt.sh` to support:

- `print-kickoff-prompt.sh <project>`
  - resolve `~/.openclaw/dev-context/projects/<project>/docs/`
  - print a kickoff prompt referencing those files
- `print-kickoff-prompt.sh` with no args
  - either:
    - print usage guidance plus available projects, or
    - print a sensible default based on legacy flat docs / current default project

Recommended behavior:
- if project argument provided and valid: print project-specific prompt
- if no argument and legacy flat docs exist: print legacy-compatible prompt
- if no argument and projects exist: print usage guidance and maybe the currently selected/default project hint
- if invalid project: exit non-zero with clear stderr

### 5.3 Suggested script semantics

Inputs:
- positional arg 1 = project id, optional

Outputs:
- stdout = full kickoff prompt text
- stderr = validation/usage errors
- exit 0 on success, non-zero on invalid project or missing docs

The prompt text should reference the resolved file paths, not assume flat docs.

## 6. Alpha handoff for repo initialization under `~/srv/`

### 6.1 Separation of concerns

The UI should not directly scaffold the repo under `~/srv/` if the intended workflow is “ask Alpha to do it.”

Instead:
- UI owns project-context creation under `~/.openclaw/dev-context/projects/...`
- Alpha owns repo initialization under `~/srv/...`

This keeps the workflow aligned with the spec and avoids the UI doing silent work that should be delegated.

### 6.2 Backend contract for Alpha handoff

The backend should assemble a structured handoff request containing:
- project id
- desired repo path under `~/srv/<projectId>`
- whether the context was blank or seeded
- resolved context doc paths
- optional kickoff prompt text or a prompt reference

Suggested payload shape returned to the frontend and/or passed into the handoff layer:

```json
{
  "agent": "alpha",
  "action": "init-project-repo",
  "projectId": "OpenClaw_agents_UI",
  "repoPath": "/home/ww/srv/OpenClaw_agents_UI",
  "contextDocs": {
    "currentStatus": "/home/ww/.openclaw/dev-context/projects/OpenClaw_agents_UI/docs/current-status.md",
    "decisions": "/home/ww/.openclaw/dev-context/projects/OpenClaw_agents_UI/docs/decisions.md",
    "nextSteps": "/home/ww/.openclaw/dev-context/projects/OpenClaw_agents_UI/docs/next-steps.md",
    "devWorkflow": "/home/ww/.openclaw/dev-context/projects/OpenClaw_agents_UI/docs/dev-workflow.md"
  }
}
```

### 6.3 Trigger mechanism

The exact transport depends on existing OpenClaw integration choices, but the UI design should support one of these patterns:

1. **Preferred:** backend invokes an existing local automation path that can send a task to Alpha
2. **Fallback:** backend returns a ready-to-send Alpha task prompt and the UI presents it for copy/paste

If no reliable direct delegation API exists yet, implement the fallback first. That still satisfies the workflow requirement while keeping the contract stable.

### 6.4 User-facing flow

After project creation, show:
- `Project context created`
- `Generate Kickoff Prompt`
- `Ask Alpha to Init Repo`

When the Alpha action is triggered, show either:
- `Handoff sent to Alpha` with timestamp and request summary, or
- `Prepared Alpha init request` with a copyable prompt if direct dispatch is not yet implemented

The UI must not claim the repo exists until a positive result is returned.

## 7. Blank template vs seeded template behavior

### 7.1 Blank project creation

For a blank project, create the four standard docs with lightweight starter headings, e.g.:
- project title
- purpose
- current status placeholder
- known decisions placeholder
- next steps placeholder
- workflow notes placeholder

This is better than zero-byte files because it gives Alpha and the operator some structure immediately.

### 7.2 Seeded project creation

When seeded from another project:
- copy only the standard docs from source `docs/`
- do not copy any future non-doc project artifacts by default
- record `seededFrom` in `meta.json` or UI state if metadata is used

This keeps seeding predictable and avoids accidental baggage.

## 8. Suggested implementation sequence

1. Add path constants and helper functions for project/legacy doc resolution.
2. Add `GET /api/context/projects` and `GET /api/context/projects/:projectId`.
3. Add `POST /api/context/projects` with blank + seeded creation.
4. Extend `data/ui-state.json` handling for selected project persistence.
5. Update the Working Context frontend to list/select projects and display project docs.
6. Update `print-kickoff-prompt.sh` to accept an optional project argument.
7. Add `POST /api/context/kickoff-prompt` and UI modal/copy flow.
8. Add `POST /api/context/projects/:projectId/init-repo` with Alpha handoff or fallback prompt generation.
9. Add compatibility polish for legacy flat docs and empty-state handling.

## 9. Risks and edge cases

- **Name collisions:** normalized names may collide; backend must reject duplicates cleanly.
- **Partial seeded copies:** handle missing source docs explicitly and report which files were copied.
- **Legacy ambiguity:** if both legacy docs and projects exist, the selected/default behavior must be obvious in the UI.
- **Alpha transport uncertainty:** direct Alpha dispatch may not exist yet; design the endpoint so fallback copy/paste mode is valid.
- **Path safety:** all project paths must be derived from normalized project ids under the known root, never from raw user paths.

## 10. Acceptance-oriented outcome

This addendum is complete if the implementation delivers:
- a project-scoped docs structure under `~/.openclaw/dev-context/projects/<project>/docs/`
- project listing, selection, blank creation, and seeded creation in the UI
- backend endpoints for list/select/create/prompt/init-repo flows
- a project-aware kickoff prompt generated via the updated helper script
- a clean handoff path for Alpha to initialize repos under `~/srv/`
- read compatibility with the old flat docs layout without breaking current usage
