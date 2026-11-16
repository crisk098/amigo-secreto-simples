import { randomUUID } from 'node:crypto';
import { conflict, notFound } from './lib/errors.js';
import { normalize, toTitleCase } from './lib/validation.js';

export function findParticipant(db, id) {
  const participant = db.participants.find((p) => p.id === id);
  if (!participant) throw notFound('Participante não encontrado.');
  return participant;
}

/** Reaproveita a grafia de uma família já existente (ignorando maiúsculas/acentos). */
export function canonicalFamily(participants, family) {
  if (!family) return '';
  const key = normalize(family);
  return participants.find((p) => normalize(p.family) === key)?.family ?? toTitleCase(family);
}

export function assertUniqueName(participants, name, ignoreId = null) {
  const key = normalize(name);
  const clash = participants.some((p) => p.id !== ignoreId && normalize(p.name) === key);
  if (clash) throw conflict(`Já existe um participante chamado "${name}".`);
}

export function createParticipant(db, { name, family = '', email = '', wishlist = '' }) {
  const formattedName = toTitleCase(name);
  assertUniqueName(db.participants, formattedName);
  const participant = {
    id: randomUUID(),
    name: formattedName,
    family: canonicalFamily(db.participants, family),
    email,
    wishlist,
    pinHash: '',
    createdAt: new Date().toISOString()
  };
  db.participants.push(participant);
  return participant;
}
