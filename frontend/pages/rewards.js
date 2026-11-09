import { api } from '../services/api.js';
import { loadUser } from '../services/store.js';
import { esc, toast, tierBadge, pageTitle, formatDate, openModal } from '../components/ui.js';

const REASONS = {
  PREMIUM_REQUIRED: 'Premium only',
  OUT_OF_STOCK: 'Out of stock',
  INSUFFICIENT_POINTS: 'Not enough points',
};

export async function render(app) {
  const [rewards, redemptions] = await Promise.all([api.get('/rewards'), api.get('/rewards/redemptions')]);
  app.innerHTML = `${pageTitle('Rewards shop', 'Exchange your points for partner offers.')}
    <p class="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5"><i class="ph-fill ph-info"></i> <b>Demo rewards.</b> The partners and promo codes below are simulated for this MVP. They are not real partnerships and the codes cannot be used in real shops.</p>
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">${rewards.map((r) => `
      <div class="bg-white border border-sage-100 rounded-2xl p-5 flex flex-col ${r.locked ? 'opacity-80' : ''}">
        <div class="h-24 -mx-5 -mt-5 mb-4 rounded-t-2xl bg-gradient-to-br from-sage-100 to-amber-50 flex items-center justify-center text-sage-600 text-5xl"><i class="ph ${esc(r.icon)}"></i></div>
        <div class="flex justify-between items-start mb-2"><p class="text-xs text-gray-500">${esc(r.partner_name)} <span class="text-[10px] uppercase tracking-wide text-gray-400">(demo)</span></p>${tierBadge(r.tier_required)}</div>
        <h3 class="font-display font-semibold text-lg text-sage-900">${esc(r.reward_title)}</h3>
        <p class="text-sm text-gray-600 my-2 flex-1">${esc(r.description)}</p>
        <p class="text-amber-700 font-semibold mb-3"><i class="ph-fill ph-star"></i> ${r.points_cost} points${r.points_missing && !r.locked ? ` <span class="text-xs text-gray-400 font-normal">(${r.points_missing} more needed)</span>` : ''}</p>
        <button data-id="${r.id}" ${r.can_redeem ? '' : 'disabled'} class="py-2 rounded-xl text-sm font-medium text-white bg-sage-600 hover:bg-sage-700 disabled:bg-gray-300 disabled:cursor-not-allowed">${r.can_redeem ? 'Redeem' : esc(REASONS[r.blocked_reason])}</button>
      </div>`).join('')}</div>
    <h3 class="font-display font-semibold text-lg text-sage-900 mb-3">My redemptions</h3>
    ${redemptions.length ? `<div class="bg-white border border-sage-100 rounded-xl divide-y divide-sage-100">${redemptions.map((d) => `
      <div class="p-3 flex flex-wrap justify-between gap-2 text-sm"><div><p class="font-medium">${esc(d.reward_title)} <span class="text-gray-400">&bull; ${esc(d.partner_name)}</span></p><p class="text-xs text-gray-400">${formatDate(d.created_at)} &bull; -${d.points_spent} points</p></div>
      <code class="px-2 py-1 bg-sage-50 border border-sage-200 rounded-lg self-center">${esc(d.promo_code)}</code></div>`).join('')}</div>`
    : '<p class="text-sm text-gray-500 bg-white border border-sage-100 rounded-xl p-4">No redemptions yet.</p>'}`;

  app.querySelectorAll('button[data-id]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      const res = await api.post(`/rewards/${b.dataset.id}/redeem`, null, { 'Idempotency-Key': crypto.randomUUID() });
      openModal(`<div class="text-center"><i class="ph-fill ph-gift text-5xl text-sage-500"></i>
        <h3 class="font-display font-bold text-xl text-sage-900 mt-2">${esc(res.reward_title)}</h3>
        <p class="text-sm text-gray-500">${esc(res.partner_name)}</p>
        <p class="my-4 text-2xl font-mono tracking-wider bg-sage-50 border border-sage-200 rounded-xl py-3">${esc(res.promo_code)}</p>
        <p class="text-xs text-gray-500 mb-4">${res.points_spent} points spent. New balance: ${res.balance}.</p>
        <button data-close class="px-4 py-2 rounded-lg bg-sage-600 text-white">Done</button></div>`);
      await loadUser();
      await render(app);
    } catch (err) {
      toast(err.message, 'error');
      await loadUser();
      await render(app);
    }
  }));
}
