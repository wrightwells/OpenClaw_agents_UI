const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const os = require('os');
const util = require('util');

const execFileAsync = util.promisify(execFile);
const app = express();
const PORT = process.env.PORT || 4321;

const HOME = os.homedir();
const OPENCLAW_CONFIG = path.join(HOME, '.openclaw', 'openclaw.json');
const TEAM_ROOT = path.join(HOME, '.openclaw', 'workspace', 'OpenClaw_Team');
const TEMPLATE_DIR = path.join(TEAM_ROOT, 'agent-templates');
const SYNC_SCRIPT = path.join(TEAM_ROOT, 'scripts', 'sync-agent-prompts.sh');
const UI_STATE_PATH = path.join(__dirname, 'data', 'ui-state.json');
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

function getConfig() {
  return readJsonSafe(OPENCLAW_CONFIG, {});
}

function getUiState() {
  return readJsonSafe(UI_STATE_PATH, {
    usageOverrides: {},
    releaseHistory: [],
    notes: {}
  });
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

function buildMetricSet(agentId, override, label) {
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

async function readPrompt(agentId) {
  const filePath = path.join(TEMPLATE_DIR, `${agentId}.md`);
  const content = await fsp.readFile(filePath, 'utf8');
  return { agentId, filePath, content };
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
  if (!AGENT_ORDER.includes(agentId)) {
    return res.status(400).json({ error: 'Unknown agent id' });
  }
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'Content must be a string' });
  }
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
    const { stdout, stderr } = await execFileAsync('bash', [SYNC_SCRIPT], { cwd: TEAM_ROOT, env: process.env, maxBuffer: 1024 * 1024 });
    const state = getUiState();
    state.releaseHistory = state.releaseHistory || [];
    state.releaseHistory.unshift({ at: new Date().toISOString(), stdout, stderr });
    state.releaseHistory = state.releaseHistory.slice(0, 10);
    await saveUiState(state);
    res.json({ ok: true, ranAt: new Date().toISOString(), stdout, stderr });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      stdout: error.stdout || '',
      stderr: error.stderr || ''
    });
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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, port: PORT, time: new Date().toISOString() });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`OpenClaw_agents_UI listening on http://127.0.0.1:${PORT}`);
});
