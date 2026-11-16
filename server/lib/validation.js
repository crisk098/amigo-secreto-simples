import { badRequest } from './errors.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Normaliza texto para comparações: sem acentos, minúsculo, espaços colapsados. */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanText(value, { max = 100, required = false, label = 'Campo' } = {}) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (required && !text) throw badRequest(`${label} é obrigatório.`);
  if (text.length > max) throw badRequest(`${label} deve ter no máximo ${max} caracteres.`);
  return text;
}

/** Formata texto em Title Case (Primeira Letra de Cada Palavra Maiúscula, preservando preposições comuns em minúsculo se desejado ou tudo capitalizado). */
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

export function cleanEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!email) return '';
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    throw badRequest('Informe um e-mail válido ou deixe o campo em branco.');
  }
  return email;
}

export function cleanParticipantPin(value) {
  const pin = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}$/.test(pin)) throw badRequest('A senha deve ter exatamente 4 números.');
  return pin;
}

export function cleanPassword(value, label = 'A senha do organizador') {
  const pwd = typeof value === 'string' ? value : '';
  if (pwd.length < 6 || pwd.length > 64) {
    throw badRequest(`${label} deve ter entre 6 e 64 caracteres.`);
  }
  return pwd;
}

export function cleanUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest('O link público é inválido.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw badRequest('O link público deve começar com http:// ou https://.');
  return url.origin;
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
