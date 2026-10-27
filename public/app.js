const $ = (id) => document.getElementById(id);
const landing = $('landing');
const game = $('game');
const canvas = $('map');
const ctx = canvas.getContext('2d');
const keys = new Set();
const directions = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const local = { code: '', token: '', playerId: '' };
let view = null;
let movementLoop = null;
let pollLoop = null;
let toastTimer = 0;
let lastChatId = '';
let lastLogId = '';
let renderFrame = 0;

const PATHS = [
  [[182, 145], [315, 235], [498, 160]],
  [[498, 160], [660, 235], [804, 355]],
  [[804, 355], [690, 450], [480, 555]],
  [[480, 555], [300, 414], [182, 145]],
  [[498, 160], [476, 342], [480, 555]],
];

function savedCredentials() {
  try { return JSON.parse(localStorage.getItem('shadows-room') || 'null'); } catch { return null; }
}

function saveCredentials(data) {
  Object.assign(local, data);
  localStorage.setItem('shadows-room', JSON.stringify(local));
}

async function jsonRequest(operation, body) {
  const response = await fetch('/api/game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, op: operation }),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || data.message || 'The room service could not be reached.'), { data, status: response.status });
  return data;
}

async function createRoom() {
  setLandingError('');
  setBusy(true);
  try {
    const result = await jsonRequest('create', { name: $('player-name').value });
    saveCredentials({ code: result.code, token: result.token, playerId: result.playerId });
    await enterRoom();
  } catch (error) { setLandingError(error.message); }
  finally { setBusy(false); }
}

async function joinRoom() {
  setLandingError('');
  const code = $('room-code').value.trim().toUpperCase();
  if (code.length !== 6) return setLandingError('Enter the six-character room code from your host.');
  setBusy(true);
  try {
    const result = await jsonRequest('join', { code, name: $('player-name').value });
    saveCredentials({ code: result.code, token: result.token, playerId: result.playerId });
    await enterRoom();
  } catch (error) { setLandingError(error.message); }
  finally { setBusy(false); }
}

async function enterRoom() {
  landing.classList.add('hidden');
  game.classList.remove('hidden');
  $('room-code-display').textContent = local.code;
  setConnection('CONNECTING');
  await refreshState();
  clearInterval(pollLoop);
  pollLoop = setInterval(refreshState, 850);
  startMovementLoop();
  resizeCanvas();
}

async function refreshState() {
  if (!local.code || !local.token) return;
  try {
    const next = await jsonRequest('state', { code: local.code, token: local.token });
    const oldPhase = view?.room.phase;
    view = next;
    setConnection('CONNECTED');
    updateUi();
    if (oldPhase !== 'investigation' && next.room.phase === 'investigation' && !sessionStorage.getItem('shadows-tutorial-seen')) showTutorial();
  } catch (error) {
    setConnection('RECONNECTING');
    if (error.status === 401 || error.status === 404) {
      clearInterval(pollLoop);
      localStorage.removeItem('shadows-room');
      Object.assign(local, { code: '', token: '', playerId: '' });
      game.classList.add('hidden');
      landing.classList.remove('hidden');
      setLandingError(error.message);
    } else if (error.data?.error) showToast(error.data.error);
  }
}

async function act(action, extra = {}) {
  if (!local.code || !local.token) return;
  try {
    const result = await jsonRequest('action', { code: local.code, token: local.token, action, ...extra });
    if (result.state) view = result.state;
    if (result.message) showToast(result.message);
    if (view) updateUi();
  } catch (error) {
    if (error.data?.state) { view = error.data.state; updateUi(); }
    showGameError(error.message);
  }
}

function setBusy(busy) {
  $('create-room').disabled = busy;
  $('join-room').disabled = busy;
}

function setLandingError(message) { $('landing-error').textContent = message; }
function setConnection(message) { $('connection-state').textContent = message; $('connection-state').classList.toggle('is-offline', message !== 'CONNECTED'); }

function showToast(message) {
  const el = $('map-toast');
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3200);
}

function showGameError(message) {
  $('game-error').textContent = message;
  $('game-error').classList.add('is-visible');
  setTimeout(() => $('game-error').classList.remove('is-visible'), 4500);
}

