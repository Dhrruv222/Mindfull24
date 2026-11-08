import { api } from '../services/api.js';
import { esc, toast, tierBadge, pageTitle, formatDate, openModal } from '../components/ui.js';

const STATUS_STYLE = {
  open: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  full: 'bg-amber-50 text-amber-800 border-amber-200',
  closed: 'bg-gray-100 text-gray-500 border-gray-200',
};

export async function render(app) {
  const [sessions, mine] = await Promise.all([api.get('/sessions'), api.get('/sessions/my-sessions')]);
  const mineIds = new Set(mine.map((s) => s.id));
  app.innerHTML = `
    <div class="flex flex-wrap items-start justify-between gap-3">
      ${pageTitle('Group activity sessions', 'Do activities together. Capacity and membership rules are enforced by the server.')}
      <button id="create-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-white bg-sage-600 hover:bg-sage-700"><i class="ph ph-plus"></i> Create session</button>
    </div>
    <div class="grid md:grid-cols-2 gap-4 mb-8">${sessions.map((s) => card(s, mineIds.has(s.id))).join('') || '<p class="text-sm text-gray-500">No upcoming sessions. Create the first one!</p>'}</div>
    <h3 class="font-display font-semibold text-lg text-sage-900 mb-3">My sessions</h3>
    ${mine.length ? `<ul class="bg-white border border-sage-100 rounded-xl divide-y divide-sage-100">${mine.map((s) => `
      <li class="p-3 text-sm flex justify-between"><span><span class="font-medium">${esc(s.title)}</span> <span class="text-gray-400">&bull; ${formatDate(s.session_date)}</span></span><button data-details="${s.id}" class="text-sage-700 underline">Details</button></li>`).join('')}</ul>`
    : '<p class="text-sm text-gray-500 bg-white border border-sage-100 rounded-xl p-4">You have not joined any sessions yet.</p>'}`;

  app.querySelectorAll('[data-join]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await api.post(`/sessions/${b.dataset.join}/join`);
      toast('You joined the session', 'success');
    } catch (err) { toast(err.message, 'error'); }
    render(app);
  }));
  app.querySelectorAll('[data-details]').forEach((b) => b.addEventListener('click', () => showDetails(b.dataset.details, app)));
  app.querySelector('#create-btn').addEventListener('click', () => createForm(app));
}

function card(s, joined) {
  const canJoin = s.status === 'open' && !joined && !s.activity_locked;
  return `<div class="bg-white border border-sage-100 rounded-2xl p-5">
    <div class="flex justify-between items-start gap-2 mb-1"><h3 class="font-display font-semibold text-lg text-sage-900">${esc(s.title)}</h3>
      <span class="text-xs px-2 py-0.5 rounded-full border ${STATUS_STYLE[s.status]}">${s.status}</span></div>
    <p class="text-xs text-gray-500 mb-2">Host: ${esc(s.host.name)} &bull; ${formatDate(s.session_date)}</p>
    <p class="text-sm text-gray-600 mb-3">${esc(s.description)}</p>
    <p class="text-sm mb-1"><i class="ph ph-target"></i> ${esc(s.activity.title)} ${tierBadge(s.activity.tier_required)}</p>
    <p class="text-sm text-gray-600 mb-4"><i class="ph ph-users"></i> ${s.member_count} / ${s.capacity} joined</p>
    <div class="flex gap-2">
      <button data-details="${s.id}" class="text-sm px-3 py-1.5 rounded-lg border">Details</button>
      ${joined ? '<span class="text-sm px-3 py-1.5 text-emerald-700">Joined &#10003;</span>'
    : `<button data-join="${s.id}" ${canJoin ? '' : 'disabled'} class="text-sm px-3 py-1.5 rounded-lg text-white bg-sage-600 hover:bg-sage-700 disabled:bg-gray-300 disabled:cursor-not-allowed">${s.activity_locked ? 'Premium only' : s.status === 'open' ? 'Join' : s.status === 'full' ? 'Full' : 'Closed'}</button>`}
    </div></div>`;
}

