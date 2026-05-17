const state = {
  token: localStorage.getItem('truco_admin_token'),
  torneos: [],
  historial: [],
  selectedFixtureId: null,
  selectedPositionsId: null,
  currentDetail: null,
  lastFinishedDetail: null,
  selectedHistoryTournament: null,
};

const MODES = {
  americano_parejas_fijas: {
    min: 5,
    initialRows: 5,
    summary: 'Carga cada pareja en una fila: nombre del equipo y sus 2 jugadores.',
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

function renderFixture(detail) {
  const { torneo, partidos } = detail;
  if (!partidos.length) {
    $('#fixtureContent').innerHTML = emptyCard('Fixture pendiente de generacion.');
    return;
  }

  const grouped = groupBy(partidos, (partido) => partido.ronda);
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
        ${items.map((partido, index) => fixtureRowForMode(torneo.modalidad, partido, index)).join('')}
      </div>
    </section>
  `).join('');

  $('#fixtureContent').innerHTML = `
    <div class="cup-board">
      <div class="cup-frame top-left"></div>
      <div class="cup-frame top-right"></div>
      <div class="cup-frame bottom-left"></div>
      <div class="cup-frame bottom-right"></div>
      <header class="cup-header">
        <div class="cup-title-band">
          <span>Fixture Oficial</span>
        </div>
        <div class="cup-trophy" aria-hidden="true">
          <div class="cup-bowl"></div>
          <div class="cup-stem"></div>
          <div class="cup-base"></div>
        </div>
        <h3>${torneo.nombre_torneo}</h3>
        <p>${fixtureModeLabel(torneo.modalidad)}</p>
      </header>
      <div class="cup-rounds">
        ${rounds}
      </div>
    </div>
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
    return 'Americano por parejas fijas';
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
      <div class="match-body">
        <span class="team-name">${partido.pareja1}</span>
        <span class="versus-cell">vs</span>
        <span class="team-name">${partido.es_fecha_libre ? 'Fecha libre' : partido.pareja2}</span>
      </div>
      ${adminOnlyFixtureMeta(`<div class="match-score">Ganador: ${partido.ganador || '-'}</div>`)}
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
      <div class="match-body">
        <span class="team-name">${partido.jugador_a} / ${partido.jugador_b}</span>
        <span class="versus-cell">vs</span>
        <span class="team-name">${partido.jugador_c} / ${partido.jugador_d}</span>
      </div>
      ${adminOnlyFixtureMeta(`<div class="match-score">Puntaje: ${scoreText(partido)}</div>`)}
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
      <div class="match-body">
        <span class="team-name">${partido.jugador_1}</span>
        <span class="versus-cell">${partido.es_fecha_libre ? 'libre' : 'vs'}</span>
        <span class="team-name">${partido.es_fecha_libre ? 'Fecha libre' : partido.jugador_2}</span>
      </div>
      ${adminOnlyFixtureMeta(`<div class="match-score">Puntaje: ${scoreText1v1(partido)}</div>`)}
    </article>
  `;
}

function adminOnlyFixtureMeta(html) {
  return isAdmin() ? html : '';
}

function mesaBadge(index) {
  return `<span class="mesa-badge">Mesa ${index + 1}</span>`;
}

function scoreText(partido) {
  if (partido.estado !== 'finalizado') {
    return '-';
  }
  return `${partido.puntaje_dupla1} - ${partido.puntaje_dupla2}`;
}

function scoreText1v1(partido) {
  if (partido.estado !== 'finalizado') {
    return '-';
  }
  return `${partido.puntaje_jugador_1} - ${partido.puntaje_jugador_2}`;
}

function statusBadge(status) {
  return `<span class="status ${status === 'finalizado' ? 'done' : ''}">${status}</span>`;
}

function renderPositions(detail) {
  const { torneo, participantes } = detail;
  const rows = participantes.map((item, index) => {
    if (torneo.modalidad === 'americano_parejas_fijas') {
      return `<tr><td>${index + 1}</td><td>${item.nombre_equipo}</td><td>${item.jugador_1} / ${item.jugador_2}</td><td>${item.partidos_jugados}</td><td>${item.partidos_ganados}</td><td>${item.partidos_perdidos}</td><td>${item.puntos_totales}</td><td>-</td></tr>`;
    }
    return `<tr><td>${index + 1}</td><td>${item.nombre}</td><td>${item.alias || '-'}</td><td>${item.partidos_jugados}</td><td>${item.partidos_ganados}</td><td>${item.partidos_perdidos}</td><td>${item.puntos_a_favor}</td><td>${item.puntos_en_contra}</td></tr>`;
  }).join('');

  const head = torneo.modalidad === 'americano_parejas_fijas'
    ? '<th>#</th><th>Equipo</th><th>Jugadores</th><th>PJ</th><th>PG</th><th>PP</th><th>Puntos</th><th>Contra</th>'
    : '<th>#</th><th>Jugador</th><th>Alias</th><th>PJ</th><th>PG</th><th>PP</th><th>Puntos</th><th>Contra</th>';

  $('#positionsContent').innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>${head}</tr></thead>
        <tbody>${rows || '<tr><td colspan="6">Sin participantes</td></tr>'}</tbody>
      </table>
    </div>
    ${torneo.modalidad !== 'americano_parejas_fijas' ? '<p class="meta standings-note">Desempate: puntos totales, menor contra y luego resultado directo entre jugadores enfrentados.</p>' : ''}
  `;
}

function getSortedParticipants(detail) {
  const participantes = [...detail.participantes];
  if (detail.torneo.modalidad === 'americano_parejas_fijas') {
    return participantes.sort((a, b) => (
      b.puntos_totales - a.puntos_totales
      || b.partidos_ganados - a.partidos_ganados
      || a.partidos_perdidos - b.partidos_perdidos
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
    : `${winnerName} se lleva La Cofradía-2026 con ${winner.puntos_totales} puntos.`;
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
    : [...sorted].sort((a, b) => b.puntos_totales - a.puntos_totales)[0];
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

  $('#pairResultFields').classList.toggle('is-hidden', torneo.modalidad !== 'americano_parejas_fijas');
  $('#individualResultFields').classList.toggle('is-hidden', torneo.modalidad === 'americano_parejas_fijas');
  $('#scoreOneLabel').textContent = torneo.modalidad === 'americano_individual_1v1' ? 'Jugador 1' : 'Dupla 1';
  $('#scoreTwoLabel').textContent = torneo.modalidad === 'americano_individual_1v1' ? 'Jugador 2' : 'Dupla 2';
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
    hint.textContent = 'No hay partidos pendientes para cargar.';
    hint.classList.remove('done');
    return;
  }

  if (selected.estado === 'finalizado') {
    hint.textContent = 'Resultado ya cargado. Si guardas de nuevo, vas a corregir este resultado.';
    hint.classList.add('done');
    return;
  }

  hint.textContent = 'Pendiente de carga.';
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
      return `<tr><td>${index + 1}</td><td>${item.nombre_equipo}</td><td>${item.jugador_1} / ${item.jugador_2}</td><td>${item.partidos_jugados}</td><td>${item.partidos_ganados}</td><td>${item.partidos_perdidos}</td><td>${item.puntos_totales}</td><td>-</td></tr>`;
    }
    return `<tr><td>${index + 1}</td><td>${item.nombre}</td><td>${item.alias || '-'}</td><td>${item.partidos_jugados}</td><td>${item.partidos_ganados}</td><td>${item.partidos_perdidos}</td><td>${item.puntos_a_favor}</td><td>${item.puntos_en_contra}</td></tr>`;
  }).join('');
  const head = detail.torneo.modalidad === 'americano_parejas_fijas'
    ? '<th>#</th><th>Equipo</th><th>Jugadores</th><th>PJ</th><th>PG</th><th>PP</th><th>Puntos</th><th>Contra</th>'
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
    : '<th>#</th><th>Equipo</th><th>Jugadores</th><th>PJ</th><th>PG</th><th>PP</th><th>Puntos</th><th>Contra</th>';
  const rows = torneo.posiciones.map((item) => isIndividual
    ? `<tr><td>${item.posicion}</td><td>${item.nombre}</td><td>${item.detalle || '-'}</td><td>${item.partidos_jugados}</td><td>${item.partidos_ganados}</td><td>${item.partidos_perdidos}</td><td>${item.puntos_a_favor}</td><td>${item.puntos_en_contra}</td></tr>`
    : `<tr><td>${item.posicion}</td><td>${item.nombre}</td><td>${item.detalle || '-'}</td><td>${item.partidos_jugados}</td><td>${item.partidos_ganados}</td><td>${item.partidos_perdidos}</td><td>${item.puntos_totales}</td><td>-</td></tr>`
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
    : ['#', 'Equipo', 'PJ', 'PG', 'PP', 'Pts', 'Contra'];
  const rows = sorted.map((item, index) => isIndividual
    ? [index + 1, item.alias || item.nombre, item.partidos_jugados, item.partidos_ganados, item.partidos_perdidos, item.puntos_a_favor, item.puntos_en_contra]
    : [index + 1, item.nombre_equipo, item.partidos_jugados, item.partidos_ganados, item.partidos_perdidos, item.puntos_totales, '-']
  );
  return buildWhatsappTable(detail.torneo.nombre_torneo, headers, rows);
}

function tableTextFromHistory(torneo) {
  if (!torneo) return '';
  const isIndividual = torneo.modalidad !== 'americano_parejas_fijas';
  const headers = isIndividual
    ? ['#', 'Jugador', 'PJ', 'PG', 'PP', 'Pts', 'Contra']
    : ['#', 'Equipo', 'PJ', 'PG', 'PP', 'Pts', 'Contra'];
  const rows = (torneo.posiciones || []).map((item) => isIndividual
    ? [item.posicion, item.detalle || item.nombre, item.partidos_jugados, item.partidos_ganados, item.partidos_perdidos, item.puntos_a_favor, item.puntos_en_contra]
    : [item.posicion, item.nombre, item.partidos_jugados, item.partidos_ganados, item.partidos_perdidos, item.puntos_totales, '-']
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
      throw new Error('El torneo de parejas fijas empieza desde 5 parejas.');
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
  $('#copyWinnerTableButton').addEventListener('click', () => copyText(tableTextFromDetail(state.lastFinishedDetail), 'Tabla final copiada.'));
  $('#copyHistoryTableButton').addEventListener('click', () => copyText(tableTextFromHistory(state.selectedHistoryTournament), 'Tabla del historial copiada.'));
  $('#shareLinkButton').addEventListener('click', shareLink);
  $('#backupButton').addEventListener('click', downloadBackup);
  $('#clearHistoryButton').addEventListener('click', clearHistory);
  $('#deleteFixtureTournamentButton').addEventListener('click', () => deleteSelectedTournament(state.selectedFixtureId));
  $('#deletePositionsTournamentButton').addEventListener('click', () => deleteSelectedTournament(state.selectedPositionsId));
  $('#historyContent').addEventListener('click', (event) => {
    const button = event.target.closest('[data-history-open]');
    if (!button) {
      return;
    }
    openHistoryTournament(Number(button.dataset.historyOpen));
  });
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

  if (!window.confirm('Esto va a borrar todos los torneos finalizados del historial.')) {
    return;
  }

  try {
    const result = await api('/api/historial', { method: 'DELETE' });
    toast(`Historial borrado: ${result.torneos_borrados} torneo(s).`);
    await loadTorneos();
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
      await api(`/api/partidos/parejas/${match.id}/resultado`, {
        method: 'POST',
        body: JSON.stringify({ ganador_id: Number($('#winnerSelect').value) }),
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