function updateUi() {
  if (!view) return;
  const { room: r, me } = view;
  $('room-code-display').textContent = r.code;
  $('round-counter').textContent = `ROUND ${r.round} / ${r.totalRounds}`;
  $('player-count').textContent = r.phase === 'lobby' ? `${r.connectedCount} / 8 CONNECTED` : `${r.activeCount} / 8 PLAYERS`;
  $('team-summary').textContent = r.phase === 'lobby' ? `${r.readyCount} / ${r.connectedCount} READY` : `${r.activeCount} IN THE CASE`;
  $('map-title').textContent = ({ lobby: 'The waiting room', investigation: 'The streets of London', reunion: 'The road to Blackthorn', results: 'Case closed' })[r.phase];
  updatePhaseCard(r, me);
  updateObjectives(r, me);
  renderClues(r.clues);
  renderTeam(r.players, me);
  renderLog(r.log);
  renderChat(r.chat);
  updateVoteUi(r, me);
  updateResults(r, me);
  updateControls(r, me);
  drawMap();
  if (r.phase === 'investigation' && !sessionStorage.getItem('shadows-tutorial-seen')) showTutorial();
}

function updatePhaseCard(r, me) {
  const copy = {
    lobby: ['WAITING', `Round ${r.round} of ${r.totalRounds}`, 'Everyone gets a Ready button. The case begins automatically when every connected player is ready.'],
    investigation: ['INVESTIGATE', 'The separation', 'A blast has scattered the team. Recover the letter fragments, then follow the evidence.'],
    reunion: ['REUNITE', 'The final route', 'The telegraph points to Blackthorn House. Bring everyone still in the chase to its door, then investigate together.'],
    results: ['CASE CLOSED', 'The truth comes to light.', 'The whole team reached Blackthorn House and finished the case.'],
  }[r.phase];
  $('phase-pill').textContent = copy[0];
  $('phase-title').textContent = copy[1];
  $('phase-copy').textContent = copy[2];
  const roleCard = $('role-card');
  roleCard.classList.toggle('hidden', !me.role || r.phase === 'lobby');
  $('role-kicker').textContent = r.mode === 'cooperative' ? 'TEAM ROLE' : 'PRIVATE ROLE';
  $('role-name').textContent = me.role === 'culprit' ? 'THE CULPRIT' : 'A DETECTIVE';
  $('role-name').classList.toggle('role-name--culprit', me.role === 'culprit');
  $('role-secret').textContent = me.role === 'culprit' ? `Secretly slow the case and avoid a unanimous vote. ${me.objectiveAchieved ? 'You have jammed two stations.' : ''}` : r.mode === 'cooperative' ? 'Everyone is a detective. Share the clues and meet at Blackthorn House together.' : 'Your role is private. Recover clues, compare suspicions, and watch for anyone delaying the case.';
  $('start-game').classList.toggle('hidden', r.phase !== 'lobby');
  $('start-game').classList.toggle('is-ready', me.ready);
  $('start-game').setAttribute('aria-pressed', String(Boolean(me.ready)));
  $('start-game').textContent = me.ready ? 'READY · Change status ✓' : 'I’m ready →';
  $('start-hint').textContent = r.phase === 'lobby'
    ? (r.connectedCount < 2 ? 'At least two players must join. You can mark ready while you wait.' : `${r.readyCount} of ${r.connectedCount} connected players ready · starts automatically when all are ready.`)
    : '';
  $('mission-list').classList.toggle('hidden', r.phase === 'lobby' || r.phase === 'results');
}

