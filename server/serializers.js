export const eventView = (config) => ({
  eventName: config.eventName,
  suggestedBudget: config.suggestedBudget,
  eventDate: config.eventDate,
  eventLocation: config.eventLocation
});

/** Visão pública: expõe apenas o necessário. Lista de desejos é pública para todos verem as sugestões. E-mail e hash permanecem estritamente privados. */
export const publicParticipant = (p) => ({
  id: p.id,
  name: p.name,
  family: p.family,
  wishlist: p.wishlist || '',
  hasPin: Boolean(p.pinHash)
});

export const organizerParticipant = (p) => ({
  ...publicParticipant(p),
  email: p.email,
  wishlist: p.wishlist,
  createdAt: p.createdAt
});

export const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });

export const drawSummary = (draw, participants) =>
  draw
    ? {
        active: true,
        date: draw.date,
        total: draw.pairs.length,
        outOfDraw: participants.filter((p) => !draw.pairs.some((pair) => pair.giverId === p.id)).length
      }
    : { active: false, date: null, total: 0, outOfDraw: 0 };
