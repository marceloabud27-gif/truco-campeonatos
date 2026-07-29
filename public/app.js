const state = {
  token: localStorage.getItem('truco_admin_token'),
  torneos: [],
  historial: [],
  selectedFixtureId: null,
  selectedPositionsId: null,
  currentDetail: null,
  lastFinishedDetail: null,
  selectedHistoryTournament: null,
  pendingHistoryDeleteId: null,
  pendingDeleteAllHistory: false,
  installPromptEvent: null,
};

const MODES = {
  americano_parejas_fijas: {
    min: 4,
    initialRows: 4,
    summary: 'Carga parejas fijas. Todos contra todos, partidos a 18 puntos, victoria 3 pts.',
  },
  americano_individual: {
    min: 7,
    initialRows: 10,
    summary: 'Carga un jugador por fila. El alias es opcional.',
  },
  americano_individual_1v1: {
    min: 2,
    initialRows: 8,
    summary: 'Carga jugadores por fila. El fixture sera todos contra todos, 1 vs 1.',
  },
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const PUBLIC_MODE = new URLSearchParams(window.location.search).get('public');
const INSTALL_BANNER_DISMISSED_KEY = 'truco_install_banner_dismissed';

function isAdmin() {
  return Boolean(state.token);
}

function isFixturePublicMode() {
  return PUBLIC_MODE === 'fixture';
}

function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  return fetch(path, { ...options, headers }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) {
        clearAdminSession();
        openLoginDialog();
      }
      throw new Error(payload.message || 'Operacion rechazada.');
    }
    return payload;
  });
}

function clearAdminSession() {
  localStorage.removeItem('truco_admin_token');
  state.token = null;
  applyAuthUi();
}

function openLoginDialog() {
  const dialog = $('#loginDialog');
  if (dialog && !dialog.open) {
    dialog.showModal();
  }
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  window.setTimeout(() => element.classList.remove('show'), 2400);
}

function updateLiveStatus() {
  const now = new Intl.DateTimeFormat('es-PY', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date());
  $('#liveStatus').textContent = `En vivo - actualizado ${now}`;
}

function applyAuthUi() {
  document.body.classList.toggle('fixture-public-mode', isFixturePublicMode());
  document.body.classList.toggle('spectator-fixture-only', !isAdmin());
  $$('.admin-only').forEach((element) => {
    element.classList.toggle('is-hidden', !isAdmin());
  });
  $('#loginToggle').textContent = isAdmin() ? 'Admin activo' : 'Admin';
  $('.bottom-nav').style.gridTemplateColumns = isAdmin() ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)';
  if (!isAdmin() && !$('#fixtureView').classList.contains('active')) {
    switchView('fixtureView');
  }
  if (isFixturePublicMode() && !isAdmin()) {
    switchView('fixtureView');
  }
}

function polishModeCards() {
  const copy = {
    americano_parejas_fijas: ['Paraguayo Express Parejas', '4+ parejas · todos contra todos · 18 pts', '♣'],
    americano_individual: ['Americano Individual', 'Rotativo · desde 7 jugadores', '♠'],
    americano_individual_1v1: ['Individual 1 vs 1', 'Todos contra todos · mano a mano', '♦'],
  };

  $$('[data-mode-pick]').forEach((button) => {
    const [title, subtitle, icon] = copy[button.dataset.modePick] || [];
    if (!title) return;
    button.innerHTML = `
      <span class="mode-card-icon" aria-hidden="true">${icon}</span>
      <span class="mode-card-copy">
        <strong>${title}</strong>
        <span>${subtitle}</span>
      </span>
    `;
  });
}

function setCreateMode(mode) {
  $('#createMode').value = mode;
  $('#modeSummary').textContent = MODES[mode].summary;
  $$('[data-mode-pick]').forEach((button) => {
    button.classList.toggle('active', button.dataset.modePick === mode);
  });
  renderParticipantRows(mode);
}

function renderParticipantRows(mode, count = MODES[mode].initialRows) {
  $('#participantsRows').innerHTML = Array.from({ length: count }, (_, index) => participantRowTemplate(mode, index)).join('');
  updateParticipantButtonText(mode);
}

function participantRowTemplate(mode, index) {
  const number = index + 1;
  if (mode === 'americano_parejas_fijas') {
    return `
      <div class="participant-row" data-participant-row>
        <span class="participant-number">${number}</span>
        <div class="participant-fields pair">
          <input data-pair-team type="text" placeholder="Equipo ${number}">
          <input data-pair-player-one type="text" placeholder="Jugador 1">
          <input data-pair-player-two type="text" placeholder="Jugador 2">
        </div>
      </div>
    `;
  }

  return `
    <div class="participant-row" data-participant-row>
      <span class="participant-number">${number}</span>
      <div class="participant-fields">
        <input data-player-name type="text" placeholder="Nombre del jugador ${number}">
      </div>
    </div>
  `;
}

function addParticipantRow() {
  const mode = $('#createMode').value || 'americano_parejas_fijas';
  const rows = $$('[data-participant-row]');
  $('#participantsRows').insertAdjacentHTML('beforeend', participantRowTemplate(mode, rows.length));
}

function updateParticipantButtonText(mode) {
  $('#addParticipantButton').textContent = mode === 'americano_parejas_fijas'
    ? 'Agregar pareja'
    : 'Agregar jugador';
}

function switchView(id) {
  $$('.view').forEach((view) => view.classList.toggle('active', view.id === id));
  $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === id));
}

async function loadTorneos() {
  state.torneos = await api('/api/torneos');
  renderTournamentSelects();
  await refreshSelectedViews();
  updateLiveStatus();
}

function renderTournamentSelects() {
  const previousFixtureId = state.selectedFixtureId || Number($('#fixtureTournamentSelect').value) || null;
  const previousPositionsId = state.selectedPositionsId || Number($('#positionsTournamentSelect').value) || null;
  const activos = state.torneos.filter((torneo) => torneo.estado === 'activo');
  const options = activos.map((torneo) => `<option value="${torneo.id}">${torneo.nombre_torneo}</option>`).join('');
  $('#fixtureTournamentSelect').innerHTML = options || '<option value="">Sin torneos activos</option>';
  $('#positionsTournamentSelect').innerHTML = options || '<option value="">Sin torneos activos</option>';

  const fixtureStillExists = activos.some((torneo) => torneo.id === previousFixtureId);
  const positionsStillExists = activos.some((torneo) => torneo.id === previousPositionsId);

  if (fixtureStillExists) {
    $('#fixtureTournamentSelect').value = String(previousFixtureId);
  }
  if (positionsStillExists) {
    $('#positionsTournamentSelect').value = String(previousPositionsId);
  }

  state.selectedFixtureId = Number($('#fixtureTournamentSelect').value) || null;
  state.selectedPositionsId = Number($('#positionsTournamentSelect').value) || null;
}

async function refreshLiveData() {
  if (isAdmin() && $('#loadView').classList.contains('active')) {
    updateLiveStatus();
    return;
  }

  try {
    state.torneos = await api('/api/torneos');
    renderTournamentSelects();
    await refreshSelectedViews();
    updateLiveStatus();
  } catch (error) {
    // El refresco en vivo no debe interrumpir a los espectadores si la red cae un instante.
  }
}

async function refreshSelectedViews() {
  if (state.selectedFixtureId) {
    const detail = await api(`/api/torneos/${state.selectedFixtureId}`);
    state.currentDetail = detail;
    renderFixture(detail);
    if (isAdmin()) {
      renderLoadMatches(detail);
    }
  } else {
    $('#fixtureContent').innerHTML = emptyCard('No hay fixtures activos.');
    $('#matchSelect').innerHTML = '';
  }

  if (isAdmin() && state.selectedPositionsId) {
    renderPositions(await api(`/api/torneos/${state.selectedPositionsId}`));
  } else {
    $('#positionsContent').innerHTML = emptyCard('No hay posiciones disponibles.');
  }

  if (isAdmin()) {
    await renderHistory();
  } else {
    state.historial = [];
    $('#historyContent').innerHTML = '';
  }
}

