import { api } from '../services/api.js';
import { store } from '../services/store.js';
import { esc, formatDate, pageTitle } from '../components/ui.js';

export async function render(app) {
  const [profile, history, calendars, redemptions] = await Promise.all([
    api.get('/profile'), api.get('/profile/history'), api.get('/calendars'), api.get('/rewards/redemptions'),
  ]);
  const stat = (label, value, icon) => `<div class="bg-white border border-sage-100 rounded-2xl p-4"><i class="ph-fill ${icon} text-sage-500 text-xl"></i><p class="text-2xl font-display font-bold text-sage-900 mt-1">${value}</p><p class="text-xs text-gray-500">${label}</p></div>`;
  app.innerHTML = `
    ${pageTitle(`Hello, ${store.user.name}`, 'Open a door, complete an activity and collect points.')}
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
      ${stat('Points balance', profile.points_balance, 'ph-star')}
      ${stat('Activities completed', profile.stats.completed_activities, 'ph-check-circle')}
      ${stat('Rewards redeemed', redemptions.length, 'ph-gift')}
      ${stat('Sessions joined', profile.stats.sessions_joined, 'ph-users-three')}
    </div>
    <div class="grid md:grid-cols-2 gap-6">
      <section>
        <h3 class="font-display font-semibold text-lg text-sage-900 mb-3">Your calendars</h3>
        <div class="space-y-2">${calendars.filter((c) => c.status === 'active').map((c) => `
          <a href="#/calendars/${c.id}" class="block bg-white border border-sage-100 rounded-xl p-3 hover:border-sage-300">
            <div class="flex justify-between text-sm"><span class="font-medium">${esc(c.title)}</span><span class="text-gray-500">${c.locked ? 'Locked' : `${c.completed_activities}/${c.total_activities}`}</span></div>
            <div class="h-2 bg-sage-100 rounded-full mt-2 overflow-hidden"><div class="h-full bg-sage-500" style="width:${c.total_activities ? Math.round((c.completed_activities / c.total_activities) * 100) : 0}%"></div></div>
          </a>`).join('')}</div>
      </section>
      <section>
        <h3 class="font-display font-semibold text-lg text-sage-900 mb-3">Activity history</h3>
        ${history.length ? `<ul class="bg-white border border-sage-100 rounded-xl divide-y divide-sage-100">${history.slice(0, 8).map((h) => `
          <li class="p-3 flex justify-between text-sm"><div><p class="font-medium">${esc(h.activity_title)}</p><p class="text-xs text-gray-400">${esc(h.calendar_title)} &bull; ${formatDate(h.completed_at)}</p></div><span class="text-emerald-700 font-medium">+${h.points_awarded}</span></li>`).join('')}</ul>`
    : '<p class="text-sm text-gray-500 bg-white border border-sage-100 rounded-xl p-4">No activities completed yet. Open a calendar to begin.</p>'}
      </section>
    </div>`;
}
