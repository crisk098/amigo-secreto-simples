const BULLET_RE = /^\s*(?:[-•*]|\d+[.)])\s+/;
const NO_FAMILY_RE = /^sem\s+(?:fam[ií]lia|grupo)$/i;
const FAMILY_PREFIX_RE = /^(?:fam[ií]lia|grupo)\s+/i;

function toFamily(raw) {
  const family = raw.trim();
  return NO_FAMILY_RE.test(family) ? '' : family;
}

/**
 * Interpreta uma lista colada pelo organizador. Formatos aceitos:
 *   Nome                      (usa a família do cabeçalho atual / padrão)
 *   Nome (Família)
 *   Nome - Família
 *   Nome, Família
 *   [Família Silva]           (cabeçalho)
 *   Família Silva:            (cabeçalho; "Sem família:" remove a restrição)
 *
 * @returns {{ name: string, family: string }[]}
 */
export function parseParticipantList(text, defaultFamily = '') {
  const results = [];
  let currentFamily = defaultFamily.trim();

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.replace(BULLET_RE, '').trim();
    if (!line) continue;

    const bracket = line.match(/^\[(.+)\]$/);
    if (bracket) {
      currentFamily = toFamily(bracket[1]);
      continue;
    }

    const colonHeader = line.match(/^(.+):$/);
    if (colonHeader) {
      const label = colonHeader[1].trim();
      currentFamily = NO_FAMILY_RE.test(label)
        ? ''
        : FAMILY_PREFIX_RE.test(label)
          ? label
          : `Família ${label}`;
      continue;
    }

    let name = line;
    let family = currentFamily;

    const paren = line.match(/^(.*?)\s*\((.+)\)$/);
    if (paren) {
      name = paren[1];
      family = toFamily(paren[2]);
    } else if (line.includes(' - ')) {
      const [first, ...rest] = line.split(' - ');
      name = first;
      family = toFamily(rest.join(' - '));
    } else if (line.includes(',')) {
      const [first, ...rest] = line.split(',');
      name = first;
      family = toFamily(rest.join(','));
    }

    name = name.trim();
    if (name) results.push({ name, family });
  }

  return results;
}
