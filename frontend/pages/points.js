import { api } from '../services/api.js';
import { esc, formatDate, pageTitle } from '../components/ui.js';

export async function render(app) {
  const [summary, history] = await Promise.all([api.get('/points/balance'), api.get('/points/history?limit=100')]);
  const stat = (label, value, color) => `<div class="bg-white border border-sage-100 rounded-2xl p-4"><p class="text-2xl font-display font-bold ${color}">${value}</p><p class="text-xs text-gray-500">${label}</p></div>`;
  app.innerHTML = `${pageTitle('Points dashboard', 'Every earning and spending transaction is recorded in your ledger.')}
    <div class="grid grid-cols-3 gap-3 mb-6 max-w-2xl">
      ${stat('Balance', summary.balance, 'text-sage-900')}
      ${stat('Total earned', summary.total_earned, 'text-emerald-700')}
      ${stat('Total spent', summary.total_spent, 'text-red-600')}
    </div>
    <div class="bg-white border border-sage-100 rounded-2xl overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="text-left text-xs text-gray-400 uppercase"><tr><th class="p-3">Date</th><th class="p-3">Type</th><th class="p-3">Source</th><th class="p-3 text-right">Amount</th><th class="p-3 text-right">Balance</th></tr></thead>
        <tbody class="divide-y divide-sage-100">${history.map((h) => `<tr>
          <td class="p-3 text-gray-500">${formatDate(h.created_at)}</td><td class="p-3">${esc(h.transaction_type)}</td>
          <td class="p-3">${esc(h.reference_type)}</td>
          <td class="p-3 text-right font-medium ${h.transaction_type === 'earn' ? 'text-emerald-700' : 'text-red-600'}">${h.transaction_type === 'earn' ? '+' : '-'}${h.amount}</td>
          <td class="p-3 text-right text-gray-500">${h.balance_after}</td></tr>`).join('') || '<tr><td class="p-4 text-gray-500" colspan="5">No transactions yet.</td></tr>'}</tbody>
      </table>
    </div>`;
}
