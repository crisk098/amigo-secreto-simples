import { api } from './api.js?v=2.0.1';
import { $, $$, avatar, clear, familyBadge, formatDateTime, h, openDialog, safeReplaceChildren, showError, toast, toTitleCase, withBusy } from './dom.js?v=2.0.1';

const LAYOUT_KEY = 'amigo-secreto:public-layout';
const view = {
  query: '',
  mode: 'all',
  layout: localStorage.getItem(LAYOUT_KEY) || 'grid',
  participants: [],
  event: {},
  draw: { active: false }
};
let refreshState = async () => {};

const normalize = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/* ---------- Renderização de Participantes (Cards e Lista) ---------- */
function visibleParticipants() {
  const query = normalize(view.query.trim());
  return view.participants.filter((p) => {
    if (view.mode === 'ready' && !p.hasPin) return false;
    if (view.mode === 'pending' && p.hasPin) return false;
    return !query || normalize(`${p.name} ${p.family} ${p.wishlist || ''}`).includes(query);
  });
}

function participantCard(p) {
  const displayName = toTitleCase(p.name);
  const actions = p.hasPin
    ? [
        h('button', { type: 'button', class: 'btn btn--primary', onclick: () => openReveal(p) }, '🎁 Ver meu amigo'),
        h('button', { type: 'button', class: 'btn', title: 'Alterar minha senha ou dados', 'aria-label': `Alterar dados de ${displayName}`, onclick: () => openClaim(p) }, '✏️')
      ]
    : [h('button', { type: 'button', class: 'btn btn--primary', onclick: () => openClaim(p) }, '👉 Criar minha senha')];

  const wishlistSection = p.wishlist
    ? h('div', { class: 'card__wishlist' },
        h('span', { class: 'card__wishlist-icon' }, '🎁'),
        h('div', { class: 'card__wishlist-content' },
          h('span', { class: 'card__wishlist-label' }, 'Desejo de presente:'),
          h('span', { class: 'card__wishlist-text' }, p.wishlist)))
    : null;

  return h(
    'article',
    { class: `card ${p.hasPin ? 'card--ready' : 'card--pending'}` },
    h('div', { class: 'card__head' },
      avatar(displayName),
      h('div', { class: 'card__title' },
        h('span', { class: 'card__name', title: displayName }, displayName),
        familyBadge(p.family))),
    h('span', { class: `status status--${p.hasPin ? 'ready' : 'pending'}` }, p.hasPin ? '🟢 Senha criada' : '🟡 Aguardando senha'),
    wishlistSection,
    h('div', { class: 'card__actions' }, actions)
  );
}

function participantListItem(p) {
  const displayName = toTitleCase(p.name);
  const actions = p.hasPin
    ? [
        h('button', { type: 'button', class: 'btn btn--primary btn--sm', onclick: () => openReveal(p) }, '🎁 Ver meu amigo'),
        h('button', { type: 'button', class: 'btn btn--sm', title: 'Alterar minha senha ou dados', 'aria-label': `Alterar dados de ${displayName}`, onclick: () => openClaim(p) }, '✏️')
      ]
    : [h('button', { type: 'button', class: 'btn btn--primary btn--sm', onclick: () => openClaim(p) }, '👉 Criar senha')];

  const wishlistContent = p.wishlist
    ? h('div', { class: 'list-item__wishlist' },
        h('strong', {}, '🎁 Dica: '),
        h('span', { style: 'font-style: italic;' }, p.wishlist))
    : h('div', { class: 'list-item__wishlist muted' }, 'Nenhuma sugestão de presente adicionada ainda.');

  return h(
    'div',
    { class: `list-item ${p.hasPin ? 'list-item--ready' : 'list-item--pending'}` },
    h('div', { class: 'list-item__main' },
      avatar(displayName),
      h('div', { class: 'list-item__info' },
        h('span', { class: 'list-item__name', title: displayName }, displayName),
        familyBadge(p.family))),
    wishlistContent,
    h('div', { class: 'list-item__actions' }, actions)
  );
}

