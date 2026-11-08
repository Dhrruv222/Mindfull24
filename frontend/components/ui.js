export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function toast(message, kind = 'info') {
  const colors = { info: 'bg-sage-800', success: 'bg-emerald-700', error: 'bg-red-700' };
  const el = document.createElement('div');
  el.className = `${colors[kind]} text-white text-sm px-4 py-2.5 rounded-xl shadow-lg modal-animate max-w-xs`;
  el.textContent = message;
  document.getElementById('toast-root').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

export const tierBadge = (tier) => (tier === 'premium'
  ? '<span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200"><i class="ph-fill ph-crown-simple"></i>Premium</span>'
  : '<span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sage-100 text-sage-700 border border-sage-200">Free</span>');

export function openModal(html, { onMount } = {}) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-4" data-close-modal>
      <div class="modal-animate bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" role="dialog" aria-modal="true">${html}</div>
    </div>`;
  const close = () => { root.innerHTML = ''; };
  root.firstElementChild.addEventListener('click', (e) => { if (e.target.hasAttribute('data-close-modal') || e.target.closest('[data-close]')) close(); });
  if (onMount) onMount(root, close);
  return close;
}

export const formatDate = (value) => new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

export function pageTitle(title, subtitle = '') {
  return `<div class="mb-6"><h2 class="font-display font-bold text-2xl text-sage-900">${esc(title)}</h2>${subtitle ? `<p class="text-sm text-gray-500 mt-1">${esc(subtitle)}</p>` : ''}</div>`;
}

export const errorBox = (message) => `<div class="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm p-4">${esc(message)}</div>`;

export const lockedNotice = () => `
  <div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex items-center gap-3">
    <i class="ph-fill ph-lock-key text-xl"></i>
    <span>This content is for Premium members. Open <a class="underline font-medium" href="#/subscription">Subscription</a> to switch tiers in the demo.</span>
  </div>`;
