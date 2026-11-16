import { api, session } from './api.js?v=2.0.1';
import { $, openDialog, setupDialogs, showError, toast, withBusy } from './dom.js?v=2.0.1';
import { initOrganizer, loadOverview, resetOrganizerView } from './organizer.js?v=2.0.1';
import { initPublic, renderPublic } from './public.js?v=2.0.1';

let organizerActive = false;

async function refreshPublic() {
  try {
    const state = await api.state();
    $('#eventTitle').textContent = `🎁 ${state.event.eventName}`;
    document.title = state.event.eventName;
    renderPublic(state);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function setOrganizerMode(active) {
  organizerActive = active;
  $('#organizerSection').hidden = !active;
  $('#lockedNote').hidden = active;
  $('#organizerBtn').textContent = active ? '📋 Ir para o painel' : '🔒 Área do organizador';
  if (!active) resetOrganizerView();
}

async function enterOrganizer() {
  setOrganizerMode(true);
  try {
    await loadOverview();
  } catch {
    // Sessão inválida: o evento "organizer:expired" já cuida da saída.
  }
}

function leaveOrganizer(message) {
  session.token = null;
  setOrganizerMode(false);
  if (message) toast(message, 'info');
}

function openAuth() {
  $('#authForm').reset();
  showError($('#authError'), '');
  openDialog($('#authDialog'));
  $('#authPassword').focus();
}

async function submitAuth(event) {
  event.preventDefault();
  const password = $('#authPassword').value;
  if (!password) return showError($('#authError'), 'Digite a senha do organizador.');
  try {
    const { token } = await withBusy(event.submitter ?? $('#authForm [type=submit]'), () => api.organizer.login(password));
    session.token = token;
    $('#authDialog').close();
    await enterOrganizer();
    $('#organizerSection').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    showError($('#authError'), err.message);
    $('#authPassword').select();
  }
}

function init() {
  setupDialogs();
  initPublic(refreshPublic);
  initOrganizer(refreshPublic);

  $('#authForm').addEventListener('submit', submitAuth);
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="open-auth"]')) openAuth();
  });

  $('#organizerBtn').addEventListener('click', () => {
    if (organizerActive) $('#organizerSection').scrollIntoView({ behavior: 'smooth' });
    else openAuth();
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await api.organizer.logout().catch(() => {});
    leaveOrganizer();
  });

  window.addEventListener('organizer:expired', () => leaveOrganizer('Sessão do organizador expirada. Entre novamente.'));

  setOrganizerMode(false);
  refreshPublic();
  if (session.token) enterOrganizer();
}

init();