function updateObjectives(r, me) {
  const title = $('objective-title');
  const copy = $('objective-copy');
  const missions = r.missions;
  if (r.phase === 'lobby') {
    title.textContent = 'Gather the team';
    copy.textContent = 'Share the room code, then everyone marks ready. The case opens as soon as all connected players are ready.';
  } else if (me.eliminated && r.phase !== 'results') {
    title.textContent = 'Taken into custody';
    copy.textContent = 'Your secret role is known. Watch the detectives finish the case together.';
  } else if (me.role === 'culprit' && !r.culpritCaught && r.phase !== 'results') {
    title.textContent = me.objectiveAchieved ? 'Keep your cover' : 'Delay the investigation';
    copy.textContent = me.objectiveAchieved ? 'You jammed two stations. Avoid the team’s unanimous vote and stay hidden.' : 'Get near a detective to strike, or an unfinished station to jam it. Both actions leave clues for the team.';
  } else if (r.phase === 'investigation') {
    title.textContent = 'Follow the letter';
    copy.textContent = r.mode === 'cooperative' ? 'Work together on the ink and seal at Scotland Yard. Different detectives can handle each fragment.' : 'Have two different detectives compare the ink and seal at Scotland Yard. After two clues, detectives can vote once.';
  } else if (r.phase === 'reunion') {
    const here = r.players.filter((p) => !p.eliminated && p.safehouse && !p.incapacitated).length;
    title.textContent = r.reunionReady ? 'Complete the reunion' : 'Reach Blackthorn House';
    copy.textContent = r.reunionReady ? 'Everyone still in the chase is safely at the door. Investigate together to finish the case.' : `${here} of ${r.activeCount} teammates are at the safehouse. Help anyone who is down, then gather at the door.`;
  } else if (r.phase === 'results') {
    title.textContent = r.matchComplete ? 'The casebook is claimed' : `Round ${r.round} is complete`;
    copy.textContent = r.matchComplete ? 'The three-round tournament is over. The highest score wins.' : `Round ${r.round} of ${r.totalRounds} is complete. Scores carry into the next case.`;
  }
  $('mission-list').replaceChildren();
  const rows = [
    ['LETTER', missions.letter, 'Compare ink & seal'],
    ['CIPHER', missions.cipher, 'Decode timetable'],
    ['TELEGRAPH', missions.telegraph, 'Repair the signal'],
  ];
  for (const [label, m, action] of rows) {
    const row = document.createElement('div');
    row.className = 'mission-row';
    const icon = document.createElement('span');
    icon.className = `mission-check ${m.done ? 'is-done' : ''}`;
    icon.textContent = m.done ? '✓' : '○';
    const text = document.createElement('span');
    text.innerHTML = `<b>${label}</b><small>${action}</small>`;
    const progress = document.createElement('span');
    progress.className = 'mission-progress';
    progress.textContent = `${m.progress}/${m.total}`;
    row.append(icon, text, progress);
    $('mission-list').append(row);
  }
}

function renderClues(clues) {
  $('clue-count').textContent = `${clues.length} CLUE${clues.length === 1 ? '' : 'S'}`;
  const list = $('clue-list');
  list.replaceChildren();
  if (!clues.length) {
    const empty = document.createElement('p'); empty.className = 'empty-note'; empty.textContent = 'No evidence yet. The team’s findings will appear here.'; list.append(empty); return;
  }
  for (const clue of [...clues].reverse()) {
    const card = document.createElement('article'); card.className = 'clue-entry';
    const title = document.createElement('h4'); title.textContent = clue.title;
    const detail = document.createElement('p'); detail.textContent = clue.detail;
    card.append(title, detail); list.append(card);
  }
}

function renderTeam(players, me) {
  $('team-list').replaceChildren();
  players.forEach((player, index) => {
    const row = document.createElement('div'); row.className = 'team-member';
    const avatar = document.createElement('span'); avatar.className = `team-avatar avatar-${index % 5}`; avatar.textContent = initials(player.name);
    const details = document.createElement('span'); details.className = 'team-member__details';
    const name = document.createElement('b'); name.textContent = `${player.name}${player.isMe ? ' (you)' : ''}`;
    const status = document.createElement('small');
    status.textContent = view?.room.phase === 'lobby'
      ? player.ready ? 'Ready to investigate' : player.connected ? 'Waiting to get ready' : 'Reconnecting'
      : player.eliminated ? 'Taken into custody' : player.incapacitated ? 'Needs rescue' : !player.connected ? 'Reconnecting' : player.safehouse ? 'At Blackthorn House' : 'In the streets';
    details.append(name, status);
    const badge = document.createElement('span'); badge.className = 'team-member__badge';
    if (view?.room.phase === 'lobby') {
      badge.textContent = player.ready ? 'READY' : 'WAITING';
      badge.classList.toggle('badge-ready', Boolean(player.ready));
      badge.classList.toggle('badge-waiting', !player.ready);
    }
    else if (player.incapacitated) badge.textContent = 'DOWN';
    else if (player.eliminated) badge.textContent = 'CAUGHT';
    else if (player.revealedRole) badge.textContent = player.revealedRole === 'culprit' ? 'CULPRIT' : 'DETECTIVE';
    else badge.textContent = player.isMe && me.role === 'culprit' ? 'YOU' : '•';
    if (player.revealedRole === 'culprit') badge.classList.add('badge-danger');
    row.append(avatar, details, badge); $('team-list').append(row);
  });
}

