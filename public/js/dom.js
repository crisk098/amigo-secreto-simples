export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** Cria elementos de forma segura (textContent), sem innerHTML. */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in el && key !== 'list') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export const clear = (el) => {
  if (!el) return;
  if (typeof el.replaceChildren === 'function') {
    el.replaceChildren();
  } else {
    while (el.firstChild) el.removeChild(el.firstChild);
  }
};

export const safeReplaceChildren = (el, ...nodes) => {
  if (!el) return;
  if (typeof el.replaceChildren === 'function') {
    el.replaceChildren(...nodes.filter(Boolean));
  } else {
    while (el.firstChild) el.removeChild(el.firstChild);
    for (const node of nodes) {
      if (node) el.appendChild(node instanceof Node ? node : document.createTextNode(String(node)));
    }
  }
};

export function toast(message, type = 'info') {
  const el = h('div', { class: `toast toast--${type}` }, message);
  $('#toasts').append(el);
  setTimeout(() => el.remove(), type === 'error' ? 6000 : 3500);
}

export function showError(el, message) {
  el.textContent = message;
  el.hidden = !message;
}

export function toTitleCase(value) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (!text) return '';
  const lowerWords = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  return text
    .split(' ')
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && lowerWords.has(lower)) {
        return lower;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

const initials = (name) =>
  name.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase();

/** Matiz estável (0–359) derivado do nome da família. */
function hueFor(text) {
  let hash = 0;
  for (const char of text.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

export function avatar(name, large = false) {
  const el = h('span', { class: `avatar${large ? ' avatar--lg' : ''}`, 'aria-hidden': 'true' }, initials(name));
  el.style.setProperty('--h', hueFor(name));
  return el;
}

export function familyBadge(family) {
  if (!family) return h('span', { class: 'badge badge--none' }, 'Sem restrição');
  const el = h('span', { class: 'badge', title: family }, `🏡 ${family}`);
  el.style.setProperty('--h', hueFor(family));
  return el;
}

export function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

/** Fecha diálogos ao clicar em [data-close] ou no fundo. */
export function setupDialogs() {
  document.addEventListener('click', (event) => {
    const dialog = event.target.closest('dialog');
    if (event.target.closest('[data-close]') && dialog) dialog.close();
    else if (event.target instanceof HTMLDialogElement) event.target.close();
  });
}

export function confirmDialog({ title, message, confirmLabel = 'Confirmar', danger = false }) {
  const dialog = $('#confirmDialog');
  $('#confirmTitle').textContent = title;
  $('#confirmMessage').textContent = message;
  const ok = $('#confirmOk');
  ok.textContent = confirmLabel;
  ok.className = danger ? 'btn btn--primary btn--danger' : 'btn btn--primary';
  dialog.returnValue = '';
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
    dialog.showModal();
  });
}

export async function withBusy(button, task) {
  button.disabled = true;
  try {
    return await task();
  } finally {
    button.disabled = false;
  }
}

export const formatDateTime = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
