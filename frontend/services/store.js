import { api, setToken, getToken } from './api.js';

export const store = { user: null };

export async function loadUser() {
  if (!getToken()) {
    store.user = null;
    return null;
  }
  try {
    store.user = await api.get('/profile');
  } catch {
    store.user = null;
  }
  window.dispatchEvent(new Event('user:updated'));
  return store.user;
}

export async function authenticate(path, payload) {
  const { token } = await api.post(path, payload);
  setToken(token);
  return loadUser();
}

export async function logout() {
  try { await api.post('/logout'); } catch { /* token may already be invalid */ }
  setToken(null);
  store.user = null;
}
