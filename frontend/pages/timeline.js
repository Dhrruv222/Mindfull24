import { api } from '../services/api.js';
import { esc, pageTitle } from '../components/ui.js';

const TYPE = {
  door_available: { label: 'Door available', icon: 'ph-door', dot: 'bg-sage-400' },
  door_opened: { label: 'Door opened', icon: 'ph-door-open', dot: 'bg-amber-400' },
  activity_completed: { label: 'Completed', icon: 'ph-check-circle', dot: 'bg-emerald-500' },
  points_earned: { label: 'Points earned', icon: 'ph-star', dot: 'bg-yellow-500' },
  points_spent: { label: 'Points spent', icon: 'ph-coins', dot: 'bg-orange-500' },
  reward_redeemed: { label: 'Reward redeemed', icon: 'ph-gift', dot: 'bg-pink-500' },
  randomizer_draw: { label: 'Randomizer draw', icon: 'ph-dice-five', dot: 'bg-violet-500' },
  session_joined: { label: 'Group session', icon: 'ph-users-three', dot: 'bg-sky-500' },
};
const STATUS = {
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  available: 'bg-sage-50 text-sage-700 border-sage-200',
  locked: 'bg-gray-100 text-gray-500 border-gray-200',
};

const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromKey = (k) => new Date(`${k}T00:00:00`);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
const eventDay = (e) => (e.all_day ? e.date : key(new Date(e.at)));
const timeOf = (e) => (e.all_day ? 'All day' : new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

const state = { view: 'month', anchor: key(new Date()), selected: key(new Date()) };

function visibleRange() {
  const a = fromKey(state.anchor);
  if (state.view === 'month') {
    const first = new Date(a.getFullYear(), a.getMonth(), 1);
    const last = new Date(a.getFullYear(), a.getMonth() + 1, 0);
    return { start: mondayOf(first), end: addDays(mondayOf(last), 6) };
  }
  if (state.view === 'week') { const s = mondayOf(a); return { start: s, end: addDays(s, 6) }; }
  return { start: a, end: a };
}

function eventRow(e) {
  const t = TYPE[e.type];
  return `<li class="p-3 flex gap-3">
    <div class="w-9 h-9 rounded-lg bg-sage-50 text-sage-700 flex items-center justify-center shrink-0"><i class="ph ${t.icon} text-lg"></i></div>
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-2"><p class="font-medium text-sm text-sage-900">${esc(e.title)}</p>
        <span class="text-[10px] px-2 py-0.5 rounded-full border ${STATUS[e.status]}">${e.status}</span></div>
      <p class="text-xs text-gray-500">${t.label} &bull; ${timeOf(e)}${e.calendar ? ` &bull; ${esc(e.calendar)}` : ''}</p>
      <p class="text-xs text-gray-600 mt-0.5">${esc(e.description)}</p>
    </div></li>`;
}

function dayPanel(dayKey, byDay) {
  const events = byDay.get(dayKey) || [];
  const title = fromKey(dayKey).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  return `<section class="bg-white border border-sage-100 rounded-2xl p-4" aria-live="polite">
    <h3 class="font-display font-semibold text-sage-900 mb-2">${title}</h3>
    ${events.length ? `<ul class="divide-y divide-sage-100">${events.map(eventRow).join('')}</ul>`
    : '<p class="text-sm text-gray-500">Nothing recorded on this day.</p>'}</section>`;
}

function monthGrid(range, byDay, todayKey) {
  const anchor = fromKey(state.anchor);
  const cells = [];
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) {
    const k = key(d);
    const events = byDay.get(k) || [];
    const dots = [...new Set(events.map((e) => e.type))].slice(0, 5).map((t) => `<span class="w-2 h-2 rounded-full ${TYPE[t].dot}"></span>`).join('');
    const outside = d.getMonth() !== anchor.getMonth();
    cells.push(`<button data-day="${k}" class="min-h-16 sm:min-h-20 p-1.5 border border-sage-100 text-left rounded-lg ${outside ? 'bg-gray-50 text-gray-400' : 'bg-white'} ${k === state.selected ? 'ring-2 ring-sage-500' : ''} hover:bg-sage-50" aria-label="${k}, ${events.length} events">
      <span class="text-xs ${k === todayKey ? 'bg-sage-600 text-white rounded-full px-1.5 py-0.5' : ''}">${d.getDate()}</span>
      <span class="flex flex-wrap gap-1 mt-1">${dots}</span>${events.length ? `<span class="text-[10px] text-gray-500 hidden sm:block mt-0.5">${events.length} event${events.length > 1 ? 's' : ''}</span>` : ''}</button>`);
  }
  return `<div class="grid grid-cols-7 gap-1 text-center text-xs text-gray-400 mb-1">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((n) => `<span>${n}</span>`).join('')}</div>
    <div class="grid grid-cols-7 gap-1">${cells.join('')}</div>`;
}

