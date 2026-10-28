import { createDetectivePreview, createLondonWorld } from './world3d.js';

const $ = (id) => document.getElementById(id);
const welcome = $('welcome-screen');
const identity = $('identity-screen');
const landing = $('landing');
const game = $('game');
const canvas = $('map');
const ctx = canvas.getContext('2d');
function savedReducedMotion() {
  try { return localStorage.getItem('shadows-reduce-motion') === 'true'; }
  catch { return false; }
}
let world = null;
try { world = createLondonWorld($('world-3d'), { reducedMotion: savedReducedMotion(), onLook: () => advanceTutorial('look') }); }
catch (error) { console.warn('The 3D London scene could not start; the illustrated map fallback will be used.', error); }
const worldArt = new Image();
worldArt.src = '/london-district.png';
const keys = new Set();
const directions = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const local = { code: '', token: '', playerId: '', playerName: '' };
let selectedCharacter = null;
let view = null;
let movementLoop = null;
let pollLoop = null;
let toastTimer = 0;
let lastChatId = '';
let lastLogId = '';
let lastClueSignature = '';
let renderFrame = 0;
let lastFrameAt = performance.now();
const displayPositions = new Map();
const characterPreviews = [];
let tutorialIndex = -1;

const TUTORIAL_STEPS = [
  { trigger: 'move', title: 'Move through London', copy: 'Use W, A, S, D or the arrow keys. On a phone or tablet, hold one of the direction buttons. Move a little to continue.', hint: 'You can change direction any time.' },
  { trigger: 'look', title: 'Look around', copy: 'Drag across the street scene to turn your view. On a touch screen, swipe over the scene.', hint: 'Try a short drag.' },
  { trigger: 'investigate', title: 'Examine a clue', copy: 'Follow the gold marker to a glowing station. Get close, then press E or tap Examine.', hint: 'Your current lead is shown on the right.' },
  { trigger: 'challenge', title: 'Read the evidence', copy: 'The exhibit explains what you found. Choose the answer that fits, or set the puzzle using the clue and its hint. You can try again if you are wrong.', hint: 'Work together: different detectives examine the letter and its seal.' },
  { trigger: 'casebook', title: 'Check Watson’s Casebook', copy: 'Your shared casebook explains what the team found, why it matters, and where to look next. The clue stays there for everyone.', hint: 'Read the newest clue, then continue.' },
  { trigger: 'finish', title: 'Follow one lead at a time', copy: 'The gold marker and “Your Next Lead” panel show what to do next. Gather the clues, follow the telegram, then meet at Blackthorn House.', hint: 'You can replay these tips with How to Play.', final: true },
];

const PATHS = [
  [[182, 145], [315, 235], [498, 160]],
  [[498, 160], [660, 235], [804, 355]],
  [[804, 355], [690, 450], [480, 555]],
  [[480, 555], [300, 414], [182, 145]],
  [[498, 160], [476, 342], [480, 555]],
];

const FIELD_CHALLENGES = {
  'letter-ink': {
    kicker: 'SCOTLAND YARD · DISPATCH LAB', title: 'The ink has a signature',
    evidence: 'The laboratory finds iron-rich gall residue in the letter. Only the Yard dispatch office used that ink.',
    question: 'Which ink matches the sample?',
    hint: 'Look for the option that names iron. The clue says “iron-rich gall residue.”',
    options: [
      { id: 'lampblack', label: 'Lampblack printer’s ink', note: 'Soot pigment, with no iron residue' },
      { id: 'iron-gall', label: 'Iron-gall dispatch ink', note: 'The Yard’s iron-rich formula' },
      { id: 'blue-aniline', label: 'Blue aniline ink', note: 'A bright synthetic dye' },
    ],
  },
  'letter-seal': {
    kicker: 'SCOTLAND YARD · SEAL REGISTER', title: 'The impossible hour',
    evidence: 'Holmes left London at 8:40. Seal 14 was signed out at 8:52; the letter carries a 9:10 stamp.',
    question: 'What does the register prove?',
    hint: 'Compare the times: Holmes left at 8:40, but the seal was checked out at 8:52.',
    options: [
      { id: 'porter-before', label: 'The porter stamped it before Holmes left', note: 'That would put the letter before 8:40' },
      { id: 'holmes-returned', label: 'Holmes returned to the Yard', note: 'No return is recorded that night' },
      { id: 'after-departure', label: 'The seal was used after Holmes departed', note: 'Its checkout time is 8:52' },
    ],
  },
  cipher: {
    kicker: '221B BAKER STREET · HOLMES’S NOTE', title: 'Read the mirror writing',
    evidence: 'The pencilled margin reads “TSAE / 82:9”. Holmes often reversed short directions in his field notes.',
    question: 'Set the three timetable wheels to the reversed hour: 9 · 2 · 8.',
    hint: 'Turn the wheels to 9, then 2, then 8. The note is written backwards.',
    puzzle: 'timetable',
    station: 'cipher',
    options: [
      { id: 'east-928', label: 'East London Station at 9:28', note: 'Reverse both the direction and the time' },
      { id: 'yard-910', label: 'Scotland Yard at 9:10', note: 'This is the forged letter’s stamp' },
      { id: 'baker-840', label: 'Baker Street at 8:40', note: 'This is when Holmes left London' },
    ],
  },
  wire: {
    kicker: 'EAST LONDON · SIGNAL BOX', title: 'Restore the outgoing pulse',
    evidence: 'Holmes’s routing card says the live line opens with three short pulses and one long pulse.',
    question: 'Tap each pulse to change it. Route three short pulses, then one long.',
    hint: 'The card says three SHORT pulses first, followed by one LONG pulse.',
    puzzle: 'telegraph',
    station: 'wire',
    options: [
      { id: 'long-three-short', label: 'One long, then three short', note: 'The reverse order will not open the line' },
      { id: 'triple-short-long', label: 'Three short, then one long', note: 'The sequence written on Holmes’s card' },
      { id: 'four-short', label: 'Four short pulses', note: 'A station check, not a dispatch signal' },
    ],
  },
  relay: {
    kicker: 'EAST LONDON · RELAY CABLE', title: 'Read the last word backwards',
    evidence: 'The final relay arrives as “NROHTKCALB”. The receiving key reverses the last word.',
    question: 'What destination does the signal name?',
    hint: 'Read NROHTKCALB from right to left.',
    options: [
      { id: 'scotland-yard', label: 'Scotland Yard', note: 'The false dispatch begins there' },
      { id: '221b', label: '221B Baker Street', note: 'Holmes’s note points away from Baker Street' },
      { id: 'blackthorn-house', label: 'Blackthorn House', note: 'The genuine transfer destination' },
    ],
  },
};

function savedCredentials() {
  try { return JSON.parse(localStorage.getItem('shadows-room') || 'null'); } catch { return null; }
}

function saveCredentials(data) {
  Object.assign(local, data);
  localStorage.setItem('shadows-room', JSON.stringify(local));
}