function emptyCard(text) {
  return `<div class="card"><p class="meta">${text}</p></div>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderFixture(detail) {
  const { torneo, partidos } = detail;
  if (!partidos.length) {
    $('#fixtureContent').innerHTML = emptyCard('Fixture pendiente de generacion.');
    return;
  }

  if (isFixturePublicMode() && !isAdmin()) {
    renderPublicFixturePremium(detail);
    return;
  }

  const grouped = groupBy(partidos, (partido) => partido.ronda);
  const upcoming = renderUpcomingMatches(detail, grouped);
  const rounds = Object.entries(grouped).map(([ronda, items]) => `
    <section class="round-card cup-round-card">
      <div class="round-header cup-round-header">
        <div>
          <span class="round-kicker">Ronda</span>
          <p class="round-title">${ronda}</p>
        </div>
        ${torneo.modalidad !== 'americano_parejas_fijas' ? renderWaitingPlayers(detail, items) : ''}
      </div>
      <div class="match-grid">
        ${visibleRoundMatches(torneo.modalidad, items)
          .map((partido, index) => fixtureRowForMode(torneo.modalidad, partido, index))
          .join('')}
      </div>
    </section>
  `).join('');

  $('#fixtureContent').innerHTML = `
    <div class="cup-board">
      ${renderOfficialShowpiece(torneo)}
      ${upcoming}
      <div class="cup-rounds">
        ${rounds}
      </div>
    </div>
  `;
}

function renderPublicFixturePremium(detail) {
  const { torneo, partidos } = detail;
  const grouped = groupBy(partidos, (partido) => partido.ronda);
  const upcomingRound = getUpcomingRound(grouped);
  const historicalRounds = Object.entries(grouped)
    .sort(([roundA], [roundB]) => Number(roundA) - Number(roundB))
    .map(([ronda, items]) => ({ ronda, items }));

  $('#fixtureContent').innerHTML = `
    ${renderPwaInstallBanner()}
    <article class="relative overflow-hidden rounded-[28px] border border-[#c5a85c]/30 bg-[linear-gradient(180deg,rgba(9,32,23,.98),rgba(3,15,11,.99))] px-4 pb-6 pt-5 shadow-[0_28px_70px_rgba(0,0,0,0.42),inset_0_0_0_1px_rgba(255,255,255,0.04)] sm:px-6 sm:pb-7 sm:pt-7">
      <div class="pointer-events-none absolute inset-0 opacity-[0.10] [background-image:linear-gradient(90deg,rgba(255,255,255,.30)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,.24)_1px,transparent_1px)] [background-size:58px_58px]"></div>
      <div class="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_50%_22%,rgba(245,211,126,.24),rgba(18,71,45,.22)_38%,transparent_72%)]"></div>

      ${renderOfficialShowpiece(torneo)}

      <div class="relative z-[1] mt-7 sm:mt-8">
        ${renderPublicUpcomingPremium(detail, upcomingRound)}
      </div>

      <div class="relative z-[1] mt-8 border-t border-[#c5a85c]/18 pt-7">
        ${historicalRounds.map(({ ronda, items }) => renderPublicRoundPreview(detail, ronda, items)).join('')}
      </div>
    </article>
  `;
}

function renderPwaInstallBanner() {
  if (!shouldShowInstallBanner()) {
    return '';
  }

  const isAppleMobile = isIosDevice();
  const buttonLabel = state.installPromptEvent ? 'Instalar' : (isAppleMobile ? 'Como instalar' : 'Instalar');
  const helperText = isAppleMobile
    ? 'Compartir > Agregar a pantalla de inicio'
    : 'Acceso directo al fixture';

  return `
    <section class="relative z-[2] mb-4 grid grid-cols-[3.25rem_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-[18px] border border-[#c5a85c]/45 bg-[linear-gradient(120deg,rgba(18,21,21,.96),rgba(7,18,13,.95))] p-3 shadow-[0_18px_34px_rgba(0,0,0,.28),inset_0_1px_0_rgba(255,255,255,.06)] sm:mb-5 sm:grid-cols-[3.75rem_minmax(0,1fr)_auto_auto] sm:p-3.5">
      <img src="/assets/pwa/icon-192.png?v=20260724" alt="" aria-hidden="true" class="h-12 w-12 rounded-[13px] border border-[#c5a85c]/35 object-cover shadow-[0_10px_20px_rgba(0,0,0,.28)] sm:h-14 sm:w-14">
      <div class="min-w-0">
        <p class="truncate font-serif text-[1.18rem] font-bold leading-tight text-[#f4dfaa] sm:text-[1.32rem]">Instalá La Cofradía</p>
        <p class="mt-0.5 text-[.76rem] font-semibold leading-tight text-white/62 sm:text-[.86rem]">${helperText}</p>
      </div>
      <button type="button" data-install-pwa class="rounded-[10px] border border-[#f4dfaa]/40 bg-[linear-gradient(180deg,#ffe7a0,#b78228)] px-3.5 py-2 text-[.82rem] font-black text-[#17100a] shadow-[0_10px_20px_rgba(0,0,0,.26),inset_0_1px_0_rgba(255,255,255,.52)] sm:px-4 sm:text-[.9rem]">${buttonLabel}</button>
      <button type="button" data-dismiss-install-banner aria-label="Cerrar aviso de instalacion" class="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[.03] text-xl leading-none text-[#f4dfaa]/80">×</button>
    </section>
  `;
}

function shouldShowInstallBanner() {
  return isFixturePublicMode()
    && !isAdmin()
    && !isPwaStandalone()
    && localStorage.getItem(INSTALL_BANNER_DISMISSED_KEY) !== '1';
}

function isPwaStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');
}

function renderOfficialShowpiece(torneo) {
  return `
    <header class="relative z-[1] overflow-hidden rounded-[24px] border border-[#c5a85c]/55 bg-[#06150f] p-1.5 shadow-[0_22px_48px_rgba(0,0,0,.38),inset_0_0_0_1px_rgba(255,245,190,.08)] sm:rounded-[28px] sm:p-2">
      <img
        src="/assets/fixture-oficial-card.png?v=20260724-admin-luxury"
        alt="Fixture oficial ${escapeHtml(torneo.nombre_torneo)}"
        class="block aspect-[641/475] w-full rounded-[20px] object-cover shadow-[inset_0_0_0_1px_rgba(255,245,190,.08)] sm:rounded-[24px]"
        loading="eager"
      >
    </header>
  `;
}

function getUpcomingRound(grouped) {
  return Object.entries(grouped)
    .sort(([roundA], [roundB]) => Number(roundA) - Number(roundB))
    .map(([ronda, items]) => ({
      ronda,
      matches: items
        .filter((partido) => partido.estado !== 'finalizado' && !partido.es_fecha_libre)
        .map((partido, index) => ({ partido, index })),
      allItems: items,
    }))
    .find((round) => round.matches.length);
}

function visibleRoundMatches(modalidad, items) {
  if (modalidad === 'americano_parejas_fijas') {
    return items.filter((partido) => !partido.es_fecha_libre);
  }
  return items;
}

function renderOfficialPlaque() {
  return `
    <div class="relative z-[2] grid min-h-[58px] w-[82%] max-w-[32rem] place-items-center rounded-[12px] bg-[linear-gradient(100deg,#7d4d18_0%,#c99133_18%,#ffe9a3_45%,#d0a14c_60%,#9a5e1d_100%)] px-6 py-3 text-[#160f08] shadow-[0_18px_28px_rgba(0,0,0,.38),inset_0_2px_0_rgba(255,255,255,.5),inset_0_-2px_0_rgba(70,43,13,.34),inset_0_0_0_1px_rgba(255,242,184,.28)] [clip-path:polygon(4%_0,96%_0,96%_18%,100%_18%,100%_82%,96%_82%,96%_100%,4%_100%,4%_82%,0_82%,0_18%,4%_18%)] sm:min-h-[70px] sm:w-[78%] sm:px-8">
      <span class="pointer-events-none absolute inset-x-8 top-2 h-px bg-white/45"></span>
      <span class="pointer-events-none absolute inset-x-10 bottom-2 h-px bg-[#5b3713]/35"></span>
      <span class="absolute left-4 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[#6c471a]/55 shadow-[inset_0_1px_1px_rgba(255,255,255,.42),0_1px_2px_rgba(0,0,0,.24)]"></span>
      <span class="absolute right-4 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[#6c471a]/55 shadow-[inset_0_1px_1px_rgba(255,255,255,.42),0_1px_2px_rgba(0,0,0,.24)]"></span>
      <span class="text-center text-[clamp(1.04rem,4.2vw,1.9rem)] font-black uppercase tracking-[0.08em] drop-shadow-[0_1px_0_rgba(255,255,255,.28)]">Fixture Oficial</span>
    </div>
  `;
}

function renderPremiumIdentitySeal() {
  return `
    <div class="pointer-events-none absolute left-1/2 top-[1.35rem] z-[1] h-[15rem] w-[15rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(245,211,126,.28),rgba(25,82,51,.10)_48%,transparent_72%)] opacity-95 blur-[1px] sm:h-[18rem] sm:w-[18rem]"></div>
    <img
      src="/assets/pwa/icon-512.png?v=20260724"
      alt=""
      aria-hidden="true"
      class="pointer-events-none relative z-[2] h-[10.5rem] w-[10.5rem] rounded-[2rem] object-contain opacity-[0.74] mix-blend-screen drop-shadow-[0_28px_44px_rgba(197,168,92,.35)] sm:h-[13rem] sm:w-[13rem]"
    >
  `;
}

function renderLuxuryOfficialPlaque() {
  return `
    <div class="relative z-[3] -mt-6 grid min-h-[72px] w-[96%] max-w-[36rem] place-items-center rounded-[14px] border border-[#dcbf72]/75 bg-[linear-gradient(100deg,#14100b_0%,#2a241b_15%,#72521f_32%,#f6df9a_50%,#8b6426_68%,#17120c_100%)] p-[2px] shadow-[0_20px_34px_rgba(0,0,0,.46),0_0_26px_rgba(197,168,92,.22)] [clip-path:polygon(4%_0,96%_0,96%_13%,100%_13%,100%_87%,96%_87%,96%_100%,4%_100%,4%_87%,0_87%,0_13%,4%_13%)] sm:min-h-[86px] sm:w-[92%]">
      <div class="relative grid h-full min-h-[68px] w-full place-items-center rounded-[12px] bg-[linear-gradient(180deg,rgba(20,19,17,.98),rgba(9,10,9,.98))] px-7 py-3 text-[#f7e5ad] shadow-[inset_0_0_0_1px_rgba(255,235,170,.28),inset_0_10px_22px_rgba(255,255,255,.05)] sm:min-h-[82px]">
        <span class="pointer-events-none absolute inset-x-7 top-2 h-px bg-[#fff0b8]/45"></span>
        <span class="pointer-events-none absolute inset-x-8 bottom-2 h-px bg-[#7b571f]/55"></span>
        <span class="absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff0b8,#9d6d28_68%,#3e260d)]"></span>
        <span class="absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff0b8,#9d6d28_68%,#3e260d)]"></span>
        <span class="text-center font-serif text-[clamp(1.45rem,5.45vw,2.7rem)] font-black uppercase tracking-[0.08em] text-[#f4dfaa] drop-shadow-[0_2px_0_rgba(0,0,0,.7),0_0_14px_rgba(245,211,126,.28)]">Fixture Oficial</span>
      </div>
    </div>
  `;
}

function renderPremiumTrophy() {
  return `
    <img
      src="/assets/copa-referencia.png?v=20260519"
      alt=""
      aria-hidden="true"
      class="relative z-[3] mt-4 h-[52px] w-auto object-contain drop-shadow-[0_13px_16px_rgba(0,0,0,.36)] sm:h-[64px]"
    >
  `;
}

function renderPublicUpcomingPremium(detail, upcomingRound) {
  if (!upcomingRound) {
    return `
      <section class="rounded-[22px] border border-[#c5a85c]/25 bg-[#1d2426]/95 p-6 shadow-[0_18px_34px_rgba(0,0,0,.24)]">
        <p class="text-sm font-black uppercase tracking-wide text-[#e4c56f]">Estado</p>
        <h2 class="mt-2 font-serif text-4xl font-extrabold text-[#f5e3b1]">Fixture completo</h2>
      </section>
    `;
  }

  return `
    <section class="rounded-[24px] border border-[#9f6f2a]/62 bg-[radial-gradient(circle_at_50%_0%,rgba(174,124,42,.13),transparent_38%),linear-gradient(180deg,rgba(16,17,15,.99),rgba(5,7,6,.995))] p-4 shadow-[0_24px_42px_rgba(0,0,0,.46),inset_0_0_0_1px_rgba(255,231,160,.05)] sm:p-5">
      <div class="text-center">
        <p class="flex items-center justify-center gap-3 text-[.92rem] font-black uppercase tracking-[0.10em] text-[#d9b65e] before:h-px before:w-10 before:bg-[#8f6426]/70 after:h-px after:w-10 after:bg-[#8f6426]/70 sm:text-[1rem]">Proximos partidos</p>
        <h2 class="mt-2 font-serif text-[3rem] font-extrabold leading-none text-[#f3d994] drop-shadow-[0_4px_10px_rgba(0,0,0,.72),0_0_16px_rgba(197,168,92,.12)] sm:text-[3.65rem]">Ronda ${upcomingRound.ronda}</h2>
        ${detail.torneo.modalidad !== 'americano_parejas_fijas' ? renderWaitingPlayers(detail, upcomingRound.allItems) : ''}
      </div>
      <div class="mt-5 grid gap-4 sm:mt-6">
        ${upcomingRound.matches
          .map(({ partido, index }) => publicFixtureRowForMode(detail.torneo.modalidad, partido, index))
          .join('')}
      </div>
    </section>
  `;
}

function renderPublicRoundPreview(detail, ronda, items) {
  return `
    <section class="mb-7 rounded-[20px] border border-[#8f6426]/45 bg-[linear-gradient(180deg,rgba(16,17,15,.92),rgba(6,8,7,.96))] p-5 shadow-[inset_0_0_0_1px_rgba(255,231,160,.04)]">
      <p class="text-sm font-black uppercase tracking-wide text-[#d9b65e]">Ronda</p>
      <h2 class="mt-1 font-serif text-[2.35rem] font-extrabold leading-none text-[#f3d994]">${ronda}</h2>
      <div class="mt-5 grid gap-4">
        ${visibleRoundMatches(detail.torneo.modalidad, items)
          .map((partido, index) => publicFixtureRowForMode(detail.torneo.modalidad, partido, index))
          .join('')}
      </div>
    </section>
  `;
}

function publicFixtureRowForMode(modalidad, partido, index) {
  if (modalidad === 'americano_parejas_fijas') {
    return renderPublicMatchCard(partido.pareja1, partido.es_fecha_libre ? 'Fecha libre' : partido.pareja2, index);
  }
  if (modalidad === 'americano_individual_1v1') {
    return renderPublicMatchCard(partido.jugador_1, partido.es_fecha_libre ? 'Fecha libre' : partido.jugador_2, index);
  }
  return renderPublicMatchCard(`${partido.jugador_a} / ${partido.jugador_b}`, `${partido.jugador_c} / ${partido.jugador_d}`, index);
}

function renderPublicMatchCard(leftName, rightName, index) {
  return `
    <article class="relative rounded-[18px] border border-[#9f6f2a]/76 bg-[linear-gradient(90deg,rgba(166,116,38,.55),transparent_15px),radial-gradient(circle_at_50%_0%,rgba(255,228,142,.08),transparent_42%),linear-gradient(180deg,rgba(19,19,17,.99),rgba(6,7,7,.99))] px-3 pb-4 pt-3 shadow-[inset_0_1px_0_rgba(255,235,170,.08),0_16px_28px_rgba(0,0,0,.38)]">
      <div class="absolute left-1/2 top-0 grid min-h-8 min-w-[5.75rem] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[9px] border border-[#9f6f2a]/70 bg-[linear-gradient(180deg,#17140d,#060807)] px-4 text-[.74rem] font-black uppercase tracking-[0.08em] text-[#f0d58e] shadow-[0_10px_20px_rgba(0,0,0,.36)]">Mesa ${index + 1}</div>
      <div class="grid min-h-[5.7rem] grid-cols-[minmax(0,1fr)_3.05rem_minmax(0,1fr)] items-center gap-2 pt-4 sm:min-h-[6.25rem] sm:grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)]">
        <span class="min-w-0 text-center font-serif text-[clamp(1.03rem,4.2vw,1.7rem)] font-bold uppercase leading-[1.08] text-[#f6ead0] drop-shadow-[0_3px_0_rgba(0,0,0,.78)] [text-wrap:balance]">${formatPublicTeamName(leftName)}</span>
        <span class="grid place-items-center text-center font-serif text-[#352615]">
          <span class="grid h-9 w-9 place-items-center bg-[radial-gradient(circle_at_38%_24%,rgba(255,255,255,.74),transparent_22%),linear-gradient(145deg,#ffe9a4,#ad7627_70%,#4f310f)] text-[.78rem] font-black [clip-path:polygon(50%_0,90%_17%,84%_76%,50%_100%,16%_76%,10%_17%)] sm:h-10 sm:w-10">VS</span>
          <small class="mt-0.5 text-[.56rem] font-black lowercase tracking-wide text-[#c9a85c]">versus</small>
        </span>
        <span class="min-w-0 text-center font-serif text-[clamp(1.03rem,4.2vw,1.7rem)] font-bold uppercase leading-[1.08] text-[#f6ead0] drop-shadow-[0_3px_0_rgba(0,0,0,.78)] [text-wrap:balance]">${formatPublicTeamName(rightName)}</span>
      </div>
    </article>
  `;
}

function formatPublicTeamName(name) {
  return escapeHtml(name).replace(/\s+\/\s+/g, ' /<wbr> ');
}

function renderUpcomingMatches(detail, grouped) {
  const { torneo } = detail;
  const upcomingRound = getUpcomingRound(grouped);

  if (!upcomingRound) {
    return `
      <section class="upcoming-panel is-complete">
        <div class="upcoming-head">
          <span class="round-kicker">Estado</span>
          <p class="round-title">Todos los partidos estan cargados</p>
        </div>
      </section>
    `;
  }

  return `
    <section class="upcoming-panel">
      <div class="upcoming-head">
        <div>
          <span class="round-kicker">Proximos partidos</span>
          <p class="round-title">Ronda ${upcomingRound.ronda}</p>
        </div>
        ${torneo.modalidad !== 'americano_parejas_fijas' ? renderWaitingPlayers(detail, upcomingRound.allItems) : ''}
      </div>
      <div class="match-grid upcoming-grid">
        ${upcomingRound.matches
          .map(({ partido, index }) => fixtureRowForMode(torneo.modalidad, partido, index))
          .join('')}
      </div>
    </section>
  `;
}

function fixtureRowForMode(modalidad, partido, index) {
  if (modalidad === 'americano_parejas_fijas') {
    return pairFixtureRow(partido, index);
  }
  if (modalidad === 'americano_individual_1v1') {
    return individual1v1FixtureRow(partido, index);
  }
  return individualFixtureRow(partido, index);
}

function fixtureModeLabel(modalidad) {
  if (modalidad === 'americano_parejas_fijas') {
    return 'Campeonato Paraguayo Express por Parejas';
  }
  if (modalidad === 'americano_individual_1v1') {
    return 'Americano individual 1 vs 1';
  }
  return 'Americano individual por duplas rotativas';
}

function renderWaitingPlayers(detail, roundMatches) {
  const playingIds = new Set();
  roundMatches.forEach((partido) => {
    if (detail.torneo.modalidad === 'americano_individual_1v1') {
      [partido.id_jugador_1, partido.id_jugador_2].filter(Boolean).forEach((id) => playingIds.add(id));
      return;
    }

    [partido.id_jugador_a, partido.id_jugador_b, partido.id_jugador_c, partido.id_jugador_d]
      .forEach((id) => playingIds.add(id));
  });

  const waiting = detail.participantes
    .filter((jugador) => !playingIds.has(jugador.id))
    .map((jugador) => jugador.alias || jugador.nombre);

  if (!waiting.length) {
    return '';
  }

  return `<span class="waiting-player">Espera: ${waiting.join(', ')}</span>`;
}

function groupBy(items, keyGetter) {
  return items.reduce((groups, item) => {
    const key = keyGetter(item);
    groups[key] ||= [];
    groups[key].push(item);
    return groups;
  }, {});
}

function pairFixtureRow(partido, index) {
  return `
    <article class="match-card">
      <div class="match-top">
        ${mesaBadge(index)}
        ${adminOnlyFixtureMeta(statusBadge(partido.estado))}
      </div>
      <div class="match-body ${canShowFixtureResults() && partido.estado === 'finalizado' ? 'has-scoreboard' : ''}">
        ${teamScoreCell(partido.pareja1, partido.puntaje_pareja1, partido.estado)}
        <span class="versus-cell"><span>VS</span><small>versus</small></span>
        ${teamScoreCell(partido.es_fecha_libre ? 'Fecha libre' : partido.pareja2, partido.puntaje_pareja2, partido.estado)}
      </div>
      ${adminOnlyFixtureMeta(partido.estado === 'finalizado' && partido.ganador ? `<div class="match-score">Ganador: ${partido.ganador}</div>` : '')}
    </article>
  `;
}

function individualFixtureRow(partido, index) {
  return `
    <article class="match-card">
      <div class="match-top">
        ${mesaBadge(index)}
        ${adminOnlyFixtureMeta(statusBadge(partido.estado))}
      </div>
      <div class="match-body ${canShowFixtureResults() && partido.estado === 'finalizado' ? 'has-scoreboard' : ''}">
        ${teamScoreCell(`${partido.jugador_a} / ${partido.jugador_b}`, partido.puntaje_dupla1, partido.estado)}
        <span class="versus-cell"><span>VS</span><small>versus</small></span>
        ${teamScoreCell(`${partido.jugador_c} / ${partido.jugador_d}`, partido.puntaje_dupla2, partido.estado)}
      </div>
    </article>
  `;
}

function individual1v1FixtureRow(partido, index) {
  return `
    <article class="match-card ${partido.es_fecha_libre ? 'free-round' : ''}">
      <div class="match-top">
        ${mesaBadge(index)}
        ${adminOnlyFixtureMeta(statusBadge(partido.es_fecha_libre ? 'libre' : partido.estado))}
      </div>
      <div class="match-body ${canShowFixtureResults() && partido.estado === 'finalizado' ? 'has-scoreboard' : ''}">
        ${teamScoreCell(partido.jugador_1, partido.puntaje_jugador_1, partido.estado)}
        <span class="versus-cell">${partido.es_fecha_libre ? '<span>Libre</span>' : '<span>VS</span><small>versus</small>'}</span>
        ${teamScoreCell(partido.es_fecha_libre ? 'Fecha libre' : partido.jugador_2, partido.puntaje_jugador_2, partido.estado)}
      </div>
    </article>
  `;
}

function adminOnlyFixtureMeta(html) {
  return isAdmin() ? html : '';
}

function canShowFixtureResults() {
  return isAdmin();
}

function teamScoreCell(name, score, status) {
  const scoreBadge = canShowFixtureResults() && status === 'finalizado'
    ? `<span class="score-number">${score ?? 0}</span>`
    : '';
  return `<span class="team-score-cell"><span class="team-name">${name}</span>${scoreBadge}</span>`;
}

function mesaBadge(index) {
  return `<span class="mesa-badge">Mesa ${index + 1}</span>`;
}

function statusBadge(status) {
  return `<span class="status ${status === 'finalizado' ? 'done' : ''}">${status}</span>`;
}

function renderPositions(detail) {
  const { torneo, participantes } = detail;
  const rows = participantes.map((item, index) => {
    if (torneo.modalidad === 'americano_parejas_fijas') {
      return `<tr><td>${index + 1}</td><td>${item.nombre_equipo}</td><td>${item.jugador_1} / ${item.jugador_2}</td><td>${item.partidos_jugados}</td><td>${item.partidos_ganados}</td><td>${item.partidos_perdidos}</td><td>${item.puntos_a_favor}</td><td>${item.puntos_en_contra}</td><td>${item.diferencia_puntos}</td><td>${item.puntos_totales}</td></tr>`;
    }
    return `<tr><td>${index + 1}</td><td>${item.nombre}</td><td>${item.alias || '-'}</td><td>${item.partidos_jugados}</td><td>${item.partidos_ganados}</td><td>${item.partidos_perdidos}</td><td>${item.puntos_a_favor}</td><td>${item.puntos_en_contra}</td></tr>`;
  }).join('');

  const head = torneo.modalidad === 'americano_parejas_fijas'
    ? '<th>#</th><th>Equipo</th><th>Jugadores</th><th>PJ</th><th>PG</th><th>PP</th><th>PF</th><th>PC</th><th>DIF</th><th>PTS</th>'
    : '<th>#</th><th>Jugador</th><th>Alias</th><th>PJ</th><th>PG</th><th>PP</th><th>Puntos</th><th>Contra</th>';

  $('#positionsContent').innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>${head}</tr></thead>
        <tbody>${rows || '<tr><td colspan="6">Sin participantes</td></tr>'}</tbody>
      </table>
    </div>
    <p class="meta standings-note">${torneo.modalidad === 'americano_parejas_fijas' ? 'Desempate: PTS, diferencia, puntos a favor y resultado directo.' : 'Desempate: puntos totales, menor contra y luego resultado directo entre jugadores enfrentados.'}</p>
  `;
}

