import { api } from '../services/api.js';
import { loadUser } from '../services/store.js';
import { toast, tierBadge, pageTitle } from '../components/ui.js';

const FEATURES = [
  ['Free calendars and activities', true, true],
  ['Main randomizer', true, true],
  ['Group sessions', true, true],
  ['Premium calendars (e.g. Football)', false, true],
  ['Premium activities and rewards', false, true],
  ['Full randomizer pool with a shorter cooldown', false, true],
];
const check = (ok) => (ok ? '<i class="ph-fill ph-check-circle text-emerald-600"></i>' : '<i class="ph ph-minus text-gray-300"></i>');

export async function render(app) {
  const [sub, ent] = await Promise.all([api.get('/subscription'), api.get('/subscription/entitlements')]);
  app.innerHTML = `${pageTitle('Subscription', 'Compare Free and Premium. No payment is needed in the demo.')}
    <div class="flex items-center gap-3 mb-6"><span class="text-sm">Current plan:</span>${tierBadge(sub.tier)}</div>
    <div class="max-w-xl bg-white border border-sage-100 rounded-2xl overflow-hidden mb-6">
      <table class="w-full text-sm"><thead class="bg-sage-50 text-left text-xs text-gray-500"><tr><th class="p-3">Feature</th><th class="p-3 text-center">Free</th><th class="p-3 text-center">Premium</th></tr></thead>
      <tbody class="divide-y divide-sage-100">${FEATURES.map(([label, free, premium]) => `<tr><td class="p-3">${label}</td><td class="p-3 text-center">${check(free)}</td><td class="p-3 text-center">${check(premium)}</td></tr>`).join('')}</tbody></table>
    </div>
    <p class="text-sm text-gray-600 mb-4">Randomizer cooldown on your plan: <b>${ent.features.randomizer_cooldown_minutes} minutes</b>.</p>
    ${sub.demo_switcher_enabled ? `
      <div class="max-w-xl bg-amber-50 border border-amber-200 rounded-2xl p-5">
        <h3 class="font-display font-semibold text-amber-900 mb-1"><i class="ph-fill ph-flask"></i> Demo tier switcher</h3>
        <p class="text-sm text-amber-900/80 mb-3">Changes your demo account tier on the server, so every API restriction updates immediately.</p>
        <div class="inline-flex rounded-xl overflow-hidden border border-amber-300">
          <button data-tier="free" class="px-5 py-2 text-sm font-medium ${sub.tier === 'free' ? 'bg-sage-600 text-white' : 'bg-white'}">Free</button>
          <button data-tier="premium" class="px-5 py-2 text-sm font-medium ${sub.tier === 'premium' ? 'bg-sage-600 text-white' : 'bg-white'}">Premium</button>
        </div>
      </div>` : '<p class="text-sm text-gray-500">The demo tier switcher is not available for this account or environment.</p>'}`;

  app.querySelectorAll('[data-tier]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await api.post('/demo/tier', { tier: b.dataset.tier });
      toast(`Switched to ${b.dataset.tier}`, 'success');
      await loadUser();
      await render(app);
    } catch (err) { toast(err.message, 'error'); }
  }));
}