async function jsonRequest(operation, body) {
  let response;
  try {
    response = await fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, op: operation }),
      cache: 'no-store',
    });
  } catch {
    throw new Error('Cannot reach the game service at /api/game. Check that the local server or Vercel deployment is running, then retry.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || data.message || 'The room service could not be reached.'), { data, status: response.status });
  return data;
}

async function createRoom() {
  setLandingError('');
  setBusy(true);
  try {
    const result = await jsonRequest('create', { name: local.playerName });
    beginCharacterSelection(result);
  } catch (error) { setLandingError(error.message); }
  finally { setBusy(false); }
}

async function joinRoom() {
  setLandingError('');
  const code = $('room-code').value.trim().toUpperCase();
  if (code.length !== 6) return setLandingError('Enter the six-character room code from your host.');
  setBusy(true);
  try {
    const result = await jsonRequest('join', { code, name: local.playerName });
    beginCharacterSelection(result);
  } catch (error) { setLandingError(error.message); }
  finally { setBusy(false); }
}

function beginCharacterSelection(result) {
  Object.assign(local, result, { playerName: local.playerName });
  selectedCharacter = ['boy', 'girl'].includes(localStorage.getItem('shadows-character')) ? localStorage.getItem('shadows-character') : null;
  sessionStorage.setItem('shadows-pending-room', JSON.stringify(local));
  showCharacterGate();
}

async function confirmCharacterSelection() {
  if (!selectedCharacter || !local.code || !local.token) return;
  $('character-continue').disabled = true;
  $('character-hint').textContent = 'Saving your detective to the room…';
  try {
    const result = await jsonRequest('action', { code: local.code, token: local.token, action: 'character', character: selectedCharacter });
    if (result.state) view = result.state;
    local.character = selectedCharacter;
    saveCredentials(local);
    sessionStorage.removeItem('shadows-pending-room');
    await enterRoom();
  } catch (error) {
    $('character-hint').textContent = error.message || 'Could not save your detective. Check the connection and try again.';
    $('character-continue').disabled = false;
  }
}

async function cancelCharacterSelection() {
  if (local.code && local.token) {
    try { await jsonRequest('action', { code: local.code, token: local.token, action: 'leave' }); } catch { /* The room may have expired while choosing. */ }
  }
  sessionStorage.removeItem('shadows-pending-room');
  Object.assign(local, { code: '', token: '', playerId: '' });
  selectedCharacter = null;
  showRoomEntry();
}

function showScreen(screen) {
  for (const element of [welcome, identity, landing, $('character-gate'), game]) element.classList.add('hidden');
  screen.classList.remove('hidden');
}

function showWelcome() { showScreen(welcome); }

function showIdentity() {
  $('player-name').value = localStorage.getItem('shadows-name') || local.playerName || '';
  $('identity-error').textContent = '';
  showScreen(identity);
  $('player-name').focus();
}

function continueFromIdentity() {
  const name = $('player-name').value.trim();
  if (name.length < 2 || name.length > 18 || /[<>\u0000-\u001f]/.test(name)) {
    $('identity-error').textContent = 'Enter a detective name of 2–18 characters. Avoid angle brackets or control characters.';
    $('player-name').focus();
    return;
  }
  local.playerName = name;
  localStorage.setItem('shadows-name', name);
  $('welcome-detective-name').textContent = name;
  showRoomEntry();
}

function showRoomEntry() {
  $('welcome-detective-name').textContent = local.playerName || localStorage.getItem('shadows-name') || 'Detective';
  $('landing-error').textContent = '';
  showScreen(landing);
}

async function leaveRoom() {
  if (!local.code || !local.token) return showWelcome();
  const left = await act('leave');
  if (!left) return;
  clearInterval(pollLoop); clearInterval(movementLoop); keys.clear(); view = null;
  localStorage.removeItem('shadows-room');
  sessionStorage.removeItem('shadows-pending-room');
  Object.assign(local, { code: '', token: '', playerId: '' });
  showWelcome();
}

async function enterRoom() {
  showScreen(game);
  $('room-code-display').textContent = local.code;
  setConnection('CONNECTING');
  await refreshState();
  if (view?.me?.character) {
    selectedCharacter = view.me.character;
    local.character = selectedCharacter;
    localStorage.setItem('shadows-character', selectedCharacter);
    localStorage.setItem('shadows-room', JSON.stringify(local));
  }
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
      showIdentity();
      $('identity-error').textContent = error.message;
    } else if (error.data?.error) showToast(error.data.error);
  }
}

async function act(action, extra = {}) {
  if (!local.code || !local.token) return false;
  try {
    const result = await jsonRequest('action', { code: local.code, token: local.token, action, ...extra });
    if (result.state) view = result.state;
    if (result.message) showToast(result.message);
    if (view) updateUi();
    return true;
  } catch (error) {
    if (error.data?.state) { view = error.data.state; updateUi(); }
    if (!$('evidence-puzzle').classList.contains('hidden')) $('puzzle-feedback').textContent = error.message;
    else showGameError(error.message);
    return false;
  }
}

function openEvidencePuzzle(challenge) {
  keys.clear();
  challenge.failures = 0;
  $('puzzle-kicker').textContent = challenge.kicker;
  $('puzzle-title').textContent = challenge.title;
  $('puzzle-evidence').textContent = challenge.evidence;
  $('puzzle-question').textContent = challenge.question;
  $('puzzle-feedback').textContent = '';
  const options = $('puzzle-options');
  options.replaceChildren();
  if (challenge.puzzle === 'timetable') {
    const wheels = [0, 1, 2].map((index) => {
      const wheel = document.createElement('button');
      wheel.type = 'button';
      wheel.className = 'dial-wheel';
      wheel.setAttribute('aria-label', `Timetable wheel ${index + 1}`);
      wheel.dataset.value = '0';
      wheel.innerHTML = `<small>WHEEL ${index + 1}</small><strong>0</strong><span>↻ turn</span>`;
      wheel.addEventListener('click', () => {
        const value = (Number(wheel.dataset.value) + 1) % 10;
        wheel.dataset.value = String(value);
        wheel.querySelector('strong').textContent = String(value);
      });
      options.append(wheel);
      return wheel;
    });
    const submit = document.createElement('button');
    submit.type = 'button'; submit.className = 'button button--gold puzzle-submit'; submit.textContent = 'Set the timetable';
    submit.addEventListener('click', async () => {
      submit.disabled = true;
      $('puzzle-feedback').textContent = 'Listening for the clockwork…';
      if (await submitPuzzleAnswer(challenge, 'puzzle', { station: challenge.station, solution: wheels.map((wheel) => Number(wheel.dataset.value)) })) closeEvidencePuzzle();
      else submit.disabled = false;
    });
    options.append(submit);
  } else if (challenge.puzzle === 'telegraph') {
    const pulses = ['short', 'short', 'short', 'short'];
    const buttons = pulses.map((_, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'pulse-toggle';
      button.setAttribute('aria-label', `Pulse ${index + 1}`);
      const setValue = (value) => {
        pulses[index] = value;
        button.dataset.pulse = value;
        button.innerHTML = `<small>PULSE ${index + 1}</small><strong>${value === 'short' ? '—' : '━━━━'}</strong><span>${value.toUpperCase()}</span>`;
      };
      setValue('short');
      button.addEventListener('click', () => setValue(pulses[index] === 'short' ? 'long' : 'short'));
      options.append(button);
      return button;
    });
    const submit = document.createElement('button');
    submit.type = 'button'; submit.className = 'button button--gold puzzle-submit'; submit.textContent = 'Transmit sequence';
    submit.addEventListener('click', async () => {
      submit.disabled = true;
      $('puzzle-feedback').textContent = 'Testing the live line…';
      if (await submitPuzzleAnswer(challenge, 'puzzle', { station: challenge.station, solution: buttons.map((button) => button.dataset.pulse) })) closeEvidencePuzzle();
      else submit.disabled = false;
    });
    options.append(submit);
  }
  if (challenge.puzzle) {
    $('evidence-puzzle').classList.remove('hidden');
    options.querySelector('button')?.focus();
    return;
  }
  for (const option of challenge.options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'puzzle-option';
    const label = document.createElement('strong'); label.textContent = option.label;
    const note = document.createElement('small'); note.textContent = option.note;
    button.append(label, note);
    button.addEventListener('click', async () => {
      for (const choice of options.querySelectorAll('button')) choice.disabled = true;
      $('puzzle-feedback').textContent = 'Checking the field notes…';
      if (await submitPuzzleAnswer(challenge, 'interact', { answer: option.id })) closeEvidencePuzzle();
      else for (const choice of options.querySelectorAll('button')) choice.disabled = false;
    });
    options.append(button);
  }
  $('evidence-puzzle').classList.remove('hidden');
  options.querySelector('button')?.focus();
}

