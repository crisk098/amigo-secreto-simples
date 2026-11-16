import { api, session } from './api.js?v=2.0.1';
import { $, $$, clear, confirmDialog, familyBadge, h, openDialog, safeReplaceChildren, showError, toast, toTitleCase, withBusy } from './dom.js?v=2.0.1';

let overview = null;
let refreshPublic = async () => {};
let editingId = null;

/** Executa uma ação da API exibindo erros como toast. Retorna undefined em caso de falha. */
async function run(task) {
  try {
    return await task();
  } catch (err) {
    toast(err.message, 'error');
    return undefined;
  }
}

function applyOverview(next) {
  overview = next;
  render();
}

export async function loadOverview() {
  const data = await api.organizer.overview();
  applyOverview(data);
}

/* ---------- Render ---------- */
function render() {
  if (!overview) return;
  renderShare();
  renderWarning();
  renderTable();
  renderSettings();
  renderDraw();
}

function renderShare() {
  $('#shareUrl').value = overview.event.publicBaseUrl || window.location.origin;
}

function renderWarning() {
  const box = $('#familyWarning');
  const family = overview.oversizedFamily;
  box.hidden = !family;
  if (family) {
    box.textContent = `⚠️ A família “${family.name}” tem ${family.count} pessoas — mais da metade dos ${overview.participants.length} participantes. Adicione pessoas de outros grupos para o sorteio ser possível.`;
  }
}

function renderTable() {
  const body = $('#participantsTable');
  clear(body);
  if (!overview.participants.length) {
    body.append(
      h('tr', {}, h('td', { class: 'table__empty', colSpan: 6 },
        'Nenhum participante ainda. ',
        h('button', { type: 'button', class: 'link', onclick: loadSample }, 'Carregar exemplo com 8 pessoas')))
    );
    return;
  }
  const locked = overview.draw.active;
  for (const p of overview.participants) {
    const displayName = toTitleCase(p.name);
    body.append(
      h('tr', {},
        h('td', {}, h('strong', {}, displayName)),
        h('td', {}, familyBadge(p.family)),
        h('td', {}, p.wishlist ? h('span', { title: p.wishlist }, `🎁 ${p.wishlist}`) : h('span', { class: 'muted' }, '—')),
        h('td', {}, p.email || h('span', { class: 'muted' }, '—')),
        h('td', {}, p.hasPin ? '🟢 Criada' : '🟡 Pendente'),
        h('td', { class: 'table__actions' },
          h('button', { type: 'button', class: 'btn btn--sm', onclick: () => openPersonDialog(p) }, 'Editar'),
          ' ',
          p.hasPin && h('button', { type: 'button', class: 'btn btn--sm', title: 'Remove a senha para a pessoa criar outra', onclick: () => resetPin(p) }, 'Redefinir senha'),
          p.hasPin && ' ',
          h('button', { type: 'button', class: 'btn btn--sm btn--danger-ghost', disabled: locked, title: locked ? 'Cancele o sorteio para remover pessoas' : 'Remover', 'aria-label': `Remover ${displayName}`, onclick: () => removePerson(p) }, 'Remover')))
    );
  }
}

function renderSettings() {
  const form = $('#settingsForm');
  const { event } = overview;
  if (!form.dataset.loaded) {
    for (const key of ['eventName', 'suggestedBudget', 'eventDate', 'eventLocation', 'publicBaseUrl']) {
      form.elements[key].value = event[key] ?? '';
    }
    form.dataset.loaded = 'true';
  }
  const { configured, sender } = overview.email;
  $('#emailStatus').className = `alert ${configured ? 'alert--ok' : 'alert--info'} field--wide`;
  $('#emailStatus').textContent = configured
    ? `✅ SMTP configurado (${sender}). Você pode enviar o resultado por e-mail ao sortear.`
    : 'ℹ️ E-mail não configurado — tudo funciona pelo site com a senha de 4 dígitos. Para ativar, defina as variáveis SMTP_* no arquivo .env e reinicie o servidor.';
  $('#testEmailBtn').disabled = !configured;
}

function checklistItem(kind, text) {
  return h('li', { class: kind }, `${{ ok: '✅', bad: '❌', info: 'ℹ️' }[kind]} ${text}`);
}

