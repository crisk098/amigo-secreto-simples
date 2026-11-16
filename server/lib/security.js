import { scrypt, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 32;

/** Gera hash `salt:chave` (hex) usando scrypt. */
export async function hashSecret(secret) {
  const salt = randomBytes(16);
  const key = await scryptAsync(String(secret), salt, KEY_LENGTH);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifySecret(secret, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [saltHex, keyHex] = stored.split(':');
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scryptAsync(String(secret ?? ''), Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function generatePassword(length = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join('');
}

/** Sessões em memória do organizador (token opaco com expiração). */
export class SessionManager {
  #sessions = new Map();

  constructor(ttlMs = 1000 * 60 * 60 * 8) {
    this.ttlMs = ttlMs;
  }

  create() {
    const token = randomBytes(32).toString('base64url');
    this.#sessions.set(token, Date.now() + this.ttlMs);
    return token;
  }

  validate(token) {
    if (!token) return false;
    const expiresAt = this.#sessions.get(token);
    if (!expiresAt) return false;
    if (expiresAt < Date.now()) {
      this.#sessions.delete(token);
      return false;
    }
    return true;
  }

  revoke(token) {
    this.#sessions.delete(token);
  }

  revokeAll() {
    this.#sessions.clear();
  }
}

/** Bloqueia temporariamente uma chave após muitas falhas (anti força-bruta). */
export class AttemptLimiter {
  #entries = new Map();

  constructor({ maxFailures = 5, lockMs = 10 * 60 * 1000 } = {}) {
    this.maxFailures = maxFailures;
    this.lockMs = lockMs;
  }

  /** Retorna segundos restantes de bloqueio (0 = liberado). */
  retryAfter(key) {
    const entry = this.#entries.get(key);
    if (!entry?.lockedUntil) return 0;
    const remaining = entry.lockedUntil - Date.now();
    if (remaining <= 0) {
      this.#entries.delete(key);
      return 0;
    }
    return Math.ceil(remaining / 1000);
  }

  fail(key) {
    const entry = this.#entries.get(key) ?? { failures: 0, lockedUntil: 0 };
    entry.failures += 1;
    if (entry.failures >= this.maxFailures) {
      entry.lockedUntil = Date.now() + this.lockMs;
      entry.failures = 0;
    }
    this.#entries.set(key, entry);
  }

  reset(key) {
    this.#entries.delete(key);
  }
}