async function submitPuzzleAnswer(challenge, action, extra) {
  const correct = await act(action, extra);
  if (correct) {
    advanceTutorial('challenge');
    return true;
  }
  challenge.failures = (challenge.failures || 0) + 1;
  if (challenge.failures >= 2 && challenge.hint) {
    $('puzzle-feedback').textContent += ` Hint: ${challenge.hint}`;
  }
  return false;
}

function closeEvidencePuzzle() {
  $('evidence-puzzle').classList.add('hidden');
  $('puzzle-feedback').textContent = '';
  keys.clear();
}

function beginInteraction() {
  if (!view || !$('evidence-puzzle').classList.contains('hidden')) return;
  if (view.room.phase === 'capture') return;
  const down = nearDownPlayer(view.me, view.room.players);
  const target = nearestPoint(view.me);
  const jammed = target && view.room.sabotage?.mission === target.mission && view.room.sabotage.until > Date.now();
  if (down || !target || jammed || target.mission === 'reunion') { act('interact'); return; }
  if (view.me.role === 'culprit' && view.room.mode === 'deduction') {
    advanceTutorial('investigate');
    showGameError('Keep your cover. The culprit cannot submit detective evidence.');
    return;
  }
  const challenge = FIELD_CHALLENGES[target.id];
  if (challenge) { advanceTutorial('investigate'); openEvidencePuzzle(challenge); }
  else act('interact');
}

function setBusy(busy) {
  $('create-room').disabled = busy;
  $('join-room').disabled = busy;
}

function setCharacter(character) {
  if (!['boy', 'girl'].includes(character)) return;
  selectedCharacter = character;
  localStorage.setItem('shadows-character', character);
  document.querySelectorAll('.character-choice').forEach((card) => {
    const selected = card.dataset.character === character;
    card.classList.toggle('is-selected', selected);
    card.setAttribute('aria-checked', String(selected));
  });
  $('character-hint').textContent = character === 'boy' ? 'Boy Detective selected.' : 'Girl Detective selected.';
  $('character-continue').disabled = false;
}

function showCharacterGate() {
  showScreen($('character-gate'));
  $('character-back').classList.remove('hidden');
  document.querySelectorAll('.character-choice').forEach((card) => {
    const selected = card.dataset.character === selectedCharacter;
    card.classList.toggle('is-selected', selected);
    card.setAttribute('aria-checked', String(selected));
    card.disabled = false;
  });
  $('character-hint').textContent = selectedCharacter ? `${selectedCharacter === 'boy' ? 'Boy' : 'Girl'} Detective selected. Confirm to enter the room.` : 'Select a detective, then confirm to enter the room.';
  $('character-continue').disabled = !selectedCharacter;
  characterPreviews.forEach((preview) => preview.setActive(true));
  document.querySelector('.character-choice[aria-checked="true"]')?.focus();
}

function initializeCharacterSelection() {
  document.querySelectorAll('.character-choice').forEach((card) => {
    card.addEventListener('click', () => setCharacter(card.dataset.character));
    card.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const choices = [...document.querySelectorAll('.character-choice')];
      const next = choices.find((choice) => choice !== card);
      next.focus();
      setCharacter(next.dataset.character);
    });
  });
  $('character-continue').addEventListener('click', confirmCharacterSelection);
  $('character-back').addEventListener('click', cancelCharacterSelection);
  $('identity-back').addEventListener('click', showWelcome);
  $('identity-continue').addEventListener('click', continueFromIdentity);
  $('play-game').addEventListener('click', showIdentity);
  $('room-back').addEventListener('click', showIdentity);
  $('player-name').addEventListener('keydown', (event) => { if (event.key === 'Enter') continueFromIdentity(); });
  $('open-settings').addEventListener('click', () => $('settings-modal').classList.remove('hidden'));
  $('settings-close').addEventListener('click', () => $('settings-modal').classList.add('hidden'));
  $('settings-done').addEventListener('click', () => $('settings-modal').classList.add('hidden'));
  $('settings-modal').addEventListener('click', (event) => { if (event.target === $('settings-modal')) $('settings-modal').classList.add('hidden'); });
  $('reduce-motion').checked = savedReducedMotion();
  document.body.classList.toggle('reduce-motion', $('reduce-motion').checked);
  $('reduce-motion').addEventListener('change', () => {
    const reducedMotion = $('reduce-motion').checked;
    try { localStorage.setItem('shadows-reduce-motion', String(reducedMotion)); } catch { /* The preference remains active for this page. */ }
    document.body.classList.toggle('reduce-motion', reducedMotion);
    world?.setReducedMotion(reducedMotion);
    characterPreviews.forEach((preview) => preview.setReducedMotion?.(reducedMotion));
  });
  $('open-how-to-play').addEventListener('click', showTutorial);
  $('tutorial-close').addEventListener('click', closeTutorial);
  $('tutorial-skip').addEventListener('click', closeTutorial);
  $('replay-tutorial').addEventListener('click', showTutorial);
  $('tutorial-next').addEventListener('click', () => {
    if (tutorialIndex === -2 || TUTORIAL_STEPS[tutorialIndex]?.final) closeTutorial();
    else if (TUTORIAL_STEPS[tutorialIndex]?.trigger === 'casebook' && view?.room.clues.length) { tutorialIndex++; renderTutorialStep(); }
  });
  $('tutorial').addEventListener('click', (event) => { if (event.target === $('tutorial')) closeTutorial(); });
  document.querySelector('.character-gate__panel').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.classList.contains('character-choice')) {
      event.preventDefault(); setCharacter(event.target.dataset.character);
    }
  });
  for (const canvas of document.querySelectorAll('.character-preview')) {
    try { characterPreviews.push(createDetectivePreview(canvas, canvas.dataset.preview)); }
    catch (error) { console.warn('A character preview could not start.', error); characterPreviews.push({ setActive() {}, dispose() {} }); }
  }
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
  const isLobby = r.phase === 'lobby';
  $('lobby-screen').classList.toggle('hidden', !isLobby);
  $('game-grid').classList.toggle('hidden', isLobby);
  $('bottom-drawer').classList.toggle('hidden', isLobby);
  $('room-code-display').textContent = r.code;
  $('lobby-code').textContent = r.code;
  $('lobby-player-count').textContent = `${r.connectedCount} / 8 CONNECTED`;
  const hostName = r.players.find((player) => player.isHost)?.name || 'No host';
  $('host-status').textContent = me.isHost ? 'YOU ARE THE HOST' : `HOST: ${hostName}`;
  $('ready-toggle').textContent = me.ready ? 'Not Ready' : 'Mark Ready';
  $('ready-toggle').classList.toggle('is-ready', Boolean(me.ready));
  $('start-game').classList.toggle('hidden', !isLobby || !me.isHost);
  $('start-game').disabled = !me.isHost || !r.allReady || r.connectedCount < 2;
  $('lobby-hint').textContent = r.connectedCount < 2
    ? 'At least two detectives must join. Share the room code to invite a friend.'
    : r.allReady
      ? (me.isHost ? 'Everyone is ready. Start the case when your team is set.' : 'Everyone is ready. Waiting for the host to start the case.')
      : `${r.readyCount} of ${r.connectedCount} connected detectives are ready. Mark ready, then wait for the host.`;
  $('round-counter').textContent = `ROUND ${r.round} / ${r.totalRounds}`;
  $('player-count').textContent = r.phase === 'lobby' ? `${r.connectedCount} / 8 CONNECTED` : `${r.activeCount} / 8 PLAYERS`;
  $('team-summary').textContent = r.phase === 'lobby' ? `${r.readyCount} / ${r.connectedCount} READY` : `${r.activeCount} IN THE CASE`;
  $('map-title').textContent = ({ lobby: 'The waiting room', investigation: 'The streets of London', capture: 'The Blackthorn trap', reunion: 'The road to Blackthorn', results: 'Case closed' })[r.phase];
  updatePhaseCard(r, me);
  updateObjectives(r, me);
  renderClues(r.clues);
  renderTeam(r.players, me);
  renderTeam(r.players, me, 'lobby-team-list');
  renderLog(r.log);
  renderChat(r.chat);
  updateVoteUi(r, me);
  updateTrapUi(r, me);
  updateResults(r, me);
  updateControls(r, me);
  world?.setState(view);
  drawMap();
  if (r.phase === 'investigation' && !sessionStorage.getItem('shadows-tutorial-seen')) showTutorial();
}