function renderLog(log) {
  const list = $('event-list');
  const newest = log.at(-1)?.id || '';
  if (newest === lastLogId && list.childElementCount) return;
  lastLogId = newest;
  list.replaceChildren();
  for (const item of log.slice(-6).reverse()) {
    const row = document.createElement('p'); row.className = `event event--${item.kind}`;
    const time = new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const stamp = document.createElement('time'); stamp.textContent = time;
    const text = document.createElement('span'); text.textContent = item.text;
    row.append(stamp, text); list.append(row);
  }
}

function renderChat(chat) {
  const newest = chat.at(-1)?.id || '';
  const list = $('chat-list');
  if (newest === lastChatId && list.childElementCount) return;
  lastChatId = newest;
  list.replaceChildren();
  for (const message of chat.slice(-5)) {
    const row = document.createElement('p');
    const name = document.createElement('b'); name.textContent = `${message.name}: `;
    const text = document.createElement('span'); text.textContent = message.text;
    row.append(name, text); list.append(row);
  }
  list.scrollTop = list.scrollHeight;
}

function updateVoteUi(r, me) {
  const showVote = me.voteEligible && (r.voteAvailable || (r.vote && !r.vote.resolved));
  const showSummary = Boolean(r.vote?.resolved);
  $('vote-card').classList.toggle('hidden', !showVote && !showSummary);
  if (showVote) {
    const secondsLeft = r.vote?.deadline ? Math.max(0, Math.ceil((r.vote.deadline - Date.now()) / 1000)) : 30;
    $('vote-copy').textContent = me.hasVoted ? `Your suspicion is recorded. Every detective must choose the same person (${secondsLeft}s left).` : `Discuss your suspect, then vote. Every detective must choose the same person (${secondsLeft}s left) to take the culprit out of the case.`;
    fillSuspects($('vote-target'), r.players, me, true);
    $('vote-submit').disabled = me.hasVoted;
    $('vote-result').textContent = '';
  } else if (showSummary) {
    $('vote-copy').textContent = 'The team has used its one suspicion vote. Finish the clues and meet at Blackthorn House.';
    $('vote-result').textContent = voteText(r.vote);
  }
  $('vote-submit').classList.toggle('hidden', !showVote);
}

function voteText(vote) {
  const tally = Object.entries(vote.tally || {}).map(([name, count]) => `${name} ${count}`).join(' · ');
  const outcome = vote.outcome === 'caught' ? `${vote.suspectName} was unanimously identified and taken into custody.` : vote.outcome === 'wrong' ? `${vote.suspectName} was innocent. The culprit is still at large.` : 'The vote split. No one was taken into custody.';
  return `${outcome}${tally ? ` (${tally})` : ''}`;
}

function fillSuspects(select, players, me, includeSelf = false) {
  const current = select.value;
  select.replaceChildren();
  const first = document.createElement('option'); first.value = ''; first.textContent = 'Choose a suspect'; select.append(first);
  for (const player of (view?.room.suspects || players).filter((candidate) => candidate.active !== false)) {
    if (!includeSelf && player.id === me.id) continue;
    const option = document.createElement('option'); option.value = player.id; option.textContent = player.name; select.append(option);
  }
  if ([...select.options].some((o) => o.value === current)) select.value = current;
}