function renderDraw() {
  const { participants, draw, oversizedFamily, email } = overview;
  const ready = participants.filter((p) => p.hasPin).length;
  const enough = participants.length >= 3;
  const canDraw = enough && !oversizedFamily;

  const items = [
    enough
      ? checklistItem('ok', `${participants.length} participantes (mínimo de 3).`)
      : checklistItem('bad', `Apenas ${participants.length} participante(s) — são necessários ao menos 3.`),
    checklistItem('info', `${ready} de ${participants.length} já criaram senha. Os demais podem criar depois do sorteio.`),
    oversizedFamily
      ? checklistItem('bad', `A família “${oversizedFamily.name}” tem mais da metade dos participantes.`)
      : checklistItem('ok', 'Nenhuma família ocupa mais da metade da lista.')
  ];
  if (draw.active && draw.outOfDraw > 0) {
    items.push(checklistItem('bad', `${draw.outOfDraw} pessoa(s) foram adicionadas após o sorteio e não participam. Refaça o sorteio.`));
  }
  safeReplaceChildren($('#checklist'), ...items);

  $('#sendEmailsWrap').hidden = !email.configured;
  const drawBtn = $('#drawBtn');
  drawBtn.disabled = !canDraw;
  drawBtn.textContent = draw.active ? '🎲 Refazer sorteio (substitui o atual)' : '🚀 Realizar sorteio';
  $('#cancelDrawBtn').hidden = !draw.active;

  const key = $('#answerKey');
  key.hidden = !draw.active;
  if (draw.active) {
    safeReplaceChildren(
      $('#answerKeyList'),
      ...participants.map((p) => {
        const displayName = toTitleCase(p.name);
        const slot = h('span', {}, h('button', { type: 'button', class: 'btn btn--sm', onclick: () => revealPair(p, slot) }, '👁️ Revelar'));
        return h('li', {}, h('strong', {}, `👤 ${displayName} tirou`), slot);
      })
    );
  } else {
    $('#drawReport').hidden = true;
  }
}

/* ---------- Ações: participantes ---------- */
async function loadSample() {
  const data = await run(() => api.organizer.loadSample());
  if (data) {
    applyOverview(data);
    await refreshPublic();
  }
}

async function resetPin(p) {
  const ok = await confirmDialog({
    title: 'Redefinir senha?',
    message: `${p.name} poderá criar uma nova senha de 4 dígitos.`,
    confirmLabel: 'Redefinir'
  });
  if (!ok) return;
  const data = await run(() => api.organizer.resetPin(p.id));
  if (data) {
    applyOverview(data);
    await refreshPublic();
    toast('Senha redefinida.', 'success');
  }
}

async function removePerson(p) {
  const ok = await confirmDialog({ title: 'Remover participante?', message: `${p.name} será removido da lista.`, confirmLabel: 'Remover', danger: true });
  if (!ok) return;
  const data = await run(() => api.organizer.removeParticipant(p.id));
  if (data) {
    applyOverview(data);
    await refreshPublic();
  }
}

async function clearAll() {
  if (!overview.participants.length) return;
  const ok = await confirmDialog({
    title: 'Apagar todos os participantes?',
    message: 'Todos os participantes e o sorteio atual serão apagados. Esta ação não pode ser desfeita.',
    confirmLabel: 'Apagar tudo',
    danger: true
  });
  if (!ok) return;
  const data = await run(() => api.organizer.clearParticipants());
  if (data) {
    applyOverview(data);
    await refreshPublic();
  }
}

function openPersonDialog(person = null) {
  editingId = person?.id ?? null;
  const form = $('#personForm');
  form.reset();
  $('#personTitle').textContent = person ? 'Editar participante' : 'Adicionar participante';
  form.elements.name.value = person?.name ?? '';
  form.elements.family.value = person?.family ?? '';
  form.elements.email.value = person?.email ?? '';
  showError($('#personError'), '');
  openDialog($('#personDialog'));
  form.elements.name.focus();
}

async function submitPerson(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = { name: form.elements.name.value, family: form.elements.family.value, email: form.elements.email.value };
  try {
    const data = await withBusy(event.submitter ?? form.querySelector('[type=submit]'), () =>
      editingId ? api.organizer.updateParticipant(editingId, payload) : api.organizer.addParticipant(payload)
    );
    $('#personDialog').close();
    applyOverview(data);
    await refreshPublic();
  } catch (err) {
    showError($('#personError'), err.message);
  }
}

