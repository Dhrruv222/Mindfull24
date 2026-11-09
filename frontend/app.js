import { store, loadUser, logout } from './services/store.js';
import { esc, tierBadge, errorBox, toast } from './components/ui.js';
import * as auth from './pages/auth.js';
import * as dashboard from './pages/dashboard.js';
import * as calendars from './pages/calendars.js';
import * as randomizer from './pages/randomizer.js';
import * as points from './pages/points.js';
import * as rewards from './pages/rewards.js';
import * as sessions from './pages/sessions.js';
import * as subscription from './pages/subscription.js';
import * as timeline from './pages/timeline.js';
import * as project from './pages/project.js';

const routes = [
  { path: /^\/login$/, page: auth, public: true, args: () => ['login'] },
  { path: /^\/register$/, page: auth, public: true, args: () => ['register'] },
  { path: /^\/$/, page: dashboard },
  { path: /^\/calendars$/, page: calendars, args: () => [null] },
  { path: /^\/calendars\/(\d+)$/, page: calendars, args: (m) => [Number(m[1])] },
  { path: /^\/randomizer$/, page: randomizer },
  { path: /^\/points$/, page: points },
  { path: /^\/rewards$/, page: rewards },
  { path: /^\/sessions$/, page: sessions },
  { path: /^\/timeline$/, page: timeline },
  { path: /^\/project$/, page: project },
  { path: /^\/subscription$/, page: subscription },
];

const NAV = [
  ['#/', 'Dashboard', 'ph-house'],
  ['#/calendars', 'Calendars', 'ph-calendar-heart'],
  ['#/randomizer', 'Randomizer', 'ph-dice-five'],
  ['#/points', 'Points', 'ph-star'],
  ['#/rewards', 'Rewards', 'ph-gift'],
  ['#/sessions', 'Group sessions', 'ph-users-three'],
  ['#/timeline', 'Timeline', 'ph-clock-counter-clockwise'],
  ['#/subscription', 'Subscription', 'ph-crown-simple'],
  ['#/project', 'Project hub', 'ph-kanban'],
];

function renderHeader() {
  const header = document.getElementById('header');
  const u = store.user;
  const current = location.hash || '#/';
  const nav = u ? NAV.map(([href, label, icon]) => {
    const active = href === '#/' ? current === '#/' : current.startsWith(href);
    return `<a href="${href}" class="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${active ? 'bg-sage-600 text-white' : 'text-sage-800 hover:bg-sage-100'}"><i class="ph ${icon}"></i>${label}</a>`;
  }).join('') : '';
  header.innerHTML = `
    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-col gap-3">
      <div class="flex items-center justify-between gap-3">
        <a href="#/" class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-sage-600 text-white flex items-center justify-center shadow-sm"><i class="ph-fill ph-calendar-heart text-2xl"></i></div>
          <div>
            <h1 class="font-display font-bold text-xl text-sage-900 leading-tight">Advent Calendar</h1>
            <p class="text-xs text-gray-500">Complete activities. Earn points. Unlock rewards.</p>
          </div>
        </a>
        ${u ? `<div class="flex items-center gap-2 text-sm">
          <span id="hdr-points" class="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-medium"><i class="ph-fill ph-star"></i>${u.points_balance}</span>
          ${tierBadge(u.subscription_tier)}
          <span class="hidden md:inline text-gray-600">${esc(u.name)}</span>
          <button id="logout-btn" class="text-xs px-2.5 py-1.5 rounded-lg border bg-white hover:bg-gray-50">Log out</button>
        </div>` : ''}
      </div>
      ${u ? `<nav class="flex gap-1 overflow-x-auto pb-1">${nav}</nav>` : ''}
    </div>`;
  const btn = document.getElementById('logout-btn');
  if (btn) btn.addEventListener('click', async () => { await logout(); location.hash = '#/login'; renderHeader(); });
}

let routeSeq = 0;

async function route() {
  const seq = ++routeSeq;
  const path = (location.hash.slice(1) || '/').split('?')[0];
  const app = document.getElementById('app');
  const match = routes.map((r) => ({ r, m: path.match(r.path) })).find((x) => x.m);

  if (!match) { location.hash = '#/'; return; }
  if (!match.r.public && !store.user) { location.hash = '#/login'; return; }
  if (match.r.public && store.user) { location.hash = '#/'; return; }

  if (store.user) await loadUser();
  renderHeader();
  // Render off-screen and swap in only if no newer navigation started meanwhile.
  const view = document.createElement('div');
  try {
    await match.r.page.render(view, ...(match.r.args ? match.r.args(match.m) : []));
  } catch (err) {
    view.innerHTML = errorBox(err.message);
  }
  if (seq === routeSeq) app.replaceChildren(view);
}

window.addEventListener('hashchange', route);
window.addEventListener('user:updated', renderHeader);
window.addEventListener('auth:expired', () => {
  store.user = null;
  toast('Your session expired. Please log in again.', 'error');
  location.hash = '#/login';
});

await loadUser();
renderHeader();
route();