function getSortedParticipants(detail) {
  const participantes = [...detail.participantes];
  if (detail.torneo.modalidad === 'americano_parejas_fijas') {
    return participantes.sort((a, b) => (
      b.puntos_totales - a.puntos_totales
      || b.diferencia_puntos - a.diferencia_puntos
      || b.puntos_a_favor - a.puntos_a_favor
      || comparePairHeadToHead(a.id, b.id, detail.partidos)
      || b.partidos_ganados - a.partidos_ganados
      || a.nombre_equipo.localeCompare(b.nombre_equipo)
    ));
  }

  return participantes.sort((a, b) => (
    b.puntos_a_favor - a.puntos_a_favor
    || a.puntos_en_contra - b.puntos_en_contra
    || compareHeadToHead(a.id, b.id, detail.partidos)
    || b.partidos_ganados - a.partidos_ganados
    || b.diferencia_puntos - a.diferencia_puntos
    || a.nombre.localeCompare(b.nombre)
  ));
}

function compareHeadToHead(idA, idB, partidos) {
  let pointsA = 0;
  let pointsB = 0;

  for (const partido of partidos) {
    if (partido.estado !== 'finalizado') {
      continue;
    }

    const sideA = getPlayerSide(partido, idA);
    const sideB = getPlayerSide(partido, idB);
    if (!sideA || !sideB || sideA === sideB) {
      continue;
    }

    const scoreSideOne = partido.puntaje_dupla1 ?? partido.puntaje_jugador_1;
    const scoreSideTwo = partido.puntaje_dupla2 ?? partido.puntaje_jugador_2;
    pointsA += sideA === 1 ? scoreSideOne : scoreSideTwo;
    pointsB += sideB === 1 ? scoreSideOne : scoreSideTwo;
  }

  return pointsB - pointsA;
}