async function submitBulk(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const data = await withBusy(event.submitter ?? form.querySelector('[type=submit]'), () =>
      api.organizer.importList({ text: form.elements.text.value, defaultFamily: form.elements.defaultFamily.value })
    );
    $('#bulkDialog').close();
    form.reset();
    applyOverview(data);
    await refreshPublic();
    const skipped = data.skipped.length ? ` (${data.skipped.length} já existiam: ${data.skipped.join(', ')})` : '';
    toast(`${data.added} pessoa(s) adicionada(s)${skipped}.`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ---------- Ações: configurações ---------- */
async function submitSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const data = await run(() => withBusy(event.submitter ?? form.querySelector('[type=submit]'), () => api.organizer.saveConfig(values)));
  if (!data) return;
  if (data.token) session.token = data.token;
  form.elements.currentPassword.value = '';
  form.elements.newPassword.value = '';
  delete form.dataset.loaded;
  applyOverview(data);
  await refreshPublic();
  toast('Configurações salvas.', 'success');
}

async function sendTestEmail() {
  const to = $('#testEmailTo').value.trim();
  const result = await run(() => withBusy($('#testEmailBtn'), () => api.organizer.testEmail(to)));
  if (result) toast(result.message, 'success');
}

/* ---------- Ações: sorteio ---------- */
async function executeDraw() {
  const replacing = overview.draw.active;
  const ok = await confirmDialog({
    title: replacing ? 'Refazer o sorteio?' : 'Realizar o sorteio?',
    message: replacing
      ? 'O resultado atual será substituído por um novo. Quem já viu o amigo secreto verá outro nome.'
      : 'Os participantes poderão ver o resultado digitando a senha de 4 dígitos.',
    confirmLabel: replacing ? 'Refazer' : 'Sortear'
  });
  if (!ok) return;

  const sendEmails = overview.email.configured && $('#sendEmails').checked;
  const data = await run(() => withBusy($('#drawBtn'), () => api.organizer.draw(sendEmails)));
  if (!data) return;
  applyOverview(data);
  renderReport(data.report);
  await refreshPublic();
  toast('Sorteio realizado! 🎉', 'success');
}

function renderReport(report) {
  const labels = {
    email_sent: '✉️ E-mail enviado',
    email_failed: '⚠️ Falha no e-mail — use o site',
    site: null
  };
  const readyIds = new Set(overview.participants.filter((p) => p.hasPin).map((p) => p.id));
  const box = $('#drawReport');
  safeReplaceChildren(
    box,
    h('h3', {}, '📊 Relatório do sorteio'),
    h('ul', { class: 'report__list' },
      report.map((entry) =>
        h('li', {}, h('strong', {}, toTitleCase(entry.name)),
          h('span', { class: 'muted' }, labels[entry.status] ?? (readyIds.has(entry.id) ? '✅ Pronto para consultar no site' : '🟡 Precisa criar senha no site'))))
    )
  );
  box.hidden = false;
}

async function cancelDraw() {
  const ok = await confirmDialog({
    title: 'Cancelar o sorteio?',
    message: 'Os participantes deixarão de ver o resultado até você sortear novamente.',
    confirmLabel: 'Cancelar sorteio',
    danger: true
  });
  if (!ok) return;
  const data = await run(() => api.organizer.cancelDraw());
  if (data) {
    applyOverview(data);
    await refreshPublic();
  }
}

async function revealPair(person, slot) {
  const data = await run(() => api.organizer.revealPair(person.id));
  if (!data) return;
  const receiverName = toTitleCase(data.receiverName);
  safeReplaceChildren(
    slot,
    h('span', { class: 'secret-chip' }, `🎉 ${receiverName}`),
    ' ',
    h('button', { type: 'button', class: 'btn btn--sm', onclick: () => revealButton(person, slot) }, '🔒')
  );
}

function revealButton(person, slot) {
  safeReplaceChildren(slot, h('button', { type: 'button', class: 'btn btn--sm', onclick: () => revealPair(person, slot) }, '👁️ Revelar'));
}

/* ---------- Abas e inicialização ---------- */
function selectTab(name) {
  $$('[data-tab]').forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
    $(`#pane-${tab.dataset.tab}`).hidden = !active;
  });
}

export function resetOrganizerView() {
  overview = null;
  selectTab('participants');
  delete $('#settingsForm').dataset.loaded;
}

export function initOrganizer(refresh) {
  refreshPublic = refresh;

  $$('[data-tab]').forEach((tab) => tab.addEventListener('click', () => selectTab(tab.dataset.tab)));

  $('#pane-participants').addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'open-bulk') openDialog($('#bulkDialog'));
    if (action === 'open-single') openPersonDialog();
    if (action === 'clear-all') clearAll();
  });

  $('#personForm').addEventListener('submit', submitPerson);
  $('#bulkForm').addEventListener('submit', submitBulk);
  $('#settingsForm').addEventListener('submit', submitSettings);
  $('#testEmailBtn').addEventListener('click', sendTestEmail);
  $('#drawBtn').addEventListener('click', executeDraw);
  $('#cancelDrawBtn').addEventListener('click', cancelDraw);

  $('#copyLinkBtn').addEventListener('click', async () => {
    const link = $('#shareUrl').value;
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copiado! Envie para os participantes.', 'success');
    } catch {
      $('#shareUrl').select();
      toast('Selecione e copie o link manualmente (Ctrl+C).', 'info');
    }
  });
}
