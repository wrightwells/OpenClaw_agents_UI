const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFile, spawn } = require('child_process');
const os = require('os');
const util = require('util');
const crypto = require('crypto');

const execFileAsync = util.promisify(execFile);
const app = express();
const PORT = process.env.PORT || 4321;

const HOME = os.homedir();
const OPENCLAW_CONFIG = path.join(HOME, '.openclaw', 'openclaw.json');
const TEAM_ROOT = path.join(HOME, '.openclaw', 'workspace', 'OpenClaw_Team');
const TEMPLATE_DIR = path.join(TEAM_ROOT, 'agent-templates');
const SYNC_SCRIPT = path.join(TEAM_ROOT, 'scripts', 'sync-agent-prompts.sh');
const UI_STATE_PATH = path.join(__dirname, 'data', 'ui-state.json');
const DEV_CONTEXT_ROOT = path.join(HOME, '.openclaw', 'dev-context');
const PROJECTS_ROOT = path.join(DEV_CONTEXT_ROOT, 'projects');
const CONTEXT_DOC_FILENAMES = ['current-status.md', 'decisions.md', 'next-steps.md', 'dev-workflow.md'];
const KICKOFF_SCRIPT = path.join(DEV_CONTEXT_ROOT, 'print-kickoff-prompt.sh');
const PROJECT_INIT_HOOK = path.join(DEV_CONTEXT_ROOT, 'hooks', 'init-project-repo.sh');
const WORKFLOW_HOOK = path.join(DEV_CONTEXT_ROOT, 'hooks', 'submit-workflow-task.sh');
const AGENT_ORDER = ['main', 'alpha', 'delta', 'charlie', 'tango', 'romeo', 'india'];

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function readJsonSafe(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function getDefaultUiState() {
  return {
    usageOverrides: {},
    releaseHistory: [],
    notes: {},
    workingContext: {
      selectedProject: null,
      lastProjectCreatedAt: null,
      lastRepoInitRequest: null
    },
    workflow: {
      tasks: [],
      selectedTaskId: null
    }
  };
}

function getConfig() {
  return readJsonSafe(OPENCLAW_CONFIG, {});
}

function getUiState() {
  const state = readJsonSafe(UI_STATE_PATH, getDefaultUiState());
  state.workingContext = state.workingContext || getDefaultUiState().workingContext;
  state.workflow = state.workflow || getDefaultUiState().workflow;
  state.workflow.tasks = Array.isArray(state.workflow.tasks) ? state.workflow.tasks : [];
  return state;
}

async function saveUiState(state) {
  await fsp.mkdir(path.dirname(UI_STATE_PATH), { recursive: true });
  await fsp.writeFile(UI_STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function getAgentConfigs() {
  const config = getConfig();
  const defaults = config?.agents?.defaults || {};
  const list = config?.agents?.list || [];
  const byId = Object.fromEntries(list.map(agent => [agent.id, agent]));

  return AGENT_ORDER.map((id) => {
    const agent = byId[id] || { id };
    const workspace = agent.workspace || (id === 'main'
      ? path.join(HOME, '.openclaw', 'workspace')
      : path.join(HOME, `.openclaw/workspace-${id}`));
    return {
      id,
      name: agent.name || id,
      model: agent?.model?.primary || defaults?.model?.primary || 'Unknown',
      workspace,
      agentDir: agent.agentDir || null,
      promptTemplatePath: path.join(TEMPLATE_DIR, `${id}.md`),
      livePromptPath: path.join(workspace, 'AGENTS.md')
    };
  });
}

function buildMetricSet(_agentId, override, label) {
  const base = override?.[label] || {};
  return {
    usage: base.usage ?? null,
    cost: base.cost ?? null,
    status: base.status || 'Unavailable',
    basis: base.basis || 'Not measurable with current runtime (ChatGPT Plus / Codex OAuth does not expose billable API usage here).'
  };
}

function buildSummary() {
  const state = getUiState();
  const agents = getAgentConfigs().map((agent) => {
    const override = state.usageOverrides?.[agent.id] || {};
    return {
      ...agent,
      metrics: {
        day: buildMetricSet(agent.id, override, 'day'),
        week: buildMetricSet(agent.id, override, 'week'),
        month: buildMetricSet(agent.id, override, 'month')
      },
      lastRefresh: new Date().toISOString()
    };
  });

  const counts = { Actual: 0, Estimated: 0, Unavailable: 0 };
  for (const agent of agents) {
    const statuses = [agent.metrics.day.status, agent.metrics.week.status, agent.metrics.month.status];
    const strongest = statuses.includes('Actual') ? 'Actual' : statuses.includes('Estimated') ? 'Estimated' : 'Unavailable';
    counts[strongest] = (counts[strongest] || 0) + 1;
  }

  return {
    agents,
    summary: {
      trackedAgents: agents.length,
      actualAgents: counts.Actual,
      estimatedAgents: counts.Estimated,
      unavailableAgents: counts.Unavailable,
      lastRefresh: new Date().toISOString(),
      note: state.notes?.dashboard || null
    }
  };
}

function slugifyProjectName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

function assertSafeProjectName(name) {
  const project = slugifyProjectName(name);
  if (!project) throw new Error('Project name is required.');
  if (project === '.' || project === '..') throw new Error('Project name is invalid.');
  return project;
}

function getProjectDir(project) {
  return path.join(PROJECTS_ROOT, project);
}

function getProjectDocsDir(project) {
  return path.join(getProjectDir(project), 'docs');
}

function getProjectDocPaths(project) {
  return CONTEXT_DOC_FILENAMES.map((name) => path.join(getProjectDocsDir(project), name));
}

function buildBlankDocContent(project, fileName) {
  const title = fileName.replace(/\.md$/, '').replace(/-/g, ' ');
  return `# ${title}\n\nProject: ${project}\n\n`;
}

async function pathExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureProjectStructure(project, sourceProject = null) {
  const docsDir = getProjectDocsDir(project);
  await fsp.mkdir(docsDir, { recursive: true });

  for (const fileName of CONTEXT_DOC_FILENAMES) {
    const destination = path.join(docsDir, fileName);
    if (sourceProject) {
      const source = path.join(getProjectDocsDir(sourceProject), fileName);
      if (await pathExists(source)) {
        await fsp.copyFile(source, destination);
        continue;
      }
    }
    if (!(await pathExists(destination))) {
      await fsp.writeFile(destination, buildBlankDocContent(project, fileName), 'utf8');
    }
  }
}

async function readProject(project) {
  const projectDir = getProjectDir(project);
  const docsDir = getProjectDocsDir(project);
  const docs = [];

  for (const fileName of CONTEXT_DOC_FILENAMES) {
    const filePath = path.join(docsDir, fileName);
    let content = '';
    let exists = false;
    try {
      content = await fsp.readFile(filePath, 'utf8');
      exists = true;
    } catch {}
    docs.push({ name: fileName, filePath, exists, content });
  }

  return {
    name: project,
    projectDir,
    docsDir,
    docs,
    kickoffPromptScript: KICKOFF_SCRIPT,
    kickoffPromptAvailable: await pathExists(KICKOFF_SCRIPT)
  };
}

async function listProjects() {
  await fsp.mkdir(PROJECTS_ROOT, { recursive: true });
  const entries = await fsp.readdir(PROJECTS_ROOT, { withFileTypes: true });
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    const docsDir = getProjectDocsDir(name);
    const docsPresent = [];
    for (const fileName of CONTEXT_DOC_FILENAMES) {
      if (await pathExists(path.join(docsDir, fileName))) docsPresent.push(fileName);
    }
    const stats = await fsp.stat(getProjectDir(name));
    projects.push({
      name,
      docsDir,
      docsPresent,
      missingDocs: CONTEXT_DOC_FILENAMES.filter(file => !docsPresent.includes(file)),
      updatedAt: stats.mtime.toISOString()
    });
  }
  projects.sort((a, b) => a.name.localeCompare(b.name));
  return projects;
}

async function getSelectedProject(projectName) {
  const state = getUiState();
  const projects = await listProjects();
  if (projectName) return assertSafeProjectName(projectName);
  if (state.workingContext?.selectedProject && projects.some(project => project.name === state.workingContext.selectedProject)) {
    return state.workingContext.selectedProject;
  }
  return projects[0]?.name || null;
}

async function saveSelectedProject(project) {
  const state = getUiState();
  state.workingContext.selectedProject = project;
  await saveUiState(state);
}

async function buildKickoffPrompt(project) {
  if (await pathExists(KICKOFF_SCRIPT)) {
    try {
      const { stdout } = await execFileAsync('bash', [KICKOFF_SCRIPT, project], {
        cwd: DEV_CONTEXT_ROOT,
        env: process.env,
        maxBuffer: 1024 * 1024
      });
      return stdout.trim();
    } catch (error) {
      if (error.stdout?.trim()) return error.stdout.trim();
      throw error;
    }
  }

  const docPaths = getProjectDocPaths(project);
  return `Read ${docPaths.map(file => `\`${file}\``).join(', ')}, inspect git status/diff for \`${path.join(HOME, 'srv', project)}\`, summarise where we are, and continue.`;
}

