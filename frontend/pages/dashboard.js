import { api } from '../services/api.js';
import { store } from '../services/store.js';
import { esc, formatDate, pageTitle, tierBadge, calendarTheme, dateOnly } from '../components/ui.js';

export async function render(app) {
  const [profile, history, calendars, redemptions] = await Promise.all([
    api.get('/profile'), api.get('/profile/history'), api.get('/calendars'), api.get('/rewards/redemptions'),
  ]);
  const active = calendars.filter((c) => c.status === 'active');
  const started = active.filter((c) => c.joined);
  const waiting = started.reduce((n, c) => n + Math.max(0, c.unlocked_doors - c.completed_activities), 0);
  const upcoming = started.filter((c) => c.next_unlock_date).sort((a, b) => a.next_unlock_date.localeCompare(b.next_unlock_date));

  const stat = (label, value, icon) => `<div class="bg-white border border-sage-100 rounded-2xl p-4"><i class="ph-fill ${icon} text-sage-500 text-xl"></i><p class="text-2xl font-display font-bold text-sage-900 mt-1">${value}</p><p class="text-xs text-gray-500">${label}</p></div>`;
  const section = (title, body) => `<section><h3 class="font-display font-semibold text-lg text-sage-900 mb-3">${title}</h3>${body}</section>`;
  const empty = (text) => `<p class="text-sm text-gray-500 bg-white border border-sage-100 rounded-xl p-4">${text}</p>`;

  app.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2">${pageTitle(`Hello, ${store.user.name}`, 'Open a door, discover something new and collect points along the way.')}<div class="mb-6">${tierBadge(profile.subscription_tier)}</div></div>
    ${waiting ? `<a href="#/calendars" class="block mb-6 rounded-2xl p-4 bg-gradient-to-r from-amber-50 to-sage-50 border border-amber-200 text-sm text-amber-900 hover:shadow-sm"><i class="ph-fill ph-sparkle"></i> <b>${waiting} door${waiting > 1 ? 's are' : ' is'} waiting for you.</b> Open them in your calendars.</a>` : ''}
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
      ${stat('Points balance', profile.points_balance, 'ph-star')}
      ${stat('Doors discovered', started.reduce((n, c) => n + c.opened_activities, 0), 'ph-door-open')}
      ${stat('Activities completed', profile.stats.completed_activities, 'ph-check-circle')}
      ${stat('Rewards redeemed', redemptions.length, 'ph-gift')}
    </div>
    <div class="grid md:grid-cols-2 gap-6">
      ${section('Your calendars', `<div class="space-y-2">${active.map((c) => {
    const theme = calendarTheme(c.category);
    const pct = c.total_activities ? Math.round((c.completed_activities / c.total_activities) * 100) : 0;
    return `<a href="#/calendars/${c.id}" class="block bg-white border border-sage-100 rounded-xl p-3 hover:border-sage-300">
            <div class="flex justify-between items-center text-sm gap-2"><span class="font-medium flex items-center gap-2"><span class="w-7 h-7 rounded-lg ${theme.tile} inline-flex items-center justify-center"><i class="ph ${esc(c.icon)}"></i></span>${esc(c.title)}</span>
              <span class="text-gray-500 text-xs">${c.locked ? 'Premium' : c.joined ? `${c.completed_activities}/${c.total_activities}` : 'Not started'}</span></div>
            <div class="h-2 bg-sage-100 rounded-full mt-2 overflow-hidden"><div class="h-full ${theme.bar}" style="width:${pct}%"></div></div></a>`;
  }).join('')}</div>`)}
      ${section('Coming up', upcoming.length ? `<ul class="bg-white border border-sage-100 rounded-xl divide-y divide-sage-100">${upcoming.map((c) => `
          <li class="p-3 flex justify-between text-sm"><span><i class="ph ph-hourglass-medium text-sage-500"></i> ${esc(c.title)}: door ${c.next_unlock_day}</span><span class="text-gray-500">${dateOnly(c.next_unlock_date)}</span></li>`).join('')}</ul>`
    : empty('Start a calendar to see which door opens next.'))}
      ${section('Recent activities', history.length ? `<ul class="bg-white border border-sage-100 rounded-xl divide-y divide-sage-100">${history.slice(0, 6).map((h) => `
          <li class="p-3 flex justify-between text-sm"><div><p class="font-medium">${esc(h.activity_title)}</p><p class="text-xs text-gray-400">${esc(h.calendar_title)} &bull; ${formatDate(h.completed_at)}</p></div><span class="text-emerald-700 font-medium">+${h.points_awarded}</span></li>`).join('')}</ul>`
    : empty('Nothing completed yet. Open a door to begin.'))}
      ${section('Rewards redeemed', redemptions.length ? `<ul class="bg-white border border-sage-100 rounded-xl divide-y divide-sage-100">${redemptions.slice(0, 5).map((d) => `
          <li class="p-3 flex justify-between text-sm"><div><p class="font-medium">${esc(d.reward_title)}</p><p class="text-xs text-gray-400">${esc(d.partner_name)} (demo) &bull; ${formatDate(d.created_at)}</p></div><span class="text-amber-700 font-medium">-${d.points_spent}</span></li>`).join('')}</ul>`
    : empty('No rewards yet. Browse the <a class="underline" href="#/rewards">rewards shop</a>.'))}
    </div>
    <p class="text-xs text-gray-400 mt-6">See the full dated record on the <a class="underline" href="#/timeline">timeline</a>.</p>`;
}