function weekList(range, byDay, todayKey) {
  const days = [];
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) days.push(key(d));
  return `<div class="grid md:grid-cols-7 gap-2">${days.map((k) => {
    const events = byDay.get(k) || [];
    return `<button data-day="${k}" class="text-left bg-white border ${k === state.selected ? 'border-sage-500 ring-1 ring-sage-500' : 'border-sage-100'} rounded-xl p-2 min-h-24">
      <p class="text-xs font-medium ${k === todayKey ? 'text-sage-700' : 'text-gray-500'}">${fromKey(k).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</p>
      ${events.slice(0, 4).map((e) => `<p class="text-[11px] mt-1 truncate"><span class="inline-block w-1.5 h-1.5 rounded-full ${TYPE[e.type].dot}"></span> ${esc(e.title)}</p>`).join('')}
      ${events.length > 4 ? `<p class="text-[10px] text-gray-400">+${events.length - 4} more</p>` : ''}</button>`;
  }).join('')}</div>`;
}

export async function render(app) {
  const range = visibleRange();
  const data = await api.get(`/timeline?from=${key(addDays(range.start, -1))}&to=${key(addDays(range.end, 1))}`);
  const byDay = new Map();
  for (const e of data.events) {
    const k = eventDay(e);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(e);
  }
  const anchor = fromKey(state.anchor);
  const heading = state.view === 'month' ? anchor.toLocaleDateString([], { month: 'long', year: 'numeric' })
    : state.view === 'week' ? `${range.start.toLocaleDateString([], { day: 'numeric', month: 'short' })} to ${range.end.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}`
      : anchor.toLocaleDateString([], { dateStyle: 'full' });
  const btn = (v) => `<button data-view="${v}" class="px-3 py-1.5 text-sm rounded-lg ${state.view === v ? 'bg-sage-600 text-white' : 'bg-white border text-sage-800 hover:bg-sage-50'}">${v[0].toUpperCase()}${v.slice(1)}</button>`;

  app.innerHTML = `${pageTitle('Timeline', 'A dated record of doors, completions, points, rewards and sessions. Every entry is read from the records stored for your account.')}
    ${data.demo_data ? '<p class="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4"><i class="ph-fill ph-info"></i> <b>Demonstration data.</b> This is a demo account, so its starting history was seeded for the demo. Its entries are not real user activity.</p>' : ''}
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div class="flex items-center gap-2">
        <button data-nav="-1" class="w-9 h-9 rounded-lg border bg-white hover:bg-sage-50" aria-label="Previous"><i class="ph ph-caret-left"></i></button>
        <button data-nav="0" class="px-3 h-9 rounded-lg border bg-white text-sm hover:bg-sage-50">Today</button>
        <button data-nav="1" class="w-9 h-9 rounded-lg border bg-white hover:bg-sage-50" aria-label="Next"><i class="ph ph-caret-right"></i></button>
        <h3 class="font-display font-semibold text-sage-900 ml-2">${heading}</h3></div>
      <div class="flex gap-1">${['month', 'week', 'day'].map(btn).join('')}</div></div>
    ${data.events.length === 0 ? '<p class="text-sm text-gray-500 bg-white border border-sage-100 rounded-xl p-4 mb-4">No records in this period yet. Start a calendar and open a door to see it here.</p>' : ''}
    <div class="mb-5">${state.view === 'month' ? monthGrid(range, byDay, data.today) : state.view === 'week' ? weekList(range, byDay, data.today) : ''}</div>
    ${dayPanel(state.view === 'day' ? state.anchor : state.selected, byDay)}
    <div class="flex flex-wrap gap-3 text-xs text-gray-500 mt-4">${Object.values(TYPE).map((t) => `<span><span class="inline-block w-2 h-2 rounded-full ${t.dot}"></span> ${t.label}</span>`).join('')}</div>`;

  app.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.view; state.anchor = state.selected; render(app); }));
  app.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => { state.selected = b.dataset.day; render(app); }));
  app.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => {
    const n = Number(b.dataset.nav);
    const a = fromKey(state.anchor);
    if (n === 0) state.anchor = data.today;
    else if (state.view === 'month') state.anchor = key(new Date(a.getFullYear(), a.getMonth() + n, 1));
    else state.anchor = key(addDays(a, n * (state.view === 'week' ? 7 : 1)));
    state.selected = n === 0 ? data.today : state.anchor;
    render(app);
  }));
}
