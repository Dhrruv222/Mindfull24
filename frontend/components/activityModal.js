import { api } from '../services/api.js';
import { esc, openModal, toast, tierBadge, lockedNotice } from './ui.js';
import { loadUser } from '../services/store.js';

// Opens the details of one activity. `onChange` runs after points were earned.
export async function openActivity(id, onChange = () => {}) {
  let a;
  try {
    a = await api.get(`/activities/${id}`);
  } catch (err) {
    openModal(`<h3 class="font-display font-bold text-lg mb-3">Locked door</h3>${lockedNotice()}
      <button data-close class="mt-4 text-sm px-4 py-2 rounded-lg border">Close</button>`);
    if (err.status !== 403) toast(err.message, 'error');
    return;
  }
  openModal(`
    <div class="flex items-start justify-between gap-3 mb-4">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-xl bg-sage-100 text-sage-700 flex items-center justify-center text-2xl"><i class="ph ${esc(a.icon)}"></i></div>
        <div>
          <p class="text-xs text-gray-500">${esc(a.calendar_title)} &bull; Day ${a.day_number}</p>
          <h3 class="font-display font-bold text-xl text-sage-900">${esc(a.title)}</h3>
        </div>
      </div>
      <button data-close class="text-gray-400 hover:text-gray-700" aria-label="Close"><i class="ph ph-x text-xl"></i></button>
    </div>
    <div class="flex flex-wrap gap-2 mb-4 text-xs">
      <span class="px-2 py-0.5 rounded-full bg-sage-50 border border-sage-200 text-sage-700"><i class="ph ph-clock"></i> ${esc(a.duration)}</span>
      <span class="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800"><i class="ph-fill ph-star"></i> ${a.points} points</span>
      ${tierBadge(a.tier_required)}
    </div>
    <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Why it helps</h4>
    <p class="text-sm text-gray-700 mb-4">${esc(a.description)}</p>
    <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">How to complete it</h4>
    <p class="text-sm text-gray-800 bg-sage-50 border border-sage-100 rounded-xl p-4 mb-5">${esc(a.instructions)}</p>
    <button id="complete-btn" class="w-full py-2.5 rounded-xl font-medium text-white bg-sage-600 hover:bg-sage-700 disabled:bg-emerald-600 disabled:cursor-default">
      ${a.completed ? `<i class="ph-fill ph-check-circle"></i> Completed (+${a.points_awarded} points)` : `Mark as complete (+${a.points} points)`}
    </button>`, {
    onMount: (root, close) => {
      const btn = root.querySelector('#complete-btn');
      btn.disabled = a.completed;
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const res = await api.post(`/activities/${a.id}/complete`);
          toast(`+${res.points_awarded} points! Balance: ${res.balance}`, 'success');
          await loadUser();
          close();
          onChange();
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = err.code === 'ALREADY_COMPLETED';
        }
      });
    },
  });
}
