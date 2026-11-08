import { authenticate } from '../services/store.js';
import { esc, toast } from '../components/ui.js';

const DEMO = [
  ['Free demo', 'free@demo.saca.test'],
  ['Premium demo', 'premium@demo.saca.test'],
  ['Alex (test)', 'alex@demo.saca.test'],
  ['Sam (low points)', 'sam@demo.saca.test'],
];

export async function render(app, mode) {
  const isRegister = mode === 'register';
  app.innerHTML = `
    <div class="max-w-md mx-auto bg-white border border-sage-100 rounded-2xl shadow-sm p-6">
      <h2 class="font-display font-bold text-2xl text-sage-900 mb-1">${isRegister ? 'Create your account' : 'Welcome back'}</h2>
      <p class="text-sm text-gray-500 mb-5">${isRegister ? 'Join the Advent Calendar and start earning points.' : 'Log in to open your daily doors.'}</p>
      <form id="auth-form" class="space-y-3" novalidate>
        ${isRegister ? '<label class="block text-sm">Name<input name="name" required maxlength="60" autocomplete="name" class="mt-1 w-full border rounded-lg px-3 py-2"></label>' : ''}
        <label class="block text-sm">Email<input name="email" type="email" required autocomplete="email" class="mt-1 w-full border rounded-lg px-3 py-2"></label>
        <label class="block text-sm">Password<input name="password" type="password" required autocomplete="${isRegister ? 'new-password' : 'current-password'}" class="mt-1 w-full border rounded-lg px-3 py-2">
          ${isRegister ? '<span class="text-xs text-gray-400">At least 8 characters with a letter and a number.</span>' : ''}</label>
        <p id="form-error" class="text-sm text-red-600 hidden"></p>
        <button class="w-full py-2.5 rounded-xl font-medium text-white bg-sage-600 hover:bg-sage-700">${isRegister ? 'Register' : 'Log in'}</button>
      </form>
      <p class="text-sm text-gray-500 mt-4 text-center">${isRegister ? 'Already registered? <a class="text-sage-700 underline" href="#/login">Log in</a>' : 'New here? <a class="text-sage-700 underline" href="#/register">Create an account</a>'}</p>
      ${isRegister ? '' : `<div class="mt-5 pt-4 border-t border-sage-100">
        <p class="text-xs text-gray-500 mb-2">Demo accounts (password <code>Demo1234!</code>):</p>
        <div class="flex flex-wrap gap-2">${DEMO.map(([label, email]) => `<button type="button" data-email="${esc(email)}" class="text-xs px-2.5 py-1 rounded-full border bg-sage-50 hover:bg-sage-100">${esc(label)}</button>`).join('')}</div>
      </div>`}
    </div>`;

  const form = app.querySelector('#auth-form');
  const error = app.querySelector('#form-error');
  app.querySelectorAll('[data-email]').forEach((b) => b.addEventListener('click', () => {
    form.email.value = b.dataset.email;
    form.password.value = 'Demo1234!';
  }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.classList.add('hidden');
    const data = Object.fromEntries(new FormData(form));
    try {
      await authenticate(isRegister ? '/register' : '/login', data);
      toast(isRegister ? 'Account created. Welcome!' : 'Logged in', 'success');
      location.hash = '#/';
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
    }
  });
}