async function showDetails(id, app) {
  const s = await api.get(`/sessions/${id}`);
  openModal(`<div class="flex justify-between mb-3"><h3 class="font-display font-bold text-xl text-sage-900">${esc(s.title)}</h3><button data-close aria-label="Close"><i class="ph ph-x text-xl"></i></button></div>
    <p class="text-sm text-gray-600 mb-3">${esc(s.description) || 'No description.'}</p>
    <p class="text-sm mb-1"><b>Activity:</b> ${esc(s.activity.title)}</p>
    <p class="text-sm mb-1"><b>When:</b> ${formatDate(s.session_date)}</p>
    <p class="text-sm mb-3"><b>Host:</b> ${esc(s.host.name)} &bull; <b>Status:</b> ${s.status} (${s.member_count}/${s.capacity})</p>
    <h4 class="text-xs font-semibold uppercase text-gray-400 mb-1">Participants</h4>
    <ul class="text-sm space-y-1 mb-4">${s.participants.map((p) => `<li><i class="ph ph-user"></i> ${esc(p.name)}</li>`).join('')}</ul>
    ${s.is_host && s.status !== 'closed' ? '<button id="close-session" class="text-sm px-3 py-1.5 rounded-lg border border-red-200 text-red-700">Close session</button>' : ''}`, {
    onMount: (root, close) => {
      const btn = root.querySelector('#close-session');
      if (btn) btn.addEventListener('click', async () => {
        await api.post(`/sessions/${id}/close`);
        toast('Session closed', 'success');
        close();
        render(app);
      });
    },
  });
}

async function createForm(app) {
  const calendars = (await api.get('/calendars')).filter((c) => !c.locked && c.status === 'active');
  const options = [];
  for (const c of calendars) {
    const doors = await api.get(`/calendars/${c.id}/activities`);
    options.push(`<optgroup label="${esc(c.title)}">${doors.filter((d) => !d.locked).map((d) => `<option value="${d.id}">Day ${d.day_number}: ${esc(d.title)}</option>`).join('')}</optgroup>`);
  }
  const soon = new Date(Date.now() + 24 * 3600 * 1000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  openModal(`<div class="flex justify-between mb-3"><h3 class="font-display font-bold text-xl text-sage-900">Create a session</h3><button data-close aria-label="Close"><i class="ph ph-x text-xl"></i></button></div>
    <form id="session-form" class="space-y-3">
      <label class="block text-sm">Title<input name="title" required minlength="3" maxlength="120" class="mt-1 w-full border rounded-lg px-3 py-2"></label>
      <label class="block text-sm">Description<textarea name="description" maxlength="1000" rows="2" class="mt-1 w-full border rounded-lg px-3 py-2"></textarea></label>
      <label class="block text-sm">Activity<select name="activity_id" class="mt-1 w-full border rounded-lg px-3 py-2">${options.join('')}</select></label>
      <div class="grid grid-cols-2 gap-3">
        <label class="block text-sm">Date &amp; time<input name="session_date" type="datetime-local" required value="${soon}" class="mt-1 w-full border rounded-lg px-3 py-2"></label>
        <label class="block text-sm">Capacity<input name="capacity" type="number" min="2" max="50" required value="6" class="mt-1 w-full border rounded-lg px-3 py-2"></label>
      </div>
      <button class="w-full py-2.5 rounded-xl font-medium text-white bg-sage-600 hover:bg-sage-700">Create session</button>
    </form>`, {
    onMount: (root, close) => root.querySelector('#session-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      try {
        await api.post('/sessions', { ...f, activity_id: Number(f.activity_id), capacity: Number(f.capacity), session_date: new Date(f.session_date).toISOString() });
        toast('Session created', 'success');
        close();
        render(app);
      } catch (err) { toast(err.message, 'error'); }
    }),
  });
}