function comparePairHeadToHead(idA, idB, partidos) {
  const direct = partidos.find((partido) => (
    partido.estado === 'finalizado'
    && !partido.es_fecha_libre
    && (
      (partido.id_pareja1 === idA && partido.id_pareja2 === idB)
      || (partido.id_pareja1 === idB && partido.id_pareja2 === idA)
    )
  ));

  if (!direct) {
    return 0;
  }
  if (direct.ganador_id === idA) {
    return -1;
  }
  if (direct.ganador_id === idB) {
    return 1;
  }
  return 0;
}

function getPlayerSide(partido, playerId) {
  if (partido.id_jugador_1 === playerId) {
    return 1;
  }
  if (partido.id_jugador_2 === playerId) {
    return 2;
  }
  if ([partido.id_jugador_a, partido.id_jugador_b].includes(playerId)) {
    return 1;
  }
  if ([partido.id_jugador_c, partido.id_jugador_d].includes(playerId)) {
    return 2;
  }
  return null;
}

function maybeShowTournamentFinished(detail) {
  if (!isTournamentComplete(detail)) {
    return false;
  }

  const sorted = getSortedParticipants(detail);
  const winner = sorted[0];
  const last = sorted[sorted.length - 1];
  const isIndividual = detail.torneo.modalidad !== 'americano_parejas_fijas';
  const winnerName = isIndividual ? (winner.alias || winner.nombre) : winner.nombre_equipo;
  const lastName = isIndividual ? (last.alias || last.nombre) : last.nombre_equipo;

  $('#winnerTableContent').innerHTML = renderDetailPositionsTable(detail);
  $('#winnerHighlights').innerHTML = renderTournamentHighlights(detail, sorted);
  $('#winnerTitle').textContent = `Ganador: ${winnerName}`;
  $('#winnerMessage').textContent = isIndividual
    ? `${winnerName} se lleva La Cofradía-2026 con ${winner.puntos_a_favor} puntos. En empate, manda menor contra y despues el resultado directo.`
    : `${winnerName} se lleva La Cofradia-2026 con ${winner.puntos_totales} PTS y diferencia ${winner.diferencia_puntos}.`;
  $('#lastPlaceMessage').textContent = isIndividual
    ? `${lastName}: Bienvenido a la Turma da Monica`
    : '';
  $('#winnerDialog').showModal();
  return true;
}

