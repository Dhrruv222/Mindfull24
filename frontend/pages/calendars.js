import { api } from '../services/api.js';
import { esc, tierBadge, pageTitle, lockedNotice, calendarTheme, dateOnly, openModal, toast } from '../components/ui.js';
import { openActivity } from '../components/activityModal.js';

export async function render(app, id) {
  return id ? detail(app, id) : catalogue(app);
}

async function catalogue(app) {
  const calendars = await api.get('/calendars');
  app.innerHTML = `${pageTitle('Activity calendars', 'Each calendar has 24 doors. A new door opens every day, so there is always something to look forward to.')}
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${calendars.map((c) => {
    const soon = c.status === 'coming_soon';
    const theme = calendarTheme(c.category);
    const pct = c.total_activities ? Math.round((c.completed_activities / c.total_activities) * 100) : 0;
    return `<a href="#/calendars/${c.id}" class="block bg-gradient-to-b ${theme.head} border rounded-2xl p-5 hover:shadow-md transition ${soon ? 'opacity-70' : ''}">
        <div class="flex items-center justify-between mb-3">
          <div class="w-11 h-11 rounded-xl ${theme.tile} flex items-center justify-center text-2xl"><i class="ph ${esc(c.icon)}"></i></div>
          <div class="flex items-center gap-2">${c.locked ? '<i class="ph-fill ph-lock-key text-amber-600"></i>' : ''}${tierBadge(c.tier_required)}</div>
        </div>
        <h3 class="font-display font-semibold text-lg text-sage-900">${esc(c.title)}</h3>
        <p class="text-xs text-gray-400 mb-2">${esc(c.category)}</p>
        <p class="text-sm text-gray-600 mb-4">${esc(c.description)}</p>
        ${soon ? '<p class="text-xs font-medium text-gray-500">Coming soon</p>'
    : `<div class="h-2 bg-white/70 rounded-full overflow-hidden border border-black/5"><div class="h-full ${theme.bar}" style="width:${pct}%"></div></div>
        <p class="text-xs text-gray-500 mt-1">${c.completed_activities} / ${c.total_activities} completed &bull; ${c.unlocked_doors} doors open${c.joined ? ' &bull; <span class="text-emerald-700 font-medium">Started</span>' : ''}</p>`}
      </a>`;
  }).join('')}</div>`;
}

function sealedModal(d) {
  openModal(`<div class="text-center py-2">
      <div class="w-16 h-16 mx-auto rounded-2xl bg-gray-100 text-gray-500 flex items-center justify-center text-3xl"><i class="ph-fill ph-lock-simple"></i></div>
      <h3 class="font-display font-bold text-xl text-sage-900 mt-3">Door ${d.day_number} is still sealed</h3>
      <p class="text-sm text-gray-600 mt-1">It opens on <b>${dateOnly(d.unlock_date)}</b>. Come back then to discover what is inside.</p>
      <button data-close class="mt-5 px-4 py-2 rounded-lg border text-sm">Close</button></div>`);
}

