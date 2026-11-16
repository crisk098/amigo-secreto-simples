import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DrawError, findOversizedFamily, runDraw } from '../server/lib/draw.js';
import { parseParticipantList } from '../server/lib/parser.js';

const person = (id, family = '') => ({ id: String(id), name: `P${id}`, family });

function assertValid(participants, pairs) {
  assert.equal(pairs.length, participants.length);
  assert.equal(new Set(pairs.map((p) => p.giverId)).size, participants.length);
  assert.equal(new Set(pairs.map((p) => p.receiverId)).size, participants.length);
  const byId = new Map(participants.map((p) => [p.id, p]));
  for (const { giverId, receiverId } of pairs) {
    assert.notEqual(giverId, receiverId, 'ninguém tira a si mesmo');
    const [g, r] = [byId.get(giverId), byId.get(receiverId)];
    if (g.family) assert.notEqual(g.family.toLowerCase(), r.family.toLowerCase(), 'mesma família');
  }
}

test('sorteio respeita regras em várias execuções', () => {
  const people = [
    person(1, 'Silva'), person(2, 'silva'), person(3, 'Silva'),
    person(4, 'Souza'), person(5, 'Souza'),
    person(6, 'Lima'), person(7, 'Lima'),
    person(8)
  ];
  for (let i = 0; i < 300; i++) assertValid(people, runDraw(people));
});

test('caso apertado: duas famílias de metade cada', () => {
  const people = [person(1, 'A'), person(2, 'A'), person(3, 'B'), person(4, 'B')];
  for (let i = 0; i < 100; i++) assertValid(people, runDraw(people));
});

test('rejeita menos de 3 participantes', () => {
  assert.throws(() => runDraw([person(1), person(2)]), DrawError);
});

test('rejeita família com mais da metade', () => {
  const people = [person(1, 'A'), person(2, 'A'), person(3, 'A'), person(4)];
  assert.equal(findOversizedFamily(people).count, 3);
  assert.throws(() => runDraw(people), /Impossível/);
});

test('parser: cabeçalhos, formatos inline e "sem família"', () => {
  const text = `
    Família Silva:
    Carlos
    - Mariana
    [Souza]
    1. Ana
    Sem Família:
    João
    Pedro (Lima)
    Lucas - Santos
    Bia, Costa
  `;
  assert.deepEqual(parseParticipantList(text), [
    { name: 'Carlos', family: 'Família Silva' },
    { name: 'Mariana', family: 'Família Silva' },
    { name: 'Ana', family: 'Souza' },
    { name: 'João', family: '' },
    { name: 'Pedro', family: 'Lima' },
    { name: 'Lucas', family: 'Santos' },
    { name: 'Bia', family: 'Costa' }
  ]);
});

test('parser: família padrão e linhas vazias', () => {
  assert.deepEqual(parseParticipantList('\n\nAna\n  \nBeto', 'Família X'), [
    { name: 'Ana', family: 'Família X' },
    { name: 'Beto', family: 'Família X' }
  ]);
});