function renderTournamentHighlights(detail, sorted) {
  const isIndividual = detail.torneo.modalidad !== 'americano_parejas_fijas';
  const top = sorted.slice(0, 3);
  const bestAttack = isIndividual
    ? [...sorted].sort((a, b) => b.puntos_a_favor - a.puntos_a_favor)[0]
    : [...sorted].sort((a, b) => b.puntos_a_favor - a.puntos_a_favor)[0];
  const bestDefense = isIndividual
    ? [...sorted].sort((a, b) => a.puntos_en_contra - b.puntos_en_contra)[0]
    : null;

  const nameOf = (item) => {
    if (!item) return '-';
    return isIndividual ? (item.alias || item.nombre) : item.nombre_equipo;
  };

  const cards = [
    `<div class="highlight-card"><strong>Podio</strong><span>${top.map((item, index) => `${index + 1}. ${nameOf(item)}`).join(' | ')}</span></div>`,
    `<div class="highlight-card"><strong>Mejor ataque</strong><span>${nameOf(bestAttack)}</span></div>`,
  ];

  if (bestDefense) {
    cards.push(`<div class="highlight-card"><strong>Mejor defensa</strong><span>${nameOf(bestDefense)} (${bestDefense.puntos_en_contra} contra)</span></div>`);
  }

  return cards.join('');
}

function isTournamentComplete(detail) {
  const playableMatches = detail.partidos.filter((partido) => !partido.es_fecha_libre);
  return playableMatches.length > 0 && playableMatches.every((partido) => partido.estado === 'finalizado');
}

function renderLoadMatches(detail, preferredMatchId = null) {
  if (!isAdmin()) {
    return;
  }

  const { torneo, partidos } = detail;
  const showFinished = $('#showFinishedMatches').checked;
  const available = partidos.filter((partido) => !partido.es_fecha_libre && (showFinished || partido.estado !== 'finalizado'));
  $('#matchSelect').innerHTML = available.map((partido) => {
    const marker = partido.estado === 'finalizado' ? '[CARGADO]' : '[PENDIENTE]';
    const label = matchLabel(torneo.modalidad, partido, marker);
    return `<option value="${partido.id}">${label}</option>`;
  }).join('') || '<option value="">No quedan partidos pendientes</option>';

  if (preferredMatchId && available.some((partido) => partido.id === preferredMatchId)) {
    $('#matchSelect').value = String(preferredMatchId);
  }

  $('#pairResultFields').classList.add('is-hidden');
  $('#individualResultFields').classList.remove('is-hidden');
  if (torneo.modalidad === 'americano_parejas_fijas') {
    $('#scoreOneLabel').textContent = 'Pareja 1';
    $('#scoreTwoLabel').textContent = 'Pareja 2';
    $('#scoreOne').max = '18';
    $('#scoreTwo').max = '18';
  } else {
    $('#scoreOneLabel').textContent = torneo.modalidad === 'americano_individual_1v1' ? 'Jugador 1' : 'Dupla 1';
    $('#scoreTwoLabel').textContent = torneo.modalidad === 'americano_individual_1v1' ? 'Jugador 2' : 'Dupla 2';
    $('#scoreOne').max = '40';
    $('#scoreTwo').max = '40';
  }
  updateWinnerOptions();
  updateMatchStatusHint();
}

function matchLabel(modalidad, partido, marker) {
  if (modalidad === 'americano_parejas_fijas') {
    return `${marker} R${partido.ronda}: ${partido.pareja1} vs ${partido.pareja2}`;
  }
  if (modalidad === 'americano_individual_1v1') {
    return `${marker} R${partido.ronda}: ${partido.jugador_1} vs ${partido.jugador_2}`;
  }
  return `${marker} R${partido.ronda}: ${partido.jugador_a} / ${partido.jugador_b} vs ${partido.jugador_c} / ${partido.jugador_d}`;
}

function updateWinnerOptions() {
  const detail = state.currentDetail;
  const selected = getSelectedMatch();
  if (!detail || !selected || detail.torneo.modalidad !== 'americano_parejas_fijas') {
    return;
  }
  $('#winnerSelect').innerHTML = `
    <option value="${selected.id_pareja1}">${selected.pareja1}</option>
    <option value="${selected.id_pareja2}">${selected.pareja2}</option>
  `;
}

function updateMatchStatusHint() {
  const selected = getSelectedMatch();
  const hint = $('#matchStatusHint');
  if (!selected) {
    $('#scoreOne').value = '';
    $('#scoreTwo').value = '';
    hint.textContent = 'No hay partidos pendientes para cargar.';
    hint.classList.remove('done');
    return;
  }

  if (state.currentDetail?.torneo.modalidad === 'americano_parejas_fijas') {
    $('#scoreOne').value = selected.puntaje_pareja1 ?? '';
    $('#scoreTwo').value = selected.puntaje_pareja2 ?? '';
  } else if (state.currentDetail?.torneo.modalidad === 'americano_individual_1v1') {
    $('#scoreOne').value = selected.puntaje_jugador_1 ?? '';
    $('#scoreTwo').value = selected.puntaje_jugador_2 ?? '';
  } else {
    $('#scoreOne').value = selected.puntaje_dupla1 ?? '';
    $('#scoreTwo').value = selected.puntaje_dupla2 ?? '';
  }

  if (selected.estado === 'finalizado') {
    hint.textContent = 'Resultado ya cargado. Si guardas de nuevo, vas a corregir este resultado.';
    hint.classList.add('done');
    return;
  }

  hint.textContent = state.currentDetail?.torneo.modalidad === 'americano_parejas_fijas'
    ? 'Carga marcador a 18. No se permiten empates.'
    : 'Pendiente de carga.';
  hint.classList.remove('done');
}

