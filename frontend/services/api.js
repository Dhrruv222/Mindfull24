const TOKEN_KEY = 'advent_calendar_token';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `Request failed (${status})`);
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error || {};
  }
}

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => (token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY));

async function request(method, path, body, headers = {}) {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event('auth:expired'));
    }
    throw new ApiError(res.status, data);
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body, headers) => request('POST', path, body || {}, headers),
};
