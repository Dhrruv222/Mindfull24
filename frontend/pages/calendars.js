import { api } from '../services/api.js';
import { esc, tierBadge, pageTitle, lockedNotice } from '../components/ui.js';
import { openActivity } from '../components/activityModal.js';

export async function render(app, id) {
  return id ? detail(app, id) : catalogue(app);
}

async function catalogue(app) {
  const calendars = await api.get('/calendars');
  app.innerHTML = `${pageTitle('Activity calendars', 'Specialised calendars with a new activity behind every door.')}
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${calendars.map((c) => {
    const soon = c.status === 'coming_soon';
    const pct = c.total_activities ? Math.round((c.completed_activities / c.total_activities) * 100) : 0;
    return `<a href="#/calendars/${c.id}" class="block bg-white border border-sage-100 rounded-2xl p-5 hover:shadow-md transition ${soon ? 'opacity-70' : ''}">
        <div class="flex items-center justify-between mb-3">
          <div class="w-11 h-11 rounded-xl bg-sage-100 text-sage-700 flex items-center justify-center text-2xl"><i class="ph ${esc(c.icon)}"></i></div>
          <div class="flex items-center gap-2">${c.locked ? '<i class="ph-fill ph-lock-key text-amber-600"></i>' : ''}${tierBadge(c.tier_required)}</div>
        </div>
        <h3 class="font-display font-semibold text-lg text-sage-900">${esc(c.title)}</h3>
        <p class="text-xs text-gray-400 mb-2">${esc(c.category)}</p>
        <p class="text-sm text-gray-600 mb-4">${esc(c.description)}</p>
        ${soon ? '<p class="text-xs font-medium text-gray-500">Coming soon</p>'
    : `<div class="h-2 bg-sage-100 rounded-full overflow-hidden"><div class="h-full bg-sage-500" style="width:${pct}%"></div></div><p class="text-xs text-gray-500 mt-1">${c.completed_activities} / ${c.total_activities} completed</p>`}
      </a>`;
  }).join('')}</div>`;
}

async function detail(app, id) {
  const calendar = await api.get(`/calendars/${id}`);
  const header = `<a href="#/calendars" class="text-sm text-sage-700 hover:underline"><i class="ph ph-arrow-left"></i> All calendars</a>
    <div class="flex items-center gap-3 my-4"><h2 class="font-display font-bold text-2xl text-sage-900">${esc(calendar.title)}</h2>${tierBadge(calendar.tier_required)}</div>
    <p class="text-sm text-gray-600 mb-6">${esc(calendar.description)}</p>`;

  if (calendar.locked) { app.innerHTML = header + lockedNotice(); return; }
  if (calendar.status !== 'active') { app.innerHTML = `${header}<p class="text-sm text-gray-500">This calendar is not open yet.</p>`; return; }

  const doors = await api.get(`/calendars/${id}/activities`);
  const done = doors.filter((d) => d.completed).length;
  app.innerHTML = `${header}
    <p class="text-sm font-medium text-sage-800 mb-3">${done} / ${doors.length} doors completed</p>
    <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">${doors.map((d) => {
    const style = d.completed ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
      : d.locked ? 'bg-gray-100 border-gray-200 text-gray-400' : 'bg-sage-50 border-sage-200 text-sage-800 door-pattern';
    const icon = d.completed ? 'ph-fill ph-check-circle text-emerald-600' : d.locked ? 'ph-fill ph-lock-key' : `ph ${esc(d.icon)}`;
    return `<button class="door aspect-square rounded-2xl border-2 ${style} flex flex-col items-center justify-center gap-1 shadow-sm" data-id="${d.id}" title="${esc(d.title)}">
        <span class="font-display font-bold text-2xl">${d.day_number}</span><i class="${icon} text-xl"></i>
        <span class="text-[10px]">${d.locked ? 'Premium' : `${d.points} pts`}</span></button>`;
  }).join('')}</div>`;
  app.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => openActivity(b.dataset.id, () => detail(app, id))));
}
