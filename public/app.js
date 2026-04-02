const state = {
  dashboard: null,
  prompts: null,
  runtime: null,
  contextDocs: null,
  promptDrafts: {}
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

function hasUnsavedPromptChanges() {
  if (!state.prompts?.prompts) return false;
  return state.prompts.prompts.some(prompt => state.promptDrafts[prompt.agentId] !== undefined && state.promptDrafts[prompt.agentId] !== prompt.content);
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
  document.getElementById('dashboardNote').classList.toggle('hidden', !summary.note);
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
  container.innerHTML = data.prompts.map(prompt => {
    const currentValue = state.promptDrafts[prompt.agentId] ?? prompt.content;
    const dirty = currentValue !== prompt.content;
    return `
      <div class="editor-card">
        <div class="editor-header">
          <div>
            <h3>${escapeHtml(prompt.agentId)}</h3>
            <div class="small path">${escapeHtml(prompt.filePath)}</div>
            <div class="small ${dirty ? 'warning-text' : ''}">${dirty ? 'Modified in browser; not saved to template source yet.' : 'Saved to template source.'}</div>
          </div>
          <button data-save-agent="${escapeHtml(prompt.agentId)}">Save ${escapeHtml(prompt.agentId)}</button>
        </div>
        <textarea id="prompt-${escapeHtml(prompt.agentId)}">${escapeHtml(currentValue)}</textarea>
        <div id="save-status-${escapeHtml(prompt.agentId)}" class="small"></div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('textarea[id^="prompt-"]').forEach(textarea => {
    textarea.addEventListener('input', () => {
      const agentId = textarea.id.replace('prompt-', '');
      state.promptDrafts[agentId] = textarea.value;
      const prompt = state.prompts.prompts.find(item => item.agentId === agentId);
      const status = document.getElementById(`save-status-${agentId}`);
      if (status) {
        status.textContent = textarea.value === prompt.content ? '' : 'Unsaved local edits';
      }
    });
  });

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
        const prompt = state.prompts.prompts.find(item => item.agentId === agentId);
        if (prompt) prompt.content = textarea.value;
        state.promptDrafts[agentId] = textarea.value;
        status.textContent = `Saved at ${new Date(result.savedAt).toLocaleString()}`;
        renderPrompts(state.prompts);
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

function updateProjectSelects(projects, selectedProject) {
  const projectOptions = projects.length
    ? projects.map(project => `<option value="${escapeHtml(project.name)}" ${project.name === selectedProject ? 'selected' : ''}>${escapeHtml(project.name)}</option>`).join('')
    : '<option value="">No projects found</option>';

  document.getElementById('projectSelect').innerHTML = projectOptions;
  document.getElementById('copyProjectSelect').innerHTML = '<option value="">Start from blank templates</option>' + projects.map(project => `<option value="${escapeHtml(project.name)}">${escapeHtml(project.name)}</option>`).join('');
  document.getElementById('projectListMeta').textContent = projects.length
    ? `${projects.length} project${projects.length === 1 ? '' : 's'} found under ~/.openclaw/dev-context/projects/`
    : 'No project-scoped working context folders found yet.';
}

function renderRepoInitStatus(targetId, repoInit) {
  const el = document.getElementById(targetId);
  if (!repoInit) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.classList.remove('hidden');
  el.textContent = [
    `Status: ${repoInit.status}`,
    repoInit.note || '',
    repoInit.repoRoot ? `Repo root: ${repoInit.repoRoot}` : '',
    repoInit.requestPath ? `Handoff note: ${repoInit.requestPath}` : '',
    repoInit.stdout ? `stdout:\n${repoInit.stdout}` : '',
    repoInit.stderr ? `stderr:\n${repoInit.stderr}` : '',
    repoInit.manualCommand ? `Suggested Alpha handoff:\n${repoInit.manualCommand}` : ''
  ].filter(Boolean).join('\n\n');
}

function renderContextDocs(data) {
  updateProjectSelects(data.projects || [], data.selectedProject || '');
  document.getElementById('kickoffPrompt').value = data.kickoffPrompt || '';
  document.getElementById('kickoffMeta').textContent = data.selectedProject
    ? `Prompt targets project ${data.selectedProject}${data.repoInit?.hookExists ? ` · init hook available at ${data.repoInit.hookPath}` : ' · no init hook installed; fallback handoff notes will be created'}`
    : 'Select or create a project to generate a kickoff prompt.';

  const container = document.getElementById('contextDocs');
  if (!data.project) {
    container.innerHTML = '<div class="note">No project selected yet.</div>';
    return;
  }

  container.innerHTML = data.project.docs.map(doc => `
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

async function loadContextDocs(project = '') {
  setGlobalStatus('Loading context docs…');
  const query = project ? `?project=${encodeURIComponent(project)}` : '';
  state.contextDocs = await fetchJson(`/api/context-docs${query}`);
  renderContextDocs(state.contextDocs);
  setGlobalStatus('Context docs ready');
}

async function releaseToLive() {
  const status = document.getElementById('releaseStatus');
  if (hasUnsavedPromptChanges() && !window.confirm('Some prompt editors have unsaved changes in the browser. Release will only use what is already saved to disk. Continue?')) {
    return;
  }
  status.textContent = 'Running release to live and restarting OpenClaw…';
  try {
    const result = await fetchJson('/api/release', { method: 'POST' });
    status.textContent = `Release completed at ${new Date(result.ranAt).toLocaleString()}\n\nPrompt sync output:\n${result.syncStdout || '(none)'}${result.syncStderr ? `\n${result.syncStderr}` : ''}\n\nRestart output:\n${result.restartStdout || '(none)'}${result.restartStderr ? `\n${result.restartStderr}` : ''}`;
    await loadRuntime();
  } catch (error) {
    status.textContent = `Release failed: ${error.message}`;
  }
}

async function createProject() {
  const name = document.getElementById('newProjectName').value.trim();
  const copyFrom = document.getElementById('copyProjectSelect').value;
  const initRepo = document.getElementById('initRepoOnCreate').checked;
  const status = document.getElementById('createProjectStatus');
  status.classList.remove('hidden');
  status.textContent = 'Creating project…';

  try {
    const result = await fetchJson('/api/context-projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, copyFrom: copyFrom || null, initRepo })
    });
    document.getElementById('newProjectName').value = '';
    document.getElementById('initRepoOnCreate').checked = false;
    status.textContent = `Created project ${result.selectedProject}${result.copiedFrom ? ` by copying docs from ${result.copiedFrom}` : ' from blank templates'}.`;
    renderRepoInitStatus('repoInitStatus', result.repoInit);
    await loadContextDocs(result.selectedProject);
  } catch (error) {
    status.textContent = `Create failed: ${error.message}`;
  }
}

async function selectProject() {
  const project = document.getElementById('projectSelect').value;
  if (!project) return;
  await fetchJson('/api/context-projects/select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project })
  });
  await loadContextDocs(project);
}

async function generateKickoffPrompt() {
  const project = document.getElementById('projectSelect').value || state.contextDocs?.selectedProject;
  if (!project) {
    window.alert('Select or create a project first.');
    return;
  }
  const result = await fetchJson(`/api/context-projects/${encodeURIComponent(project)}/kickoff`, { method: 'POST' });
  document.getElementById('kickoffPrompt').value = result.kickoffPrompt || '';
}

async function copyKickoffPrompt() {
  const textarea = document.getElementById('kickoffPrompt');
  if (!textarea.value.trim()) {
    window.alert('Generate a kickoff prompt first.');
    return;
  }
  await navigator.clipboard.writeText(textarea.value);
  setGlobalStatus('Kickoff prompt copied to clipboard');
}

async function triggerRepoInit() {
  const project = document.getElementById('projectSelect').value || state.contextDocs?.selectedProject;
  if (!project) {
    window.alert('Select or create a project first.');
    return;
  }
  renderRepoInitStatus('repoInitStatus', { status: 'pending', note: 'Submitting Alpha repo-init handoff…' });
  const result = await fetchJson(`/api/context-projects/${encodeURIComponent(project)}/init-repo`, { method: 'POST' });
  renderRepoInitStatus('repoInitStatus', result.repoInit);
}

function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const view = btn.dataset.view;
      if (view !== 'prompts' && hasUnsavedPromptChanges()) {
        const ok = window.confirm('You have unsaved prompt edits. Leave the Prompt Editor anyway?');
        if (!ok) return;
      }
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
  document.getElementById('refreshContext').addEventListener('click', () => loadContextDocs(document.getElementById('projectSelect').value));
  document.getElementById('releaseToLive').addEventListener('click', releaseToLive);
  document.getElementById('createProjectBtn').addEventListener('click', createProject);
  document.getElementById('selectProjectBtn').addEventListener('click', selectProject);
  document.getElementById('generateKickoffBtn').addEventListener('click', generateKickoffPrompt);
  document.getElementById('copyKickoffBtn').addEventListener('click', copyKickoffPrompt);
  document.getElementById('initRepoBtn').addEventListener('click', triggerRepoInit);
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