function getSelectedMatch() {
  const selectedId = Number($('#matchSelect').value);
  return state.currentDetail?.partidos.find((partido) => partido.id === selectedId);
}

function getNextPendingMatchId(detail, currentMatchId) {
  const ordered = detail.partidos
    .filter((partido) => !partido.es_fecha_libre)
    .sort((a, b) => a.ronda - b.ronda || a.id - b.id);
  const currentIndex = ordered.findIndex((partido) => partido.id === currentMatchId);
  const afterCurrent = ordered.slice(Math.max(0, currentIndex + 1));
  const beforeCurrent = ordered.slice(0, Math.max(0, currentIndex + 1));
  const next = [...afterCurrent, ...beforeCurrent].find((partido) => partido.estado !== 'finalizado');
  return next?.id || null;
}

async function renderHistory() {
  state.historial = await api('/api/historial');
  $('#historyContent').innerHTML = state.historial.map((torneo) => `
    <article class="card">
      <p class="card-title">${torneo.nombre_torneo}</p>
      <p class="meta">${formatDate(torneo.fecha_inicio)} - ${torneo.modalidad}</p>
      <p class="meta">Campeon: ${torneo.campeon_nombre || '-'}</p>
      <button class="secondary history-open" type="button" data-history-open="${torneo.id}">Ver tabla del torneo</button>
    </article>
  `).join('') || emptyCard('El Salon de la Fama espera su primer campeon.');
}

