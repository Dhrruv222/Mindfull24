import { api } from '../services/api.js';
import { loadUser } from '../services/store.js';
import { esc, toast, pageTitle, formatDate } from '../components/ui.js';
import { openActivity } from '../components/activityModal.js';

let timer;
let shown = false;

export async function render(app) {
  clearInterval(timer);
  shown = false;
  const s = await api.get('/randomizer/status');
  app.innerHTML = `${pageTitle('Randomizer', 'Draw a surprise activity. A cooldown applies between draws and is enforced by the server.')}
    <div class="max-w-xl bg-white border border-sage-100 rounded-2xl p-6 text-center">
      <i class="ph-fill ph-dice-five text-5xl text-sage-500"></i>
      <p class="text-sm text-gray-500 mt-2">${s.pool_size} activities in your pool &bull; cooldown ${s.cooldown_minutes} min</p>
      <div class="grid grid-cols-2 gap-3 mt-4 text-left">
        <label class="block text-xs text-gray-500">Category<select id="f-category" class="mt-1 w-full border rounded-lg px-2 py-2 text-sm text-gray-800 bg-white"><option value="">Any category</option>${s.filters.categories.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></label>
        <label class="block text-xs text-gray-500">Time available<select id="f-minutes" class="mt-1 w-full border rounded-lg px-2 py-2 text-sm text-gray-800 bg-white"><option value="">Any duration</option>${s.filters.max_minutes.map((m) => `<option value="${m}">Up to ${m} min</option>`).join('')}</select></label>
      </div>
      <button id="draw-btn" class="mt-5 px-6 py-3 rounded-xl font-medium text-white bg-sage-600 hover:bg-sage-700 disabled:bg-gray-300 disabled:cursor-not-allowed">Draw an activity</button>
      <p id="cooldown" class="text-sm text-amber-700 mt-3 min-h-5"></p>
      <div id="result" class="mt-4 text-left"></div>
    </div>`;
  const btn = app.querySelector('#draw-btn');
  const cooldown = app.querySelector('#cooldown');
  const result = app.querySelector('#result');

  const startCountdown = (until) => {
    clearInterval(timer);
    const tick = () => {
      // Stop once the page has been shown and then navigated away from.
      if (app.isConnected) shown = true;
      else if (shown) { clearInterval(timer); return; }
      const left = Math.ceil((new Date(until) - Date.now()) / 1000);
      if (left <= 0) { clearInterval(timer); btn.disabled = false; cooldown.textContent = ''; return; }
      btn.disabled = true;
      cooldown.textContent = `Next draw available in ${Math.floor(left / 60)}m ${String(left % 60).padStart(2, '0')}s (${formatDate(until)})`;
    };
    tick();
    timer = setInterval(tick, 1000);
  };
  if (!s.can_draw) startCountdown(s.next_available_at);

  const showActivity = (a) => {
    result.innerHTML = `<div class="border border-sage-200 rounded-xl p-4 bg-sage-50">
      <p class="text-xs text-gray-500">${esc(a.calendar_title)} &bull; ${a.points} points</p>
      <p class="font-display font-semibold text-lg text-sage-900">${esc(a.title)}</p>
      <p class="text-sm text-gray-700 mt-1">${esc(a.description)}</p>
      <button id="open-btn" class="mt-3 text-sm px-4 py-2 rounded-lg bg-sage-600 text-white hover:bg-sage-700">View instructions</button></div>`;
    result.querySelector('#open-btn').addEventListener('click', () => openActivity(a.id, () => loadUser()));
  };
  if (s.last_draw && !s.can_draw) {
    try { showActivity(await api.get(`/activities/${s.last_draw.activity_id}`)); } catch { /* ignore */ }
  }

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const res = await api.post('/randomizer/draw', { category: app.querySelector('#f-category').value || undefined, max_minutes: Number(app.querySelector('#f-minutes').value) || undefined });
      showActivity(res.activity);
      startCountdown(res.draw.cooldown_until);
    } catch (err) {
      toast(err.message, 'error');
      if (err.details.next_available_at) startCountdown(err.details.next_available_at);
      else btn.disabled = false;
    }
  });
}