function updateResults(r, me) {
  const show = r.phase === 'results';
  $('result-card').classList.toggle('hidden', !show);
  if (!show) return;
  const solved = r.result?.caseSolved;
  $('result-stamp').textContent = r.matchComplete ? 'MATCH OVER' : solved ? 'SOLVED' : 'CULPRIT ESCAPED';
  $('result-stamp').classList.toggle('result-stamp--fail', !solved);
  const winners = r.result?.matchWinnerNames || [];
  $('result-title').textContent = r.matchComplete ? (winners.length === 1 ? `${winners[0]} wins Watson’s casebook.` : `Joint winners: ${winners.join(' & ')}.`) : solved ? 'The case is solved.' : 'The culprit escaped.';
  const award = r.result?.roundAwards?.find((entry) => entry.playerId === me.id);
  $('result-copy').textContent = `Round ${r.round} · You earned ${award?.pointsEarned ?? 0} point${award?.pointsEarned === 1 ? '' : 's'}. ${r.result?.caseOutcome || ''}`;
  $('result-truth').textContent = r.result?.truth || '';
  const breakdown = award?.notes?.length ? award.notes.join(' · ') : 'No bonus points this round.';
  $('round-score').textContent = `Your round points: ${breakdown}. Detectives score for evidence and solving the case together. A culprit scores for sabotage and escaping capture.`;
  const board = $('scoreboard');
  board.replaceChildren();
  for (const [index, entry] of (r.result?.scoreboard || []).entries()) {
    const row = document.createElement('li');
    const label = document.createElement('span'); label.textContent = `${index + 1}. ${entry.name}${entry.playerId === me.id ? ' (you)' : ''}`;
    const points = document.createElement('b'); points.textContent = `${entry.score} pts`;
    row.append(label, points); board.append(row);
  }
  $('rematch').classList.toggle('hidden', !me.isHost);
  $('rematch').innerHTML = r.matchComplete ? 'Start a new match <span>↻</span>' : 'Next round <span>→</span>';
}

function nearDownPlayer(me, players) { return players.find((p) => p.id !== me.id && p.incapacitated && distance(me, p) < 50); }

function updateControls(r, me) {
  const active = ['investigation', 'reunion'].includes(r.phase);
  const down = nearDownPlayer(me, r.players);
  const target = nearestPoint(me);
  $('interact').disabled = !active || me.incapacitated || me.eliminated || (!target && !down);
  $('interact').innerHTML = down ? `<span>✚</span> Rescue` : '<span>◎</span> Investigate';
  $('interaction-hint').textContent = down ? `Rescue ${down.name}` : target ? `${target.label} · press E` : r.phase === 'lobby' ? 'Waiting for the host to begin.' : 'Move close to a glowing station.';
  if (target?.mission === 'reunion' && r.reunionReady) $('interaction-hint').textContent = 'Complete the reunion · press E';
  if (target?.mission === 'reunion' && r.reunionReady) $('interact').innerHTML = '<span>◎</span> Reunite';
  const roleAction = $('role-action');
  const culpritCanAct = me.role === 'culprit' && !r.culpritCaught && active;
  roleAction.classList.toggle('hidden', !culpritCanAct);
  if (culpritCanAct) {
    const targetPlayer = r.players.find((p) => p.id !== me.id && !p.eliminated && !p.incapacitated && distance(me, p) <= 39);
    roleAction.textContent = targetPlayer ? `Strike ${targetPlayer.name}` : 'Sabotage';
    roleAction.disabled = me.incapacitated || (targetPlayer ? me.cooldowns.ambush > 0 : me.cooldowns.sabotage > 0);
    roleAction.title = targetPlayer ? 'Strike a nearby detective; they can be rescued' : 'Jam an unfinished mission station';
  }
}

function nearestPoint(me) {
  if (!view) return null;
  const mission = view.room.missions;
  return view.room.points.map((p) => ({ ...p, distance: distance(me, p) }))
    .filter((p) => p.distance <= 52)
    .filter((p) => {
      if (p.mission === 'letter') return !mission.letter.done;
      if (p.mission === 'cipher') return mission.letter.done && !mission.cipher.done;
      if (p.mission === 'telegraph') return mission.cipher.done && !mission.telegraph.done;
      if (p.mission === 'reunion') return view.room.phase === 'reunion';
      return false;
    })
    .sort((a, b) => a.distance - b.distance)[0];
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function initials(name) { return name.split(/\s+/).map((word) => word[0] || '').join('').slice(0, 2).toUpperCase(); }

function moveVector() {
  let x = 0, y = 0;
  if (keys.has('ArrowLeft') || keys.has('a')) x--;
  if (keys.has('ArrowRight') || keys.has('d')) x++;
  if (keys.has('ArrowUp') || keys.has('w')) y--;
  if (keys.has('ArrowDown') || keys.has('s')) y++;
  return [x, y];
}

function startMovementLoop() {
  clearInterval(movementLoop);
  movementLoop = setInterval(() => {
    if (!view?.me.canMove) return;
    const [dx, dy] = moveVector();
    if (dx || dy) act('move', { dx, dy });
  }, 240);
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width * 960, y: (event.clientY - rect.top) / rect.height * 640 };
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  drawMap();
}