function renderDetailPositionsTable(detail) {
  const rows = getSortedParticipants(detail).map((item, index) => {
    if (detail.torneo.modalidad === 'americano_parejas_fijas') {
      return `<tr><td>${index + 1}</td><td>${item.nombre_equipo}</td><td>${item.jugador_1} / ${item.jugador_2}</td><td>${item.partidos_jugados}</td><td>${item.partidos_ganados}</td><td>${item.partidos_perdidos}</td><td>${item.puntos_a_favor}</td><td>${item.puntos_en_contra}</td><td>${item.diferencia_puntos}</td><td>${item.puntos_totales}</td></tr>`;
    }
    return `<tr><td>${index + 1}</td><td>${item.nombre}</td><td>${item.alias || '-'}</td><td>${item.partidos_jugados}</td><td>${item.partidos_ganados}</td><td>${item.partidos_perdidos}</td><td>${item.puntos_a_favor}</td><td>${item.puntos_en_contra}</td></tr>`;
  }).join('');
  const head = detail.torneo.modalidad === 'americano_parejas_fijas'
    ? '<th>#</th><th>Equipo</th><th>Jugadores</th><th>PJ</th><th>PG</th><th>PP</th><th>PF</th><th>PC</th><th>DIF</th><th>PTS</th>'
    : '<th>#</th><th>Jugador</th><th>Alias</th><th>PJ</th><th>PG</th><th>PP</th><th>Puntos</th><th>Contra</th>';

  return `
    <div class="table-wrap history-table">
      <table>
        <thead><tr>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderHistoryPositions(torneo) {
  if (!torneo.posiciones?.length) {
    return '<p class="meta">Tabla final no disponible para este torneo.</p>';
  }

  const isIndividual = torneo.modalidad !== 'americano_parejas_fijas';
  const head = isIndividual
    ? '<th>#</th><th>Jugador</th><th>Alias</th><th>PJ</th><th>PG</th><th>PP</th><th>Puntos</th><th>Contra</th>'
    : '<th>#</th><th>Equipo</th><th>Jugadores</th><th>PJ</th><th>PG</th><th>PP</th><th>PF</th><th>PC</th><th>DIF</th><th>PTS</th>';
  const rows = torneo.posiciones.map((item) => isIndividual
    ? `<tr><td>${item.posicion}</td><td>${item.nombre}</td><td>${item.detalle || '-'}</td><td>${item.partidos_jugados}</td><td>${item.partidos_ganados}</td><td>${item.partidos_perdidos}</td><td>${item.puntos_a_favor}</td><td>${item.puntos_en_contra}</td></tr>`
    : `<tr><td>${item.posicion}</td><td>${item.nombre}</td><td>${item.detalle || '-'}</td><td>${item.partidos_jugados}</td><td>${item.partidos_ganados}</td><td>${item.partidos_perdidos}</td><td>${item.puntos_a_favor}</td><td>${item.puntos_en_contra}</td><td>${item.diferencia_puntos}</td><td>${item.puntos_totales}</td></tr>`
  ).join('');

  return `
    <div class="table-wrap history-table">
      <table>
        <thead><tr>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function openHistoryTournament(torneoId) {
  const torneo = state.historial.find((item) => item.id === torneoId);
  if (!torneo) {
    toast('No encontre ese torneo en el historial.');
    return;
  }

  const winner = torneo.campeon_nombre || '-';
  const last = torneo.posiciones?.[torneo.posiciones.length - 1];
  const lastText = last ? `Ultimo: ${last.nombre}` : 'Ultimo: -';

  $('#historyDialogTitle').textContent = torneo.nombre_torneo;
  $('#historyDialogMeta').textContent = `Ganador: ${winner} | ${lastText}`;
  $('#historyDialogTable').innerHTML = renderHistoryPositions(torneo);
  state.selectedHistoryTournament = torneo;
  $('#historyDialog').showModal();
}

function tableTextFromDetail(detail) {
  const sorted = getSortedParticipants(detail);
  const isIndividual = detail.torneo.modalidad !== 'americano_parejas_fijas';
  const headers = isIndividual
    ? ['#', 'Jugador', 'PJ', 'PG', 'PP', 'Pts', 'Contra']
    : ['#', 'Equipo', 'PJ', 'PG', 'PP', 'PF', 'PC', 'DIF', 'PTS'];
  const rows = sorted.map((item, index) => isIndividual
    ? [index + 1, item.alias || item.nombre, item.partidos_jugados, item.partidos_ganados, item.partidos_perdidos, item.puntos_a_favor, item.puntos_en_contra]
    : [index + 1, item.nombre_equipo, item.partidos_jugados, item.partidos_ganados, item.partidos_perdidos, item.puntos_a_favor, item.puntos_en_contra, item.diferencia_puntos, item.puntos_totales]
  );
  return buildWhatsappTable(detail.torneo.nombre_torneo, headers, rows);
}

function tableTextFromHistory(torneo) {
  if (!torneo) return '';
  const isIndividual = torneo.modalidad !== 'americano_parejas_fijas';
  const headers = isIndividual
    ? ['#', 'Jugador', 'PJ', 'PG', 'PP', 'Pts', 'Contra']
    : ['#', 'Equipo', 'PJ', 'PG', 'PP', 'PF', 'PC', 'DIF', 'PTS'];
  const rows = (torneo.posiciones || []).map((item) => isIndividual
    ? [item.posicion, item.detalle || item.nombre, item.partidos_jugados, item.partidos_ganados, item.partidos_perdidos, item.puntos_a_favor, item.puntos_en_contra]
    : [item.posicion, item.nombre, item.partidos_jugados, item.partidos_ganados, item.partidos_perdidos, item.puntos_a_favor, item.puntos_en_contra, item.diferencia_puntos, item.puntos_totales]
  );
  return buildWhatsappTable(`${torneo.nombre_torneo}\nGanador: ${torneo.campeon_nombre || '-'}`, headers, rows);
}

function buildWhatsappTable(title, headers, rows) {
  const textRows = [headers, ...rows].map((row) => row.map((value) => String(value ?? '-')));
  const widths = headers.map((_, columnIndex) => Math.min(
    18,
    Math.max(...textRows.map((row) => row[columnIndex].length))
  ));
  const formatRow = (row) => row
    .map((value, index) => truncateText(value, widths[index]).padEnd(widths[index], ' '))
    .join('  ');
  const separator = widths.map((width) => '-'.repeat(width)).join('  ');

  return [
    title,
    '```',
    formatRow(headers),
    separator,
    ...rows.map((row) => formatRow(row.map((value) => String(value ?? '-')))),
    '```',
  ].join('\n');
}

function truncateText(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1))}.`;
}

async function copyText(text, successMessage) {
  if (!text) {
    toast('No hay tabla para copiar.');
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    toast(successMessage);
  } catch (error) {
    toast('No pude copiar automaticamente.');
  }
}

function formatDate(value) {
  if (!value) {
    return '-';
  }
  return new Intl.DateTimeFormat('es-PY', { dateStyle: 'medium' }).format(new Date(value));
}

function parseParticipants(mode) {
  if (mode === 'americano_parejas_fijas') {
    const parejas = $$('[data-participant-row]').map((row) => ({
      nombre_equipo: row.querySelector('[data-pair-team]')?.value.trim(),
      jugador_1: row.querySelector('[data-pair-player-one]')?.value.trim(),
      jugador_2: row.querySelector('[data-pair-player-two]')?.value.trim(),
    })).filter((pareja) => pareja.nombre_equipo || pareja.jugador_1 || pareja.jugador_2);

    if (parejas.length < MODES[mode].min) {
      throw new Error('El Campeonato Paraguayo Express empieza desde 4 parejas.');
    }
    parejas.forEach((pareja, index) => {
      if (!pareja.nombre_equipo || !pareja.jugador_1 || !pareja.jugador_2) {
        throw new Error(`Completa equipo y 2 jugadores en la fila ${index + 1}.`);
      }
    });
    assertUniqueNames(parejas.map((pareja) => pareja.nombre_equipo), 'equipo');
    return { parejas };
  }

  const jugadores = $$('[data-participant-row]').map((row) => ({
    nombre: row.querySelector('[data-player-name]')?.value.trim(),
  })).filter((jugador) => jugador.nombre);

  if (jugadores.length < MODES[mode].min) {
    throw new Error(mode === 'americano_individual_1v1'
      ? 'El torneo individual 1 vs 1 empieza desde 2 jugadores.'
      : 'El torneo americano individual empieza desde 7 jugadores.');
  }
  assertUniqueNames(jugadores.map((jugador) => jugador.nombre), 'jugador');
  return { jugadores };
}

function assertUniqueNames(names, label) {
  const seen = new Map();
  for (const [index, name] of names.entries()) {
    const normalized = name.trim().toLocaleLowerCase('es');
    if (seen.has(normalized)) {
      throw new Error(`Hay un ${label} repetido: "${name}" en las filas ${seen.get(normalized) + 1} y ${index + 1}. Usa un apellido o apodo para diferenciarlos.`);
    }
    seen.set(normalized, index);
  }
}

function bindEvents() {
  $$('.nav-item').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
  $('#fixtureTournamentSelect').addEventListener('change', async (event) => {
    state.selectedFixtureId = Number(event.target.value) || null;
    await refreshSelectedViews();
  });
  $('#positionsTournamentSelect').addEventListener('change', async (event) => {
    state.selectedPositionsId = Number(event.target.value) || null;
    await refreshSelectedViews();
  });
  $('#loginToggle').addEventListener('click', openLoginDialog);
  $('#logoutButton').addEventListener('click', () => {
    clearAdminSession();
    $('#loginDialog').close();
    toast('Sesion cerrada.');
  });
  $('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const result = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: $('#username').value, password: $('#password').value }),
    });
    state.token = result.token;
    localStorage.setItem('truco_admin_token', result.token);
    applyAuthUi();
    $('#loginDialog').close();
    toast('Admin autenticado.');
    await loadTorneos();
  });
  $$('[data-open-create]').forEach((button) => button.addEventListener('click', () => {
    if (!isAdmin()) {
      toast('Ingresa como Admin para crear torneos.');
      openLoginDialog();
      return;
    }
    setCreateMode(button.dataset.openCreate);
    switchView('loadView');
  }));
  $$('[data-mode-pick]').forEach((button) => button.addEventListener('click', () => {
    setCreateMode(button.dataset.modePick);
  }));
  $('#createTournamentForm').addEventListener('submit', createTournament);
  $('#addParticipantButton').addEventListener('click', addParticipantRow);
  $('#generateFixtureButton').addEventListener('click', generateFixture);
  $('#matchSelect').addEventListener('change', () => {
    updateWinnerOptions();
    updateMatchStatusHint();
  });
  $('#showFinishedMatches').addEventListener('change', () => {
    if (state.currentDetail) {
      renderLoadMatches(state.currentDetail);
    }
  });
  $('#resultForm').addEventListener('submit', saveResult);
  $('#closeWinnerDialog').addEventListener('click', () => $('#winnerDialog').close());
  $('#closeHistoryDialog').addEventListener('click', () => $('#historyDialog').close());
  $('#closeClearHistoryDialog').addEventListener('click', () => $('#clearHistoryDialog').close());
  $('#copyWinnerTableButton').addEventListener('click', () => copyText(tableTextFromDetail(state.lastFinishedDetail), 'Tabla final copiada.'));
  $('#copyHistoryTableButton').addEventListener('click', () => copyText(tableTextFromHistory(state.selectedHistoryTournament), 'Tabla del historial copiada.'));
  $('#shareLinkButton').addEventListener('click', shareLink);
  $('#backupButton').addEventListener('click', downloadBackup);
  $('#clearHistoryButton').addEventListener('click', openClearHistoryDialog);
  $('#deleteAllHistoryButton').addEventListener('click', handleDeleteAllHistoryClick);
  $('#historyDeleteList').addEventListener('click', handleHistoryDeleteListClick);
  $('#deleteFixtureTournamentButton').addEventListener('click', () => deleteSelectedTournament(state.selectedFixtureId));
  $('#deletePositionsTournamentButton').addEventListener('click', () => deleteSelectedTournament(state.selectedPositionsId));
  $('#historyContent').addEventListener('click', (event) => {
    const button = event.target.closest('[data-history-open]');
    if (!button) {
      return;
    }
    openHistoryTournament(Number(button.dataset.historyOpen));
  });
  $('#fixtureContent').addEventListener('click', handleFixtureContentClick);
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPromptEvent = event;
    if (state.currentDetail) {
      renderFixture(state.currentDetail);
    }
  });
  window.addEventListener('appinstalled', () => {
    localStorage.setItem(INSTALL_BANNER_DISMISSED_KEY, '1');
    state.installPromptEvent = null;
    toast('La Cofradía instalada.');
    if (state.currentDetail) {
      renderFixture(state.currentDetail);
    }
  });
}

async function handleFixtureContentClick(event) {
  if (event.target.closest('[data-dismiss-install-banner]')) {
    localStorage.setItem(INSTALL_BANNER_DISMISSED_KEY, '1');
    if (state.currentDetail) {
      renderFixture(state.currentDetail);
    }
    return;
  }

  if (event.target.closest('[data-install-pwa]')) {
    await promptInstallPwa();
  }
}

async function promptInstallPwa() {
  if (state.installPromptEvent) {
    state.installPromptEvent.prompt();
    const result = await state.installPromptEvent.userChoice.catch(() => null);
    state.installPromptEvent = null;
    if (result?.outcome === 'accepted') {
      localStorage.setItem(INSTALL_BANNER_DISMISSED_KEY, '1');
    }
    if (state.currentDetail) {
      renderFixture(state.currentDetail);
    }
    return;
  }

  if (isIosDevice()) {
    toast('iPhone: Compartir > Agregar a pantalla de inicio.');
    return;
  }

  toast('En el navegador toca menu > Agregar a pantalla principal.');
}

async function shareLink() {
  let url = window.location.origin;
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    try {
      const info = await api('/api/share-info');
      url = info.local_url || url;
    } catch (error) {
      // Si no se puede detectar IP local, usa la URL actual.
    }
  }
  const publicUrl = `${url}/?public=fixture`;
  const text = `Fixture y resultados en vivo: ${publicUrl}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Torneos American Express', text, url });
      return;
    } catch (error) {
      // Si cancela el dialogo nativo, cae al copiado.
    }
  }

  await copyText(text, 'Enlace copiado para WhatsApp.');
}

async function downloadBackup() {
  if (!isAdmin()) {
    toast('Solo Admin puede descargar backup.');
    return;
  }

  try {
    const backup = await api('/api/backup');
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup-torneos-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast('Backup descargado.');
  } catch (error) {
    toast(error.message);
  }
}

async function deleteSelectedTournament(tournamentId) {
  if (!isAdmin()) {
    toast('Solo Admin puede borrar torneos.');
    return;
  }

  if (!tournamentId) {
    toast('Selecciona un torneo para borrar.');
    return;
  }

  const torneo = state.torneos.find((item) => item.id === tournamentId);
  const name = torneo?.nombre_torneo || 'este torneo';
  if (!window.confirm(`Borrar "${name}" y todos sus partidos/posiciones?`)) {
    return;
  }

  try {
    await api(`/api/torneos/${tournamentId}`, { method: 'DELETE' });
    toast('Torneo borrado.');
    state.selectedFixtureId = null;
    state.selectedPositionsId = null;
    await loadTorneos();
  } catch (error) {
    toast(error.message);
  }
}