function updatePhaseCard(r, me) {
  const copy = {
    lobby: ['WAITING', `Round ${r.round} of ${r.totalRounds}`, 'Mark ready when you are set. The host starts after everyone is ready.'],
    investigation: ['INVESTIGATE', 'The Blackthorn case', 'Follow the active gold marker. New leads open when the evidence supports them.'],
    capture: ['FINAL TRAP', 'Catch the culprit', 'Go to Blackthorn Safehouse. Three detectives use the lever, valve, and key in order.'],
    reunion: ['REUNITE', 'Meet at Blackthorn House', 'Follow the last clue to the safehouse. Help anyone who needs it, then investigate together.'],
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
  $('role-secret').textContent = me.role === 'culprit' ? `Secretly slow the case and avoid a unanimous vote. ${me.objectiveAchieved ? 'You have jammed two stations.' : ''}` : r.mode === 'cooperative' ? 'Everyone is a detective. Share clues and meet at Blackthorn House together.' : 'Your role is private. Share clues and watch for anyone slowing the case.';
  $('start-hint').textContent = r.phase === 'lobby'
    ? (r.connectedCount < 2 ? 'At least two players must join.' : `${r.readyCount} of ${r.connectedCount} connected players ready · the host starts the case.`)
    : '';
  $('mission-list').classList.toggle('hidden', r.phase !== 'investigation' || me.role === 'culprit' || me.eliminated);
}

function updateObjectives(r, me) {
  const title = $('objective-title');
  const copy = $('objective-copy');
  const missions = r.missions;
  if (r.phase === 'lobby') {
    title.textContent = 'Gather the team';
    copy.textContent = 'Share the room code. Everyone marks ready, then the host starts the case.';
  } else if (r.phase === 'capture') {
    title.textContent = 'Stop the escape';
    copy.textContent = 'Go to the Blackthorn Safehouse. Work together to set the lever, valve, and key.';
  } else if (me.eliminated && r.phase !== 'results') {
    title.textContent = 'Taken into custody';
    copy.textContent = 'Your secret role is known. Watch the detectives finish the case together.';
  } else if (me.role === 'culprit' && !r.culpritCaught && r.phase !== 'results') {
    title.textContent = me.objectiveAchieved ? 'Keep your cover' : 'Delay the investigation';
    copy.textContent = me.objectiveAchieved ? 'You jammed two stations. Avoid the team’s unanimous vote and stay hidden.' : 'Get near a detective to strike, or an unfinished station to jam it. Both actions leave clues for the team.';
  } else if (r.phase === 'investigation') {
    const active = !missions.letter.done
      ? { title: 'Find the letter clues', detail: 'Scotland Yard · examine the ink sample and seal register.', progress: missions.letter.progress, total: missions.letter.total, teamWork: true }
      : !missions.cipher.done
        ? { title: 'Decode the timetable', detail: '221B Baker Street · read Holmes’s reversed note.', progress: missions.cipher.progress, total: missions.cipher.total }
        : { title: 'Repair the telegraph', detail: 'East London Station · restore the signal and read its message.', progress: missions.telegraph.progress, total: missions.telegraph.total, teamWork: true };
    title.textContent = active.title;
    copy.textContent = active.teamWork ? `${active.detail} Different detectives examine each part, so work together.` : active.detail;
    $('mission-list').replaceChildren();
    const row = document.createElement('div'); row.className = 'mission-row';
    const icon = document.createElement('span'); icon.className = 'mission-check'; icon.textContent = '○';
    const text = document.createElement('span');
    const label = document.createElement('b'); label.textContent = 'CASE PROGRESS';
    const description = document.createElement('small'); description.textContent = `${active.progress} of ${active.total} evidence steps complete`;
    text.append(label, description);
    const progress = document.createElement('span'); progress.className = 'mission-progress'; progress.textContent = `${active.progress}/${active.total}`;
    row.append(icon, text, progress); $('mission-list').append(row);
  } else if (r.phase === 'reunion') {
    const here = r.players.filter((p) => !p.eliminated && p.safehouse && !p.incapacitated).length;
    title.textContent = r.reunionReady ? 'Complete the reunion' : 'Reach Blackthorn House';
    copy.textContent = r.reunionReady ? 'Everyone still in the chase is safely at the door. Investigate together to finish the case.' : `${here} of ${r.activeCount} teammates are at the safehouse. Help anyone who is down, then gather at the door.`;
  } else if (r.phase === 'results') {
    title.textContent = r.matchComplete ? 'The casebook is claimed' : `Round ${r.round} is complete`;
    copy.textContent = r.matchComplete ? 'The three-round tournament is over. The highest score wins.' : `Round ${r.round} of ${r.totalRounds} is complete. Scores carry into the next case.`;
  }
}

function renderClues(clues) {
  const signature = clues.map((clue) => clue.id).join('|');
  if (signature === lastClueSignature) return;
  lastClueSignature = signature;
  $('clue-count').textContent = `${clues.length} CLUE${clues.length === 1 ? '' : 'S'}`;
  const list = $('clue-list');
  list.replaceChildren();
  if (!clues.length) {
    const empty = document.createElement('p'); empty.className = 'empty-note'; empty.textContent = 'No clue yet. Examine a gold-marked place to add the first note.'; list.append(empty); return;
  }
  for (const clue of [...clues].reverse()) {
    const card = document.createElement('article'); card.className = 'clue-entry';
    const title = document.createElement('h4'); title.textContent = clue.title;
    const summaries = clue.title.includes('letter')
      ? ['The ink and seal show the letter was made after Holmes left.', 'The official seal was checked out too late for Holmes to send this letter.', 'Next: decode Holmes’s note at 221B Baker Street.']
      : clue.title.includes('timetable')
        ? ['Holmes’s reversed note points to East London Station at 9:28.', 'The porter’s name was on a decoy timetable, not the live record.', 'Next: inspect the signal box at East London Station.']
        : ['The real transfer was sent to Blackthorn House at 9:28.', 'Inspector Elias Vale signed it; the porter was framed.', 'Next: follow the route to Blackthorn House.'];
    const labels = ['WHAT', 'WHY IT MATTERS', 'NEXT'];
    card.append(title);
    summaries.forEach((summary, index) => {
      const line = document.createElement('p'); line.className = 'clue-summary';
      const label = document.createElement('b'); label.textContent = `${labels[index]} · `;
      line.append(label, document.createTextNode(summary)); card.append(line);
    });
    const full = document.createElement('details'); full.className = 'clue-original';
    const fullLabel = document.createElement('summary'); fullLabel.textContent = 'Read the full note';
    const detail = document.createElement('p'); detail.textContent = clue.detail;
    full.append(fullLabel, detail); card.append(full); list.append(card);
  }
}

function renderTeam(players, me, listId = 'team-list') {
  const list = $(listId);
  if (!list) return;
  list.replaceChildren();
  players.forEach((player, index) => {
    const row = document.createElement('div'); row.className = 'team-member';
    const avatar = document.createElement('span');
    avatar.className = `team-avatar avatar-${index % 5} character-avatar character-${player.character || 'boy'}`;
    avatar.textContent = player.character === 'girl' ? '♀' : '♂';
    avatar.title = `${player.character === 'girl' ? 'Girl' : 'Boy'} Detective`;
    avatar.setAttribute('aria-label', avatar.title);
    const details = document.createElement('span'); details.className = 'team-member__details';
    const name = document.createElement('b'); name.textContent = `${player.name}${player.isMe ? ' (you)' : ''}`;
    const status = document.createElement('small');
    status.textContent = view?.room.phase === 'lobby'
      ? player.connected ? (player.ready ? 'Ready' : 'Not ready') : 'Reconnecting'
      : player.eliminated ? 'Taken into custody' : player.incapacitated ? 'Needs rescue' : !player.connected ? 'Reconnecting' : player.safehouse ? 'At Blackthorn House' : 'In the streets';
    if (player.isHost) status.textContent = `Host · ${status.textContent}`;
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
    row.append(avatar, details, badge); list.append(row);
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
    $('vote-copy').textContent = me.hasVoted ? `Your suspicion is recorded. Every detective must choose the same person (${secondsLeft}s left).` : `Discuss your suspect, then vote. A unanimous correct vote opens the Blackthorn trap (${secondsLeft}s left).`;
    fillSuspects($('vote-target'), r.players, me, true);
    $('vote-submit').disabled = me.hasVoted;
    $('vote-result').textContent = '';
  } else if (showSummary) {
    $('vote-copy').textContent = r.vote.outcome === 'capture' ? 'The accusation was correct. The culprit is making a run for the safehouse—coordinate the final trap.' : 'The team has used its one suspicion vote. Finish the clues and meet at Blackthorn House.';
    $('vote-result').textContent = voteText(r.vote);
  }
  $('vote-submit').classList.toggle('hidden', !showVote);
}

function voteText(vote) {
  const tally = Object.entries(vote.tally || {}).map(([name, count]) => `${name} ${count}`).join(' · ');
  const outcome = vote.outcome === 'capture' ? `${vote.suspectName} was unanimously identified. The safehouse trap must still be set.` : vote.outcome === 'caught' ? `${vote.suspectName} was unanimously identified and taken into custody.` : vote.outcome === 'wrong' ? `${vote.suspectName} was innocent. The culprit is still at large.` : 'The vote split. No one was taken into custody.';
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

function updateTrapUi(r, me) {
  const active = r.phase === 'capture';
  $('trap-card').classList.toggle('hidden', !active);
  if (!active) return;
  const capture = r.capture || { progress: 0, total: 3, next: 'lever', mechanisms: [] };
  $('trap-progress').textContent = `${capture.progress} / ${capture.total} SET`;
  const atSafehouse = Math.hypot(me.x - 484, me.y - 552) <= 82;
  const nextLabel = ({ lever: 'Pull lever', valve: 'Turn valve', key: 'Insert key' })[capture.next] || 'Trap set';
  $('trap-copy').textContent = me.role === 'culprit'
    ? 'The detectives have your trail. Keep moving; the team must coordinate three different operators to close the trap.'
    : atSafehouse
      ? `${capture.progress} of 3 mechanisms are set. Next: ${nextLabel}. Each step needs a different detective.`
      : 'Move to the glowing Blackthorn Safehouse marker. Each mechanism must be operated by a different detective, in order.';
  for (const mechanism of ['lever', 'valve', 'key']) {
    const used = capture.mechanisms.some((entry) => entry.mechanism === mechanism);
    const button = $(`trap-${mechanism}`);
    button.classList.toggle('is-ready', used);
    button.disabled = me.role !== 'detective' || me.incapacitated || !atSafehouse || mechanism !== capture.next || capture.mechanisms.some((entry) => entry.playerId === me.id);
  }
}

function nearDownPlayer(me, players) { return players.find((p) => p.id !== me.id && p.incapacitated && distance(me, p) < 50); }

function updateControls(r, me) {
  const active = ['investigation', 'capture', 'reunion'].includes(r.phase);
  const isCulprit = me.role === 'culprit' && r.mode === 'deduction';
  const down = nearDownPlayer(me, r.players);
  const target = nearestPoint(me);
  const canRescue = Boolean(down && !isCulprit);
  const canUseTarget = Boolean(target && (!isCulprit || target.mission === 'reunion'));
  $('interact').disabled = !active || r.phase === 'capture' || me.incapacitated || me.eliminated || (!canUseTarget && !canRescue);
  $('interact').innerHTML = canRescue ? `<span>✚</span> Rescue` : target?.mission === 'reunion' ? '<span>◎</span> Reunite' : '<span>⌕</span> Examine';
  const canUseKey = !me.incapacitated && !me.eliminated && r.phase !== 'capture' && (canRescue || (active && canUseTarget));
  $('interaction-keycap').classList.toggle('hidden', !canUseKey);
  $('interaction-hint').textContent = canRescue ? `Help ${down.name} up · press E or tap Rescue` : r.phase === 'capture' ? 'Go to Blackthorn Safehouse and use the next trap button.' : isCulprit && r.phase !== 'reunion' ? 'Keep your cover. Reach Blackthorn when the route opens.' : target ? `Nearby: ${target.label} · press E or tap Examine` : r.phase === 'lobby' ? 'Waiting for the host to begin.' : 'Follow the gold marker to your next clue.';
  if (target?.mission === 'reunion' && r.reunionReady) $('interaction-hint').textContent = 'Complete the reunion · press E';
  const roleAction = $('role-action');
  const culpritCanAct = me.role === 'culprit' && !r.culpritCaught && ['investigation', 'reunion'].includes(r.phase);
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
      if (p.mission === 'letter') return !mission.letter.done && !mission.letter.parts[p.part];
      if (p.mission === 'cipher') return mission.letter.done && !mission.cipher.done;
      if (p.mission === 'telegraph') return mission.cipher.done && !mission.telegraph.done && !mission.telegraph.parts[p.part];
      if (p.mission === 'reunion') return ['capture', 'reunion'].includes(view.room.phase);
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
    if (!view?.me.canMove || !$('evidence-puzzle').classList.contains('hidden')) return;
    const [dx, dy] = moveVector();
    if (dx || dy) {
      const direction = world ? world.inputToWorld(dx, dy) : { dx, dy };
      act('move', direction).then((ok) => { if (ok) advanceTutorial('move'); });
    }
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
  world?.resize();
  drawMap();
}

function drawMap() {
  if (!canvas.width || !canvas.height) return;
  const ratio = window.devicePixelRatio || 1;
  ctx.setTransform(canvas.width / 960, 0, 0, canvas.height / 640, 0, 0);
  ctx.clearRect(0, 0, 960, 640);
  const now = performance.now();
  const frameDelta = Math.min((now - lastFrameAt) / 1000, .05);
  lastFrameAt = now;
  if (!world) drawEnvironment(Date.now());
  if (!view) {
    for (const location of [
      { x: 182, y: 145, name: 'Scotland Yard', id: 'yard' },
      { x: 498, y: 160, name: '221B Baker Street', id: 'baker' },
      { x: 804, y: 355, name: 'East London Station', id: 'station' },
      { x: 480, y: 555, name: 'Blackthorn Safehouse', id: 'safehouse' },
    ]) drawLocation(location, 'lobby');
    drawCompass();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return;
  }
  for (const location of view.room.locations) drawLocation(location, view.room.phase);
  for (const point of view.room.points) drawPoint(point);
  const currentIds = new Set();
  for (const p of view.room.players) {
    currentIds.add(p.id);
    let position = displayPositions.get(p.id);
    if (!position) {
      position = { x: p.x, y: p.y };
      displayPositions.set(p.id, position);
    }
    const smoothing = 1 - Math.exp(-frameDelta * 13);
    position.x += (p.x - position.x) * smoothing;
    position.y += (p.y - position.y) * smoothing;
    drawPlayer({ ...p, x: position.x, y: position.y }, view.me);
  }
  for (const playerId of displayPositions.keys()) if (!currentIds.has(playerId)) displayPositions.delete(playerId);
  drawCompass();
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function drawTitleMap() { drawMap(); }

function drawEnvironment(time) {
  if (worldArt.complete && worldArt.naturalWidth) {
    ctx.drawImage(worldArt, 0, 0, 960, 640);
  } else {
    const bg = ctx.createLinearGradient(0, 0, 0, 640);
    bg.addColorStop(0, '#101d27'); bg.addColorStop(1, '#17222a');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 960, 640);
    drawStreetGrid(); drawParkAndRiver(); drawRoads(); drawBuildings();
  }

  ctx.fillStyle = 'rgba(3, 8, 13, .12)';
  ctx.fillRect(0, 0, 960, 640);

  for (let i = 0; i < 5; i++) {
    const x = ((i * 231 + time * .005) % 1160) - 100;
    const y = 72 + ((i * 109) % 492) + Math.sin(time / 3200 + i) * 13;
    const fog = ctx.createRadialGradient(x, y, 4, x, y, 145);
    fog.addColorStop(0, 'rgba(185, 203, 207, .075)');
    fog.addColorStop(1, 'rgba(185, 203, 207, 0)');
    ctx.fillStyle = fog;
    ctx.fillRect(x - 145, y - 92, 290, 184);
  }

  ctx.save();
  ctx.lineWidth = 1;
  for (let i = 0; i < 38; i++) {
    const x = (i * 97 + time * .038) % 1020 - 30;
    const y = (i * 173 + time * .14) % 690 - 24;
    ctx.strokeStyle = `rgba(200, 214, 215, ${.07 + (i % 4) * .018})`;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 11); ctx.stroke();
  }
  ctx.restore();

  const vignette = ctx.createRadialGradient(480, 315, 185, 480, 315, 650);
  vignette.addColorStop(0, 'rgba(1, 5, 9, 0)');
  vignette.addColorStop(1, 'rgba(1, 5, 9, .62)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, 960, 640);
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
  if (world) {
    const projected = world.projectGame(loc.x, loc.y, 0.16);
    if (!projected?.visible) return;
    loc = { ...loc, x: projected.x, y: projected.y };
  }
  const safe = loc.id === 'safehouse';
  const open = safe && phase !== 'lobby' && phase !== 'investigation';
  const color = safe && !open ? '#a59a85' : '#f1c77f';
  ctx.save();
  const glow = ctx.createRadialGradient(loc.x, loc.y, 1, loc.x, loc.y, 58);
  glow.addColorStop(0, safe && !open ? 'rgba(216,180,119,.07)' : 'rgba(245,183,87,.24)');
  glow.addColorStop(1, 'rgba(245,183,87,0)');
  ctx.fillStyle = glow; ctx.fillRect(loc.x - 58, loc.y - 58, 116, 116);
  ctx.shadowColor = color; ctx.shadowBlur = open ? 22 : 13;
  ctx.beginPath(); ctx.arc(loc.x, loc.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.arc(loc.x, loc.y, 10, 0, Math.PI * 2);
  ctx.strokeStyle = safe && !open ? 'rgba(194,184,161,.46)' : 'rgba(255,220,157,.62)';
  ctx.lineWidth = 1; ctx.stroke();

  const label = loc.name.toUpperCase();
  ctx.font = '600 9px Georgia, serif';
  const width = Math.max(76, ctx.measureText(label).width + 18);
  const top = loc.y + 22;
  ctx.fillStyle = 'rgba(4, 9, 13, .82)';
  roundedRect(ctx, loc.x - width / 2, top, width, 18, 3); ctx.fill();
  ctx.strokeStyle = 'rgba(230, 192, 125, .32)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, loc.x, top + 9);
  ctx.restore();
}

function drawPoint(p) {
  const { room, me } = view;
  const active = (p.mission === 'letter' && !room.missions.letter.done && !room.missions.letter.parts[p.part]) || (p.mission === 'cipher' && room.missions.letter.done && !room.missions.cipher.done) || (p.mission === 'telegraph' && room.missions.cipher.done && !room.missions.telegraph.done && !room.missions.telegraph.parts[p.part]) || (p.mission === 'reunion' && ['capture', 'reunion'].includes(room.phase));
  if (!active) return;
  if (world) {
    const projected = world.projectGame(p.x, p.y, 0.3);
    if (!projected?.visible) return;
    p = { ...p, x: projected.x, y: projected.y };
  }
  const jammed = room.sabotage?.mission === p.mission && room.sabotage.until > Date.now();
  const nearby = distWorld(me, p) < 52;
  const time = Date.now() / 520;
  const radius = 16 + Math.sin(time) * 2;
  ctx.save();
  const glow = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, radius * 2.5);
  glow.addColorStop(0, jammed ? 'rgba(235,89,69,.34)' : 'rgba(246,197,114,.3)');
  glow.addColorStop(1, 'rgba(246,197,114,0)');
  ctx.fillStyle = glow; ctx.fillRect(p.x - radius * 2.5, p.y - radius * 2.5, radius * 5, radius * 5);
  ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = jammed ? 'rgba(244,126,102,.8)' : nearby ? 'rgba(255,229,178,.9)' : 'rgba(238,196,124,.64)';
  ctx.lineWidth = nearby ? 1.8 : 1; ctx.setLineDash([2, 4]); ctx.stroke(); ctx.setLineDash([]);
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4);
  ctx.fillStyle = jammed ? '#f17b67' : '#f5d28f';
  ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12;
  ctx.fillRect(-4, -4, 8, 8); ctx.restore();
  if (nearby) {
    const label = jammed ? 'JAMMED · CLEAR' : `${p.label.toUpperCase()} · E`;
    ctx.font = '600 9px Georgia, serif';
    const width = ctx.measureText(label).width + 18;
    ctx.fillStyle = 'rgba(4, 9, 13, .88)';
    roundedRect(ctx, p.x - width / 2, p.y - 37, width, 19, 3); ctx.fill();
    ctx.strokeStyle = jammed ? 'rgba(233,112,92,.6)' : 'rgba(232,195,127,.45)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#f2e4c7'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, p.x, p.y - 27.5);
  }
  ctx.restore();
}

function distWorld(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function drawPlayer(p, me) {
  if (world) {
    const projected = world.projectPlayer(p.id);
    if (!projected?.visible) return;
    const color = p.incapacitated ? '#ef9b87' : p.isMe ? '#f0d9af' : '#dce1d7';
    const label = p.eliminated ? 'IN CUSTODY' : p.incapacitated ? 'DOWN · RESCUE' : p.name;
    ctx.save();
    ctx.beginPath(); ctx.arc(projected.x, projected.y + 5, p.isMe ? 11 : 8, 0, Math.PI * 2);
    ctx.strokeStyle = p.incapacitated ? 'rgba(238,119,96,.86)' : p.isMe ? 'rgba(249,214,153,.9)' : 'rgba(198,214,206,.55)';
    ctx.lineWidth = 1.5; ctx.setLineDash(p.isMe || p.incapacitated ? [2, 3] : []); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '600 10px Georgia, serif';
    const width = Math.min(132, ctx.measureText(label).width + 14);
    roundedRect(ctx, projected.x - width / 2, projected.y - 15, width, 17, 3);
    ctx.fillStyle = 'rgba(4, 9, 13, .88)'; ctx.fill();
    ctx.strokeStyle = p.isMe ? 'rgba(242,203,133,.72)' : 'rgba(198,214,206,.38)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, projected.x, projected.y - 6.5, 124);
    if (!p.connected) { ctx.beginPath(); ctx.arc(projected.x + width / 2 - 2, projected.y - 13, 3, 0, Math.PI * 2); ctx.fillStyle = '#d4b878'; ctx.fill(); }
    ctx.restore();
    return;
  }
  ctx.save();
  const coat = p.eliminated ? '#5d5e5b' : p.incapacitated ? '#9d4a40' : p.isMe ? '#c79b5f' : '#65868a';
  const pulse = p.isMe ? 14 + Math.sin(Date.now() / 260) * 1.5 : 13;
  ctx.fillStyle = 'rgba(0, 0, 0, .56)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 10, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
  if (p.isMe || p.incapacitated) {
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, pulse, pulse * .82, 0, 0, Math.PI * 2);
    ctx.strokeStyle = p.incapacitated ? 'rgba(238,119,96,.86)' : 'rgba(249,214,153,.9)';
    ctx.lineWidth = 1.5; ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([]);
  }

  const body = ctx.createLinearGradient(p.x - 9, p.y - 8, p.x + 7, p.y + 11);
  body.addColorStop(0, p.isMe ? '#e0bd82' : '#a3b6ac');
  body.addColorStop(.4, coat); body.addColorStop(1, '#202b30');
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - 6); ctx.lineTo(p.x + 8, p.y - 1); ctx.lineTo(p.x + 7, p.y + 9);
  ctx.quadraticCurveTo(p.x, p.y + 14, p.x - 7, p.y + 9); ctx.lineTo(p.x - 8, p.y - 1); ctx.closePath();
  ctx.fillStyle = body; ctx.fill(); ctx.strokeStyle = 'rgba(241,225,195,.72)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(p.x, p.y - 3); ctx.lineTo(p.x, p.y + 8);
  ctx.strokeStyle = 'rgba(22,28,29,.78)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(p.x, p.y - 7, 4.1, 4.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = p.eliminated ? '#85827a' : '#d0b28a'; ctx.fill();
  ctx.beginPath(); ctx.ellipse(p.x, p.y - 10, 6.5, 2.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#171b1c'; ctx.fill();
  roundedRect(ctx, p.x - 4.5, p.y - 14, 9, 5, 1.5); ctx.fill();

  const label = p.eliminated ? 'IN CUSTODY' : p.incapacitated ? 'DOWN · RESCUE' : p.name;
  ctx.font = '600 10px Georgia, serif';
  const labelWidth = Math.min(132, ctx.measureText(label).width + 14);
  const labelY = p.y - 35;
  ctx.fillStyle = 'rgba(4, 9, 13, .9)';
  roundedRect(ctx, p.x - labelWidth / 2, labelY, labelWidth, 17, 3); ctx.fill();
  ctx.strokeStyle = p.incapacitated ? 'rgba(226,117,93,.62)' : p.isMe ? 'rgba(242,203,133,.72)' : 'rgba(198,214,206,.38)';
  ctx.lineWidth = 1; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = p.incapacitated ? '#ef9b87' : p.isMe ? '#f0d9af' : '#dce1d7';
  ctx.fillText(label, p.x, labelY + 8.5, 124);
  if (!p.connected) {
    ctx.beginPath(); ctx.arc(p.x + 9, p.y - 9, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#d4b878'; ctx.fill();
  }
  ctx.restore();
}

function drawCompass() {
  const yaw = world?.getYaw?.() || 0;
  ctx.save();
  ctx.translate(914, 48);
  ctx.fillStyle = 'rgba(4, 9, 14, .74)'; ctx.beginPath(); ctx.arc(0, 0, 27, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(218, 184, 121, .55)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#e7d7b5'; ctx.font = '600 9px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', 0, -17);
  ctx.rotate(-yaw);
  ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(5, 5); ctx.lineTo(0, 2); ctx.lineTo(-5, 5); ctx.closePath();
  ctx.fillStyle = '#e5b96e'; ctx.shadowColor = '#e5b96e'; ctx.shadowBlur = 9; ctx.fill();
  ctx.restore();
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath(); context.roundRect(x, y, width, height, radius);
}

function showTutorial() {
  $('tutorial').classList.remove('hidden');
  if (!view || view.room.phase !== 'investigation') {
    tutorialIndex = -2;
    $('tutorial-counter').textContent = 'QUICK GUIDE';
    $('tutorial-title').textContent = 'How to Play';
    $('tutorial-copy').textContent = 'Move around London and follow the gold marker. Detectives examine the clues and solve short challenges together. The shared casebook explains what each clue means and where to go next. Finish together at Blackthorn House.';
    $('tutorial-hint').textContent = '2–3 players solve cooperatively. With 4–8 players, one person secretly plays the culprit.';
    $('tutorial-next').textContent = 'Got it';
    $('tutorial-next').disabled = false;
    return;
  }
  sessionStorage.setItem('shadows-tutorial-seen', 'true');
  tutorialIndex = 0;
  renderTutorialStep();
}

function renderTutorialStep() {
  const step = TUTORIAL_STEPS[tutorialIndex];
  if (!step) { closeTutorial(); return; }
  $('tutorial-counter').textContent = `YOUR FIRST MINUTE · STEP ${tutorialIndex + 1} OF ${TUTORIAL_STEPS.length}`;
  $('tutorial-title').textContent = step.title;
  $('tutorial-copy').textContent = step.copy;
  $('tutorial-hint').textContent = step.hint;
  $('tutorial-next').textContent = step.final ? 'Start investigating →' : step.trigger === 'casebook' ? 'I’ve read the clue →' : 'Next step →';
  $('tutorial-next').disabled = step.trigger === 'casebook' ? !view?.room.clues.length : !step.final;
}

function advanceTutorial(action) {
  const step = TUTORIAL_STEPS[tutorialIndex];
  if (!step || step.trigger !== action) return;
  tutorialIndex++;
  if (action === 'investigate' && view?.me.role === 'culprit') tutorialIndex = TUTORIAL_STEPS.length - 1;
  if (!world && TUTORIAL_STEPS[tutorialIndex]?.trigger === 'look') tutorialIndex++;
  renderTutorialStep();
}

function closeTutorial() { $('tutorial').classList.add('hidden'); tutorialIndex = -1; }

initializeCharacterSelection();
$('create-room').addEventListener('click', createRoom);
$('join-room').addEventListener('click', joinRoom);
$('room-code').addEventListener('keydown', (event) => { if (event.key === 'Enter') joinRoom(); });
$('ready-toggle').addEventListener('click', () => act('ready', { ready: !view?.me.ready }));
$('start-game').addEventListener('click', () => act('start'));
for (const mechanism of ['lever', 'valve', 'key']) {
  $(`trap-${mechanism}`).addEventListener('click', () => act('trap', { mechanism }));
}
$('lobby-copy-code').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(local.code); $('lobby-hint').textContent = `Room code ${local.code} copied. Send it to your friends.`; }
  catch { $('lobby-hint').textContent = `Share room code ${local.code} with your friends.`; }
});
$('invite-room').addEventListener('click', async () => {
  const invite = `Join my Sherlock: Shadows of London case. Room code: ${local.code}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Sherlock: Shadows of London', text: invite, url: location.href });
    else { await navigator.clipboard.writeText(invite); $('lobby-hint').textContent = 'Invite copied. Send it to your friends.'; }
  } catch { $('lobby-hint').textContent = `Invite your friends with room code ${local.code}.`; }
});
$('leave-room').addEventListener('click', leaveRoom);
$('lobby-leave').addEventListener('click', leaveRoom);
$('interact').addEventListener('click', beginInteraction);
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
$('puzzle-close').addEventListener('click', closeEvidencePuzzle);
$('evidence-puzzle').addEventListener('click', (event) => { if (event.target === $('evidence-puzzle')) closeEvidencePuzzle(); });
$('leave-game').addEventListener('click', (event) => {
  event.preventDefault(); leaveRoom();
});

window.addEventListener('keydown', (event) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  const key = event.key.toLowerCase();
  if (key === 'escape' && !$('evidence-puzzle').classList.contains('hidden')) { closeEvidencePuzzle(); return; }
  if (!$('evidence-puzzle').classList.contains('hidden')) return;
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) event.preventDefault();
  if (['w', 'a', 's', 'd', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) keys.add(key.length === 1 ? key : ({ arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', arrowup: 'ArrowUp', arrowdown: 'ArrowDown' })[key]);
  if (key === 'e' && !event.repeat && view) beginInteraction();
});
window.addEventListener('keyup', (event) => {
  const key = event.key.toLowerCase();
  keys.delete(key.length === 1 ? key : ({ arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', arrowup: 'ArrowUp', arrowdown: 'ArrowDown' })[key]);
});
window.addEventListener('blur', () => keys.clear());
window.addEventListener('resize', resizeCanvas);
window.addEventListener('beforeunload', () => {
  clearInterval(pollLoop); clearInterval(movementLoop);
  characterPreviews.forEach((preview) => preview.dispose());
  world?.dispose();
});

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

requestAnimationFrame(function animate() { drawMap(); renderFrame = requestAnimationFrame(animate); });

const restored = savedCredentials();
if (restored?.code && restored?.token) {
  Object.assign(local, restored);
  local.playerName ||= restored.name || localStorage.getItem('shadows-name') || '';
  selectedCharacter = ['boy', 'girl'].includes(restored.character) ? restored.character : null;
  enterRoom().catch((error) => { showWelcome(); $('identity-error').textContent = error.message || 'Could not reconnect to your saved case.'; });
} else if (sessionStorage.getItem('shadows-pending-room')) {
  try {
    Object.assign(local, JSON.parse(sessionStorage.getItem('shadows-pending-room')));
    selectedCharacter = ['boy', 'girl'].includes(localStorage.getItem('shadows-character')) ? localStorage.getItem('shadows-character') : null;
    showCharacterGate();
  } catch { sessionStorage.removeItem('shadows-pending-room'); showWelcome(); }
} else {
  local.playerName = localStorage.getItem('shadows-name') || '';
  selectedCharacter = ['boy', 'girl'].includes(localStorage.getItem('shadows-character')) ? localStorage.getItem('shadows-character') : null;
  resizeCanvas();
  showWelcome();
}

window.__sherlockClientReady = true;
window.dispatchEvent(new Event('sherlock-client-ready'));