function drawMap() {
  if (!view) { drawTitleMap(); return; }
  if (!canvas.width || !canvas.height) return;
  const ratio = window.devicePixelRatio || 1;
  ctx.setTransform(canvas.width / 960, 0, 0, canvas.height / 640, 0, 0);
  ctx.clearRect(0, 0, 960, 640);
  const bg = ctx.createLinearGradient(0, 0, 0, 640);
  bg.addColorStop(0, '#101d27'); bg.addColorStop(1, '#17222a');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 960, 640);
  drawStreetGrid();
  drawParkAndRiver();
  drawRoads();
  drawBuildings();
  for (const location of view.room.locations) drawLocation(location, view.room.phase);
  for (const point of view.room.points) drawPoint(point);
  for (const p of view.room.players) drawPlayer(p, view.me);
  drawCompass();
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function drawTitleMap() {
  if (!canvas.width || !canvas.height) return;
  ctx.setTransform(canvas.width / 960, 0, 0, canvas.height / 640, 0, 0);
  ctx.fillStyle = '#111e27'; ctx.fillRect(0, 0, 960, 640);
  drawStreetGrid(); drawParkAndRiver(); drawRoads(); drawBuildings();
  for (const p of [{ x: 182, y: 145, name: 'SCOTLAND YARD', icon: '✦' }, { x: 498, y: 160, name: '221B BAKER STREET', icon: '⌂' }, { x: 804, y: 355, name: 'EAST LONDON STATION', icon: '▤' }, { x: 480, y: 555, name: 'BLACKTHORN HOUSE', icon: '◈' }]) drawLocation(p, 'lobby');
}

function drawStreetGrid() {
  ctx.strokeStyle = 'rgba(155,178,180,.055)'; ctx.lineWidth = 1;
  for (let x = 18; x < 960; x += 34) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 640); ctx.stroke(); }
  for (let y = 12; y < 640; y += 34) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(960, y); ctx.stroke(); }
  for (let i = 0; i < 150; i++) {
    const x = (i * 127 + 19) % 960, y = (i * 79 + 7) % 640;
    ctx.fillStyle = `rgba(204,215,202,${0.008 + ((i * 17) % 20) / 1000})`;
    ctx.fillRect(x, y, 22 + (i % 8) * 5, 13 + (i % 6) * 4);
  }
}

