import { randomInt } from 'node:crypto';
import { normalize } from './validation.js';

export class DrawError extends Error {}

export const MIN_PARTICIPANTS = 3;

function shuffled(items, rng) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Chave de grupo: pessoas sem família formam grupos de uma pessoa só. */
function groupKey(person) {
  const family = normalize(person.family);
  return family || `__solo__${person.id}`;
}

/** Retorna a família que ocupa mais da metade da lista (sorteio impossível), ou null. */
export function findOversizedFamily(participants) {
  const counts = new Map();
  for (const p of participants) {
    const family = normalize(p.family);
    if (!family) continue;
    const entry = counts.get(family) ?? { name: p.family, count: 0 };
    entry.count += 1;
    counts.set(family, entry);
  }
  for (const entry of counts.values()) {
    if (entry.count * 2 > participants.length) return entry;
  }
  return null;
}

/**
 * Sorteia pares (quem presenteia → quem recebe) sem auto-sorteio e
 * sem que pessoas da mesma família se tirem.
 * Usa backtracking com reinícios aleatórios; é completo, então só falha se não houver solução.
 *
 * @returns {{ giverId: string, receiverId: string }[]}
 */
export function runDraw(participants, rng = randomInt) {
  if (participants.length < MIN_PARTICIPANTS) {
    throw new DrawError(`É necessário ter no mínimo ${MIN_PARTICIPANTS} participantes.`);
  }

  const oversized = findOversizedFamily(participants);
  if (oversized) {
    throw new DrawError(
      `Impossível sortear: "${oversized.name}" tem ${oversized.count} pessoas, mais da metade dos ${participants.length} participantes.`
    );
  }

  const sizes = new Map();
  for (const p of participants) sizes.set(groupKey(p), (sizes.get(groupKey(p)) ?? 0) + 1);
  // Famílias maiores primeiro: são as mais restritas.
  const givers = [...participants].sort((a, b) => sizes.get(groupKey(b)) - sizes.get(groupKey(a)));

  const attemptLimit = 5_000;
  for (let restart = 0; restart < 200; restart++) {
    const taken = new Set();
    const pairs = [];
    let steps = 0;

    const solve = (index) => {
      if (index === givers.length) return true;
      if (++steps > attemptLimit) return false;
      const giver = givers[index];
      const candidates = shuffled(
        participants.filter((r) => !taken.has(r.id) && r.id !== giver.id && groupKey(r) !== groupKey(giver)),
        rng
      );
      for (const receiver of candidates) {
        taken.add(receiver.id);
        pairs.push({ giverId: giver.id, receiverId: receiver.id });
        if (solve(index + 1)) return true;
        taken.delete(receiver.id);
        pairs.pop();
      }
      return false;
    };

    if (solve(0)) return pairs;
  }

  throw new DrawError('Não foi possível encontrar uma combinação válida. Revise as famílias cadastradas.');
}