async function triggerProjectRepoInit(project) {
  const repoRoot = path.join(HOME, 'srv', project);
  const kickoffPrompt = await buildKickoffPrompt(project);
  const manualCommand = [
    'Alpha handoff required.',
    `Create or initialize the repo at ${repoRoot}.`,
    'Suggested kickoff prompt:',
    kickoffPrompt
  ].join('\n\n');

  if (await pathExists(PROJECT_INIT_HOOK)) {
    try {
      const result = await execFileAsync('bash', [PROJECT_INIT_HOOK, project, repoRoot], {
        cwd: DEV_CONTEXT_ROOT,
        env: { ...process.env, OPENCLAW_PROJECT_NAME: project, OPENCLAW_PROJECT_REPO_ROOT: repoRoot },
        maxBuffer: 1024 * 1024
      });
      return {
        status: 'hook-executed',
        repoRoot,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        manualCommand,
        note: `Executed ${PROJECT_INIT_HOOK}.`
      };
    } catch (error) {
      return {
        status: 'hook-failed',
        repoRoot,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || '',
        manualCommand,
        note: `Tried ${PROJECT_INIT_HOOK} but it failed. Manual Alpha handoff still required.`
      };
    }
  }

  const requestDir = path.join(getProjectDir(project), 'handoff');
  await fsp.mkdir(requestDir, { recursive: true });
  const requestPath = path.join(requestDir, `alpha-init-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
  await fsp.writeFile(requestPath, `${manualCommand}\n`, 'utf8');

  return {
    status: 'manual-handoff-required',
    repoRoot,
    requestPath,
    stdout: '',
    stderr: '',
    manualCommand,
    note: `No hook script found at ${PROJECT_INIT_HOOK}. Wrote a handoff note for Alpha instead.`
  };
}

function appendWorkflowLog(task, message, type = 'info') {
  task.logs = Array.isArray(task.logs) ? task.logs : [];
  task.logs.push({ id: crypto.randomUUID(), at: new Date().toISOString(), type, message });
}

function getWorkflowState() {
  const state = getUiState();
  state.workflow = state.workflow || { tasks: [], selectedTaskId: null };
  state.workflow.tasks = Array.isArray(state.workflow.tasks) ? state.workflow.tasks : [];
  return state;
}

function getTaskById(state, taskId) {
  return state.workflow.tasks.find(task => task.id === taskId) || null;
}

async function triggerWorkflowTask(task) {
  const kickoffPrompt = await buildKickoffPrompt(task.project);
  const requestDir = path.join(getProjectDir(task.project), 'handoff');
  await fsp.mkdir(requestDir, { recursive: true });
  const requestPath = path.join(requestDir, `workflow-task-${task.id}.md`);
  const handoffPrompt = [
    `Project: ${task.project}`,
    `Notify preference: ${task.notifyChannel}`,
    'Requested work:',
    task.request,
    '',
    'Kickoff prompt:',
    kickoffPrompt
  ].join('\n');

  task.handoff = {
    status: 'pending',
    hookPath: WORKFLOW_HOOK,
    requestPath,
    manualPrompt: handoffPrompt
  };
  await fsp.writeFile(requestPath, `${handoffPrompt}\n`, 'utf8');
  appendWorkflowLog(task, `Created workflow handoff note at ${requestPath}.`);

  if (await pathExists(WORKFLOW_HOOK)) {
    try {
      const result = await execFileAsync('bash', [WORKFLOW_HOOK, task.id, task.project, task.notifyChannel, requestPath], {
        cwd: DEV_CONTEXT_ROOT,
        env: {
          ...process.env,
          OPENCLAW_WORKFLOW_TASK_ID: task.id,
          OPENCLAW_PROJECT_NAME: task.project,
          OPENCLAW_NOTIFY_CHANNEL: task.notifyChannel,
          OPENCLAW_WORKFLOW_REQUEST_PATH: requestPath,
          OPENCLAW_WORKFLOW_REQUEST: task.request
        },
        maxBuffer: 1024 * 1024
      });
      task.handoff.status = 'hook-executed';
      task.handoff.stdout = result.stdout || '';
      task.handoff.stderr = result.stderr || '';
      task.status = 'running';
      task.activeWorker = 'HAL';
      appendWorkflowLog(task, `Workflow hook executed from ${WORKFLOW_HOOK}.`);
      if (result.stdout?.trim()) appendWorkflowLog(task, result.stdout.trim());
      return;
    } catch (error) {
      task.handoff.status = 'hook-failed';
      task.handoff.stdout = error.stdout || '';
      task.handoff.stderr = error.stderr || error.message || '';
      task.status = 'awaiting-manual-handoff';
      task.activeWorker = 'HAL';
      appendWorkflowLog(task, `Workflow hook failed; falling back to manual handoff.`, 'warning');
      if (task.handoff.stderr) appendWorkflowLog(task, task.handoff.stderr, 'warning');
      return;
    }
  }

  task.handoff.status = 'manual-handoff-required';
  task.status = 'awaiting-manual-handoff';
  task.activeWorker = 'HAL';
  appendWorkflowLog(task, `No workflow hook found at ${WORKFLOW_HOOK}; manual HAL orchestration handoff required.`, 'warning');
}

function readHookTaskState(taskId) {
  const statePath = path.join(WORKFLOW_TASKS_ROOT, taskId, 'state.json');
  try {
    if (!fs.existsSync(statePath)) return null;
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return null;
  }
}

function readHookTaskResult(taskId) {
  const resultPath = path.join(WORKFLOW_TASKS_ROOT, taskId, 'agent-result.json');
  try {
    if (!fs.existsSync(resultPath)) return null;
    const raw = fs.readFileSync(resultPath, 'utf8').trim();
    if (!raw) return null;
    return raw.slice(0, 4000);
  } catch {
    return null;
  }
}

function dedupeLogs(logs) {
  const seen = new Set();
  return (logs || []).filter((log) => {
    const key = `${log.at}|${log.type}|${log.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function serializeWorkflowTask(task) {
  const hookState = readHookTaskState(task.id);
  const hookResult = readHookTaskResult(task.id);
  const mergedLogs = dedupeLogs([
    ...(task.logs || []),
    ...(hookState?.logs || []),
    ...(hookResult ? [{ at: hookState?.updatedAt || new Date().toISOString(), type: 'info', message: `Agent result captured (${hookResult.length} chars).` }] : [])
  ]);

  return {
    id: task.id,
    project: task.project,
    request: task.request,
    notifyChannel: task.notifyChannel,
    status: hookState?.status || task.status,
    activeWorker: hookState?.agent || task.activeWorker,
    createdAt: task.createdAt,
    updatedAt: hookState?.updatedAt || task.updatedAt,
    logs: mergedLogs,
    questions: task.questions || [],
    handoff: {
      ...(task.handoff || {}),
      hookState,
      resultPreview: hookResult
    }
  };
}

app.get('/api/summary', (_req, res) => {
  res.json(buildSummary());
});

app.get('/api/prompts', async (_req, res) => {
  try {
    const prompts = [];
    for (const id of AGENT_ORDER) {
      const filePath = path.join(TEMPLATE_DIR, `${id}.md`);
      let content = '';
      let exists = false;
      try {
        content = await fsp.readFile(filePath, 'utf8');
        exists = true;
      } catch {}
      prompts.push({ agentId: id, filePath, exists, content });
    }
    res.json({ prompts, releaseScript: SYNC_SCRIPT });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/prompts/:agentId', async (req, res) => {
  const { agentId } = req.params;
  const { content } = req.body || {};
  if (!AGENT_ORDER.includes(agentId)) return res.status(400).json({ error: 'Unknown agent id' });
  if (typeof content !== 'string') return res.status(400).json({ error: 'Content must be a string' });
  try {
    const filePath = path.join(TEMPLATE_DIR, `${agentId}.md`);
    await fsp.mkdir(TEMPLATE_DIR, { recursive: true });
    await fsp.writeFile(filePath, content, 'utf8');
    res.json({ ok: true, agentId, filePath, savedAt: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/release', async (_req, res) => {
  try {
    const syncResult = await execFileAsync('bash', [SYNC_SCRIPT], {
      cwd: TEAM_ROOT,
      env: process.env,
      maxBuffer: 1024 * 1024
    });

    let restartStdout = '';
    let restartStderr = '';
    try {
      const restarted = await execFileAsync('openclaw', ['gateway', 'restart'], {
        env: process.env,
        maxBuffer: 1024 * 1024
      });
      restartStdout = restarted.stdout || '';
      restartStderr = restarted.stderr || '';
    } catch (restartError) {
      restartStdout = restartError.stdout || '';
      restartStderr = restartError.stderr || restartError.message || '';
      throw Object.assign(new Error(`Prompt sync succeeded but OpenClaw restart failed: ${restartError.message}`), {
        stdout: `${syncResult.stdout || ''}\n${restartStdout}`.trim(),
        stderr: `${syncResult.stderr || ''}\n${restartStderr}`.trim()
      });
    }

    const state = getUiState();
    state.releaseHistory = state.releaseHistory || [];
    state.releaseHistory.unshift({
      at: new Date().toISOString(),
      syncStdout: syncResult.stdout || '',
      syncStderr: syncResult.stderr || '',
      restartStdout,
      restartStderr
    });
    state.releaseHistory = state.releaseHistory.slice(0, 10);
    await saveUiState(state);

    res.json({
      ok: true,
      ranAt: new Date().toISOString(),
      syncStdout: syncResult.stdout || '',
      syncStderr: syncResult.stderr || '',
      restartStdout,
      restartStderr
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message, stdout: error.stdout || '', stderr: error.stderr || '' });
  }
});

app.get('/api/runtime', async (_req, res) => {
  try {
    const config = getConfig();
    const state = getUiState();
    let statusText = '';
    try {
      const { stdout } = await execFileAsync('openclaw', ['status'], { maxBuffer: 1024 * 1024 });
      statusText = stdout;
    } catch (error) {
      statusText = error.stdout || error.message;
    }

    res.json({
      agents: getAgentConfigs(),
      defaults: config?.agents?.defaults || {},
      channels: config?.channels || {},
      gateway: config?.gateway || {},
      authProfiles: Object.keys(config?.auth?.profiles || {}),
      releaseHistory: state.releaseHistory || [],
      statusText,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/context-docs', async (req, res) => {
  try {
    const projects = await listProjects();
    const selectedProject = await getSelectedProject(req.query.project);
    if (!selectedProject) {
      return res.json({
        projects,
        selectedProject: null,
        project: null,
        kickoffPrompt: '',
        generatedAt: new Date().toISOString(),
        repoInit: { hookPath: PROJECT_INIT_HOOK, hookExists: await pathExists(PROJECT_INIT_HOOK) }
      });
    }

    await saveSelectedProject(selectedProject);
    const project = await readProject(selectedProject);
    const kickoffPrompt = await buildKickoffPrompt(selectedProject);

    res.json({
      projects,
      selectedProject,
      project,
      kickoffPrompt,
      generatedAt: new Date().toISOString(),
      repoInit: { hookPath: PROJECT_INIT_HOOK, hookExists: await pathExists(PROJECT_INIT_HOOK) }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/context-projects/select', async (req, res) => {
  try {
    const project = assertSafeProjectName(req.body?.project);
    if (!(await pathExists(getProjectDir(project)))) return res.status(404).json({ error: `Project not found: ${project}` });
    await saveSelectedProject(project);
    res.json({ ok: true, selectedProject: project });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/context-projects', async (req, res) => {
  try {
    const project = assertSafeProjectName(req.body?.name);
    const copyFrom = req.body?.copyFrom ? assertSafeProjectName(req.body.copyFrom) : null;
    const initRepo = Boolean(req.body?.initRepo);

    if (await pathExists(getProjectDir(project))) return res.status(409).json({ error: `Project already exists: ${project}` });
    if (copyFrom && !(await pathExists(getProjectDir(copyFrom)))) return res.status(404).json({ error: `Source project not found: ${copyFrom}` });

    await ensureProjectStructure(project, copyFrom);
    await saveSelectedProject(project);

    let repoInit = null;
    const state = getUiState();
    state.workingContext.lastProjectCreatedAt = new Date().toISOString();
    if (initRepo) {
      repoInit = await triggerProjectRepoInit(project);
      state.workingContext.lastRepoInitRequest = { project, at: new Date().toISOString(), status: repoInit.status, repoRoot: repoInit.repoRoot };
    }
    await saveUiState(state);

    res.status(201).json({ ok: true, project: await readProject(project), selectedProject: project, copiedFrom: copyFrom, repoInit, kickoffPrompt: await buildKickoffPrompt(project) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/context-projects/:project/kickoff', async (req, res) => {
  try {
    const project = assertSafeProjectName(req.params.project);
    if (!(await pathExists(getProjectDir(project)))) return res.status(404).json({ error: `Project not found: ${project}` });
    await saveSelectedProject(project);
    const kickoffPrompt = await buildKickoffPrompt(project);
    res.json({ ok: true, project, kickoffPrompt });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/context-projects/:project/init-repo', async (req, res) => {
  try {
    const project = assertSafeProjectName(req.params.project);
    if (!(await pathExists(getProjectDir(project)))) return res.status(404).json({ error: `Project not found: ${project}` });
    const repoInit = await triggerProjectRepoInit(project);
    res.json({ ok: true, project, repoInit });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/context-projects/:project/docs/:docName', async (req, res) => {
  try {
    const project = assertSafeProjectName(req.params.project);
    const docName = String(req.params.docName || '');
    if (!(await pathExists(getProjectDir(project)))) return res.status(404).json({ error: `Project not found: ${project}` });
    if (!CONTEXT_DOC_FILENAMES.includes(docName)) return res.status(400).json({ error: `Unknown context doc: ${docName}` });
    const content = String(req.body?.content ?? '');
    const filePath = path.join(getProjectDocsDir(project), docName);
    await fsp.mkdir(getProjectDocsDir(project), { recursive: true });
    await fsp.writeFile(filePath, content, 'utf8');
    res.json({ ok: true, project, docName, filePath, savedAt: new Date().toISOString() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/workflow', async (req, res) => {
  try {
    const state = getWorkflowState();
    const projects = await listProjects();
    const selectedProject = await getSelectedProject(req.query.project);
    const selectedTaskId = req.query.taskId || state.workflow.selectedTaskId || state.workflow.tasks[0]?.id || null;
    const selectedTask = selectedTaskId ? getTaskById(state, selectedTaskId) : null;
    res.json({
      projects,
      selectedProject,
      tasks: state.workflow.tasks.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(serializeWorkflowTask),
      selectedTaskId,
      selectedTask: selectedTask ? serializeWorkflowTask(selectedTask) : null,
      hook: { workflowHookPath: WORKFLOW_HOOK, hookExists: await pathExists(WORKFLOW_HOOK) },
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/workflow/tasks', async (req, res) => {
  try {
    const project = assertSafeProjectName(req.body?.project);
    const requestText = String(req.body?.request || '').trim();
    const notifyChannel = req.body?.notifyChannel === 'telegram' ? 'telegram' : 'none';
    if (!(await pathExists(getProjectDir(project)))) return res.status(404).json({ error: `Project not found: ${project}` });
    if (!requestText) return res.status(400).json({ error: 'Task request is required.' });

    const state = getWorkflowState();
    const task = {
      id: crypto.randomUUID(),
      project,
      request: requestText,
      notifyChannel,
      status: 'submitted',
      activeWorker: 'HAL',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      logs: [],
      questions: [],
      handoff: null
    };
    appendWorkflowLog(task, `Task submitted for project ${project}.`);
    appendWorkflowLog(task, `Telegram updates preference: ${notifyChannel}.`);
    appendWorkflowLog(task, 'HAL is orchestrating the request.');
    await triggerWorkflowTask(task);
    task.updatedAt = new Date().toISOString();
    state.workflow.tasks.unshift(task);
    state.workflow.selectedTaskId = task.id;
    await saveUiState(state);
    res.status(201).json({ ok: true, task: serializeWorkflowTask(task) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/workflow/tasks/:taskId/select', async (req, res) => {
  try {
    const state = getWorkflowState();
    const task = getTaskById(state, req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    state.workflow.selectedTaskId = task.id;
    await saveUiState(state);
    res.json({ ok: true, selectedTaskId: task.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/workflow/tasks/:taskId/questions', async (req, res) => {
  try {
    const state = getWorkflowState();
    const task = getTaskById(state, req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    const question = String(req.body?.question || '').trim();
    const askedBy = String(req.body?.askedBy || 'Agent').trim() || 'Agent';
    if (!question) return res.status(400).json({ error: 'Question is required.' });
    task.questions = Array.isArray(task.questions) ? task.questions : [];
    const item = { id: crypto.randomUUID(), askedBy, question, askedAt: new Date().toISOString(), answer: '', answeredAt: null };
    task.questions.push(item);
    appendWorkflowLog(task, `${askedBy} asked a question.`);
    task.updatedAt = new Date().toISOString();
    await saveUiState(state);
    res.status(201).json({ ok: true, question: item, task: serializeWorkflowTask(task) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/workflow/tasks/:taskId/reply', async (req, res) => {
  try {
    const state = getWorkflowState();
    const task = getTaskById(state, req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    const questionId = String(req.body?.questionId || '');
    const answer = String(req.body?.answer || '').trim();
    if (!questionId || !answer) return res.status(400).json({ error: 'Question id and answer are required.' });
    const question = (task.questions || []).find(item => item.id === questionId);
    if (!question) return res.status(404).json({ error: 'Question not found.' });
    question.answer = answer;
    question.answeredAt = new Date().toISOString();
    appendWorkflowLog(task, `Reply posted to question from ${question.askedBy}.`);
    task.updatedAt = new Date().toISOString();
    await saveUiState(state);
    res.json({ ok: true, task: serializeWorkflowTask(task) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, port: PORT, time: new Date().toISOString() });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`OpenClaw Agents UI listening on http://127.0.0.1:${PORT}`);
});
