const TOKEN_KEY = 'amigo-secreto:organizer-token';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export const session = {
  get token() {
    return sessionStorage.getItem(TOKEN_KEY);
  },
  set token(value) {
    if (value) sessionStorage.setItem(TOKEN_KEY, value);
    else sessionStorage.removeItem(TOKEN_KEY);
  }
};

async function request(method, url, body, { auth = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && session.token) headers.Authorization = `Bearer ${session.token}`;

  let response;
  try {
    response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError('Sem conexão com o servidor. Verifique sua internet e tente novamente.', 0);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (auth && response.status === 401) window.dispatchEvent(new Event('organizer:expired'));
    throw new ApiError(data.error || 'Erro inesperado. Tente novamente.', response.status);
  }
  return data;
}

const org = (method, path, body) => request(method, `/api/organizer${path}`, body, { auth: true });

export const api = {
  state: () => request('GET', '/api/state'),
  claim: (id, payload) => request('POST', `/api/participants/${id}/claim`, payload),
  reveal: (id, pin) => request('POST', `/api/participants/${id}/reveal`, { pin }),
  saveWishlist: (id, pin, wishlist) => request('PUT', `/api/participants/${id}/wishlist`, { pin, wishlist }),

  organizer: {
    login: (password) => request('POST', '/api/organizer/login', { password }),
    logout: () => org('POST', '/logout'),
    overview: () => org('GET', '/overview'),
    saveConfig: (payload) => org('PUT', '/config', payload),
    addParticipant: (payload) => org('POST', '/participants', payload),
    importList: (payload) => org('POST', '/participants/bulk', payload),
    loadSample: () => org('POST', '/participants/sample'),
    updateParticipant: (id, payload) => org('PATCH', `/participants/${id}`, payload),
    resetPin: (id) => org('POST', `/participants/${id}/reset-pin`),
    removeParticipant: (id) => org('DELETE', `/participants/${id}`),
    clearParticipants: () => org('DELETE', '/participants'),
    draw: (sendEmails) => org('POST', '/draw', { sendEmails }),
    cancelDraw: () => org('DELETE', '/draw'),
    revealPair: (giverId) => org('POST', `/draw/reveal/${giverId}`),
    testEmail: (to) => org('POST', '/email/test', { to })
  }
};
