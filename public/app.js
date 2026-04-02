const state = {
  dashboard: null,
  prompts: null,
  runtime: null,
  contextDocs: null,
  workflow: null,
  promptDrafts: {},
  workflowPollTimer: null,
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
          <button data-save-agent="${escapeHtml(prompt.agentId)}" title="Save only this agent template back to disk.">Save ${escapeHtml(prompt.agentId)}</button>
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
      if (status) status.textContent = textarea.value === prompt.content ? '' : 'Unsaved local edits';
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

function renderWorkflowStatus(task) {
  const bar = document.getElementById('workflowStatusBar');
  const worker = document.getElementById('workflowWorker');
  const meta = document.getElementById('workflowStatusMeta');
  const spinner = document.getElementById('workflowSpinner');
  if (!task) {
    bar.className = 'workflow-status idle';
    worker.textContent = 'Waiting for next task';
    meta.textContent = 'Submit or select a task to begin.';
    spinner.classList.add('hidden');
    return;
  }
  const active = ['submitted', 'awaiting-manual-handoff', 'running', 'pending', 'queued'].includes(task.status);
  bar.className = `workflow-status ${active ? 'active' : 'idle'}`;
  if (active) {
    worker.textContent = `${task.activeWorker || 'HAL'} working on ${task.project}`;
    meta.textContent = `Status: ${task.status} · Updated ${new Date(task.updatedAt || task.createdAt).toLocaleString()} · Remote updates: ${task.notifyChannel}`;
    spinner.classList.remove('hidden');
  } else {
    const completedBy = task.activeWorker || 'HAL';
    worker.textContent = 'Waiting for next task';
    meta.textContent = `Last completed by ${completedBy} · ${task.project} · ${new Date(task.updatedAt || task.createdAt).toLocaleString()}`;
    spinner.classList.add('hidden');
  }
}

function renderWorkflowTasks(data) {
  const select = document.getElementById('workflowTaskSelect');
  const projectSelect = document.getElementById('workflowProjectSelect');
  const projects = data.projects || [];
  projectSelect.innerHTML = projects.length
    ? projects.map(project => `<option value="${escapeHtml(project.name)}" ${project.name === data.selectedProject ? 'selected' : ''}>${escapeHtml(project.name)}</option>`).join('')
    : '<option value="">No projects available</option>';

  const tasks = data.tasks || [];
  select.innerHTML = tasks.length
    ? tasks.map(task => `<option value="${escapeHtml(task.id)}" ${task.id === data.selectedTaskId ? 'selected' : ''}>${escapeHtml(task.project)} · ${escapeHtml(task.status)} · ${new Date(task.createdAt).toLocaleString()}</option>`).join('')
    : '<option value="">No workflow tasks yet</option>';

  const task = data.selectedTask;
  renderWorkflowStatus(task);
  document.getElementById('workflowTaskMeta').textContent = task
    ? `${task.project} · ${task.notifyChannel} · created ${new Date(task.createdAt).toLocaleString()}`
    : 'No task selected.';

  const output = document.getElementById('workflowOutput');
  const resultPreview = task?.handoff?.resultPreview;
  let renderedResult = '';
  if (resultPreview) {
    let pretty = resultPreview;
    try {
      const parsed = JSON.parse(resultPreview);
      if (parsed?.payload?.output_text) {
        pretty = parsed.payload.output_text;
      } else if (parsed?.payload?.output) {
        pretty = JSON.stringify(parsed.payload.output, null, 2);
      } else {
        pretty = JSON.stringify(parsed, null, 2);
      }
    } catch {}
    renderedResult = `<div class="note"><strong>Completed task result</strong>\n\n${escapeHtml(pretty.slice(0, 3000))}</div>`;
  }
  output.innerHTML = task?.logs?.length
    ? `${renderedResult}${task.logs.map(line => `<div class="log-line log-${escapeHtml(line.type || 'info')}\"><span class="log-time">${new Date(line.at).toLocaleTimeString()}</span>${escapeHtml(line.message)}</div>`).join('')}`
    : (renderedResult || '<div class="small">No output yet for this task.</div>');

  const qaBody = document.getElementById('workflowQaBody');
  if (!task?.questions?.length) {
    qaBody.innerHTML = '<tr><td colspan="4" class="small">No questions yet.</td></tr>';
  } else {
    qaBody.innerHTML = task.questions.map(question => `
      <tr>
        <td>${escapeHtml(question.askedBy || 'Agent')}<div class="small">${new Date(question.askedAt).toLocaleString()}</div></td>
        <td>${escapeHtml(question.question)}</td>
        <td>
          <textarea id="reply-${escapeHtml(question.id)}" placeholder="Write your answer here...">${escapeHtml(question.answer || '')}</textarea>
        </td>
        <td>
          <button data-reply-question="${escapeHtml(question.id)}" title="Send your reply back into the workflow task log.">Post reply</button>
        </td>
      </tr>
    `).join('');
    qaBody.querySelectorAll('[data-reply-question]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const questionId = btn.getAttribute('data-reply-question');
        const answer = document.getElementById(`reply-${questionId}`).value;
        if (!state.workflow?.selectedTaskId) return;
        await fetchJson(`/api/workflow/tasks/${encodeURIComponent(state.workflow.selectedTaskId)}/reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questionId, answer })
        });
        await loadWorkflow();
      });
    });
  }
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
      <div class="editor-header">
        <div>
          <h3>${escapeHtml(doc.name)}</h3>
          <span class="small path">${escapeHtml(doc.filePath)}</span>
        </div>
        <button data-save-doc="${escapeHtml(doc.name)}" title="Save changes to this working-context document.">Update</button>
      </div>
      <textarea class="context-doc-textarea" id="context-doc-${escapeHtml(doc.name)}">${escapeHtml(doc.exists ? doc.content : '')}</textarea>
      <div id="context-doc-status-${escapeHtml(doc.name)}" class="small"></div>
    </div>
  `).join('');

  container.querySelectorAll('[data-save-doc]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const docName = btn.getAttribute('data-save-doc');
      const project = data.selectedProject;
      const textarea = document.getElementById(`context-doc-${docName}`);
      const status = document.getElementById(`context-doc-status-${docName}`);
      status.textContent = 'Saving…';
      try {
        const result = await fetchJson(`/api/context-projects/${encodeURIComponent(project)}/docs/${encodeURIComponent(docName)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: textarea.value })
        });
        status.textContent = `Updated at ${new Date(result.savedAt).toLocaleString()}`;
      } catch (error) {
        status.textContent = `Update failed: ${error.message}`;
      }
    });
  });
}

async function loadDashboard() {
  setGlobalStatus('Loading dashboard…');
  state.dashboard = await fetchJson('/api/summary');
  renderDashboard(state.dashboard);
  setGlobalStatus('Dashboard ready');
}

async function loadPrompts() {
  setGlobalStatus('Loading prompts…');
  const [prompts, contextDocs] = await Promise.all([
    fetchJson('/api/prompts'),
    fetchJson('/api/context-docs')
  ]);
  state.prompts = prompts;
  renderPrompts(state.prompts);

  const projectSelect = document.getElementById('promptProjectSelect');
  if (projectSelect) {
    projectSelect.innerHTML = (contextDocs.projects || []).length
      ? contextDocs.projects.map(project => `<option value="${escapeHtml(project.name)}" ${project.name === contextDocs.selectedProject ? 'selected' : ''}>${escapeHtml(project.name)}</option>`).join('')
      : '<option value="">No projects found</option>';
  }
  const promptKickoff = document.getElementById('promptKickoffText');
  if (promptKickoff) {
    promptKickoff.value = contextDocs.kickoffPrompt || '';
  }

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

async function loadWorkflow(taskId = '') {
  setGlobalStatus('Loading workflow…');
  const params = new URLSearchParams();
  if (taskId) params.set('taskId', taskId);
  const query = params.toString() ? `?${params.toString()}` : '';
  state.workflow = await fetchJson(`/api/workflow${query}`);
  renderWorkflowTasks(state.workflow);
  setGlobalStatus('Workflow ready');
}

async function releaseToLive() {
  const status = document.getElementById('releaseStatus');
  if (hasUnsavedPromptChanges() && !window.confirm('Some prompt editors have unsaved changes in the browser. Release will only use what is already saved to disk. Continue?')) return;
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
    await loadWorkflow();
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
  await loadWorkflow();
}

async function generateKickoffPrompt() {
  const project = document.getElementById('projectSelect').value || state.contextDocs?.selectedProject;
  if (!project) return window.alert('Select or create a project first.');
  const result = await fetchJson(`/api/context-projects/${encodeURIComponent(project)}/kickoff`, { method: 'POST' });
  document.getElementById('kickoffPrompt').value = result.kickoffPrompt || '';
}

async function copyKickoffPrompt() {
  const textarea = document.getElementById('kickoffPrompt');
  if (!textarea.value.trim()) return window.alert('Generate a kickoff prompt first.');
  await navigator.clipboard.writeText(textarea.value);
  setGlobalStatus('Kickoff prompt copied to clipboard');
}

async function generatePromptEditorKickoff() {
  const project = document.getElementById('promptProjectSelect')?.value;
  if (!project) return window.alert('Select a project first.');
  const result = await fetchJson(`/api/context-projects/${encodeURIComponent(project)}/kickoff`, { method: 'POST' });
  const textarea = document.getElementById('promptKickoffText');
  if (textarea) textarea.value = result.kickoffPrompt || '';
}

async function copyPromptEditorKickoff() {
  const textarea = document.getElementById('promptKickoffText');
  if (!textarea || !textarea.value.trim()) return window.alert('Generate a kickoff prompt first.');
  await navigator.clipboard.writeText(textarea.value);
  setGlobalStatus('Prompt Editor kickoff prompt copied to clipboard');
}

async function savePromptEditorKickoff() {
  const project = document.getElementById('promptProjectSelect')?.value;
  const textarea = document.getElementById('promptKickoffText');
  const status = document.getElementById('promptKickoffStatus');
  if (!project) return window.alert('Select a project first.');
  if (!textarea) return;
  status.textContent = 'Saving kickoff prompt…';
  try {
    const result = await fetchJson(`/api/context-projects/${encodeURIComponent(project)}/docs/dev-workflow.md`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: textarea.value })
    });
    status.textContent = `Kickoff prompt saved at ${new Date(result.savedAt).toLocaleString()}`;
  } catch (error) {
    status.textContent = `Save failed: ${error.message}`;
    window.alert(`Kickoff prompt save failed: ${error.message}`);
  }
}

async function triggerRepoInit() {
  const project = document.getElementById('projectSelect').value || state.contextDocs?.selectedProject;
  if (!project) return window.alert('Select or create a project first.');
  renderRepoInitStatus('repoInitStatus', { status: 'pending', note: 'Submitting Alpha repo-init handoff…' });
  const result = await fetchJson(`/api/context-projects/${encodeURIComponent(project)}/init-repo`, { method: 'POST' });
  renderRepoInitStatus('repoInitStatus', result.repoInit);
}

async function submitWorkflowTask() {
  const project = document.getElementById('workflowProjectSelect').value;
  const request = document.getElementById('workflowRequest').value.trim();
  const notifyChannel = document.querySelector('input[name="workflowNotify"]:checked')?.value || 'none';
  const status = document.getElementById('workflowSubmitStatus');
  const clickedAt = new Date().toLocaleTimeString();
  const payload = { project, request, notifyChannel };
  status.classList.remove('hidden');
  status.textContent = `Button clicked at ${clickedAt}`;

  if (!project) {
    status.textContent = `Button clicked at ${clickedAt}

Submit failed: no project selected.`;
    window.alert('Workflow submit failed: no project selected.');
    return;
  }
  if (!request) {
    status.textContent = `Button clicked at ${clickedAt}

Submit failed: request text is empty.`;
    window.alert('Workflow submit failed: request text is empty.');
    return;
  }

  status.textContent = `Button clicked at ${clickedAt}

Submitting task…

Payload:
${JSON.stringify(payload, null, 2)}`;
  try {
    const result = await fetchJson('/api/workflow/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    document.getElementById('workflowRequest').value = '';
    status.textContent = `Button clicked at ${clickedAt}

Task submitted for ${result.task.project}. Current worker: ${result.task.activeWorker}.

Task id: ${result.task.id}`;
    await loadWorkflow(result.task.id);
    await loadWorkflow(result.task.id);
  } catch (error) {
    status.textContent = `Button clicked at ${clickedAt}

Submit failed: ${error.message}

Payload:
${JSON.stringify(payload, null, 2)}`;
    window.alert(`Workflow submit failed: ${error.message}`);
  }
}

async function selectWorkflowTask() {
  const taskId = document.getElementById('workflowTaskSelect').value;
  if (!taskId) return;
  await fetchJson(`/api/workflow/tasks/${encodeURIComponent(taskId)}/select`, { method: 'POST' });
  await loadWorkflow(taskId);
}

function setWorkflowPolling(enabled) {
  if (state.workflowPollTimer) {
    clearInterval(state.workflowPollTimer);
    state.workflowPollTimer = null;
  }
  if (enabled) {
    state.workflowPollTimer = setInterval(() => {
      if (document.getElementById('view-workflow').classList.contains('active')) {
        loadWorkflow(state.workflow?.selectedTaskId).catch(() => {});
      }
    }, 5000);
  }
}

async function openView(view) {
  if (view !== 'prompts' && hasUnsavedPromptChanges()) {
    const ok = window.confirm('You have unsaved prompt edits. Leave the Prompt Editor anyway?');
    if (!ok) return;
  }
  switchView(view);
  setWorkflowPolling(view === 'workflow');
  if (view === 'home') setGlobalStatus('Landing page ready');
  if (view === 'dashboard') await loadDashboard();
  if (view === 'workflow') await loadWorkflow(state.workflow?.selectedTaskId || '');
  if (view === 'prompts') await loadPrompts();
  if (view === 'runtime') await loadRuntime();
  if (view === 'context') await loadContextDocs();
}

function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await openView(btn.dataset.view);
    });
  });
}

function setupActions() {
  document.getElementById('refreshDashboard').addEventListener('click', loadDashboard);
  document.getElementById('refreshWorkflow').addEventListener('click', () => loadWorkflow(state.workflow?.selectedTaskId || ''));
  document.getElementById('refreshPrompts').addEventListener('click', loadPrompts);
  document.getElementById('refreshRuntime').addEventListener('click', loadRuntime);
  document.getElementById('refreshContext').addEventListener('click', () => loadContextDocs(document.getElementById('projectSelect').value));
  document.getElementById('releaseToLive').addEventListener('click', releaseToLive);
  document.getElementById('createProjectBtn').addEventListener('click', createProject);
  document.getElementById('selectProjectBtn').addEventListener('click', selectProject);
  document.getElementById('generateKickoffBtn').addEventListener('click', generateKickoffPrompt);
  document.getElementById('copyKickoffBtn').addEventListener('click', copyKickoffPrompt);
  document.getElementById('initRepoBtn').addEventListener('click', triggerRepoInit);
  document.getElementById('generatePromptKickoffBtn').addEventListener('click', generatePromptEditorKickoff);
  document.getElementById('copyPromptKickoffBtn').addEventListener('click', copyPromptEditorKickoff);
  document.getElementById('submitWorkflowTask').addEventListener('click', submitWorkflowTask);
  document.getElementById('selectWorkflowTask').addEventListener('click', selectWorkflowTask);
  document.getElementById('homeToWorkflow').addEventListener('click', () => openView('workflow'));
  document.getElementById('homeToContext').addEventListener('click', () => openView('context'));
  document.getElementById('homeToPrompts').addEventListener('click', () => openView('prompts'));
  document.getElementById('homeToRuntime').addEventListener('click', () => openView('runtime'));
}

async function main() {
  setupNav();
  setupActions();
  switchView('home');
  setGlobalStatus('Landing page ready');
}

window.submitWorkflowTask = submitWorkflowTask;

main().catch(error => {
  setGlobalStatus(`Startup failed: ${error.message}`);
});
ch(error => {
  setGlobalStatus(`Startup failed: ${error.message}`);
});