async function clearHistory() {
  if (!isAdmin()) {
    toast('Solo Admin puede borrar el historial.');
    return;
  }

  if (!state.pendingDeleteAllHistory) {
    state.pendingHistoryDeleteId = null;
    state.pendingDeleteAllHistory = true;
    renderHistoryDeleteList();
    return;
  }

  try {
    const result = await api('/api/historial', { method: 'DELETE' });
    toast(`Historial borrado: ${result.torneos_borrados} torneo(s).`);
    state.pendingDeleteAllHistory = false;
    state.pendingHistoryDeleteId = null;
    await loadTorneos();
    renderHistoryDeleteList();
  } catch (error) {
    toast(error.message);
  }
}

async function openClearHistoryDialog() {
  if (!isAdmin()) {
    toast('Solo Admin puede borrar el historial.');
    return;
  }

  state.pendingHistoryDeleteId = null;
  state.pendingDeleteAllHistory = false;
  await renderHistory();
  renderHistoryDeleteList();
  $('#clearHistoryDialog').showModal();
}

function renderHistoryDeleteList() {
  const list = $('#historyDeleteList');
  const notice = $('#historyDeleteNotice');
  const deleteAllButton = $('#deleteAllHistoryButton');

  if (!state.historial.length) {
    list.innerHTML = emptyCard('No hay campeonatos finalizados para borrar.');
    notice.hidden = true;
    deleteAllButton.disabled = true;
    deleteAllButton.textContent = 'Borrar todo';
    return;
  }

  deleteAllButton.disabled = false;
  deleteAllButton.textContent = state.pendingDeleteAllHistory
    ? 'Confirmar borrar todo'
    : 'Borrar todo';
  notice.hidden = !state.pendingDeleteAllHistory;
  notice.textContent = state.pendingDeleteAllHistory
    ? 'Vas a borrar todos los campeonatos finalizados. Toca confirmar solo si estas seguro.'
    : '';

  list.innerHTML = state.historial.map((torneo) => {
    const confirming = state.pendingHistoryDeleteId === torneo.id;
    const winner = torneo.campeon_nombre || '-';
    const modality = torneo.modalidad === 'americano_parejas_fijas'
      ? 'Campeonato Paraguayo Express por Parejas'
      : torneo.modalidad;
    const action = confirming
      ? `<div class="history-delete-actions">
          <button class="danger compact-danger" type="button" data-history-delete-confirm="${torneo.id}">Confirmar</button>
          <button class="ghost compact-ghost" type="button" data-history-delete-cancel>Cancelar</button>
        </div>`
      : `<button class="danger compact-danger" type="button" data-history-delete="${torneo.id}">Borrar</button>`;

    return `
      <article class="history-delete-item ${confirming ? 'confirming' : ''}">
        <div>
          <p class="history-delete-title">${torneo.nombre_torneo}</p>
          <p class="history-delete-meta">${formatDate(torneo.fecha_inicio)} | ${modality}</p>
          <p class="history-delete-meta">Campeon: ${winner}</p>
        </div>
        ${action}
      </article>
    `;
  }).join('');
}

function handleDeleteAllHistoryClick() {
  clearHistory();
}

async function handleHistoryDeleteListClick(event) {
  const cancelButton = event.target.closest('[data-history-delete-cancel]');
  if (cancelButton) {
    state.pendingHistoryDeleteId = null;
    renderHistoryDeleteList();
    return;
  }

  const confirmButton = event.target.closest('[data-history-delete-confirm]');
  if (confirmButton) {
    await deleteHistoryTournament(Number(confirmButton.dataset.historyDeleteConfirm));
    return;
  }

  const deleteButton = event.target.closest('[data-history-delete]');
  if (deleteButton) {
    state.pendingDeleteAllHistory = false;
    state.pendingHistoryDeleteId = Number(deleteButton.dataset.historyDelete);
    renderHistoryDeleteList();
  }
}

async function deleteHistoryTournament(tournamentId) {
  if (!isAdmin()) {
    toast('Solo Admin puede borrar el historial.');
    return;
  }

  try {
    const result = await api(`/api/historial/${tournamentId}`, { method: 'DELETE' });
    toast(`Borrado del historial: ${result.torneo_borrado.nombre_torneo}.`);
    if (state.selectedHistoryTournament?.id === tournamentId) {
      state.selectedHistoryTournament = null;
      $('#historyDialog').close();
    }
    state.pendingHistoryDeleteId = null;
    state.pendingDeleteAllHistory = false;
    await loadTorneos();
    renderHistoryDeleteList();
  } catch (error) {
    toast(error.message);
  }
}

async function createTournament(event) {
  event.preventDefault();
  const modalidad = $('#createMode').value || 'americano_parejas_fijas';
  try {
    const participants = parseParticipants(modalidad);
    const torneo = await api('/api/torneos', {
      method: 'POST',
      body: JSON.stringify({
        nombre_torneo: $('#tournamentName').value,
        modalidad,
        ...participants,
      }),
    });
    await api(`/api/torneos/${torneo.id}/generar-fixture`, { method: 'POST', body: '{}' });
    toast('Torneo creado con fixture.');
    state.selectedFixtureId = torneo.id;
    state.selectedPositionsId = torneo.id;
    event.target.reset();
    setCreateMode(modalidad);
    await loadTorneos();
  } catch (error) {
    toast(error.message);
  }
}

async function generateFixture() {
  if (!state.selectedFixtureId) {
    toast('Selecciona un torneo activo.');
    return;
  }
  if (!window.confirm('Regenerar fixture borra el fixture actual y sus resultados cargados. ¿Continuar?')) {
    return;
  }
  try {
    await api(`/api/torneos/${state.selectedFixtureId}/generar-fixture`, { method: 'POST', body: '{}' });
    toast('Fixture generado.');
    await refreshSelectedViews();
  } catch (error) {
    toast(error.message);
  }
}

async function saveResult(event) {
  event.preventDefault();
  const match = getSelectedMatch();
  const detail = state.currentDetail;
  if (!match || !detail) {
    toast('No hay partido seleccionado.');
    return;
  }

  try {
    if (detail.torneo.modalidad === 'americano_parejas_fijas') {
      const scoreOne = Number($('#scoreOne').value);
      const scoreTwo = Number($('#scoreTwo').value);
      if (scoreOne === scoreTwo) {
        throw new Error('No se permiten empates. Una pareja debe ganar.');
      }
      if (Math.max(scoreOne, scoreTwo) !== 18) {
        throw new Error('El ganador debe llegar a 18 puntos.');
      }
      await api(`/api/partidos/parejas/${match.id}/resultado`, {
        method: 'POST',
        body: JSON.stringify({
          puntaje_pareja1: scoreOne,
          puntaje_pareja2: scoreTwo,
        }),
      });
    } else if (detail.torneo.modalidad === 'americano_individual_1v1') {
      await api(`/api/partidos/individuales-1v1/${match.id}/resultado`, {
        method: 'POST',
        body: JSON.stringify({
          puntaje_jugador_1: Number($('#scoreOne').value),
          puntaje_jugador_2: Number($('#scoreTwo').value),
        }),
      });
    } else {
      await api(`/api/partidos/individuales/${match.id}/resultado`, {
        method: 'POST',
        body: JSON.stringify({
          puntaje_dupla1: Number($('#scoreOne').value),
          puntaje_dupla2: Number($('#scoreTwo').value),
        }),
      });
    }

    toast('Resultado guardado.');
    const updatedDetail = await api(`/api/torneos/${detail.torneo.id}`);
    const nextPendingMatchId = getNextPendingMatchId(updatedDetail, match.id);
    state.currentDetail = updatedDetail;
    renderFixture(updatedDetail);
    renderPositions(updatedDetail);
    renderLoadMatches(updatedDetail, nextPendingMatchId);
    $('#scoreOne').value = '';
    $('#scoreTwo').value = '';
    if (isTournamentComplete(updatedDetail)) {
      await api(`/api/torneos/${detail.torneo.id}/finalizar`, { method: 'POST', body: '{}' });
      state.lastFinishedDetail = updatedDetail;
      maybeShowTournamentFinished(updatedDetail);
      await loadTorneos();
    }
  } catch (error) {
    toast(error.message);
  }
}

async function init() {
  applyAuthUi();
  polishModeCards();
  setCreateMode('americano_parejas_fijas');
  bindEvents();
  try {
    await loadTorneos();
    window.setInterval(refreshLiveData, 5000);
  } catch (error) {
    toast(error.message);
  }
}

init();