function renderContainer() {
  const container = $('#participantsContainer');
  const items = visibleParticipants();
  clear(container);

  container.className = view.layout === 'list' ? 'view-list' : 'view-grid';

  if (!items.length) {
    container.append(
      h('div', { class: 'empty' },
        h('div', { class: 'empty__icon' }, '👥'),
        h('p', {}, view.participants.length ? 'Nenhum participante encontrado para esse filtro.' : 'A lista ainda está vazia. O organizador precisa adicionar os nomes.'))
    );
    return;
  }

  if (view.layout === 'list') {
    container.append(...items.map(participantListItem));
  } else {
    container.append(...items.map(participantCard));
  }
}

function renderStats() {
  const ready = view.participants.filter((p) => p.hasPin).length;
  const families = new Set(view.participants.map((p) => p.family.toLowerCase()).filter(Boolean));
  $('#statTotal').textContent = view.participants.length;
  $('#statReady').textContent = ready;
  $('#statPending').textContent = view.participants.length - ready;
  $('#statFamilies').textContent = families.size;
}

function renderBanner() {
  const banner = $('#drawBanner');
  banner.hidden = view.participants.length === 0;
  banner.className = `banner${view.draw.active ? ' banner--done' : ''}`;
  banner.textContent = view.draw.active
    ? `🎉 Sorteio realizado em ${formatDateTime(view.draw.date)}. Clique em “Ver meu amigo” e digite sua senha.`
    : '⏳ O sorteio ainda não foi realizado. Crie sua senha para estar pronto!';
}

function renderFamilyOptions() {
  const families = [...new Set(view.participants.map((p) => p.family).filter(Boolean))];
  safeReplaceChildren($('#familyOptions'), ...families.map((family) => h('option', { value: family })));
}

export function renderPublic({ event, participants, draw }) {
  Object.assign(view, { event, participants, draw });
  renderStats();
  renderBanner();
  renderContainer();
  renderFamilyOptions();
}

/* ---------- Criar / alterar senha ---------- */
let claimTarget = null;

function openClaim(p) {
  claimTarget = p;
  const displayName = toTitleCase(p.name);
  const changing = p.hasPin;
  $('#claimAvatar').replaceWith(Object.assign(avatar(displayName, true), { id: 'claimAvatar' }));
  $('#claimTitle').textContent = displayName;
  safeReplaceChildren($('#claimFamily'), familyBadge(p.family));
  $('#claimIntro').textContent = changing
    ? 'Para alterar seus dados, confirme a senha atual.'
    : 'Crie uma senha de 4 números para ver seu amigo secreto depois do sorteio.';
  $('#claimCurrentWrap').hidden = !changing;
  $('#claimPinLabel').textContent = changing ? 'Nova senha de 4 números' : 'Crie uma senha de 4 números';
  $('#claimForm').reset();
  showError($('#claimError'), '');
  openDialog($('#claimDialog'));
  $(changing ? '#claimCurrent' : '#claimPin').focus();
}

async function submitClaim(event) {
  event.preventDefault();
  if (!claimTarget) return;
  const pin = $('#claimPin').value.trim();
  if (!/^\d{4}$/.test(pin)) return showError($('#claimError'), 'A senha deve ter exatamente 4 números.');

  const wishlist = $('#claimWishlist').value.trim();
  const payload = { pin, email: $('#claimEmail').value.trim() };
  if (claimTarget.hasPin) payload.currentPin = $('#claimCurrent').value.trim();
  if (wishlist || !claimTarget.hasPin) payload.wishlist = wishlist;

  try {
    await withBusy(event.submitter ?? $('#claimForm button[type=submit]'), async () => {
      const result = await api.claim(claimTarget.id, payload);
      const { name } = claimTarget;
      const target = claimTarget;
      $('#claimDialog').close();
      await refreshState();
      toast(`Senha salva, ${name}! 🎉`, 'success');
      if (result.drawActive) openReveal({ ...target, hasPin: true });
    });
  } catch (err) {
    showError($('#claimError'), err.message);
  }
}

/* ---------- Ver amigo secreto ---------- */
let revealTarget = null;
let revealPin = '';

function resetReveal() {
  revealTarget = null;
  revealPin = '';
  $('#revealPin').value = '';
  $('#revealReceiver').textContent = '';
  $('#revealForm').hidden = false;
  $('#revealResult').hidden = true;
  showError($('#revealError'), '');
}

