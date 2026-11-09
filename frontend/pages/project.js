import { api } from '../services/api.js';
import { esc, pageTitle, dateOnly } from '../components/ui.js';

const IMPL = {
  implemented: ['Implemented', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
  partial: ['Partial', 'bg-amber-50 text-amber-800 border-amber-200'],
  outstanding: ['Outstanding', 'bg-red-50 text-red-700 border-red-200'],
  process: ['Team process', 'bg-sky-50 text-sky-700 border-sky-200'],
};
const PRIORITY = { Highest: 'text-red-700', High: 'text-orange-700', Medium: 'text-amber-700', Low: 'text-gray-500' };
const TYPE_STYLE = { Epic: 'bg-violet-100 text-violet-800', Story: 'bg-emerald-100 text-emerald-800', Task: 'bg-sky-100 text-sky-800' };

const filters = { type: '', impl: '', text: '' };

function matches(item) {
  if (filters.type && item.type !== filters.type) return false;
  if (filters.impl && item.implementation.status !== filters.impl) return false;
  if (filters.text) {
    const hay = `${item.key} ${item.summary} ${item.description} ${item.labels.join(' ')} ${item.contributors.map((c) => c.name).join(' ')}`.toLowerCase();
    if (!hay.includes(filters.text.toLowerCase())) return false;
  }
  return true;
}

function itemBlock(item, byParent, depth) {
  const [implLabel, implStyle] = IMPL[item.implementation.status];
  const children = byParent.get(item.key) || [];
  const shown = children.filter((c) => matches(c) || (byParent.get(c.key) || []).some(matches));
  const dates = item.start_date ? `${dateOnly(item.start_date)} to ${dateOnly(item.due_date)}` : '';
  return `<details class="bg-white border border-sage-100 rounded-xl ${depth ? 'ml-4 sm:ml-6 mt-2' : 'mb-3'}" ${filters.text || filters.type || filters.impl ? 'open' : ''}>
    <summary class="cursor-pointer p-3 flex flex-wrap items-center gap-2">
      <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full ${TYPE_STYLE[item.type]}">${item.type}</span>
      <code class="text-xs text-gray-500">${esc(item.key)}</code>
      <span class="font-medium text-sm text-sage-900 flex-1 min-w-48">${esc(item.summary)}</span>
      <span class="text-xs font-medium ${PRIORITY[item.priority] || ''}">${esc(item.priority)}</span>
      <span class="text-[11px] px-2 py-0.5 rounded-full border ${implStyle}" title="State of the code in this repository, not Jira status">${implLabel}</span>
    </summary>
    <div class="px-4 pb-4 text-sm text-gray-700 space-y-2 border-t border-sage-50 pt-3">
      <p>${esc(item.description)}</p>
      <dl class="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600">
        <div><dt class="inline font-semibold">Jira status:</dt> <dd class="inline text-gray-400">not in export</dd></div>
        <div><dt class="inline font-semibold">Assignee:</dt> <dd class="inline ${item.assignee ? '' : 'text-gray-400'}">${esc(item.assignee || 'not in export')}</dd></div>
        ${dates ? `<div><dt class="inline font-semibold">Planned:</dt> <dd class="inline">${dates}</dd></div>` : ''}
        ${item.estimate_hours ? `<div><dt class="inline font-semibold">Estimate:</dt> <dd class="inline">${item.estimate_hours} h</dd></div>` : ''}
        ${item.parent ? `<div><dt class="inline font-semibold">Parent:</dt> <dd class="inline">${esc(item.parent)}${item.parent_source === 'inferred' ? ' <span class="text-gray-400">(inferred, not in export)</span>' : ''}</dd></div>` : ''}
        ${item.labels.length ? `<div class="sm:col-span-2"><dt class="inline font-semibold">Labels:</dt> <dd class="inline">${item.labels.map((l) => `<span class="px-1.5 py-0.5 bg-sage-50 rounded">${esc(l)}</span>`).join(' ')}</dd></div>` : ''}
        ${item.contributors.length ? `<div class="sm:col-span-2"><dt class="inline font-semibold">Contributors:</dt> <dd class="inline">${item.contributors.map((c) => `${esc(c.name)} (${esc(c.role)})`).join('; ')}</dd></div>` : ''}
      </dl>
      ${item.acceptance_criteria.length ? `<div><p class="text-xs font-semibold uppercase tracking-wide text-gray-400">Acceptance criteria</p><ol class="list-decimal ml-5 text-sm space-y-0.5">${item.acceptance_criteria.map((a) => `<li>${esc(a)}</li>`).join('')}</ol></div>` : ''}
      <div class="bg-sage-50 border border-sage-100 rounded-lg p-3 text-xs">
        <p class="font-semibold text-sage-800 mb-1">Where it lives in the app</p>
        ${item.implementation.module ? `<p><b>Module:</b> ${esc(item.implementation.module)}</p>` : ''}
        ${item.implementation.evidence ? `<p><b>Evidence:</b> ${esc(item.implementation.evidence)}</p>` : ''}
        ${item.implementation.notes ? `<p><b>Notes:</b> ${esc(item.implementation.notes)}</p>` : ''}
      </div>
      ${shown.length ? `<div>${shown.map((c) => itemBlock(c, byParent, depth + 1)).join('')}</div>` : ''}
    </div></details>`;
}

export async function render(app) {
  const data = await api.get('/project/backlog');
  const byParent = new Map();
  for (const i of data.items) {
    if (!i.parent) continue;
    if (!byParent.has(i.parent)) byParent.set(i.parent, []);
    byParent.get(i.parent).push(i);
  }
  const epics = data.items.filter((i) => i.type === 'Epic');
  const s = data.summary;
  const stat = (label, value) => `<div class="bg-white border border-sage-100 rounded-xl p-3"><p class="text-xl font-display font-bold text-sage-900">${value}</p><p class="text-xs text-gray-500">${label}</p></div>`;

  const draw = () => {
    const list = epics.filter((e) => matches(e) || (byParent.get(e.key) || []).some((c) => matches(c) || (byParent.get(c.key) || []).some(matches)));
    app.querySelector('#hub-list').innerHTML = list.length ? list.map((e) => itemBlock(e, byParent, 0)).join('') : '<p class="text-sm text-gray-500">No items match these filters.</p>';
  };

  app.innerHTML = `${pageTitle('Project hub', `${data.project.name}: planned work and how it maps to this application`)}
    <p class="text-xs text-sky-900 bg-sky-50 border border-sky-200 rounded-xl p-3 mb-4"><i class="ph-fill ph-info"></i> This hub shows a <b>static import of the Jira export</b>, not a live Jira connection. The export has no ${data.not_in_export.join(', ')}, so none are shown or invented. The implementation badge describes the code in this repository.</p>
    <div class="grid sm:grid-cols-2 gap-3 mb-4">
      <div class="bg-white border border-sage-100 rounded-xl p-4 text-sm"><p class="font-semibold text-sage-900 mb-1">Timeline</p>
        <p>Project: ${dateOnly(data.project.timeline.start)} to ${dateOnly(data.project.timeline.end)}</p>
        <p class="text-gray-500">Backlog dates in the export: ${dateOnly(data.project.backlog_window.start)} to ${dateOnly(data.project.backlog_window.end)}</p></div>
      <div class="bg-white border border-sage-100 rounded-xl p-4 text-sm"><p class="font-semibold text-sage-900 mb-1">Team</p><p>${data.team.map(esc).join(', ')}</p>
        <p class="text-gray-500">Roles per story are listed under Contributors.</p></div></div>
    <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-5">
      ${stat('Epics', s.epics)}${stat('Stories', s.stories)}${stat('Tasks', s.tasks)}${stat('Estimated hours', s.estimate_hours)}
      ${stat('Implemented', s.implementation.implemented)}${stat('Partial', s.implementation.partial)}${stat('Outstanding', s.implementation.outstanding)}${stat('Team process', s.implementation.process)}</div>
    <div class="flex flex-wrap gap-2 mb-4">
      <input id="f-text" type="search" placeholder="Search key, title, label or person" class="border rounded-lg px-3 py-2 text-sm flex-1 min-w-48" value="${esc(filters.text)}">
      <select id="f-type" class="border rounded-lg px-3 py-2 text-sm bg-white"><option value="">All types</option>${['Epic', 'Story', 'Task'].map((t) => `<option ${filters.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <select id="f-impl" class="border rounded-lg px-3 py-2 text-sm bg-white"><option value="">Any implementation state</option>${Object.entries(IMPL).map(([k, [l]]) => `<option value="${k}" ${filters.impl === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div id="hub-list"></div>
    <p class="text-xs text-gray-400 mt-4">Full matrix: documentation/REQUIREMENTS_COVERAGE.md. Source: ${esc(data.source)}.</p>`;
  draw();
  app.querySelector('#f-text').addEventListener('input', (e) => { filters.text = e.target.value.trim(); draw(); });
  app.querySelector('#f-type').addEventListener('change', (e) => { filters.type = e.target.value; draw(); });
  app.querySelector('#f-impl').addEventListener('change', (e) => { filters.impl = e.target.value; draw(); });
}
