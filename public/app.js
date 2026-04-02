const state = {
  dashboard: null,
  prompts: null,
  runtime: null,
  contextDocs: null,
};

function setGlobalStatus(text) {
  document.getElementById('globalStatus').textContent = text;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function badgeClass(status) {
  return status === 'Actual' ? 'actual' : status === 'Estimated' ? 'estimated' : 'unavailable';
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function switchView(view) {
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === `view-${view}`));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.toggle('active', el.dataset.view === view));
}

function renderDashboard(data) {
  const summary = data.summary;
  document.getElementById('dashboardSummary').innerHTML = `
    <div class="card"><h3>Tracked agents</h3><div>${summary.trackedAgents}</div></div>
    <div class="card"><h3>Actual</h3><div>${summary.actualAgents}</div></div>
    <div class="card"><h3>Estimated</h3><div>${summary.estimatedAgents}</div></div>
    <div class="card"><h3>Unavailable</h3><div>${summary.unavailableAgents}</div></div>
    <div class="card"><h3>Last refresh</h3><div>${new Date(summary.lastRefresh).toLocaleString()}</div></div>
  `;
  document.getElementById('dashboardNote').textContent = summary.note || '';
  document.getElementById('agentCards').innerHTML = data.agents.map((agent, index) => `
    <details class="agent-details agent-section" ${index === 0 ? 'open' : ''}>
      <summary>
        <div class="agent-title">
          <strong>${escapeHtml(agent.id)}</strong>
          <span class="small">Model: ${escapeHtml(agent.model)} · Updated ${new Date(agent.lastRefresh).toLocaleString()}</span>
        </div>
        <span class="agent-chevron">›</span>
      </summary>
      <div class="agent-content">
        <div class="metric-grid">
          ${['day', 'week', 'month'].map(period => {
            const m = agent.metrics[period];
            return `
              <div class="metric-card">
                <h4>${period === 'day' ? 'Last day' : period === 'week' ? 'Week total' : 'Month total'}</h4>
                <div class="metric-line"><span class="badge ${badgeClass(m.status)}">${escapeHtml(m.status)}</span></div>
                <div class="metric-line"><strong>Usage:</strong> ${m.usage ?? 'Unavailable'}</div>
                <div class="metric-line"><strong>Cost:</strong> ${m.cost ?? 'Unavailable'}</div>
                <div class="small">${escapeHtml(m.basis)}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </details>
  `).join('');
}

function renderPrompts(data) {
  const container = document.getElementById('promptEditors');
  container.innerHTML = data.prompts.map(prompt => `
    <div class="editor-card">
      <div class="editor-header">
        <div>
          <h3>${escapeHtml(prompt.agentId)}</h3>
          <div class="small path">${escapeHtml(prompt.filePath)}</div>
        </div>
        <button data-save-agent="${escapeHtml(prompt.agentId)}">Save ${escapeHtml(prompt.agentId)}</button>
      </div>
      <textarea id="prompt-${escapeHtml(prompt.agentId)}">${escapeHtml(prompt.content)}</textarea>
      <div id="save-status-${escapeHtml(prompt.agentId)}" class="small"></div>
    </div>
  `).join('');

  container.querySelectorAll('[data-save-agent]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const agentId = btn.getAttribute('data-save-agent');
      const textarea = document.getElementById(`prompt-${agentId}`);
      const status = document.getElementById(`save-status-${agentId}`);
      status.textContent = 'Saving…';
      try {
        const result = await fetchJson(`/api/prompts/${agentId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: textarea.value })
        });
        status.textContent = `Saved at ${new Date(result.savedAt).toLocaleString()}`;
      } catch (error) {
        status.textContent = `Save failed: ${error.message}`;
      }
    });
  });
}

function renderRuntime(data) {
  document.getElementById('runtimeFacts').innerHTML = data.agents.map(agent => `
    <div class="card">
      <h3>${escapeHtml(agent.id)}</h3>
      <div class="metric-line"><strong>Model:</strong> ${escapeHtml(agent.model)}</div>
      <div class="metric-line"><strong>Workspace:</strong> <span class="path">${escapeHtml(agent.workspace)}</span></div>
      <div class="metric-line"><strong>Agent dir:</strong> <span class="path">${escapeHtml(agent.agentDir || 'n/a')}</span></div>
      <div class="metric-line"><strong>Template:</strong> <span class="path">${escapeHtml(agent.promptTemplatePath)}</span></div>
      <div class="metric-line"><strong>Live prompt:</strong> <span class="path">${escapeHtml(agent.livePromptPath)}</span></div>
    </div>
  `).join('');
  document.getElementById('statusText').textContent = data.statusText || 'No status available';
}

function renderContextDocs(data) {
  const container = document.getElementById('contextDocs');
  container.innerHTML = data.docs.map(doc => `
    <div class="doc-card">
      <h3>${escapeHtml(doc.name)}</h3>
      <span class="small path">${escapeHtml(doc.filePath)}</span>
      <pre>${escapeHtml(doc.exists ? doc.content : 'File not found')}</pre>
    </div>
  `).join('');
}

async function loadDashboard() {
  setGlobalStatus('Loading dashboard…');
  state.dashboard = await fetchJson('/api/summary');
  renderDashboard(state.dashboard);
  setGlobalStatus('Dashboard ready');
}

async function loadPrompts() {
  setGlobalStatus('Loading prompts…');
  state.prompts = await fetchJson('/api/prompts');
  renderPrompts(state.prompts);
  setGlobalStatus('Prompt editor ready');
}

async function loadRuntime() {
  setGlobalStatus('Loading runtime…');
  state.runtime = await fetchJson('/api/runtime');
  renderRuntime(state.runtime);
  setGlobalStatus('Runtime ready');
}

async function loadContextDocs() {
  setGlobalStatus('Loading context docs…');
  state.contextDocs = await fetchJson('/api/context-docs');
  renderContextDocs(state.contextDocs);
  setGlobalStatus('Context docs ready');
}

async function releaseToLive() {
  const status = document.getElementById('releaseStatus');
  status.textContent = 'Running release to live and restarting OpenClaw…';
  try {
    const result = await fetchJson('/api/release', { method: 'POST' });
    status.textContent = `Release completed at ${new Date(result.ranAt).toLocaleString()}\n\nPrompt sync output:\n${result.syncStdout || '(none)'}${result.syncStderr ? `\n${result.syncStderr}` : ''}\n\nRestart output:\n${result.restartStdout || '(none)'}${result.restartStderr ? `\n${result.restartStderr}` : ''}`;
    await loadRuntime();
  } catch (error) {
    status.textContent = `Release failed: ${error.message}`;
  }
}

function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const view = btn.dataset.view;
      switchView(view);
      if (view === 'dashboard') await loadDashboard();
      if (view === 'prompts') await loadPrompts();
      if (view === 'runtime') await loadRuntime();
      if (view === 'context') await loadContextDocs();
    });
  });
}

function setupActions() {
  document.getElementById('refreshDashboard').addEventListener('click', loadDashboard);
  document.getElementById('refreshPrompts').addEventListener('click', loadPrompts);
  document.getElementById('refreshRuntime').addEventListener('click', loadRuntime);
  document.getElementById('refreshContext').addEventListener('click', loadContextDocs);
  document.getElementById('releaseToLive').addEventListener('click', releaseToLive);
}

async function main() {
  setupNav();
  setupActions();
  switchView('dashboard');
  await loadDashboard();
}

main().catch(error => {
  setGlobalStatus(`Startup failed: ${error.message}`);
});