function doorButton(d, theme) {
  const base = 'door aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-1 shadow-sm relative overflow-hidden';
  let style; let icon; let caption;
  switch (d.state) {
    case 'completed': style = 'bg-emerald-50 border-emerald-300 text-emerald-800'; icon = 'ph-fill ph-check-circle text-emerald-600'; caption = `+${d.points_awarded} pts`; break;
    case 'premium_locked': style = 'bg-amber-50 border-amber-200 text-amber-700'; icon = 'ph-fill ph-crown-simple'; caption = 'Premium'; break;
    case 'scheduled': style = 'bg-gray-100 border-gray-200 text-gray-400 door-sealed'; icon = 'ph-fill ph-lock-simple'; caption = new Date(`${d.unlock_date}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' }); break;
    case 'opened': style = `${theme.door} border-dashed`; icon = 'ph ph-door-open'; caption = `${d.points} pts`; break;
    default: style = `${theme.door} door-pattern ring-2 ring-offset-1 ring-amber-300/70`; icon = `ph ${esc(d.icon)}`; caption = 'Open me';
  }
  const label = d.state === 'scheduled' ? `Door ${d.day_number}, opens ${d.unlock_date}` : `Door ${d.day_number}: ${d.title}`;
  return `<div class="door-scene"><button class="${base} ${style} w-full" data-id="${d.id}" data-state="${d.state}" aria-label="${esc(label)}" title="${esc(label)}">
      <span class="font-display font-bold text-2xl">${d.day_number}</span><i class="${icon} text-xl"></i><span class="text-[10px]">${esc(caption)}</span></button></div>`;
}

async function detail(app, id) {
  const calendar = await api.get(`/calendars/${id}`);
  const theme = calendarTheme(calendar.category);
  const header = `<a href="#/calendars" class="text-sm text-sage-700 hover:underline"><i class="ph ph-arrow-left"></i> All calendars</a>
    <div class="flex items-center gap-3 my-4"><div class="w-11 h-11 rounded-xl ${theme.tile} flex items-center justify-center text-2xl"><i class="ph ${esc(calendar.icon)}"></i></div>
      <h2 class="font-display font-bold text-2xl text-sage-900">${esc(calendar.title)}</h2>${tierBadge(calendar.tier_required)}</div>
    <p class="text-sm text-gray-600 mb-6">${esc(calendar.description)}</p>`;

  if (calendar.locked) { app.innerHTML = header + lockedNotice(); return; }
  if (calendar.status !== 'active') { app.innerHTML = `${header}<p class="text-sm text-gray-500">This calendar is not open yet.</p>`; return; }

  const doors = await api.get(`/calendars/${id}/activities`);
  const done = doors.filter((d) => d.completed).length;
  const next = calendar.next_unlock_date
    ? `Door ${calendar.next_unlock_day} opens on ${dateOnly(calendar.next_unlock_date)}`
    : 'Every door is open';
  app.innerHTML = `${header}
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4 bg-gradient-to-r ${theme.head} border rounded-xl p-4">
      <div><p class="text-sm font-medium text-sage-800">${calendar.unlocked_doors} of ${doors.length} doors open &bull; ${calendar.opened_activities} discovered &bull; ${done} completed</p>
        <p class="text-xs text-gray-500 mt-0.5"><i class="ph ph-hourglass-medium"></i> ${next}. Started ${dateOnly(calendar.start_date)}.</p></div>
      ${calendar.joined ? '<span class="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1"><i class="ph-fill ph-check-circle"></i> Calendar started</span>'
    : '<button id="join-btn" class="text-sm px-4 py-2 rounded-lg text-white bg-sage-600 hover:bg-sage-700">Start this calendar</button>'}
    </div>
    <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">${doors.map((d) => doorButton(d, theme)).join('')}</div>
    <div class="flex flex-wrap gap-3 text-xs text-gray-500 mt-5">
      <span><i class="ph-fill ph-lock-simple"></i> Sealed until its date</span><span><i class="ph ph-sparkle"></i> Open me</span>
      <span><i class="ph ph-door-open"></i> Discovered</span><span class="text-emerald-700"><i class="ph-fill ph-check-circle"></i> Completed</span>
      <span class="text-amber-700"><i class="ph-fill ph-crown-simple"></i> Premium</span></div>`;

  const join = app.querySelector('#join-btn');
  if (join) join.addEventListener('click', async () => {
    join.disabled = true;
    try { await api.post(`/calendars/${id}/join`); toast('Calendar started. Enjoy the doors!', 'success'); await detail(app, id); } catch (err) { toast(err.message, 'error'); join.disabled = false; }
  });
  const byId = new Map(doors.map((d) => [String(d.id), d]));
  app.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => {
    const d = byId.get(b.dataset.id);
    if (d.state === 'scheduled') { sealedModal(d); return; }
    const refresh = () => detail(app, id);
    if (d.state === 'available') {
      b.classList.add('opening');
      setTimeout(() => openActivity(d.id, refresh), 380);
    } else openActivity(d.id, refresh);
  }));
}