function drawParkAndRiver() {
  ctx.fillStyle = 'rgba(46,76,67,.22)';
  roundedRect(ctx, 55, 225, 220, 168, 14); ctx.fill();
  ctx.strokeStyle = 'rgba(110,145,120,.16)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(52,82,98,.35)';
  ctx.beginPath(); ctx.moveTo(908, 0); ctx.bezierCurveTo(860, 105, 950, 198, 895, 284); ctx.bezierCurveTo(834, 375, 928, 490, 866, 640); ctx.lineTo(960, 640); ctx.lineTo(960, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(116,153,164,.20)'; ctx.lineWidth = 3; ctx.stroke();
}

function drawRoads() {
  for (const points of PATHS) {
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.strokeStyle = 'rgba(5,12,17,.46)'; ctx.lineWidth = 40; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.strokeStyle = 'rgba(121,130,116,.16)'; ctx.lineWidth = 34; ctx.stroke();
    ctx.strokeStyle = 'rgba(207,177,118,.14)'; ctx.lineWidth = 1.4; ctx.setLineDash([7, 11]); ctx.stroke(); ctx.setLineDash([]);
  }
}

function drawBuildings() {
  const blocks = [[38, 36, 136, 72], [210, 37, 105, 75], [360, 34, 100, 60], [532, 33, 128, 78], [713, 44, 102, 55], [75, 434, 142, 86], [244, 508, 114, 66], [625, 517, 154, 74], [730, 428, 90, 64], [345, 265, 91, 61], [538, 302, 112, 67], [277, 300, 60, 50], [631, 145, 76, 54], [35, 545, 116, 64]];
  blocks.forEach(([x, y, w, h], i) => {
    ctx.fillStyle = i % 3 === 0 ? 'rgba(59,70,68,.54)' : 'rgba(51,65,68,.46)';
    roundedRect(ctx, x, y, w, h, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(185,165,122,.11)'; ctx.lineWidth = 1; ctx.stroke();
    for (let wx = x + 13; wx < x + w - 8; wx += 21) for (let wy = y + 12; wy < y + h - 8; wy += 20) {
      ctx.fillStyle = (wx * wy + i) % 3 ? 'rgba(220,169,90,.10)' : 'rgba(117,148,146,.10)';
      ctx.fillRect(wx, wy, 5, 6);
    }
  });
}

function drawLocation(loc, phase) {
  const safe = loc.id === 'safehouse';
  const open = safe && phase !== 'lobby' && phase !== 'investigation';
  const color = safe ? (open ? '#d6aa64' : '#8c8170') : '#d6aa64';
  ctx.beginPath(); ctx.arc(loc.x, loc.y, 35, 0, Math.PI * 2); ctx.fillStyle = 'rgba(10,18,23,.86)'; ctx.fill();
  ctx.beginPath(); ctx.arc(loc.x, loc.y, 32, 0, Math.PI * 2); ctx.strokeStyle = `${color}66`; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.beginPath(); ctx.arc(loc.x, loc.y, 25, 0, Math.PI * 2); ctx.fillStyle = 'rgba(206,164,95,.10)'; ctx.fill();
  ctx.fillStyle = color; ctx.font = loc.id === 'baker' ? '600 11px system-ui, sans-serif' : '20px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(loc.id === 'baker' ? '221B' : loc.icon, loc.x, loc.y - 1);
  ctx.textBaseline = 'alphabetic'; ctx.font = '600 10px system-ui, sans-serif'; ctx.fillStyle = '#e0d5bd'; ctx.fillText(loc.name.toUpperCase(), loc.x, loc.y + 54);
}

function drawPoint(p) {
  const { room, me } = view;
  const active = (p.mission === 'letter' && !room.missions.letter.done) || (p.mission === 'cipher' && room.missions.letter.done && !room.missions.cipher.done) || (p.mission === 'telegraph' && room.missions.cipher.done && !room.missions.telegraph.done) || (p.mission === 'reunion' && room.phase === 'reunion');
  if (!active) return;
  const jammed = room.sabotage?.mission === p.mission && room.sabotage.until > Date.now();
  const nearby = distWorld(me, p) < 52;
  const t = Date.now() / 500;
  ctx.beginPath(); ctx.arc(p.x, p.y, 12 + Math.sin(t) * 2, 0, Math.PI * 2);
  ctx.fillStyle = jammed ? 'rgba(210,103,87,.16)' : 'rgba(218,174,101,.17)'; ctx.fill();
  ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fillStyle = jammed ? '#cf7464' : '#edca85'; ctx.fill();
  ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.strokeStyle = nearby ? '#f2d9a2' : '#cba86d99'; ctx.lineWidth = 1.1; ctx.stroke();
  if (nearby) { ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#f4e9d2'; ctx.fillText(jammed ? 'JAMMED · CLEAR' : `${p.label.toUpperCase()} · E`, p.x, p.y - 15); }
}

function distWorld(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function drawPlayer(p, me) {
  const pulse = p.isMe ? 9 + Math.sin(Date.now() / 250) * 1.1 : 8;
  ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, Math.PI * 2); ctx.fillStyle = p.incapacitated ? 'rgba(212,116,95,.2)' : 'rgba(4,10,14,.67)'; ctx.fill();
  ctx.beginPath(); ctx.arc(p.x, p.y, pulse, 0, Math.PI * 2);
  ctx.fillStyle = p.eliminated ? '#77766f' : p.incapacitated ? '#cb7869' : p.isMe ? '#e0b970' : '#85aeb0'; ctx.fill();
  ctx.strokeStyle = '#f0e1c1'; ctx.lineWidth = p.isMe ? 2 : 1; ctx.stroke();
  ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#f2ead9'; ctx.fillText(p.eliminated ? 'CUSTODY' : p.incapacitated ? '✚' : p.name, p.x, p.y - 19);
  if (!p.connected) { ctx.fillStyle = '#d4b878'; ctx.fillText('···', p.x, p.y + 25); }
}

function drawCompass() {
  ctx.fillStyle = 'rgba(222,210,186,.72)'; ctx.font = '600 9px system-ui'; ctx.textAlign = 'right'; ctx.fillText('N ↑', 930, 27);
  ctx.strokeStyle = 'rgba(219,199,161,.14)'; ctx.lineWidth = 1; ctx.strokeRect(8, 8, 944, 624);
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath(); context.roundRect(x, y, width, height, radius);
}

function showTutorial() {
  $('tutorial').classList.remove('hidden');
  sessionStorage.setItem('shadows-tutorial-seen', 'true');
}

function closeTutorial() { $('tutorial').classList.add('hidden'); }

$('create-room').addEventListener('click', createRoom);
$('join-room').addEventListener('click', joinRoom);
$('room-code').addEventListener('keydown', (event) => { if (event.key === 'Enter') joinRoom(); });
$('player-name').addEventListener('keydown', (event) => { if (event.key === 'Enter') createRoom(); });
  $('start-game').addEventListener('click', () => act('ready', { ready: !view?.me.ready }));
$('interact').addEventListener('click', () => act('interact'));
$('role-action').addEventListener('click', () => act('sabotage'));
$('vote-submit').addEventListener('click', () => { if ($('vote-target').value) act('vote', { target: $('vote-target').value }); });
$('rematch').addEventListener('click', () => act('rematch'));
$('copy-code').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(local.code); showToast(`Room code ${local.code} copied.`); }
  catch { showToast(`Share room code ${local.code} with your friends.`); }
});
$('chat-form').addEventListener('submit', (event) => {
  event.preventDefault(); const field = $('chat-input'); const text = field.value.trim();
  if (text) { field.value = ''; act('chat', { text }); }
});
$('tutorial-close').addEventListener('click', closeTutorial);
$('tutorial-got-it').addEventListener('click', closeTutorial);
$('tutorial').addEventListener('click', (event) => { if (event.target === $('tutorial')) closeTutorial(); });
$('leave-game').addEventListener('click', (event) => {
  if (view?.room.phase !== 'results') { event.preventDefault(); showToast(`Your seat will stay in room ${local.code} for the reconnect window.`); }
});