function openReveal(p) {
  resetReveal();
  revealTarget = p;
  const displayName = toTitleCase(p.name);
  $('#revealAvatar').replaceWith(Object.assign(avatar(displayName, true), { id: 'revealAvatar' }));
  $('#revealTitle').textContent = `Olá, ${displayName}!`;
  openDialog($('#revealDialog'));
  $('#revealPin').focus();
}

function renderRevealResult(data) {
  const secret = $('#revealSecret');
  const notice = $('#revealNotice');
  const tip = $('#revealReceiverWishlist');
  secret.hidden = notice.hidden = tip.hidden = true;

  if (data.status === 'revealed') {
    const receiverName = toTitleCase(data.receiver.name);
    $('#revealReceiver').textContent = `🎉 ${receiverName} 🎉`;
    secret.hidden = false;
    if (data.receiver.wishlist) {
      safeReplaceChildren(tip, h('strong', {}, '🎁 Dica de presente: '), data.receiver.wishlist);
      tip.hidden = false;
    }
  } else {
    notice.textContent =
      data.status === 'pending'
        ? '⏳ O sorteio ainda não foi realizado. Assim que acontecer, volte aqui para descobrir quem você tirou.'
        : 'Você foi adicionado depois do sorteio e não participa desta rodada. Fale com o organizador.';
    notice.hidden = false;
  }

  const { event } = data;
  safeReplaceChildren(
    $('#revealEvent'),
    h('div', {}, h('strong', {}, event.eventName)),
    event.suggestedBudget && h('div', {}, `💰 Valor sugerido: R$ ${event.suggestedBudget}`),
    event.eventDate && h('div', {}, `📅 ${event.eventDate}`),
    event.eventLocation && h('div', {}, `📍 ${event.eventLocation}`)
  );
  $('#wishlistInput').value = data.myWishlist ?? '';
  $('#wishlistForm').hidden = data.status === 'not_in_draw';
  $('#revealForm').hidden = true;
  $('#revealResult').hidden = false;
}

async function submitReveal(event) {
  event.preventDefault();
  if (!revealTarget) return;
  const pin = $('#revealPin').value.trim();
  if (!/^\d{4}$/.test(pin)) return showError($('#revealError'), 'Digite sua senha de 4 números.');
  try {
    const data = await withBusy(event.submitter ?? $('#revealForm button'), () => api.reveal(revealTarget.id, pin));
    revealPin = pin;
    renderRevealResult(data);
  } catch (err) {
    showError($('#revealError'), err.message);
    $('#revealPin').select();
  }
}

async function submitWishlist(event) {
  event.preventDefault();
  if (!revealTarget) return;
  try {
    await api.saveWishlist(revealTarget.id, revealPin, $('#wishlistInput').value);
    toast('Sugestão de presente salva!', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ---------- Inicialização ---------- */
export function initPublic(refresh) {
  refreshState = refresh;

  $('#searchInput').addEventListener('input', (e) => {
    view.query = e.target.value;
    renderContainer();
  });
  $$('[data-filter]').forEach((button) =>
    button.addEventListener('click', () => {
      view.mode = button.dataset.filter;
      $$('[data-filter]').forEach((b) => b.classList.toggle('is-active', b === button));
      renderContainer();
    })
  );

  // Controle de alternância de Layout (Cards / Lista)
  $$('[data-layout]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.layout === view.layout);
    button.addEventListener('click', () => {
      view.layout = button.dataset.layout;
      localStorage.setItem(LAYOUT_KEY, view.layout);
      $$('[data-layout]').forEach((b) => b.classList.toggle('is-active', b === button));
      renderContainer();
    });
  });

  $('#claimForm').addEventListener('submit', submitClaim);
  $('#revealForm').addEventListener('submit', submitReveal);
  $('#wishlistForm').addEventListener('submit', submitWishlist);
  $('#revealDialog').addEventListener('close', resetReveal);
  $('#claimDialog').addEventListener('close', () => {
    claimTarget = null;
    $('#claimForm').reset();
  });
}