window.addEventListener('keydown', (event) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  const key = event.key.toLowerCase();
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) event.preventDefault();
  if (['w', 'a', 's', 'd', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) keys.add(key.length === 1 ? key : ({ arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', arrowup: 'ArrowUp', arrowdown: 'ArrowDown' })[key]);
  if (key === 'e' && !event.repeat && view) act('interact');
});
window.addEventListener('keyup', (event) => {
  const key = event.key.toLowerCase();
  keys.delete(key.length === 1 ? key : ({ arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', arrowup: 'ArrowUp', arrowdown: 'ArrowDown' })[key]);
});
window.addEventListener('blur', () => keys.clear());
window.addEventListener('resize', resizeCanvas);
window.addEventListener('beforeunload', () => { clearInterval(pollLoop); clearInterval(movementLoop); });

document.querySelectorAll('.dpad button').forEach((button) => {
  const [dx, dy] = directions[button.dataset.dir];
  const add = (event) => { event.preventDefault(); keys.add(dx < 0 ? 'ArrowLeft' : dx > 0 ? 'ArrowRight' : dy < 0 ? 'ArrowUp' : 'ArrowDown'); button.classList.add('is-pressed'); };
  const remove = (event) => { event.preventDefault(); keys.delete(dx < 0 ? 'ArrowLeft' : dx > 0 ? 'ArrowRight' : dy < 0 ? 'ArrowUp' : 'ArrowDown'); button.classList.remove('is-pressed'); };
  button.addEventListener('pointerdown', add); button.addEventListener('pointerup', remove); button.addEventListener('pointercancel', remove); button.addEventListener('pointerleave', remove);
});

canvas.addEventListener('click', (event) => {
  if (!view || !view.me.canMove) return;
  const target = canvasPoint(event);
  const closest = view.room.points.map((p) => ({ ...p, d: Math.hypot(target.x - p.x, target.y - p.y) })).sort((a, b) => a.d - b.d)[0];
  if (closest?.d < 30 && closest.mission === 'reunion' && view.room.phase === 'reunion') showToast('Bring everyone still in the chase to the door, then investigate together.');
});

setInterval(() => { if (view) drawMap(); }, 90);
requestAnimationFrame(function animate() { drawMap(); renderFrame = requestAnimationFrame(animate); });

const restored = savedCredentials();
if (restored?.code && restored?.token) {
  Object.assign(local, restored);
  enterRoom().catch(() => { game.classList.add('hidden'); landing.classList.remove('hidden'); });
} else resizeCanvas();
