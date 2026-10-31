import { createDetectivePreview, createLondonWorld, createTitleWorld } from './world3d.js';
import { initAmbientAudio, playOutcomeChime, playClueProximityShimmer, playClueInspectSound, playClueDiscoveredChime, playStampSlamSound, playChaseTensionPulse, playSafehouseAssembleChime, playEvidencePinnedSlam } from './ambient-audio.js';

const $ = (id) => document.getElementById(id);
const welcome = $('welcome-screen');
const identity = $('identity-screen');
const landing = $('landing');
const game = $('game');
const canvas = $('map');
const ctx = canvas.getContext('2d');

const safeStorage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, val) { try { localStorage.setItem(key, val); } catch {} },
  remove(key) { try { localStorage.removeItem(key); } catch {} }
};
const safeSession = {
  get(key) { try { return sessionStorage.getItem(key); } catch { return null; } },
  set(key, val) { try { sessionStorage.setItem(key, val); } catch {} },
  remove(key) { try { sessionStorage.removeItem(key); } catch {} }
};

function savedReducedMotion() {
  try {
    const raw = safeStorage.get('shadows-reduce-motion');
    if (raw !== null) return raw === 'true';
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  }
  catch { return false; }
}

window.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener('change', (e) => {
  try {
    if (safeStorage.get('shadows-reduce-motion') === null) {
      const isReduced = Boolean(e.matches);
      document.body.classList.toggle('reduce-motion', isReduced);
      world?.setReducedMotion?.(isReduced);
      titleWorld?.setReducedMotion?.(isReduced);
      characterPreviews.forEach((preview) => preview.setReducedMotion?.(isReduced));
      const checkbox = $('reduce-motion');
      if (checkbox) checkbox.checked = isReduced;
    }
  } catch {}
});
let world = null;
try { world = createLondonWorld($('world-3d'), { reducedMotion: savedReducedMotion(), onLook: () => advanceTutorial('look') }); }
catch (error) { console.warn('The 3D London scene could not start; the illustrated map fallback will be used.', error); }

let titleWorld = null;
try {
  const titleCanvas = $('title-3d');
  if (titleCanvas) {
    titleWorld = createTitleWorld(titleCanvas, { reducedMotion: savedReducedMotion() });
    titleWorld?.setActive(true);
  }
} catch (error) {
  console.warn('The 3D Title scene could not start.', error);
}
const worldArt = new Image();
worldArt.src = '/london-district.png';
const keys = new Set();
const touchCapable = navigator.maxTouchPoints > 0 || window.matchMedia?.('(pointer: coarse)').matches;
document.documentElement.classList.toggle('has-touch', Boolean(touchCapable));
const touchMove = { x: 0, y: 0, pointerId: null };
const local = { code: '', token: '', playerId: '', playerName: '' };
let selectedCharacter = null;
let view = null;
let movementLoop = null;
let pollLoop = null;
let demoLoop = null;
let demoBusy = false;
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
  {
    step: 1,
    trigger: 'move',
    title: 'Step 1: Explore London',
    copy: 'Explore London. Use WASD to move and drag to look around.',
    hint: 'On mobile or touch devices, drag the virtual movement joystick.',
  },
  {
    step: 2,
    trigger: 'discover',
    title: 'Step 2: Discover Clues',
    copy: 'Follow the golden markers to discover clues.',
    hint: 'Golden beacons in the 3D world guide you to the nearest crime scene.',
  },
  {
    step: 3,
    trigger: 'minigame',
    title: 'Step 3: Solve Mini-Games',
    copy: 'Examine clues and complete simple mini-games.',
    hint: 'Approach a clue and press E or tap Examine to start a 5–15 second mini-game.',
  },
  {
    step: 4,
    trigger: 'pieces',
    title: 'Step 4: Collect Six Portrait Pieces',
    copy: 'Collect all six pieces of the thief\'s portrait.',
    hint: 'Every solved challenge earns one unique piece. The entire team shares progress.',
  },
  {
    step: 5,
    trigger: 'victory',
    title: 'Step 5: Return and Win',
    copy: 'Return to headquarters and assemble the picture.',
    hint: 'Gather at Blackthorn Safehouse with all 6 pieces, assemble the portrait, and win together!',
    final: true,
  },
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
    stationId: 'letter-ink',
    clueType: 'letter',
    kicker: 'CLUE DISCOVERED · SCOTLAND YARD LAB',
    title: 'The Bloodstained Forged Letter',
    evidence: 'An urgent dispatch recovered from the scene, bearing crimson stains. Chemical analysis detects iron-gall gall residue in the paper fibers, matching Scotland Yard’s official dispatch formula.',
    observations: [
      { tag: 'EXHIBIT', value: 'SCOTLAND YARD · LAB EXHIBIT NO. 4' },
      { tag: 'FORENSIC FINDING', value: 'Iron-gall ink formula detected in paper fibers' },
      { tag: 'CASE SIGNIFICANCE', value: 'Penned at the Yard while Holmes was away on the train' },
    ],
    question: 'Which ink formula matches the chemical analysis of the letter?',
    hint: 'Look for the option that names iron. The clue says “iron-rich gall residue.”',
    options: [
      { id: 'lampblack', label: 'Lampblack printer’s ink', note: 'Soot pigment with no iron residue' },
      { id: 'iron-gall', label: 'Iron-gall dispatch ink', note: 'The Yard’s official iron-rich formula' },
      { id: 'blue-aniline', label: 'Blue aniline ink', note: 'A synthetic dye unrecorded at the Yard' },
    ],
  },
  'letter-seal': {
    stationId: 'letter-seal',
    clueType: 'seal',
    kicker: 'CLUE DISCOVERED · SCOTLAND YARD REGISTER',
    title: 'Yard Seal Register No. 14',
    evidence: 'The official sign-out ledger for Scotland Yard wax seal #14. The forged letter carries a 9:10 PM stamp, but the register proves Inspector Elias Vale checked out the seal at 8:52 PM—twelve minutes after Holmes boarded his train.',
    observations: [
      { tag: 'EXHIBIT', value: 'METROPOLITAN POLICE · REGISTER VOL. 1895' },
      { tag: 'TIMESTAMPS', value: 'Holmes Departure: 8:40 PM · Seal Checkout: 8:52 PM · Letter: 9:10 PM' },
      { tag: 'CASE SIGNIFICANCE', value: 'Conclusive evidence that Holmes could not have applied this seal' },
    ],
    question: 'What does the official register checkout time prove?',
    hint: 'Compare the times: Holmes left at 8:40, but the seal was checked out at 8:52.',
    options: [
      { id: 'porter-before', label: 'The porter stamped it before Holmes left', note: 'Would put checkout before 8:40 PM' },
      { id: 'holmes-returned', label: 'Holmes secretly returned to the Yard', note: 'No return recorded on duty logs' },
      { id: 'after-departure', label: 'The seal was checked out after Holmes departed', note: 'Signed out by Insp. Vale at 8:52 PM' },
    ],
  },
  cipher: {
    stationId: 'cipher',
    clueType: 'timetable',
    kicker: 'CLUE DISCOVERED · 221B BAKER STREET',
    title: 'Holmes’s Mirrored Pocket Timetable',
    evidence: 'Tucked inside Holmes’s study desk lies a brass timetable dial with three rotating combination wheels and a penciled scrap reading “TSAE / 82:9”. Holmes frequently reversed directions in field notes.',
    observations: [
      { tag: 'EXHIBIT', value: '221B BAKER STREET · STUDY DESK' },
      { tag: 'DECRYPTED SCRIPT', value: 'Mirrored text “TSAE / 82:9” reverses to: EAST / 9:28' },
      { tag: 'CASE SIGNIFICANCE', value: 'Directs detectives to East London Station at 9:28 PM, exposing the decoy' },
    ],
    question: 'Turn the three tumbler wheels to Holmes’s reversed hour: 9 · 2 · 8.',
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
    stationId: 'wire',
    clueType: 'telegraph',
    kicker: 'CLUE DISCOVERED · EAST LONDON SIGNAL BOX',
    title: 'East London Telegraph Sender',
    evidence: 'A heavy brass telegraph key on a polished mahogany base. The main line is severed, but Holmes’s routing card specifies that the circuit reopens with three short pulses followed by one sustained pulse.',
    observations: [
      { tag: 'EXHIBIT', value: 'GREAT EASTERN RAILWAY · SIGNAL BOX B' },
      { tag: 'ROUTING SEQUENCE', value: 'Three short pulses, followed by one long pulse (··· —)' },
      { tag: 'CASE SIGNIFICANCE', value: 'Restores telegraph current to trace the intercepted transmission' },
    ],
    question: 'Configure the pulse order: Three Short Pulses, then One Long Pulse.',
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
    stationId: 'relay',
    clueType: 'relay',
    kicker: 'CLUE DISCOVERED · EAST LONDON RELAY',
    title: 'The Reversible Relay Slip',
    evidence: 'A paper telegraph ticker tape trailing from the receiving junction. The destination keyword is encrypted in reverse: “NROHTKCALB”. Reading the characters backwards reveals the authentic transfer hideout.',
    observations: [
      { tag: 'EXHIBIT', value: 'COMMERCIAL CABLE CO. · TAPE RECORD #709' },
      { tag: 'DECRYPTED TEXT', value: 'N-R-O-H-T-K-C-A-L-B read backwards spells: BLACKTHORN' },
      { tag: 'CASE SIGNIFICANCE', value: 'Inspector Elias Vale sent the genuine ledger directly to Blackthorn House' },
    ],
    question: 'What destination does the decrypted transmission reveal?',
    hint: 'Read NROHTKCALB from right to left.',
    options: [
      { id: 'scotland-yard', label: 'Scotland Yard', note: 'The false dispatch began there' },
      { id: '221b', label: '221B Baker Street', note: 'Holmes’s note points away from Baker Street' },
      { id: 'blackthorn-house', label: 'Blackthorn House', note: 'The genuine transfer destination' },
    ],
  },
  'clue-footprints-yard': {
    stationId: 'clue-footprints-yard',
    clueType: 'footprints',
    kicker: 'CLUE DISCOVERED · SCOTLAND YARD BACK ALLEY',
    title: 'Muddy Yard Bootprints',
    evidence: 'Deep left-tread indentations in river mud beside the Yard perimeter wall. The left heel shows a distinct diagonal wear groove, measuring 11.2 inches in length with a tapered riding heel.',
    observations: [
      { tag: 'FORENSIC EXHIBIT', value: 'IMPRESSION CAST #09 · THAMES SILT' },
      { tag: 'SOLE MEASUREMENT', value: 'Length: 11.2 in · Width: 3.8 in · Depth: 1.4 in' },
      { tag: 'HEEL PROFILE', value: 'Bespoke bevel-cut gentleman’s riding heel' },
      { tag: 'CASE CORRELATION', value: 'Matches bespoke footwear ordered by Edward Blackthorn' },
    ],
    question: 'Which footwear classification matches the forensic cast?',
    hint: 'Notice the bespoke tapered riding heel and 11-inch length, typical of a high-society gentleman riding boot.',
    options: [
      { id: 'dock-hobnail', label: 'Dockworker hobnail workboots', note: 'Square heavy toe with 16 iron hobnails' },
      { id: 'tread-riding', label: 'Bespoke gentleman’s riding boots', note: 'Tapered bevel heel matching Blackthorn’s order' },
      { id: 'police-patrol', label: 'Standard Metropolitan patrol boots', note: 'Standard issue rubberized tread' },
    ],
  },
  'clue-fabric-fence': {
    stationId: 'clue-fabric-fence',
    clueType: 'fabric',
    kicker: 'CLUE DISCOVERED · SAVILE ROW IRON RAILING',
    title: 'Torn Tweed Fabric Hem',
    evidence: 'A jagged swatch of heavy cloth impaled on an iron fence spearhead. Microscopic analysis under polarized light reveals 100% French combed worsted wool dyed in charcoal slate with twill weave.',
    observations: [
      { tag: 'EXHIBIT', value: 'TEXTILE SAMPLE #12 · FENCE ARTIFACT' },
      { tag: 'FIBER TYPE', value: 'Double-twist combed worsted French wool' },
      { tag: 'DYE COMPOSITION', value: 'Charcoal slate mordanted with iron sulfate' },
      { tag: 'TAILOR SPECIFICATION', value: 'Exclusive cut supplied by Savile Row to Lord Blackthorn' },
    ],
    question: 'Which textile matches the polarized fiber weave?',
    hint: 'The lab analysis indicates double-twist French combed worsted wool in charcoal slate.',
    options: [
      { id: 'cotton-fustian', label: 'Coarse cotton fustian', note: 'Inexpensive factory worker weave' },
      { id: 'charcoal-tweed', label: 'French worsted charcoal wool', note: 'Bespoke overcoat fabric matching suspect' },
      { id: 'silk-damask', label: 'Imported silk damask', note: 'Thin glossy weave with no wool fiber' },
    ],
  },
  'clue-photo-surveillance': {
    stationId: 'clue-photo-surveillance',
    clueType: 'photograph',
    kicker: 'CLUE DISCOVERED · THAMES WHARF SHED',
    title: 'Stolen Daguerreotype Plate',
    evidence: 'A silver-plated copper daguerreotype plate recovered from a velvet pouch. Developing the latent exposure in pyrogallol developer brings out the silhouette of a tall figure clutching an art cylinder outside Blackthorn House.',
    observations: [
      { tag: 'EXHIBIT', value: 'SILVER-GELATIN DAGUERREOTYPE #88' },
      { tag: 'DEVELOPMENT BATH', value: 'Pyrogallol developer & sodium thiosulfate fixative' },
      { tag: 'IMAGE DETAIL', value: 'Tall figure in dark Ulster coat outside Blackthorn House' },
      { tag: 'REVEALED TRUTH', value: 'Confirms the thief surveyed Blackthorn House before the heist' },
    ],
    question: 'Which developer bath correctly exposed the silver-gelatin plate?',
    hint: 'The chemical note recommends pyrogallol with silver halide fixative.',
    options: [
      { id: 'nitric-acid', label: 'Pure nitric acid wash', note: 'Destroys the silver emulsion completely' },
      { id: 'silver-pyro', label: 'Pyrogallol & sodium thiosulfate', note: 'Proper photographic developer bath' },
      { id: 'salt-brine', label: 'Common salt brine solution', note: 'Fails to reduce silver halides' },
    ],
  },
  'clue-key-iron': {
    stationId: 'clue-key-iron',
    clueType: 'key',
    kicker: 'CLUE DISCOVERED · COBBLESTONE DRAINAGE GUTTER',
    title: 'Antique Skeleton Key',
    evidence: 'A heavy, hand-filed brass skeleton key retrieved from between cobblestones. The key bit features three stepped wards cut to heights of 3 notches, 1 notch, and 4 notches.',
    observations: [
      { tag: 'EXHIBIT', value: 'HAND-FILED BRASS SKELETON KEY #02' },
      { tag: 'CREST EMBOSSING', value: 'Intertwined "EB" seal of Blackthorn Estate' },
      { tag: 'WARD BIT PATTERN', value: 'Stepped bit sequence: High (3), Low (1), Medium (4)' },
      { tag: 'APPLICATION', value: 'Bypasses the secondary crypt mortise deadlock' },
    ],
    question: 'What ward pin combination matches the cut of this skeleton key?',
    hint: 'Count the ward notches: 3 notches on the lead bit, 1 in the valley, 4 on the flank (3-1-4).',
    options: [
      { id: 'tumbler-123', label: 'Stepped 1 - 2 - 3 ward pattern', note: 'Standard household pin sequence' },
      { id: 'tumbler-314', label: 'Stepped 3 - 1 - 4 ward sequence', note: 'Matches the hand-filed bit notches exactly' },
      { id: 'tumbler-555', label: 'Flat 5 - 5 - 5 master blank', note: 'Uncut blank with no stepped wards' },
    ],
  },
  'clue-fingerprint-glass': {
    stationId: 'clue-fingerprint-glass',
    clueType: 'fingerprints',
    kicker: 'CLUE DISCOVERED · DISCARDED STREET LANTERN',
    title: 'Lantern Glass Latent Fingerprint',
    evidence: 'Forensic dusting with powdered graphite reveals an oily latent thumbprint on the lantern glass. The epidermal ridges spiral inward in a classic double whorl with 14 counted ridges.',
    observations: [
      { tag: 'EXHIBIT', value: 'GRAPHITE DUSTING EXHIBIT #5' },
      { tag: 'DERMAL CLASSIFICATION', value: 'Accidental double-whorl pattern (Henry Class W)' },
      { tag: 'CORE RIDGE COUNT', value: '14 distinct ridges between delta and core' },
      { tag: 'SUSPECT DOSSIER', value: 'Identical to Edward Blackthorn’s right thumbprint' },
    ],
    question: 'Which fingerprint pattern was classified by the forensic dusting?',
    hint: 'Look for the pattern featuring spiraling concentric ridges (double whorl).',
    options: [
      { id: 'plain-arch', label: 'Plain tented arch pattern', note: 'Ridges enter one side and exit the other' },
      { id: 'radial-loop', label: 'Left-leaning radial loop', note: 'Loop ridges curving toward the radius bone' },
      { id: 'whorl-pattern', label: 'Double-whorl ridge pattern', note: 'Concentric spirals matching Blackthorn’s thumb' },
    ],
  },
  'clue-witness-ledger': {
    stationId: 'clue-witness-ledger',
    clueType: 'witness',
    kicker: 'CLUE DISCOVERED · CAB STAND CALL BOX',
    title: 'Hansom Cab Route Ledger',
    evidence: 'A battered leather logbook kept by driver Thomas Higgins of Hansom Cab No. 42. Entry at 9:22 PM records picking up a passenger with a brass-trimmed case at East Docks, delivering directly to Blackthorn House.',
    observations: [
      { tag: 'EXHIBIT', value: 'LICENSED CAB #42 · LOGBOOK VOL. IV' },
      { tag: 'ROUTE TIMESTAMPS', value: '9:00 PM: Yard · 9:22 PM: East Docks · 9:45 PM: Blackthorn' },
      { tag: 'PASSENGER NOTES', value: 'Gentleman wearing top hat and long cape, carrying heavy chest' },
      { tag: 'CASE VALUE', value: 'Establishes the thief’s timeline connecting all crime scenes' },
    ],
    question: 'Which route did Cab No. 42 log during the suspect’s movement?',
    hint: 'The entry shows East Docks at 9:22 PM proceeding directly to Blackthorn House.',
    options: [
      { id: 'cab-westend', label: 'Paddington to West End theaters', note: 'Decoy entry recorded earlier that afternoon' },
      { id: 'cab-eastdocks', label: 'East Docks to Blackthorn House at 9:22 PM', note: 'Matches the timeline of the stolen artifacts' },
      { id: 'cab-yardreturn', label: 'Direct return to Scotland Yard', note: 'No vehicle returned to the Yard at that hour' },
    ],
  },
};

function savedCredentials() {
  try { return JSON.parse(safeStorage.get('shadows-room') || 'null'); } catch { return null; }
}

function saveCredentials(data) {
  Object.assign(local, data);
  safeStorage.set('shadows-room', JSON.stringify(local));
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
  delete local.demoBot; delete local.demo;
  setBusy(true);
  try {
    const result = await jsonRequest('create', { name: local.playerName });
    beginCharacterSelection(result);
  } catch (error) { setLandingError(error.message); }
  finally { setBusy(false); }
}

async function joinRoom() {
  setLandingError('');
  delete local.demoBot; delete local.demo;
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
  selectedCharacter = ['boy', 'girl', 'sherlock', 'watson', 'detective', 'journalist', 'officer'].includes(localStorage.getItem('shadows-character')) ? localStorage.getItem('shadows-character') : null;
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
    if (local.demoBot?.token) {
      await jsonRequest('action', { code: local.code, token: local.demoBot.token, action: 'character', character: 'boy' });
      await jsonRequest('action', { code: local.code, token: local.demoBot.token, action: 'ready', ready: true });
      await jsonRequest('action', { code: local.code, token: local.token, action: 'ready', ready: true });
      await jsonRequest('action', { code: local.code, token: local.token, action: 'start' });
    }
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
  delete local.demoBot; delete local.demo;
  selectedCharacter = null;
  showRoomEntry();
}

function showScreen(screen) {
  for (const element of [welcome, identity, landing, $('character-gate'), game]) {
    if (element) element.classList.add('hidden');
  }
  if (screen) screen.classList.remove('hidden');
  try {
    if (screen === welcome) {
      titleWorld?.setActive(true);
    } else {
      titleWorld?.setActive(false);
    }
  } catch (err) {
    console.warn('[SHERLOCK] titleWorld setActive failed:', err);
  }
}

function showWelcome() {
  if ($('menu-global-error')) $('menu-global-error').textContent = '';
  if ($('menu-join-error')) $('menu-join-error').textContent = '';
  $('menu-join-box')?.classList.add('hidden');
  showScreen(welcome);
}

function showIdentity() {
  $('player-name').value = localStorage.getItem('shadows-name') || local.playerName || '';
  $('identity-error').textContent = '';
  showScreen(identity);
  $('player-name').focus();
}

function continueFromIdentity() {
  const name = $('player-name').value.trim();
  if (name.length < 2 || name.length > 18 || /[<>\u0000-\u001f]/.test(name)) {
    $('identity-error').textContent = 'Enter a detective name (2–18 characters). Avoid angle brackets or control characters.';
    $('player-name').focus();
    return;
  }
  local.playerName = name;
  localStorage.setItem('shadows-name', name);
  $('welcome-detective-name').textContent = name;
  if (local.pendingMenuAction === 'create') {
    delete local.pendingMenuAction;
    createRoom();
  } else if (local.pendingMenuAction === 'join') {
    delete local.pendingMenuAction;
    showRoomEntry();
    setTimeout(() => $('room-code')?.focus(), 50);
  } else {
    showRoomEntry();
  }
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
  clearInterval(pollLoop); clearInterval(movementLoop); clearInterval(demoLoop); keys.clear(); resetJoystick(); view = null;
  localStorage.removeItem('shadows-room');
  sessionStorage.removeItem('shadows-pending-room');
  Object.assign(local, { code: '', token: '', playerId: '' });
  delete local.demoBot; delete local.demo;
  showWelcome();
}

async function enterRoom() {
  showScreen(game);
  $('room-code-display').textContent = local.code;
  setConnection(view ? 'CONNECTED' : 'CONNECTING');
  if (view) updateUi();
  await refreshState();
  if (view?.me?.character) {
    selectedCharacter = view.me.character;
    local.character = selectedCharacter;
    localStorage.setItem('shadows-character', selectedCharacter);
    localStorage.setItem('shadows-room', JSON.stringify(local));
  }
  clearInterval(pollLoop);
  clearInterval(demoLoop);
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
      showWelcome();
      showToast('Saved room has expired. Welcome back to Baker Street.');
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
    return result;
  } catch (error) {
    if (error.data?.state) { view = error.data.state; updateUi(); }
    if (!$('evidence-puzzle').classList.contains('hidden')) $('puzzle-feedback').textContent = error.message;
    return { ok: false, message: error.message };
  }
}

function renderEvidenceIllustration(clueType) {
  if (clueType === 'letter') {
    return `<svg viewBox="0 0 320 160" class="artifact-svg" aria-label="The Bloodstained Forged Letter">
      <defs>
        <radialGradient id="paper-vig" cx="50%" cy="50%" r="65%">
          <stop offset="0%" stop-color="#f2e8d3"/>
          <stop offset="70%" stop-color="#dfcfb0"/>
          <stop offset="100%" stop-color="#bba882"/>
        </radialGradient>
      </defs>
      <rect width="320" height="160" rx="4" fill="#13171e"/>
      <g transform="translate(45, 14) rotate(-2)">
        <rect width="230" height="132" rx="3" fill="url(#paper-vig)" stroke="#7c633c" stroke-width="1.5"/>
        <line x1="115" y1="0" x2="115" y2="132" stroke="#cfbe9b" stroke-width="0.8" stroke-dasharray="3 3"/>
        <line x1="0" y1="66" x2="230" y2="66" stroke="#cfbe9b" stroke-width="0.8" stroke-dasharray="3 3"/>
        <rect x="14" y="10" width="134" height="14" rx="1" fill="none" stroke="#5a452a" stroke-width="0.8"/>
        <text x="81" y="20" font-family="Cinzel, Georgia, serif" font-size="6.5" font-weight="700" fill="#5a452a" text-anchor="middle" letter-spacing="1">SCOTLAND YARD · DISPATCH LAB</text>
        <path d="M16,36 Q50,33 120,36 T200,35" stroke="#221b14" stroke-width="1.2" fill="none" stroke-linecap="round"/>
        <path d="M16,50 Q70,47 140,50 T210,49" stroke="#221b14" stroke-width="1.1" fill="none" stroke-linecap="round"/>
        <text x="18" y="70" font-family="Georgia, serif" font-style="italic" font-size="12.5" fill="#1b140d">“Meet at the old warehouse… midnight…”</text>
        <path d="M16,84 Q60,82 130,84 T190,83" stroke="#221b14" stroke-width="1" fill="none" stroke-linecap="round"/>
        <ellipse cx="178" cy="74" rx="13" ry="9" fill="#8f1f1f" opacity="0.88"/>
        <ellipse cx="185" cy="85" rx="5" ry="6" fill="#751515" opacity="0.85"/>
        <circle cx="164" cy="70" r="3.5" fill="#8f1f1f" opacity="0.8"/>
        <circle cx="196" cy="78" r="2.8" fill="#691212" opacity="0.85"/>
        <circle cx="204" cy="110" r="14" fill="#992222" stroke="#4d1010" stroke-width="1.2"/>
        <circle cx="204" cy="110" r="10" fill="none" stroke="#ffad99" stroke-width="0.8" opacity="0.7"/>
        <text x="204" y="113" font-family="Cinzel, Georgia, serif" font-size="8" font-weight="700" fill="#ffc2b3" text-anchor="middle">SY</text>
      </g>
    </svg>`;
  }
  if (clueType === 'seal') {
    return `<svg viewBox="0 0 320 160" class="artifact-svg" aria-label="Yard Seal Register No. 14">
      <rect width="320" height="160" rx="4" fill="#13171e"/>
      <g transform="translate(35, 14)">
        <rect width="250" height="132" rx="3" fill="#e8dfcb" stroke="#6e5737" stroke-width="1.5"/>
        <line x1="125" y1="0" x2="125" y2="132" stroke="#5a452a" stroke-width="2"/>
        <text x="62" y="18" font-family="Cinzel, Georgia, serif" font-size="7" font-weight="700" fill="#5a452a" text-anchor="middle">METROPOLITAN SEAL REGISTER</text>
        <line x1="12" y1="24" x2="118" y2="24" stroke="#8c734b" stroke-width="0.8"/>
        <text x="14" y="38" font-family="Courier, monospace" font-size="8" fill="#30261a">08:15 - Patrol Key 4 - Sgt. Miller</text>
        <text x="14" y="52" font-family="Courier, monospace" font-size="8" fill="#30261a">08:40 - Holmes Train Departure</text>
        <rect x="10" y="58" width="112" height="22" rx="2" fill="#c9a45c" opacity="0.3" stroke="#c9a45c" stroke-width="1"/>
        <text x="14" y="70" font-family="Courier, monospace" font-size="8" font-weight="bold" fill="#7d1d1d">08:52 - SEAL #14 SIGN-OUT</text>
        <text x="14" y="77" font-family="Courier, monospace" font-size="7" fill="#5a1818">OFFICER: Insp. Elias Vale</text>
        <text x="14" y="94" font-family="Courier, monospace" font-size="8" fill="#30261a">09:10 - Forged Stamp Applied</text>
        <text x="187" y="18" font-family="Cinzel, Georgia, serif" font-size="7" font-weight="700" fill="#5a452a" text-anchor="middle">OFFICIAL IMPRESSION</text>
        <circle cx="187" cy="62" r="25" fill="#8f2020" stroke="#4a1111" stroke-width="1.5"/>
        <circle cx="187" cy="62" r="19" fill="none" stroke="#f0a595" stroke-width="1" stroke-dasharray="4 2"/>
        <text x="187" y="59" font-family="Cinzel, Georgia, serif" font-size="8" font-weight="bold" fill="#ffd1c7" text-anchor="middle">SCOTLAND YARD</text>
        <text x="187" y="72" font-family="Cinzel, Georgia, serif" font-size="12" font-weight="bold" fill="#ffffff" text-anchor="middle">№ 14</text>
        <rect x="220" y="68" width="16" height="54" rx="3" fill="#a88544" stroke="#c9a45c" stroke-width="1"/>
        <ellipse cx="228" cy="68" rx="8" ry="4" fill="#f4d389"/>
      </g>
    </svg>`;
  }
  if (clueType === 'timetable') {
    return `<svg viewBox="0 0 320 160" class="artifact-svg" aria-label="Holmes’s Mirrored Pocket Timetable">
      <rect width="320" height="160" rx="4" fill="#13171e"/>
      <g transform="translate(45, 12)">
        <rect x="0" y="0" width="130" height="136" rx="10" fill="#8a6c38" stroke="#f4d389" stroke-width="1.5"/>
        <rect x="6" y="6" width="118" height="124" rx="8" fill="#1a1c22" stroke="#c9a45c" stroke-width="1"/>
        <text x="65" y="24" font-family="Cinzel, Georgia, serif" font-size="7.5" font-weight="700" fill="#c9a45c" text-anchor="middle" letter-spacing="1">RAILWAY TIMETABLE</text>
        <g transform="translate(18, 38)">
          <rect x="0" y="0" width="26" height="48" rx="3" fill="#2d281f" stroke="#c9a45c" stroke-width="1.2"/>
          <text x="13" y="32" font-family="Cinzel, Georgia, serif" font-size="22" font-weight="700" fill="#f4d389" text-anchor="middle">9</text>
          <rect x="34" y="0" width="26" height="48" rx="3" fill="#2d281f" stroke="#c9a45c" stroke-width="1.2"/>
          <text x="47" y="32" font-family="Cinzel, Georgia, serif" font-size="22" font-weight="700" fill="#f4d389" text-anchor="middle">2</text>
          <rect x="68" y="0" width="26" height="48" rx="3" fill="#2d281f" stroke="#c9a45c" stroke-width="1.2"/>
          <text x="81" y="32" font-family="Cinzel, Georgia, serif" font-size="22" font-weight="700" fill="#f4d389" text-anchor="middle">8</text>
        </g>
        <text x="65" y="110" font-family="Cinzel, Georgia, serif" font-size="7" fill="#a89474" text-anchor="middle">EAST LONDON · 9:28 PM</text>
      </g>
      <g transform="translate(195, 20) rotate(5)">
        <polygon points="0,0 100,6 94,115 5,110" fill="#ded4bd" stroke="#8a7350" stroke-width="1"/>
        <text x="15" y="22" font-family="Georgia, serif" font-size="7" font-weight="bold" fill="#695333">221B BAKER ST.</text>
        <text x="15" y="55" font-family="Georgia, serif" font-style="italic" font-size="14" font-weight="bold" fill="#221b14">“TSAE / 82:9”</text>
        <text x="15" y="78" font-family="Georgia, serif" font-size="7.5" fill="#524330">Mirror script:</text>
        <text x="15" y="92" font-family="Cinzel, Georgia, serif" font-size="9" font-weight="bold" fill="#8f2b2b">EAST / 9:28</text>
      </g>
    </svg>`;
  }
  if (clueType === 'telegraph') {
    return `<svg viewBox="0 0 320 160" class="artifact-svg" aria-label="East London Telegraph Sender">
      <rect width="320" height="160" rx="4" fill="#13171e"/>
      <g transform="translate(30, 20)">
        <rect width="260" height="120" rx="6" fill="#301b10" stroke="#7a4628" stroke-width="2"/>
        <rect x="25" y="35" width="210" height="16" rx="3" fill="#a88344" stroke="#e8c77b" stroke-width="1.2"/>
        <circle cx="190" cy="43" r="18" fill="#1a1410" stroke="#c9a45c" stroke-width="2"/>
        <circle cx="190" cy="43" r="12" fill="#38281a"/>
        <rect x="40" y="20" width="22" height="46" rx="2" fill="#a88344" stroke="#c9a45c" stroke-width="1"/>
        <rect x="80" y="24" width="16" height="38" rx="2" fill="#a88344" stroke="#c9a45c" stroke-width="1"/>
        <circle cx="130" cy="78" r="18" fill="#a85226" stroke="#d4703b" stroke-width="1.5"/>
        <circle cx="130" cy="78" r="10" fill="#301810"/>
        <circle cx="175" cy="78" r="18" fill="#a85226" stroke="#d4703b" stroke-width="1.5"/>
        <circle cx="175" cy="78" r="10" fill="#301810"/>
        <rect x="30" y="98" width="200" height="14" fill="#e8dfcb" stroke="#99866b" stroke-width="0.8"/>
        <text x="130" y="108" font-family="Courier, monospace" font-size="11" font-weight="bold" fill="#1f1810" text-anchor="middle" letter-spacing="4">· · · — (S · T)</text>
      </g>
    </svg>`;
  }
  if (clueType === 'footprints') {
    return `<svg viewBox="0 0 320 160" class="artifact-svg" aria-label="Forensic Muddy Bootprints">
      <rect width="320" height="160" rx="4" fill="#13171e"/>
      <g transform="translate(30, 16)">
        <rect width="260" height="128" rx="4" fill="#1d1914" stroke="#68553d" stroke-width="1.5"/>
        <line x1="20" y1="116" x2="240" y2="116" stroke="#c9a45c" stroke-width="1.5"/>
        <g stroke="#c9a45c" stroke-width="1">
          <line x1="20" y1="112" x2="20" y2="120"/><line x1="64" y1="114" x2="64" y2="118"/>
          <line x1="108" y1="112" x2="108" y2="120"/><line x1="152" y1="114" x2="152" y2="118"/>
          <line x1="196" y1="112" x2="196" y2="120"/><line x1="240" y1="112" x2="240" y2="120"/>
        </g>
        <text x="130" y="126" font-family="Courier, monospace" font-size="8" fill="#d4c29d" text-anchor="middle">FORENSIC TREAD SCALE (INCHES) · 11.2 IN</text>
        <g transform="translate(65, 8)">
          <path d="M15,8 Q35,2 48,15 T45,55 Q35,70 20,70 Q5,70 5,45 Z" fill="#0d0a07" stroke="#3d3023" stroke-width="1.5"/>
          <path d="M12,78 Q22,76 34,78 Q36,95 24,96 Q10,95 12,78 Z" fill="#0d0a07" stroke="#3d3023" stroke-width="1.5"/>
          <line x1="10" y1="20" x2="40" y2="20" stroke="#251c14" stroke-width="1.5"/>
          <line x1="8" y1="32" x2="44" y2="32" stroke="#251c14" stroke-width="1.5"/>
          <line x1="10" y1="44" x2="40" y2="44" stroke="#251c14" stroke-width="1.5"/>
        </g>
        <g transform="translate(145, 18) rotate(6)">
          <path d="M15,8 Q35,2 48,15 T45,55 Q35,70 20,70 Q5,70 5,45 Z" fill="#0d0a07" stroke="#8a2020" stroke-width="1.2"/>
          <path d="M12,78 Q22,76 34,78 Q36,95 24,96 Q10,95 12,78 Z" fill="#0d0a07" stroke="#8a2020" stroke-width="1.2"/>
          <text x="25" y="89" font-family="Cinzel, serif" font-size="7" font-weight="bold" fill="#ff7070" text-anchor="middle">BEVEL</text>
        </g>
        <text x="200" y="24" font-family="Cinzel, serif" font-size="7.5" font-weight="bold" fill="#c9a45c">EVIDENCE CAST #9</text>
        <text x="200" y="38" font-family="Courier, monospace" font-size="7" fill="#a89474">GENTLEMAN RIDING BOOT</text>
        <text x="200" y="50" font-family="Courier, monospace" font-size="7" fill="#a89474">DEPTH: 1.4 IN · SOFT SILT</text>
      </g>
    </svg>`;
  }
  if (clueType === 'fabric') {
    return `<svg viewBox="0 0 320 160" class="artifact-svg" aria-label="Textile Fiber Forensic Analysis">
      <rect width="320" height="160" rx="4" fill="#13171e"/>
      <g transform="translate(30, 16)">
        <rect width="260" height="128" rx="4" fill="#181c22" stroke="#485c6d" stroke-width="1.5"/>
        <circle cx="75" cy="64" r="46" fill="#12161b" stroke="#c9a45c" stroke-width="1.5"/>
        <path d="M40,40 Q75,30 110,48 Q100,85 70,88 Q45,75 40,40 Z" fill="#292624" stroke="#8f7a63" stroke-width="1"/>
        <g stroke="#54493c" stroke-width="1.2">
          <line x1="45" y1="50" x2="105" y2="50"/><line x1="48" y1="62" x2="102" y2="62"/>
          <line x1="52" y1="74" x2="98" y2="74"/><line x1="60" y1="42" x2="60" y2="82"/>
          <line x1="75" y1="38" x2="75" y2="86"/><line x1="90" y1="44" x2="90" y2="80"/>
        </g>
        <line x1="105" y1="48" x2="125" y2="40" stroke="#a68452" stroke-width="1.2"/>
        <line x1="98" y1="74" x2="118" y2="85" stroke="#a68452" stroke-width="1.2"/>
        <text x="75" y="122" font-family="Courier, monospace" font-size="7.5" fill="#c9a45c" text-anchor="middle">MAGNIFICATION: 40X · TWILL WEAVE</text>
        <g transform="translate(140, 20)">
          <text x="0" y="14" font-family="Cinzel, serif" font-size="8.5" font-weight="bold" fill="#f4d389">SAVILE ROW OVERCOAT</text>
          <text x="0" y="32" font-family="Courier, monospace" font-size="7.5" fill="#a8b5c2">FIBER: FRENCH COMBED WOOL</text>
          <text x="0" y="46" font-family="Courier, monospace" font-size="7.5" fill="#a8b5c2">DYE: CHARCOAL SLATE / IRON</text>
          <text x="0" y="60" font-family="Courier, monospace" font-size="7.5" fill="#a8b5c2">ORIGIN: LORD BLACKTHORN</text>
          <rect x="0" y="70" width="105" height="18" rx="2" fill="rgba(201,164,92,0.15)" stroke="#c9a45c" stroke-width="0.8"/>
          <text x="52" y="82" font-family="Cinzel, serif" font-size="7" font-weight="bold" fill="#ffd98c" text-anchor="middle">BESPOKE WEAVE MATCH</text>
        </g>
      </g>
    </svg>`;
  }
  if (clueType === 'photograph') {
    return `<svg viewBox="0 0 320 160" class="artifact-svg" aria-label="Stolen Daguerreotype Plate">
      <rect width="320" height="160" rx="4" fill="#13171e"/>
      <g transform="translate(45, 14)">
        <rect width="230" height="132" rx="4" fill="#2d2218" stroke="#8c6c42" stroke-width="2"/>
        <rect x="15" y="12" width="200" height="108" rx="2" fill="#c4b293" stroke="#4a3622" stroke-width="1.2"/>
        <ellipse cx="115" cy="66" rx="90" ry="46" fill="#8c775a" opacity="0.4"/>
        <path d="M50,90 Q90,50 140,70 T200,90 Z" fill="#4d3e2d"/>
        <rect x="80" y="55" width="28" height="35" fill="#30261c"/>
        <rect x="130" y="45" width="40" height="45" fill="#382d22"/>
        <g transform="translate(105, 42)">
          <circle cx="10" cy="8" r="6" fill="#18130d"/>
          <path d="M2,16 L18,16 L22,46 L-2,46 Z" fill="#18130d"/>
          <rect x="4" y="0" width="12" height="4" fill="#18130d"/>
        </g>
        <text x="115" y="112" font-family="Courier, monospace" font-size="7.5" font-weight="bold" fill="#261c12" text-anchor="middle">DAGUERREOTYPE · THAMES SURVEY</text>
      </g>
    </svg>`;
  }
  if (clueType === 'key') {
    return `<svg viewBox="0 0 320 160" class="artifact-svg" aria-label="Antique Gutter Skeleton Key">
      <rect width="320" height="160" rx="4" fill="#13171e"/>
      <g transform="translate(35, 18)">
        <rect width="250" height="124" rx="4" fill="#181d22" stroke="#685438" stroke-width="1.5"/>
        <g transform="translate(30, 52)">
          <circle cx="25" cy="12" r="18" fill="none" stroke="#d4af37" stroke-width="4"/>
          <circle cx="25" cy="12" r="10" fill="#2d2010" stroke="#8a6c25" stroke-width="1.5"/>
          <text x="25" y="15" font-family="Cinzel, serif" font-size="9" font-weight="bold" fill="#ffd98c" text-anchor="middle">EB</text>
          <line x1="43" y1="12" x2="145" y2="12" stroke="#d4af37" stroke-width="6" stroke-linecap="round"/>
          <rect x="125" y="12" width="22" height="24" fill="#d4af37"/>
          <rect x="131" y="24" width="5" height="12" fill="#181d22"/>
          <rect x="141" y="28" width="6" height="8" fill="#181d22"/>
        </g>
        <g transform="translate(190, 30)">
          <text x="0" y="12" font-family="Cinzel, serif" font-size="8.5" font-weight="bold" fill="#f4d389">BIT WARDS</text>
          <text x="0" y="28" font-family="Courier, monospace" font-size="8" fill="#c9a45c">PIN 1: 3 NOTCHES</text>
          <text x="0" y="42" font-family="Courier, monospace" font-size="8" fill="#c9a45c">PIN 2: 1 NOTCH</text>
          <text x="0" y="56" font-family="Courier, monospace" font-size="8" fill="#c9a45c">PIN 3: 4 NOTCHES</text>
          <text x="0" y="74" font-family="Cinzel, serif" font-size="7.5" font-weight="bold" fill="#75ff88">CODE: 3 - 1 - 4</text>
        </g>
      </g>
    </svg>`;
  }
  if (clueType === 'fingerprints') {
    return `<svg viewBox="0 0 320 160" class="artifact-svg" aria-label="Forensic Latent Fingerprint">
      <rect width="320" height="160" rx="4" fill="#13171e"/>
      <g transform="translate(35, 14)">
        <rect width="250" height="132" rx="4" fill="#10151c" stroke="#485c6d" stroke-width="1.5"/>
        <g transform="translate(70, 66)">
          <ellipse cx="0" cy="0" rx="42" ry="54" fill="none" stroke="#253545" stroke-width="1"/>
          <path d="M-28,25 C-32,-20 0,-44 0,-44 C0,-44 32,-20 28,25" fill="none" stroke="#a0b8cc" stroke-width="1.8"/>
          <path d="M-22,25 C-26,-15 0,-36 0,-36 C0,-36 26,-15 22,25" fill="none" stroke="#d5e8f7" stroke-width="1.8"/>
          <path d="M-16,22 C-20,-10 0,-28 0,-28 C0,-28 20,-10 16,22" fill="none" stroke="#a0b8cc" stroke-width="1.8"/>
          <ellipse cx="0" cy="0" rx="10" ry="16" fill="none" stroke="#ffffff" stroke-width="1.8"/>
          <circle cx="0" cy="0" r="3" fill="#ffffff"/>
        </g>
        <g transform="translate(145, 24)">
          <text x="0" y="14" font-family="Cinzel, serif" font-size="8.5" font-weight="bold" fill="#f4d389">LATENT WHORL DUSTING</text>
          <text x="0" y="32" font-family="Courier, monospace" font-size="7.5" fill="#a2b7c9">PATTERN: DOUBLE WHORL</text>
          <text x="0" y="46" font-family="Courier, monospace" font-size="7.5" fill="#a2b7c9">CORE RIDGES: 14 COUNT</text>
          <text x="0" y="60" font-family="Courier, monospace" font-size="7.5" fill="#a2b7c9">SURFACE: LANTERN GLASS</text>
          <rect x="0" y="70" width="95" height="18" rx="2" fill="rgba(80,180,100,0.15)" stroke="#55cc77" stroke-width="0.8"/>
          <text x="47" y="82" font-family="Cinzel, serif" font-size="7" font-weight="bold" fill="#75ff88" text-anchor="middle">BLACKTHORN MATCH</text>
        </g>
      </g>
    </svg>`;
  }
  if (clueType === 'witness') {
    return `<svg viewBox="0 0 320 160" class="artifact-svg" aria-label="Hansom Cab Witness Route Ledger">
      <rect width="320" height="160" rx="4" fill="#13171e"/>
      <g transform="translate(35, 14)">
        <rect width="250" height="132" rx="3" fill="#e8dfca" stroke="#6e5737" stroke-width="1.5"/>
        <line x1="12" y1="26" x2="238" y2="26" stroke="#8c734b" stroke-width="1"/>
        <text x="125" y="18" font-family="Cinzel, serif" font-size="8" font-weight="bold" fill="#4a3622" text-anchor="middle">LICENSED CAB #42 · DAILY LOGBOOK</text>
        <text x="16" y="42" font-family="Courier, monospace" font-size="7.5" fill="#2d2217">08:30 PM - Yard to Victoria - 1s 6d</text>
        <text x="16" y="58" font-family="Courier, monospace" font-size="7.5" fill="#2d2217">09:05 PM - Baker St Wait - 2s 0d</text>
        <rect x="12" y="66" width="226" height="24" rx="2" fill="rgba(180,40,40,0.15)" stroke="#a62b2b" stroke-width="1"/>
        <text x="16" y="78" font-family="Courier, monospace" font-size="8" font-weight="bold" fill="#8f1818">09:22 PM - EAST DOCKS -> BLACKTHORN</text>
        <text x="16" y="86" font-family="Courier, monospace" font-size="7" fill="#691616">FAIR: GENT IN CAPE W/ HEAVY CHEST</text>
        <circle cx="210" cy="108" r="16" fill="#8c2020" stroke="#4d1010" stroke-width="1.2"/>
        <text x="210" y="112" font-family="Cinzel, serif" font-size="8" font-weight="bold" fill="#ffffff" text-anchor="middle">VERIFIED</text>
      </g>
    </svg>`;
  }
  // Relay
  return `<svg viewBox="0 0 320 160" class="artifact-svg" aria-label="The Reversible Relay Slip">
    <rect width="320" height="160" rx="4" fill="#13171e"/>
    <g transform="translate(30, 20)">
      <rect width="260" height="120" rx="4" fill="#1e2530" stroke="#c9a45c" stroke-width="1.5"/>
      <text x="130" y="24" font-family="Cinzel, Georgia, serif" font-size="8" font-weight="700" fill="#c9a45c" text-anchor="middle" letter-spacing="1.5">COMMERCIAL CABLE CO. · RECEIVER</text>
      <rect x="20" y="44" width="220" height="34" fill="#e6dabf" stroke="#8c734b" stroke-width="1"/>
      <text x="130" y="66" font-family="Courier, monospace" font-size="13" font-weight="bold" fill="#2b2014" text-anchor="middle" letter-spacing="5">N R O H T K C A L B</text>
      <g transform="translate(40, 88)">
        <rect width="180" height="24" rx="2" fill="rgba(201, 164, 92, 0.2)" stroke="#c9a45c" stroke-width="1"/>
        <text x="90" y="16" font-family="Cinzel, Georgia, serif" font-size="10" font-weight="700" fill="#f4d389" text-anchor="middle" letter-spacing="2">BLACKTHORN HOUSE</text>
      </g>
    </g>
  </svg>`;
}

const PORTRAIT_PIECES = Object.freeze({
  'clue-footprints-yard': { id: 1, name: 'Top-Left Fragment (Ulster Cap & Brow)', gameType: 'find-objects', location: 'footprintsYard', hint: 'Look for the muddy bootprints near Scotland Yard.' },
  'clue-fabric-fence': { id: 2, name: 'Top-Center Fragment (Phantom Mask & Eyes)', gameType: 'match-symbols', location: 'fabricFence', hint: 'Check the torn cloth on the iron spearhead fence.' },
  'clue-photo-surveillance': { id: 3, name: 'Top-Right Fragment (High Velvet Collar)', gameType: 'unlock-box', location: 'photoSurveillance', hint: 'Inspect the daguerreotype camera near Baker Street.' },
  'clue-key-iron': { id: 4, name: 'Bottom-Left Fragment (Engraved Pocket Watch)', gameType: 'find-objects', location: 'keyIron', hint: 'Search the gutter crevice by the railway station.' },
  'clue-fingerprint-glass': { id: 5, name: 'Bottom-Center Fragment (Crimson Silk Cravat)', gameType: 'match-symbols', location: 'fingerprintGlass', hint: 'Examine the lantern glass across from the study.' },
  'clue-witness-ledger': { id: 6, name: 'Bottom-Right Fragment (Gloved Hand & Vault Key)', gameType: 'unlock-box', location: 'witnessLedger', hint: 'Review the midnight hansom cab route ledger.' },
});

function getNearestUncollectedStation(me, room) {
  if (!room || !room.portrait || !me) return null;
  const collected = room.portrait.collectedPieces || [];
  let nearest = null;
  let minDist = Infinity;

  for (const [stationId, info] of Object.entries(PORTRAIT_PIECES)) {
    if (collected.includes(info.id)) continue;
    const pt = points[info.location];
    if (!pt) continue;
    const d = Math.hypot(me.x - pt.x, me.y - pt.y);
    if (d < minDist) {
      minDist = d;
      nearest = { stationId, info, pt, dist: d };
    }
  }
  return nearest;
}

function renderPortraitPieceSvg(id) {
  switch (id) {
    case 1:
      return `<svg viewBox="0 0 100 80" class="piece-svg"><path d="M15 45 C25 18, 75 18, 85 45 C80 52, 20 52, 15 45 Z" fill="#2b2d35" stroke="#c9a45c" stroke-width="2"/><path d="M30 38 C40 30, 60 30, 70 38" stroke="#e5c178" stroke-width="1.5" fill="none"/><path d="M32 55 Q40 50 48 55 M52 55 Q60 50 68 55" stroke="#151820" stroke-width="2.5" fill="none"/></svg>`;
    case 2:
      return `<svg viewBox="0 0 100 80" class="piece-svg"><path d="M20 40 Q35 28 50 36 Q65 28 80 40 Q75 56 50 48 Q25 56 20 40 Z" fill="#11141a" stroke="#c9a45c" stroke-width="2"/><ellipse cx="36" cy="40" rx="7" ry="4" fill="#fff"/><circle cx="36" cy="40" r="3" fill="#3a6ea5"/><ellipse cx="64" cy="40" rx="7" ry="4" fill="#fff"/><circle cx="64" cy="40" r="3" fill="#3a6ea5"/></svg>`;
    case 3:
      return `<svg viewBox="0 0 100 80" class="piece-svg"><path d="M25 22 L45 65 L55 65 L75 22 L65 75 L35 75 Z" fill="#1f242e" stroke="#c9a45c" stroke-width="2"/><path d="M35 32 L48 60 L52 60 L65 32" fill="#321e1e" stroke="#a33" stroke-width="1.5"/></svg>`;
    case 4:
      return `<svg viewBox="0 0 100 80" class="piece-svg"><circle cx="50" cy="46" r="23" fill="#221d15" stroke="#ffd700" stroke-width="2.5"/><circle cx="50" cy="46" r="19" fill="#fff9e6"/><path d="M50 46 L50 34 M50 46 L60 46" stroke="#2b2014" stroke-width="2" stroke-linecap="round"/><path d="M50 23 L50 16 M46 16 L54 16" stroke="#ffd700" stroke-width="2"/></svg>`;
    case 5:
      return `<svg viewBox="0 0 100 80" class="piece-svg"><path d="M42 18 L58 18 L64 45 L50 72 L36 45 Z" fill="#7a1818" stroke="#c9a45c" stroke-width="2"/><circle cx="50" cy="35" r="3.5" fill="#ffd700" stroke="#fff" stroke-width="1"/><path d="M46 24 Q50 38 54 24" stroke="#a82828" stroke-width="1.5" fill="none"/></svg>`;
    case 6:
      return `<svg viewBox="0 0 100 80" class="piece-svg"><path d="M35 28 C30 38, 32 60, 45 65 L55 65 C65 55, 60 38, 55 28 Z" fill="#1a1d24" stroke="#c9a45c" stroke-width="2"/><circle cx="62" cy="42" r="7" fill="none" stroke="#ffd700" stroke-width="2.5"/><path d="M55 42 L38 42 M42 42 L42 47 M46 42 L46 46" stroke="#ffd700" stroke-width="2.5" stroke-linecap="round"/></svg>`;
    default:
      return '';
  }
}

function renderUnmaskedThiefSvg() {
  return `<svg viewBox="0 0 220 220" class="unmasked-thief-svg">
    <defs>
      <radialGradient id="thiefGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#3d2a1c" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#140f0b" stop-opacity="1"/>
      </radialGradient>
      <linearGradient id="goldRim" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ffd700"/>
        <stop offset="50%" stop-color="#c9a45c"/>
        <stop offset="100%" stop-color="#8a6828"/>
      </linearGradient>
    </defs>
    <rect width="220" height="220" fill="url(#thiefGlow)" rx="8"/>
    <rect x="6" y="6" width="208" height="208" fill="none" stroke="url(#goldRim)" stroke-width="2" rx="6"/>
    <!-- Coat and Shoulders -->
    <path d="M40 215 C45 155, 75 145, 110 145 C145 145, 175 155, 180 215 Z" fill="#181c24" stroke="#c9a45c" stroke-width="1.5"/>
    <path d="M80 150 L110 215 L140 150 L125 145 L110 170 L95 145 Z" fill="#2a1616" stroke="#8a2020" stroke-width="1"/>
    <!-- Crimson Cravat & Pearl Pin -->
    <path d="M102 145 L118 145 L122 175 L110 190 L98 175 Z" fill="#801818"/>
    <circle cx="110" cy="158" r="3" fill="#fff" stroke="#ffd700" stroke-width="1"/>
    <path d="M140 185 Q155 195 165 215" fill="none" stroke="#ffd700" stroke-width="2"/>
    <!-- Head and Face -->
    <ellipse cx="110" cy="100" rx="36" ry="44" fill="#dfc6a6" stroke="#4a3525" stroke-width="1.5"/>
    <!-- Slicked Victorian Hair -->
    <path d="M72 90 C70 55, 100 50, 110 50 C120 50, 150 55, 148 90 C140 68, 120 62, 110 65 C100 62, 80 68, 72 90 Z" fill="#1b1714"/>
    <!-- Features: Eyes, Monocle, Mustache -->
    <ellipse cx="96" cy="98" rx="5" ry="3.5" fill="#fff"/>
    <circle cx="96" cy="98" r="2.2" fill="#324a5f"/>
    <!-- Monocle on right eye -->
    <ellipse cx="124" cy="98" rx="8" ry="8" fill="rgba(240, 248, 255, 0.4)" stroke="#ffd700" stroke-width="2"/>
    <ellipse cx="124" cy="98" rx="5" ry="3.5" fill="#fff"/>
    <circle cx="124" cy="98" r="2.2" fill="#324a5f"/>
    <path d="M132 101 Q148 115 155 150" fill="none" stroke="#ffd700" stroke-width="1.2"/>
    <!-- Sharp nose and debonair mustache -->
    <path d="M110 94 L107 108 L113 108" fill="none" stroke="#684a32" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M96 117 Q110 114 124 117 Q130 114 135 110 Q124 124 110 120 Q96 124 85 110 Q90 114 96 117 Z" fill="#1b1714"/>
    <!-- Top Hat -->
    <path d="M60 62 C70 58, 150 58, 160 62 C150 65, 70 65, 60 62 Z" fill="#0d0f14" stroke="#c9a45c" stroke-width="1.5"/>
    <path d="M74 61 L77 15 C85 13, 135 13, 143 15 L146 61 Z" fill="#151820" stroke="#c9a45c" stroke-width="1.5"/>
    <rect x="74" y="52" width="72" height="9" fill="#7a1818" stroke="#a32020" stroke-width="1"/>
    <!-- Seal banner -->
    <rect x="30" y="198" width="160" height="18" fill="rgba(14, 22, 32, 0.95)" stroke="#ffd700" stroke-width="1" rx="3"/>
    <text x="110" y="211" font-family="Cinzel, Georgia, serif" font-size="9" font-weight="700" fill="#ffd700" text-anchor="middle" letter-spacing="1.5">EDWARD BLACKTHORN</text>
  </svg>`;
}

function isClueAlreadyCollected(challenge) {
  if (!view || !view.room) return false;
  const id = challenge.stationId || challenge.station;
  const pieceInfo = PORTRAIT_PIECES[id];
  if (pieceInfo && view.room.portrait?.collectedPieces?.includes(pieceInfo.id)) return true;
  if (view.room.clues?.some((c) => c.id === id)) return true;
  if (!view.room.missions) return false;
  const m = view.room.missions;
  if (challenge.station === 'cipher' || challenge.stationId === 'cipher') return Boolean(m.cipher?.done);
  if (challenge.clueType === 'letter') {
    if (m.letter?.done) return true;
    if (challenge.stationId === 'letter-ink' && m.letter?.parts?.ink) return true;
    if (challenge.stationId === 'letter-seal' && m.letter?.parts?.seal) return true;
  }
  if (challenge.clueType === 'seal' && (m.letter?.done || m.letter?.parts?.seal)) return true;
  if (challenge.clueType === 'telegraph' && (m.telegraph?.done || m.telegraph?.parts?.sender)) return true;
  if (challenge.clueType === 'relay' && (m.telegraph?.done || m.telegraph?.parts?.receiver)) return true;
  return false;
}

let selectedOptionId = null;
let currentChallengeAction = null;
let currentChallengePayloadGetter = null;

function setupEvidenceMagnifier() {
  const stage = $('evidence-stage');
  const mag = $('evidence-magnifier');
  if (!stage || !mag || stage.dataset.hasListener) return;
  stage.dataset.hasListener = 'true';
  stage.addEventListener('pointermove', (event) => {
    const rect = stage.getBoundingClientRect();
    const x = Math.max(30, Math.min(rect.width - 30, event.clientX - rect.left));
    const y = Math.max(30, Math.min(rect.height - 30, event.clientY - rect.top));
    mag.style.transform = `translate(${x - 40}px, ${y - 40}px)`;
  });
}

function openEvidencePuzzle(challenge) {
  keys.clear();
  selectedOptionId = null;
  challenge.failures = 0;
  try { playClueInspectSound(); } catch {}

  const stationId = challenge.stationId || challenge.station;
  const pieceInfo = PORTRAIT_PIECES[stationId];
  const miniGameType = pieceInfo?.gameType;

  $('puzzle-kicker').textContent = challenge.kicker || (pieceInfo ? `PORTRAIT FRAGMENT #${pieceInfo.id} · FORENSIC MINI-GAME` : 'CLUE DISCOVERED · FIELD EXAMINATION');
  $('puzzle-title').textContent = challenge.title;
  $('puzzle-evidence').textContent = challenge.evidence;
  $('puzzle-feedback').textContent = '';
  $('puzzle-feedback').className = 'puzzle-feedback';

  // Render SVG illustration into stage
  const illusContainer = $('evidence-illustration');
  if (illusContainer) {
    illusContainer.innerHTML = renderEvidenceIllustration(challenge.clueType);
  }

  // Setup interactive magnifying glass
  setupEvidenceMagnifier();
  const mag = $('evidence-magnifier');
  if (mag) mag.style.transform = 'translate(130px, 35px)';

  // Populate Forensic Observations Box
  const obsContainer = $('puzzle-observations');
  if (obsContainer) {
    obsContainer.replaceChildren();
    const obsList = pieceInfo ? [
      { tag: 'OBJECTIVE', value: `RECOVER THIEF'S PORTRAIT PIECE #${pieceInfo.id}` },
      { tag: 'CHALLENGE', value: miniGameType === 'find-objects' ? 'Find 3 Hidden Investigation Tools' : (miniGameType === 'match-symbols' ? 'Match 3 Ancient Cipher Symbol Pairs' : 'Align 3 Rotating Brass Cylinders') },
      { tag: 'REWARD', value: 'Assembles Shared Team Picture at Headquarters' },
    ] : (challenge.observations || [
      { tag: 'EXHIBIT', value: challenge.title },
      { tag: 'FORENSIC FINDING', value: 'Discovered in London District' },
      { tag: 'SIGNIFICANCE', value: 'Relevant to current active lead' },
    ]);
    for (const item of obsList) {
      const el = document.createElement('div');
      el.className = 'obs-item';
      el.innerHTML = `<span class="obs-tag">${item.tag}</span><strong class="obs-val">${item.value}</strong>`;
      obsContainer.append(el);
    }
  }

  const stamp = $('puzzle-stamp');
  if (stamp) {
    stamp.classList.add('hidden');
    stamp.classList.remove('is-stamped');
  }

  const submitBtn = $('puzzle-submit');
  const submitText = $('puzzle-submit-text');
  const options = $('puzzle-options');
  const question = $('puzzle-question');
  options.replaceChildren();

  // Hide all mini-game containers by default
  $('minigame-find-objects')?.classList.add('hidden');
  $('minigame-match-symbols')?.classList.add('hidden');
  $('minigame-unlock-box')?.classList.add('hidden');

  // Check if already collected
  const alreadyCollected = isClueAlreadyCollected(challenge);
  if (alreadyCollected) {
    if (question) {
      question.classList.remove('hidden');
      question.textContent = 'This evidence has already been verified and filed on record:';
    }
    options.classList.add('hidden');
    if (stamp) {
      stamp.classList.remove('hidden');
      stamp.classList.add('is-stamped');
      const stampWord = stamp.querySelector('.stamp-word');
      const stampSub = stamp.querySelector('.stamp-sub');
      if (stampWord) stampWord.textContent = 'VERIFIED';
      if (stampSub) stampSub.textContent = pieceInfo ? `PIECE #${pieceInfo.id} IN TEAM PORTRAIT` : 'RECORDED IN CASEBOOK';
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.onclick = () => {
        closeEvidencePuzzle();
        if (pieceInfo) openInvestigationBoardModal();
        else setCasebookOpen(true);
      };
    }
    if (submitText) submitText.textContent = pieceInfo ? 'View Investigation Board' : 'Open Watson’s Casebook';
    $('puzzle-feedback').textContent = pieceInfo ? `Piece #${pieceInfo.id} is safely secured in your team’s portrait collection.` : 'This clue is already safely recorded in your team’s shared casebook.';
    $('evidence-puzzle').classList.remove('hidden');
    return;
  }

  // --- BRANCH TO ONE OF THE 3 STANDARDIZED MINI-GAMES ---
  if (miniGameType === 'find-objects') {
    if (question) question.classList.add('hidden');
    if (options) options.classList.add('hidden');
    if (submitText) submitText.textContent = `Secure Portrait Piece #${pieceInfo.id}`;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.onclick = () => handleMiniGameSuccess(stationId);
    }
    initFindObjectsMiniGame(challenge, pieceInfo);
    $('evidence-puzzle').classList.remove('hidden');
    return;
  }

  if (miniGameType === 'match-symbols') {
    if (question) question.classList.add('hidden');
    if (options) options.classList.add('hidden');
    if (submitText) submitText.textContent = `Secure Portrait Piece #${pieceInfo.id}`;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.onclick = () => handleMiniGameSuccess(stationId);
    }
    initMatchSymbolsMiniGame(challenge, pieceInfo);
    $('evidence-puzzle').classList.remove('hidden');
    return;
  }

  if (miniGameType === 'unlock-box') {
    if (question) question.classList.add('hidden');
    if (options) options.classList.add('hidden');
    if (submitText) submitText.textContent = `Secure Portrait Piece #${pieceInfo.id}`;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.onclick = () => handleMiniGameSuccess(stationId);
    }
    initUnlockBoxMiniGame(challenge, pieceInfo);
    $('evidence-puzzle').classList.remove('hidden');
    return;
  }

  // Fallback: Legacy puzzles / deduction options
  if (question) {
    question.classList.remove('hidden');
    question.textContent = challenge.question || 'Examine the exhibit and deduce the truth:';
  }
  if (options) options.classList.remove('hidden');

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

    currentChallengeAction = 'puzzle';
    currentChallengePayloadGetter = () => ({ station: challenge.station, solution: wheels.map((w) => Number(w.dataset.value)) });
    if (submitText) submitText.textContent = 'Set Timetable & Add to Casebook';
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.onclick = () => handleEvidenceCollection(challenge, currentChallengeAction, currentChallengePayloadGetter());
    }
  } else if (challenge.puzzle === 'telegraph') {
    const pulses = ['short', 'short', 'short', 'short'];
    const buttons = pulses.map((_, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pulse-toggle';
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

    currentChallengeAction = 'puzzle';
    currentChallengePayloadGetter = () => ({ station: challenge.station, solution: buttons.map((b) => b.dataset.pulse) });
    if (submitText) submitText.textContent = 'Transmit & Add to Casebook';
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.onclick = () => handleEvidenceCollection(challenge, currentChallengeAction, currentChallengePayloadGetter());
    }
  } else {
    // Multiple choice deduction options
    currentChallengeAction = 'interact';
    currentChallengePayloadGetter = () => ({ answer: selectedOptionId });
    if (submitText) submitText.textContent = 'Add to Casebook';
    if (submitBtn) {
      submitBtn.disabled = true; // disabled until an option is selected
      submitBtn.onclick = () => {
        if (!selectedOptionId) return;
        handleEvidenceCollection(challenge, currentChallengeAction, currentChallengePayloadGetter());
      };
    }

    challenge.options?.forEach((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'puzzle-option';
      button.dataset.optionId = option.id;

      const label = document.createElement('strong');
      label.textContent = option.label;
      const note = document.createElement('small');
      note.textContent = option.note;
      button.append(label, note);

      button.addEventListener('click', () => {
        selectedOptionId = option.id;
        options.querySelectorAll('.puzzle-option').forEach((opt) => opt.classList.toggle('is-selected', opt === button));
        if (submitBtn) submitBtn.disabled = false;
      });

      // Double-click/double-tap submits immediately
      button.addEventListener('dblclick', () => {
        selectedOptionId = option.id;
        handleEvidenceCollection(challenge, currentChallengeAction, currentChallengePayloadGetter());
      });

      options.append(button);
    });
  }

  $('evidence-puzzle').classList.remove('hidden');
  options.querySelector('button')?.focus();
}

// ==========================================
// MINI-GAME A: FIND OBJECTS (Reference Image 1)
// ==========================================
function initFindObjectsMiniGame(challenge, pieceInfo) {
  const container = $('minigame-find-objects');
  if (!container) return;
  container.classList.remove('hidden');

  const targetsRow = $('find-targets-row');
  const stage = $('find-scene-stage');
  if (!targetsRow || !stage) return;

  targetsRow.replaceChildren();
  stage.replaceChildren();

  const isYard = challenge.stationId === 'clue-footprints-yard';
  const items = isYard ? [
    { id: 'violin', label: 'Violin', icon: '🎻', x: 20, y: 36 },
    { id: 'watch', label: 'Pocket Watch', icon: '⏱️', x: 74, y: 64 },
    { id: 'glass', label: 'Magnifier Lens', icon: '🔍', x: 50, y: 24 },
  ] : [
    { id: 'key', label: 'Skeleton Key', icon: '🗝️', x: 26, y: 58 },
    { id: 'seal', label: 'Sealed Letter', icon: '📜', x: 72, y: 30 },
    { id: 'boot', label: 'Riding Boot', icon: '👢', x: 48, y: 72 },
  ];

  let foundCount = 0;
  const foundSet = new Set();

  items.forEach((item) => {
    // Top target indicator
    const badge = document.createElement('div');
    badge.className = 'find-target-badge';
    badge.id = `find-badge-${item.id}`;
    badge.innerHTML = `<span class="badge-icon">${item.icon}</span><span class="badge-name">${item.label}</span><span class="badge-status">Search...</span>`;
    targetsRow.append(badge);

    // Clickable item in scene
    const itemEl = document.createElement('button');
    itemEl.type = 'button';
    itemEl.className = 'find-scene-item';
    itemEl.id = `find-item-${item.id}`;
    itemEl.style.left = `${item.x}%`;
    itemEl.style.top = `${item.y}%`;
    itemEl.setAttribute('aria-label', `Find ${item.label}`);
    itemEl.innerHTML = `
      <div class="find-item-halo" aria-hidden="true"></div>
      <span class="find-item-icon">${item.icon}</span>
      <span class="find-item-sparkle" aria-hidden="true">✨</span>
    `;

    itemEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (foundSet.has(item.id)) return;
      foundSet.add(item.id);
      foundCount++;
      itemEl.classList.add('is-found');
      badge.classList.add('is-found');
      const statusEl = badge.querySelector('.badge-status');
      if (statusEl) statusEl.textContent = '✓ FOUND';
      try { playClueInspectSound(); } catch {}

      if (foundCount >= items.length) {
        $('puzzle-feedback').className = 'puzzle-feedback puzzle-feedback--success';
        $('puzzle-feedback').textContent = `All 3 hidden items discovered! Securing Piece #${pieceInfo.id}...`;
        const submitBtn = $('puzzle-submit');
        if (submitBtn) submitBtn.disabled = true;
        setTimeout(() => handleMiniGameSuccess(challenge.stationId), 600);
      }
    });

    stage.append(itemEl);
  });
}

// ==========================================
// MINI-GAME B: MATCH SYMBOLS (Reference Image 2)
// ==========================================
function initMatchSymbolsMiniGame(challenge, pieceInfo) {
  const container = $('minigame-match-symbols');
  if (!container) return;
  container.classList.remove('hidden');

  const grid = $('match-tiles-grid');
  if (!grid) return;
  grid.replaceChildren();

  const isFabric = challenge.stationId === 'clue-fabric-fence';
  const baseSymbols = isFabric ? [
    { id: 'sun', glyph: '☀️', label: 'Sun' },
    { id: 'moon', glyph: '🌙', label: 'Moon' },
    { id: 'scales', glyph: '⚖️', label: 'Scales' },
  ] : [
    { id: 'eye', glyph: '👁️', label: 'Eye' },
    { id: 'key', glyph: '🔑', label: 'Key' },
    { id: 'hourglass', glyph: '⏳', label: 'Hourglass' },
  ];

  const deck = [...baseSymbols, ...baseSymbols].map((s, idx) => ({ ...s, uid: `${s.id}-${idx}` }));
  deck.sort(() => Math.random() - 0.5);

  let flippedCards = [];
  let matchedPairs = 0;
  let lockBoard = false;

  deck.forEach((cardData) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'match-tile-card';
    card.dataset.symbol = cardData.id;
    card.setAttribute('aria-label', `Tile cipher symbol`);
    card.innerHTML = `
      <div class="match-tile-inner">
        <div class="match-tile-face match-tile-back">
          <span class="match-tile-seal">☩</span>
        </div>
        <div class="match-tile-face match-tile-front">
          <span class="match-tile-glyph">${cardData.glyph}</span>
          <span class="match-tile-name">${cardData.label}</span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      if (lockBoard || card.classList.contains('is-flipped') || card.classList.contains('is-matched')) return;
      card.classList.add('is-flipped');
      flippedCards.push(card);
      try { playClueInspectSound(); } catch {}

      if (flippedCards.length === 2) {
        const [c1, c2] = flippedCards;
        if (c1.dataset.symbol === c2.dataset.symbol) {
          c1.classList.add('is-matched');
          c2.classList.add('is-matched');
          matchedPairs++;
          flippedCards = [];
          try { playClueDiscoveredChime(); } catch {}

          if (matchedPairs >= 3) {
            $('puzzle-feedback').className = 'puzzle-feedback puzzle-feedback--success';
            $('puzzle-feedback').textContent = `All 3 ancient symbol pairs matched! Securing Piece #${pieceInfo.id}...`;
            const submitBtn = $('puzzle-submit');
            if (submitBtn) submitBtn.disabled = true;
            setTimeout(() => handleMiniGameSuccess(challenge.stationId), 600);
          }
        } else {
          lockBoard = true;
          setTimeout(() => {
            c1.classList.remove('is-flipped');
            c2.classList.remove('is-flipped');
            flippedCards = [];
            lockBoard = false;
          }, 650);
        }
      }
    });

    grid.append(card);
  });
}

// ==========================================
// MINI-GAME C: UNLOCK THE BOX (Reference Image 3)
// ==========================================
function initUnlockBoxMiniGame(challenge, pieceInfo) {
  const container = $('minigame-unlock-box');
  if (!container) return;
  container.classList.remove('hidden');

  const shackle = $('padlock-shackle');
  const chassis = $('padlock-chassis');
  const targetCodeEl = $('unlock-target-code');
  if (shackle) shackle.classList.remove('is-unlocked');
  if (chassis) chassis.classList.remove('is-open');

  const isPhoto = challenge.stationId === 'clue-photo-surveillance';
  const symbols = isPhoto
    ? ['♔', '🗝', '👁', '⚙', '⌛']
    : ['B', 'E', 'D', 'L', 'M'];

  const targetCode = isPhoto
    ? ['♔', '🗝', '👁']
    : ['B', 'E', 'D'];

  if (targetCodeEl) {
    targetCodeEl.textContent = `[ ${targetCode[0]} ] · [ ${targetCode[1]} ] · [ ${targetCode[2]} ]`;
  }

  // Scramble initial dial indices so none start matching
  const currentIndices = [
    (symbols.indexOf(targetCode[0]) + 2) % symbols.length,
    (symbols.indexOf(targetCode[1]) + 3) % symbols.length,
    (symbols.indexOf(targetCode[2]) + 1) % symbols.length,
  ];

  let unlocked = false;

  function updateDialDisplay(dialIdx) {
    const valEl = $(`dial-val-${dialIdx}`);
    if (valEl) {
      valEl.textContent = symbols[currentIndices[dialIdx]];
      valEl.classList.remove('is-cycling');
      void valEl.offsetWidth;
      valEl.classList.add('is-cycling');
    }
  }

  function checkCombination() {
    if (unlocked) return;
    const isMatch = targetCode.every((targetVal, idx) => symbols[currentIndices[idx]] === targetVal);
    if (isMatch) {
      unlocked = true;
      if (shackle) shackle.classList.add('is-unlocked');
      if (chassis) chassis.classList.add('is-open');
      try { playStampSlamSound(); } catch {}
      $('puzzle-feedback').className = 'puzzle-feedback puzzle-feedback--success';
      $('puzzle-feedback').textContent = `Brass cylinders aligned! Vault padlock popped open! Securing Piece #${pieceInfo.id}...`;
      const submitBtn = $('puzzle-submit');
      if (submitBtn) submitBtn.disabled = true;
      setTimeout(() => handleMiniGameSuccess(challenge.stationId), 700);
    }
  }

  [0, 1, 2].forEach((dialIdx) => {
    updateDialDisplay(dialIdx);

    const upBtn = container.querySelector(`.dial-btn--up[data-dial="${dialIdx}"]`);
    const downBtn = container.querySelector(`.dial-btn--down[data-dial="${dialIdx}"]`);

    if (upBtn) {
      upBtn.onclick = (e) => {
        e.stopPropagation();
        if (unlocked) return;
        currentIndices[dialIdx] = (currentIndices[dialIdx] - 1 + symbols.length) % symbols.length;
        updateDialDisplay(dialIdx);
        try { playTurnSound(); } catch {}
        checkCombination();
      };
    }

    if (downBtn) {
      downBtn.onclick = (e) => {
        e.stopPropagation();
        if (unlocked) return;
        currentIndices[dialIdx] = (currentIndices[dialIdx] + 1) % symbols.length;
        updateDialDisplay(dialIdx);
        try { playTurnSound(); } catch {}
        checkCombination();
      };
    }
  });
}

// ==========================================
// HANDLE MINI-GAME SUCCESS & PIECE COLLECTION
// ==========================================
async function handleMiniGameSuccess(stationId) {
  const submitBtn = $('puzzle-submit');
  const submitText = $('puzzle-submit-text');
  const feedback = $('puzzle-feedback');
  if (submitBtn) submitBtn.disabled = true;
  if (feedback) {
    feedback.className = 'puzzle-feedback puzzle-feedback--success';
    feedback.textContent = 'Puzzle solved! Securing portrait piece for the team...';
  }

  const pieceInfo = PORTRAIT_PIECES[stationId];
  const res = await act('solve-mini-game', { stationId });
  if (res?.ok) {
    try { playClueDiscoveredChime(); } catch {}
    try { playStampSlamSound(); } catch {}
    if (view && view.me) {
      world?.playDiscoveryEffect?.(view.me.x, view.me.y);
    }
    const stamp = $('puzzle-stamp');
    if (stamp) {
      stamp.classList.remove('hidden');
      stamp.classList.add('is-stamped');
      const stampWord = stamp.querySelector('.stamp-word');
      const stampSub = stamp.querySelector('.stamp-sub');
      if (stampWord) stampWord.textContent = 'SECURED';
      if (stampSub) stampSub.textContent = `PIECE #${pieceInfo?.id || res.pieceId || ''} RECOVERED`;
    }
    if (feedback) {
      feedback.textContent = `✓ ${res.message || 'Portrait piece secured for the team!'}`;
    }
    if (submitText) submitText.textContent = '✓ Piece Secured';

    updatePortraitHud(view?.room);

    setTimeout(() => {
      closeEvidencePuzzle();
      showMapToast(`Portrait Piece #${pieceInfo?.id || res.pieceId || ''} secured! (${view?.room?.portrait?.collectedPieces?.length || 0}/6)`);
      if (view?.room?.portrait?.allCollected) {
        showMapToast('✦ All 6 portrait pieces collected! Assemble the portrait at Headquarters!');
        if (world && points.reunion) world.setBeaconTarget(points.reunion.x, points.reunion.y);
      }
    }, 950);
  } else {
    if (submitBtn) submitBtn.disabled = false;
    if (feedback) {
      feedback.className = 'puzzle-feedback puzzle-feedback--error';
      feedback.textContent = res?.message || 'Could not secure piece.';
    }
  }
}

// ==========================================
// CENTRAL INVESTIGATION BOARD (Headquarters)
// ==========================================
function openInvestigationBoardModal() {
  const modal = $('investigation-board-modal');
  if (!modal) return;
  keys.clear();

  const room = view?.room;
  const portrait = room?.portrait || { totalPieces: 6, collectedPieces: [], allCollected: false, assembled: false };
  const collected = portrait.collectedPieces || [];
  const count = collected.length;

  const countEl = $('board-progress-count');
  if (countEl) countEl.textContent = `${count} / 6`;

  const fillEl = $('board-progress-fill');
  if (fillEl) fillEl.style.width = `${Math.round((count / 6) * 100)}%`;

  const slotNames = [
    'Ulster Cap & Brow',
    'Phantom Mask & Eyes',
    'High Velvet Collar',
    'Gold Pocket Watch',
    'Crimson Silk Cravat',
    'Gloved Hand & Vault Key',
  ];

  for (let i = 1; i <= 6; i++) {
    const slot = modal.querySelector(`.portrait-piece-slot[data-slot="${i}"]`);
    if (slot) {
      const isCollected = collected.includes(i);
      slot.classList.toggle('is-slotted', isCollected);
      slot.classList.toggle('is-filled', isCollected);
      slot.classList.toggle('is-missing', !isCollected);
      if (isCollected) {
        slot.innerHTML = `
          <div class="slot-inner slot-inner--collected">
            <span class="slot-badge">✓ PIECE #${i}</span>
            <div class="slot-art">${renderPortraitPieceSvg(i)}</div>
            <span class="slot-name">${slotNames[i - 1]}</span>
          </div>`;
      } else {
        slot.innerHTML = `
          <div class="slot-inner slot-inner--empty">
            <span class="slot-number">SLOT #${i}</span>
            <span class="slot-missing-icon">?</span>
            <span class="slot-name">${slotNames[i - 1]}</span>
          </div>`;
      }
    }
  }

  const assembleBtn = $('board-assemble-btn');
  const statusMsg = $('board-status-msg');
  const revealedArt = $('board-revealed-portrait');

  if (portrait.assembled) {
    if (revealedArt) {
      revealedArt.innerHTML = renderUnmaskedThiefSvg();
      revealedArt.classList.remove('hidden');
    }
    if (statusMsg) statusMsg.textContent = 'CASE SOLVED! The Phantom Thief Edward Blackthorn has been unmasked.';
    if (assembleBtn) {
      assembleBtn.disabled = true;
      assembleBtn.textContent = '✓ Case Solved';
    }
  } else if (count >= 6 || portrait.allCollected) {
    if (revealedArt) revealedArt.classList.add('hidden');
    if (statusMsg) statusMsg.textContent = '✦ All 6 portrait pieces recovered! Assemble the portrait now to identify the thief!';
    if (assembleBtn) {
      assembleBtn.disabled = false;
      assembleBtn.textContent = '✨ ASSEMBLE PORTRAIT';
      assembleBtn.onclick = async () => {
        assembleBtn.disabled = true;
        assembleBtn.textContent = 'Assembling Portrait...';
        const res = await act('assemble-portrait');
        if (res?.ok) {
          modal.querySelectorAll('.portrait-piece-slot').forEach((s) => s.classList.add('is-assembling'));
          setTimeout(() => {
            if (revealedArt) {
              revealedArt.innerHTML = renderUnmaskedThiefSvg();
              revealedArt.classList.remove('hidden');
            }
            try { playOutcomeChime(true); } catch {}
            showMapToast('✦ CASE SOLVED! The Phantom Thief Edward Blackthorn has been unmasked!');
          }, 400);
          setTimeout(() => {
            modal.classList.add('hidden');
          }, 2000);
        } else {
          assembleBtn.disabled = false;
          assembleBtn.textContent = '✨ ASSEMBLE PORTRAIT';
          if (statusMsg) statusMsg.textContent = res?.message || 'Could not assemble portrait.';
        }
      };
    }
  } else {
    if (revealedArt) revealedArt.classList.add('hidden');
    if (statusMsg) statusMsg.textContent = `Explore London and complete mini-games to recover all 6 fragments (${6 - count} missing).`;
    if (assembleBtn) {
      assembleBtn.disabled = true;
      assembleBtn.textContent = 'Assemble Portrait (Requires 6/6)';
    }
  }

  modal.classList.remove('hidden');
}

function updatePortraitHud(room) {
  if (!room) return;
  const portrait = room.portrait || { totalPieces: 6, collectedPieces: [], allCollected: false };
  const collectedCount = portrait.collectedPieces?.length || 0;
  const hudCount = $('hud-portrait-count');
  if (hudCount) hudCount.textContent = `${collectedCount} / 6`;

  const hudEl = $('team-portrait-hud');
  if (hudEl) {
    hudEl.classList.toggle('is-complete', Boolean(portrait.allCollected || collectedCount >= 6));
  }

  for (let i = 1; i <= 6; i++) {
    const slot = document.querySelector(`.hud-slot[data-slot="${i}"]`);
    if (slot) {
      slot.classList.toggle('is-collected', portrait.collectedPieces?.includes(i));
    }
  }
}

async function handleEvidenceCollection(challenge, action, payload) {
  const submitBtn = $('puzzle-submit');
  const submitText = $('puzzle-submit-text');
  const feedback = $('puzzle-feedback');
  if (submitBtn) submitBtn.disabled = true;
  if (feedback) {
    feedback.className = 'puzzle-feedback';
    feedback.textContent = 'Examining exhibit…';
  }

  const correct = await submitPuzzleAnswer(challenge, action, payload);
  if (correct) {
    try { playClueDiscoveredChime(); } catch {}
    try { playStampSlamSound(); } catch {}
    if (view && view.me) {
      world?.playDiscoveryEffect?.(view.me.x, view.me.y);
    }
    const stamp = $('puzzle-stamp');
    if (stamp) {
      stamp.classList.remove('hidden');
      stamp.classList.add('is-stamped');
      const stampWord = stamp.querySelector('.stamp-word');
      const stampSub = stamp.querySelector('.stamp-sub');
      if (stampWord) stampWord.textContent = 'COLLECTED';
      if (stampSub) stampSub.textContent = 'RECORDED IN CASEBOOK';
    }
    if (feedback) {
      feedback.className = 'puzzle-feedback puzzle-feedback--success';
      feedback.textContent = '✓ Evidence verified and filed in Watson’s Casebook!';
    }
    if (submitText) submitText.textContent = '✓ Added to Casebook';

    setTimeout(() => {
      closeEvidencePuzzle();
      showMapToast('New evidence recorded in Watson’s Casebook.');
    }, 950);
  } else {
    if (submitBtn) submitBtn.disabled = false;
    if (feedback) feedback.className = 'puzzle-feedback puzzle-feedback--error';
  }
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

// --- MANSION & 3D PUZZLE CONTROLLERS (PANELS 3, 5, 6, 9) ---

let currentClockHour = 12;

function openClockPuzzle() {
  currentClockHour = view?.room?.mansion?.clockHour || 12;
  updateClockDisplay();
  $('clock-puzzle-modal')?.classList.remove('hidden');
  const fb = $('clock-feedback');
  if (fb) fb.textContent = '';
}

function closeClockPuzzle() {
  $('clock-puzzle-modal')?.classList.add('hidden');
}

function setClockHour(hour) {
  let h = Number(hour) || 12;
  if (h > 12) h = 1;
  if (h < 1) h = 12;
  currentClockHour = h;
  updateClockDisplay();
}

function updateClockDisplay() {
  const romans = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  const roman = romans[currentClockHour % 12];
  const hourText = $('clock-hour-text');
  if (hourText) hourText.textContent = `${roman} (${currentClockHour}:00)`;
  const hourHand = $('clock-hand-hour');
  if (hourHand) {
    hourHand.style.transform = `rotate(${(currentClockHour / 12) * 360}deg)`;
  }
}

function toggleClockHint() {
  $('clock-hint-box')?.classList.toggle('hidden');
  if (typeof playGearClick === 'function') playGearClick();
}

async function submitClockPuzzle() {
  const submitBtn = $('clock-confirm');
  const fb = $('clock-feedback');
  if (submitBtn) submitBtn.disabled = true;
  if (fb) {
    fb.textContent = 'Engaging clock mechanism…';
    fb.className = 'puzzle-feedback';
  }
  try {
    const res = await act('clock', { hour: currentClockHour });
    if (res?.solved || currentClockHour === 4) {
      playOutcomeChime?.(true);
      if (typeof playLockOpenSound === 'function') playLockOpenSound();
      if (fb) {
        fb.textContent = res?.message || '✓ The clock chimes 4 bells! The antique pocket watch drops into your hand.';
        fb.className = 'puzzle-feedback puzzle-feedback--success';
      }
      setTimeout(() => {
        closeClockPuzzle();
        showToast('Evidence secured: Antique Pocket Watch added to Casebook!');
      }, 1400);
    } else {
      playOutcomeChime?.(false);
      if (typeof playMistakeSound === 'function') playMistakeSound();
      if (fb) {
        fb.textContent = res?.message || 'The pendulum swings, but the lock remains engaged. Re-read the riddle.';
        fb.className = 'puzzle-feedback puzzle-feedback--error';
      }
    }
  } catch (err) {
    if (fb) {
      fb.textContent = err.message || 'Clock mechanism jammed.';
      fb.className = 'puzzle-feedback puzzle-feedback--error';
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function resetClockPuzzle() {
  setClockHour(12);
  const fb = $('clock-feedback');
  if (fb) {
    fb.textContent = 'Hands reset to midnight.';
    fb.className = 'puzzle-feedback';
  }
  if (typeof playGearClick === 'function') playGearClick();
}

let selectedLibraryBooks = [];

function toggleLibraryHint() {
  $('library-hint-box')?.classList.toggle('hidden');
  if (typeof playGearClick === 'function') playGearClick();
}

function openLibraryPuzzle() {
  selectedLibraryBooks = [...(view?.room?.mansion?.selectedBooks || [])];
  updateLibraryDisplay();
  $('library-hint-box')?.classList.add('hidden');
  $('library-puzzle-modal')?.classList.remove('hidden');
  const fb = $('library-feedback');
  if (fb) {
    fb.textContent = '';
    fb.className = 'puzzle-feedback';
  }
}

function closeLibraryPuzzle() {
  $('library-puzzle-modal')?.classList.add('hidden');
}

function updateLibraryDisplay() {
  const romans = ['I', 'II', 'III', 'IV', 'V'];
  document.querySelectorAll('.library-book-btn').forEach((btn) => {
    const bookNum = Number(btn.dataset.book);
    btn.classList.toggle('is-selected', selectedLibraryBooks.includes(bookNum));
  });
  const seqText = $('library-sequence-text');
  if (seqText) {
    seqText.textContent = selectedLibraryBooks.length
      ? selectedLibraryBooks.map((b) => romans[b - 1]).join(' → ')
      : '—';
  }
}

function toggleLibraryBook(bookNum) {
  const idx = selectedLibraryBooks.indexOf(bookNum);
  if (idx >= 0) {
    selectedLibraryBooks.splice(idx, 1);
  } else {
    if (selectedLibraryBooks.length < 5) selectedLibraryBooks.push(bookNum);
  }
  updateLibraryDisplay();
  if (typeof playRatchetClick === 'function') playRatchetClick();
  else playKeypressFeedback();
}

async function submitLibraryPuzzle() {
  const submitBtn = $('library-submit');
  const fb = $('library-feedback');
  if (submitBtn) submitBtn.disabled = true;
  if (fb) {
    fb.textContent = 'Testing bookshelf latch…';
    fb.className = 'puzzle-feedback';
  }
  try {
    const res = await act('library', { books: selectedLibraryBooks });
    const isCorrect = res?.solved || (selectedLibraryBooks.length === 3 && selectedLibraryBooks[0] === 3 && selectedLibraryBooks[1] === 4 && selectedLibraryBooks[2] === 5);
    if (isCorrect) {
      playOutcomeChime?.(true);
      if (typeof playCaseVictorySound === 'function') playCaseVictorySound();
      if (fb) {
        fb.textContent = res?.message || '✓ The bookcase rumbles and slides aside! Secret crypt chamber unlocked.';
        fb.className = 'puzzle-feedback puzzle-feedback--success';
      }
      setTimeout(() => {
        closeLibraryPuzzle();
        showToast('Secret passage opened! Crypt Vault Key added to Casebook.');
      }, 1400);
    } else {
      playOutcomeChime?.(false);
      if (typeof playMistakeSound === 'function') playMistakeSound();
      if (fb) {
        fb.textContent = res?.message || 'The books snap back. That order does not release the hidden latch.';
        fb.className = 'puzzle-feedback puzzle-feedback--error';
      }
    }
  } catch (err) {
    if (fb) {
      fb.textContent = err.message || 'Mechanism error.';
      fb.className = 'puzzle-feedback puzzle-feedback--error';
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function resetLibraryPuzzle() {
  selectedLibraryBooks = [];
  updateLibraryDisplay();
  const fb = $('library-feedback');
  if (fb) {
    fb.textContent = 'Sequence reset.';
    fb.className = 'puzzle-feedback';
  }
  if (typeof playRatchetClick === 'function') playRatchetClick();
  else playKeypressFeedback();
}

function openThiefRevealedModal() {
  $('thief-revealed-modal')?.classList.remove('hidden');
}

function closeThiefRevealedModal() {
  $('thief-revealed-modal')?.classList.add('hidden');
}

async function addThiefToCasebook() {
  await act('portrait', { addToCasebook: true });
  playOutcomeChime?.(true);
  closeThiefRevealedModal();
  setCasebookOpen(true);
  setDeskTab('evidence');
}

// --- BASEMENT MECHANISM PUZZLE CONTROLLER (Panel 11 Art Reference) ---
const CRYPTEX_SYMBOLS = ['sun', 'moon', 'star', 'key', 'hourglass', 'eye'];
const CRYPTEX_ICONS = { sun: '☀', moon: '☽', star: '★', key: '🗝', hourglass: '⏳', eye: '👁' };
const CRYPTEX_NAMES = { sun: 'Sun', moon: 'Moon', star: 'Star', key: 'Key', hourglass: 'Hourglass', eye: 'Eye' };

let cryptexSymbols = ['sun', 'sun', 'sun', 'sun'];
let activeCryptexDial = 0;

function updateCryptexDisplay() {
  for (let i = 0; i < 4; i++) {
    const sym = cryptexSymbols[i] || 'sun';
    const iconEl = $(`cryptex-icon-${i}`);
    const nameEl = $(`cryptex-name-${i}`);
    if (iconEl) iconEl.textContent = CRYPTEX_ICONS[sym] || '☀';
    if (nameEl) nameEl.textContent = CRYPTEX_NAMES[sym] || 'Sun';
  }
  document.querySelectorAll('.cryptex-dial-unit').forEach((unit, idx) => {
    unit.classList.toggle('is-active', idx === activeCryptexDial);
  });
}

function rotateCryptexDial(dialIdx, direction) {
  const currentSym = cryptexSymbols[dialIdx] || 'sun';
  const currIdx = CRYPTEX_SYMBOLS.indexOf(currentSym);
  const nextIdx = (currIdx + direction + CRYPTEX_SYMBOLS.length) % CRYPTEX_SYMBOLS.length;
  cryptexSymbols[dialIdx] = CRYPTEX_SYMBOLS[nextIdx];
  activeCryptexDial = dialIdx;
  updateCryptexDisplay();
  playKeypressFeedback();
  if (world?.setMansionState) {
    world.setMansionState({ basementSymbols: cryptexSymbols });
  }
}

function toggleBasementHint() {
  $('basement-hint-box')?.classList.toggle('hidden');
  if (typeof playGearClick === 'function') playGearClick();
}

function openBasementPuzzle() {
  const mansion = view?.room?.mansion || {};
  if (Array.isArray(mansion.basementSymbols) && mansion.basementSymbols.length === 4) {
    cryptexSymbols = [...mansion.basementSymbols];
  } else {
    cryptexSymbols = ['sun', 'sun', 'sun', 'sun'];
  }
  activeCryptexDial = 0;
  updateCryptexDisplay();
  $('basement-hint-box')?.classList.add('hidden');
  const feedback = $('basement-feedback');
  if (feedback) {
    feedback.textContent = mansion.basementSolved ? 'The cryptex has already unlocked the secret chamber!' : '';
    feedback.className = mansion.basementSolved ? 'puzzle-feedback puzzle-feedback--success' : 'puzzle-feedback';
  }
  $('basement-puzzle-modal')?.classList.remove('hidden');
}

function closeBasementPuzzle() {
  $('basement-puzzle-modal')?.classList.add('hidden');
}

async function submitBasementPuzzle() {
  const submitBtn = $('basement-submit');
  const feedback = $('basement-feedback');
  if (submitBtn) submitBtn.disabled = true;
  if (feedback) {
    feedback.textContent = 'Engaging locking mechanism…';
    feedback.className = 'puzzle-feedback';
  }

  try {
    const res = await act('basement', { symbols: cryptexSymbols });
    if (res?.solved || res === true) {
      if (feedback) {
        feedback.textContent = 'Success! Heavy tumblers align with a metallic clunk. The vault door unlocks!';
        feedback.className = 'puzzle-feedback puzzle-feedback--success';
      }
      playCaseVictorySound?.();
      setTimeout(() => {
        closeBasementPuzzle();
        showToast('Vault chamber unsealed! Proceed into the Secret Crypt.');
      }, 1400);
    } else {
      if (feedback) {
        feedback.textContent = res?.message || 'The cylinders click, but the locking bolt remains rigid. Recheck your clues.';
        feedback.className = 'puzzle-feedback puzzle-feedback--error';
      }
      playMistakeSound?.();
    }
  } catch (err) {
    if (feedback) {
      feedback.textContent = err.message || 'Mechanism error.';
      feedback.className = 'puzzle-feedback puzzle-feedback--error';
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function resetBasementPuzzle() {
  cryptexSymbols = ['sun', 'sun', 'sun', 'sun'];
  activeCryptexDial = 0;
  updateCryptexDisplay();
  const feedback = $('basement-feedback');
  if (feedback) {
    feedback.textContent = 'Cylinders reset to initial alignment.';
    feedback.className = 'puzzle-feedback';
  }
  playKeypressFeedback();
}

// --- MINI-GAME 1: VICTORIAN CONCENTRIC LOCK PICKING CONTROLLER ---
const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
let lockpickTumblers = [1, 1, 1];
let activeLockpickRing = 0;

function updateLockpickDisplay() {
  for (let i = 0; i < 3; i++) {
    const val = lockpickTumblers[i];
    const valEl = $(`ring-val-${i}`);
    if (valEl) valEl.textContent = ROMAN_NUMERALS[(val - 1) % 12];
    const ringEl = $(`tumbler-ring-${i}`);
    if (ringEl) {
      ringEl.style.transform = `rotate(${(val - 1) * 30}deg)`;
      ringEl.classList.toggle('is-selected', i === activeLockpickRing);
    }
  }
  document.querySelectorAll('.ring-select-btn').forEach((btn, idx) => {
    btn.classList.toggle('is-active', idx === activeLockpickRing);
  });
}

function rotateLockpickRing(dir) {
  const current = lockpickTumblers[activeLockpickRing];
  let next = current + dir;
  if (next < 1) next = 12;
  if (next > 12) next = 1;
  lockpickTumblers[activeLockpickRing] = next;
  updateLockpickDisplay();
  if (typeof playRatchetClick === 'function') playRatchetClick();
  else playKeypressFeedback();
}

function openLockpickModal() {
  lockpickTumblers = [1, 1, 1];
  activeLockpickRing = 0;
  $('lock-shackle')?.classList.remove('is-unlocked');
  $('lockpick-hint-box')?.classList.add('hidden');
  const fb = $('lockpick-feedback');
  if (fb) { fb.textContent = ''; fb.className = 'puzzle-feedback'; }
  updateLockpickDisplay();
  $('lockpick-modal')?.classList.remove('hidden');
}

function closeLockpickModal() {
  $('lockpick-modal')?.classList.add('hidden');
}

function toggleLockpickHint() {
  $('lockpick-hint-box')?.classList.toggle('hidden');
  if (typeof playGearClick === 'function') playGearClick();
}

function resetLockpick() {
  lockpickTumblers = [1, 1, 1];
  activeLockpickRing = 0;
  $('lock-shackle')?.classList.remove('is-unlocked');
  updateLockpickDisplay();
  const fb = $('lockpick-feedback');
  if (fb) {
    fb.textContent = 'Tumblers reset to initial positions.';
    fb.className = 'puzzle-feedback';
  }
  if (typeof playRatchetClick === 'function') playRatchetClick();
  else playKeypressFeedback();
}

async function submitLockpick() {
  const submitBtn = $('lockpick-submit');
  const fb = $('lockpick-feedback');
  if (submitBtn) submitBtn.disabled = true;
  if (fb) {
    fb.textContent = 'Applying torque to the lock cylinder…';
    fb.className = 'puzzle-feedback';
  }
  try {
    const res = await act('lockpick', { tumblers: lockpickTumblers });
    if (res?.ok) {
      if (typeof playLockOpenSound === 'function') playLockOpenSound();
      $('lock-shackle')?.classList.add('is-unlocked');
      if (fb) {
        fb.textContent = res.message || 'Click! The wards release and the antique lock springs open!';
        fb.className = 'puzzle-feedback puzzle-feedback--success';
      }
      setTimeout(() => {
        closeLockpickModal();
        showToast('Evidence secured: Antique Gutter Skeleton Key added to Casebook!');
      }, 1400);
    } else {
      if (typeof playMistakeSound === 'function') playMistakeSound();
      if (fb) {
        fb.textContent = res?.message || 'The tumblers bind against the shear line. Keep turning.';
        fb.className = 'puzzle-feedback puzzle-feedback--error';
      }
    }
  } catch (err) {
    if (fb) {
      fb.textContent = err.message || 'Lockpick jammed.';
      fb.className = 'puzzle-feedback puzzle-feedback--error';
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// --- MINI-GAME 2: TORN DAGUERREOTYPE PHOTOGRAPH RECONSTRUCTION CONTROLLER ---
const PHOTO_PIECE_DEFS = [
  {
    id: 0,
    title: 'Fragment I: Gaslight & Smog',
    svg: `<svg class="photo-piece-svg" viewBox="0 0 154 88" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="lampGlow" cx="25%" cy="30%" r="50%">
          <stop offset="0%" stop-color="#ffeaa7" stop-opacity="0.9"/>
          <stop offset="60%" stop-color="#d4af37" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#141a24" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="skyGrad0" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#11161f"/>
          <stop offset="100%" stop-color="#1b2432"/>
        </linearGradient>
      </defs>
      <rect width="154" height="88" fill="url(#skyGrad0)"/>
      <circle cx="36" cy="28" r="32" fill="url(#lampGlow)"/>
      <path d="M 30,12 L 42,12 L 40,32 L 32,32 Z" fill="#2b2316" stroke="#d4af37" stroke-width="1"/>
      <polygon points="36,6 30,12 42,12" fill="#ffd700"/>
      <line x1="36" y1="32" x2="36" y2="88" stroke="#1c160e" stroke-width="3"/>
      <path d="M 85,88 L 85,45 L 98,45 L 98,88 Z" fill="#0d1117"/>
      <path d="M 120,88 L 120,55 L 140,55 L 140,88 Z" fill="#0b0e13"/>
      <text x="8" y="80" fill="#a89a80" font-size="9" font-family="monospace">FRAG. 1</text>
    </svg>`
  },
  {
    id: 1,
    title: 'Fragment II: Top Hat & Silhouette',
    svg: `<svg class="photo-piece-svg" viewBox="0 0 154 88" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="skyGrad1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0e131b"/>
          <stop offset="100%" stop-color="#18202c"/>
        </linearGradient>
      </defs>
      <rect width="154" height="88" fill="url(#skyGrad1)"/>
      <ellipse cx="77" cy="52" rx="42" ry="7" fill="#090c10" stroke="#ffd700" stroke-width="0.7"/>
      <path d="M 52,50 L 55,14 L 99,14 L 102,50 Z" fill="#06080b" stroke="#333" stroke-width="1"/>
      <rect x="53" y="44" width="48" height="5" fill="#4a3718"/>
      <path d="M 64,56 C 64,75 90,75 90,56 Z" fill="#0a0d12"/>
      <polygon points="60,82 77,88 94,82 88,72 66,72" fill="#141922" stroke="#d4af37" stroke-width="0.5"/>
      <text x="8" y="80" fill="#a89a80" font-size="9" font-family="monospace">FRAG. 2</text>
    </svg>`
  },
  {
    id: 2,
    title: 'Fragment III: Westminster Spire',
    svg: `<svg class="photo-piece-svg" viewBox="0 0 154 88" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="skyGrad2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#111620"/>
          <stop offset="100%" stop-color="#1c2534"/>
        </linearGradient>
      </defs>
      <rect width="154" height="88" fill="url(#skyGrad2)"/>
      <polygon points="68,8 60,40 76,40" fill="#090d13"/>
      <rect x="57" y="40" width="22" height="48" fill="#0e131b"/>
      <circle cx="68" cy="54" r="8" fill="#ffeaa7" stroke="#d4af37" stroke-width="1"/>
      <circle cx="68" cy="54" r="2" fill="#2b2316"/>
      <line x1="68" y1="54" x2="68" y2="49" stroke="#111" stroke-width="1"/>
      <line x1="68" y1="54" x2="72" y2="54" stroke="#111" stroke-width="1"/>
      <path d="M 0,70 Q 50,60 100,75 T 154,65" stroke="rgba(212,175,55,0.2)" stroke-width="4" fill="none"/>
      <text x="8" y="80" fill="#a89a80" font-size="9" font-family="monospace">FRAG. 3</text>
    </svg>`
  },
  {
    id: 3,
    title: 'Fragment IV: Cobblestones & Crates',
    svg: `<svg class="photo-piece-svg" viewBox="0 0 154 88" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="groundGrad3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1b2432"/>
          <stop offset="100%" stop-color="#0d1117"/>
        </linearGradient>
      </defs>
      <rect width="154" height="88" fill="url(#groundGrad3)"/>
      <rect x="15" y="24" width="60" height="46" fill="#261c10" stroke="#7c622d" stroke-width="1.5"/>
      <line x1="15" y1="24" x2="75" y2="70" stroke="#5a4520" stroke-width="1"/>
      <line x1="15" y1="70" x2="75" y2="24" stroke="#5a4520" stroke-width="1"/>
      <text x="20" y="44" fill="#d4af37" font-size="7" font-family="serif">LONDON DOCKS</text>
      <ellipse cx="95" cy="45" rx="10" ry="4" fill="#242d3c" stroke="#111" stroke-width="0.5"/>
      <ellipse cx="120" cy="48" rx="12" ry="5" fill="#2a3446" stroke="#111" stroke-width="0.5"/>
      <ellipse cx="105" cy="62" rx="14" ry="5" fill="#1e2532" stroke="#111" stroke-width="0.5"/>
      <ellipse cx="135" cy="66" rx="11" ry="4" fill="#252f40" stroke="#111" stroke-width="0.5"/>
      <text x="8" y="80" fill="#a89a80" font-size="9" font-family="monospace">FRAG. 4</text>
    </svg>`
  },
  {
    id: 4,
    title: 'Fragment V: Overcoat & Watch Chain',
    svg: `<svg class="photo-piece-svg" viewBox="0 0 154 88" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="coatGrad4" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#161c26"/>
          <stop offset="100%" stop-color="#0a0d13"/>
        </linearGradient>
      </defs>
      <rect width="154" height="88" fill="url(#coatGrad4)"/>
      <polygon points="25,0 77,40 60,88 20,88" fill="#10151e" stroke="#253042" stroke-width="1"/>
      <polygon points="129,0 77,40 94,88 134,88" fill="#121822" stroke="#253042" stroke-width="1"/>
      <rect x="68" y="35" width="18" height="53" fill="#1e1810" stroke="#7c622d" stroke-width="0.5"/>
      <circle cx="77" cy="46" r="2.5" fill="#ffd700"/>
      <circle cx="77" cy="60" r="2.5" fill="#ffd700"/>
      <circle cx="77" cy="74" r="2.5" fill="#ffd700"/>
      <path d="M 77,46 Q 95,64 105,55" stroke="#ffd700" stroke-width="1.8" fill="none" stroke-dasharray="2,1"/>
      <text x="8" y="80" fill="#a89a80" font-size="9" font-family="monospace">FRAG. 5</text>
    </svg>`
  },
  {
    id: 5,
    title: 'Fragment VI: Gloved Hand & Skeleton Key',
    svg: `<svg class="photo-piece-svg" viewBox="0 0 154 88" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fogGrad5" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#192230"/>
          <stop offset="100%" stop-color="#0c1017"/>
        </linearGradient>
      </defs>
      <rect width="154" height="88" fill="url(#fogGrad5)"/>
      <path d="M 40,25 C 50,15 75,20 72,45 L 68,65 C 60,70 45,65 42,50 Z" fill="#15120e" stroke="#4a3718" stroke-width="1.5"/>
      <ellipse cx="66" cy="38" rx="6" ry="4" fill="#201a14"/>
      <ellipse cx="68" cy="46" rx="6" ry="4" fill="#201a14"/>
      <ellipse cx="67" cy="54" rx="6" ry="4" fill="#201a14"/>
      <line x1="60" y1="46" x2="135" y2="46" stroke="#ffd700" stroke-width="3"/>
      <circle cx="56" cy="46" r="9" stroke="#ffd700" stroke-width="3" fill="none"/>
      <rect x="122" y="46" width="4" height="12" fill="#ffd700"/>
      <rect x="128" y="46" width="3" height="7" fill="#ffd700"/>
      <rect x="133" y="46" width="4" height="14" fill="#ffd700"/>
      <text x="8" y="80" fill="#a89a80" font-size="9" font-family="monospace">FRAG. 6</text>
    </svg>`
  }
];

let photoSlotAssignments = [null, null, null, null, null, null];
let selectedPhotoPieceId = null;

function renderPhotoBoardAndTray() {
  const tray = $('photo-pieces-tray');
  if (!tray) return;

  // Render slots on board
  for (let s = 0; s < 6; s++) {
    const slotEl = document.querySelector(`.photo-slot[data-slot="${s}"]`);
    if (!slotEl) continue;
    slotEl.innerHTML = '';
    const pieceId = photoSlotAssignments[s];
    if (pieceId !== null) {
      slotEl.classList.add('is-filled');
      const pieceDef = PHOTO_PIECE_DEFS[pieceId];
      const div = document.createElement('div');
      div.className = 'photo-piece';
      div.innerHTML = pieceDef.svg;
      div.title = `${pieceDef.title} (Click to remove)`;
      div.addEventListener('click', (e) => {
        e.stopPropagation();
        removePhotoPieceFromSlot(s);
      });
      slotEl.appendChild(div);
    } else {
      slotEl.classList.remove('is-filled');
      const numSpan = document.createElement('span');
      numSpan.className = 'slot-number';
      numSpan.textContent = String(s + 1);
      slotEl.appendChild(numSpan);
    }
  }

  // Render fragments remaining in tray
  tray.innerHTML = '';
  PHOTO_PIECE_DEFS.forEach((pieceDef) => {
    if (photoSlotAssignments.includes(pieceDef.id)) return;
    const div = document.createElement('div');
    div.className = 'photo-piece';
    if (selectedPhotoPieceId === pieceDef.id) div.classList.add('is-selected');
    div.dataset.pieceId = pieceDef.id;
    div.draggable = true;
    div.title = pieceDef.title;
    div.innerHTML = pieceDef.svg;

    div.addEventListener('click', () => {
      if (selectedPhotoPieceId === pieceDef.id) {
        selectedPhotoPieceId = null;
      } else {
        selectedPhotoPieceId = pieceDef.id;
        if (typeof playPhotoSlideSound === 'function') playPhotoSlideSound();
      }
      renderPhotoBoardAndTray();
    });

    div.addEventListener('dragstart', (e) => {
      selectedPhotoPieceId = pieceDef.id;
      e.dataTransfer.setData('text/plain', String(pieceDef.id));
      div.classList.add('is-dragging');
      if (typeof playPhotoSlideSound === 'function') playPhotoSlideSound();
    });

    div.addEventListener('dragend', () => {
      div.classList.remove('is-dragging');
    });

    tray.appendChild(div);
  });
}

function removePhotoPieceFromSlot(slotIndex) {
  if (photoSlotAssignments[slotIndex] !== null) {
    photoSlotAssignments[slotIndex] = null;
    if (typeof playPhotoSlideSound === 'function') playPhotoSlideSound();
    renderPhotoBoardAndTray();
  }
}

function placePhotoPieceInSlot(slotIndex) {
  if (selectedPhotoPieceId === null) return;
  photoSlotAssignments[slotIndex] = selectedPhotoPieceId;
  selectedPhotoPieceId = null;
  if (typeof playPieceSnapSound === 'function') playPieceSnapSound();
  renderPhotoBoardAndTray();
}

function openPhotoReconstructModal() {
  photoSlotAssignments = [null, null, null, null, null, null];
  selectedPhotoPieceId = null;
  $('photo-hint-box')?.classList.add('hidden');
  const fb = $('photo-feedback');
  if (fb) { fb.textContent = ''; fb.className = 'puzzle-feedback'; }
  renderPhotoBoardAndTray();
  $('photoreconstruct-modal')?.classList.remove('hidden');
}

function closePhotoReconstructModal() {
  $('photoreconstruct-modal')?.classList.add('hidden');
}

function togglePhotoHint() {
  $('photo-hint-box')?.classList.toggle('hidden');
  if (typeof playGearClick === 'function') playGearClick();
}

function resetPhotoReconstruct() {
  photoSlotAssignments = [null, null, null, null, null, null];
  selectedPhotoPieceId = null;
  renderPhotoBoardAndTray();
  const fb = $('photo-feedback');
  if (fb) {
    fb.textContent = 'Mounting plate cleared. Fragments returned to tray.';
    fb.className = 'puzzle-feedback';
  }
  if (typeof playPhotoSlideSound === 'function') playPhotoSlideSound();
}

async function submitPhotoReconstruct() {
  const submitBtn = $('photo-submit');
  const fb = $('photo-feedback');
  if (photoSlotAssignments.some((p) => p === null)) {
    if (fb) {
      fb.textContent = 'Please place all 6 torn photographic fragments onto the mounting plate first.';
      fb.className = 'puzzle-feedback puzzle-feedback--error';
    }
    if (typeof playMistakeSound === 'function') playMistakeSound();
    return;
  }
  if (submitBtn) submitBtn.disabled = true;
  if (fb) {
    fb.textContent = 'Developing daguerreotype plate under chemical bath…';
    fb.className = 'puzzle-feedback';
  }
  try {
    const res = await act('photo-reconstruct', { order: photoSlotAssignments });
    if (res?.ok) {
      if (typeof playPieceSnapSound === 'function') playPieceSnapSound();
      if (fb) {
        fb.textContent = res.message || 'Photograph assembled! The suspect silhouette matches Edward Blackthorn!';
        fb.className = 'puzzle-feedback puzzle-feedback--success';
      }
      setTimeout(() => {
        closePhotoReconstructModal();
        showToast('Evidence secured: Stolen Daguerreotype Plate added to Casebook!');
      }, 1400);
    } else {
      if (typeof playMistakeSound === 'function') playMistakeSound();
      if (fb) {
        fb.textContent = res?.message || 'The photographic fragments do not align cleanly. Re-examine the edges.';
        fb.className = 'puzzle-feedback puzzle-feedback--error';
      }
    }
  } catch (err) {
    if (fb) {
      fb.textContent = err.message || 'Assembly error.';
      fb.className = 'puzzle-feedback puzzle-feedback--error';
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// --- MINI-GAME 3: SECRET CODE CIPHER WHEEL CONTROLLER ---
const CIPHER_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CIPHER_ENCRYPTED = 'ISHJRAOVYU';
let cipherShift = 0;

function initCipherWheelDOM() {
  const outer = $('cipher-outer-ring');
  const inner = $('cipher-inner-wheel');
  if (!outer || !inner || outer.querySelector('.wheel-letter-outer')) return;

  for (let i = 0; i < 26; i++) {
    const angle = (i / 26) * 2 * Math.PI - Math.PI / 2;
    const x = 120 + 96 * Math.cos(angle);
    const y = 120 + 96 * Math.sin(angle);
    const span = document.createElement('span');
    span.className = 'wheel-letter-outer';
    span.textContent = CIPHER_ALPHABET[i];
    span.style.left = `${x - 7}px`;
    span.style.top = `${y - 7}px`;
    outer.appendChild(span);
  }

  for (let i = 0; i < 26; i++) {
    const angle = (i / 26) * 2 * Math.PI - Math.PI / 2;
    const x = 77 + 58 * Math.cos(angle);
    const y = 77 + 58 * Math.sin(angle);
    const span = document.createElement('span');
    span.className = 'wheel-letter-inner';
    span.textContent = CIPHER_ALPHABET[i];
    span.style.left = `${x - 6}px`;
    span.style.top = `${y - 6}px`;
    inner.appendChild(span);
  }
}

function updateCipherWheelDisplay() {
  initCipherWheelDOM();
  const inner = $('cipher-inner-wheel');
  if (inner) {
    const angle = (cipherShift / 26) * 360;
    inner.style.transform = `rotate(${angle}deg)`;
  }
  const shiftInd = $('wheel-shift-indicator');
  if (shiftInd) shiftInd.textContent = `SHIFT: +${cipherShift}`;
  const slider = $('cipher-shift-slider');
  if (slider) slider.value = cipherShift;

  let decrypted = '';
  for (let i = 0; i < CIPHER_ENCRYPTED.length; i++) {
    const ch = CIPHER_ENCRYPTED[i];
    const idx = CIPHER_ALPHABET.indexOf(ch);
    if (idx !== -1) {
      const decIdx = (idx - cipherShift + 26) % 26;
      decrypted += CIPHER_ALPHABET[decIdx];
    } else {
      decrypted += ch;
    }
  }
  const preview = $('cipher-decoded-preview');
  if (preview) {
    preview.textContent = decrypted;
    if (decrypted === 'BLACKTHORN') {
      preview.style.color = '#ffd700';
      preview.style.textShadow = '0 0 10px rgba(255, 215, 0, 0.8)';
    } else {
      preview.style.color = '#2ecc71';
      preview.style.textShadow = '0 0 8px rgba(46, 204, 113, 0.4)';
    }
  }
}

function rotateCipherWheel(delta) {
  cipherShift = (cipherShift + delta + 26) % 26;
  updateCipherWheelDisplay();
  if (typeof playGearClick === 'function') playGearClick();
  else playKeypressFeedback();
}

function openCipherWheelModal() {
  cipherShift = 0;
  $('cipher-hint-box')?.classList.add('hidden');
  const fb = $('cipher-feedback');
  if (fb) { fb.textContent = ''; fb.className = 'puzzle-feedback'; }
  updateCipherWheelDisplay();
  $('cipherwheel-modal')?.classList.remove('hidden');
}

function closeCipherWheelModal() {
  $('cipherwheel-modal')?.classList.add('hidden');
}

function toggleCipherHint() {
  $('cipher-hint-box')?.classList.toggle('hidden');
  if (typeof playGearClick === 'function') playGearClick();
}

function resetCipherWheel() {
  cipherShift = 0;
  updateCipherWheelDisplay();
  const fb = $('cipher-feedback');
  if (fb) {
    fb.textContent = 'Cipher disk aligned to initial shift (+0).';
    fb.className = 'puzzle-feedback';
  }
  if (typeof playGearClick === 'function') playGearClick();
  else playKeypressFeedback();
}

async function submitCipherWheel() {
  const submitBtn = $('cipher-submit');
  const fb = $('cipher-feedback');
  if (submitBtn) submitBtn.disabled = true;
  if (fb) {
    fb.textContent = 'Verifying cipher alignment…';
    fb.className = 'puzzle-feedback';
  }

  let keyword = '';
  for (let i = 0; i < CIPHER_ENCRYPTED.length; i++) {
    const idx = CIPHER_ALPHABET.indexOf(CIPHER_ENCRYPTED[i]);
    keyword += CIPHER_ALPHABET[(idx - cipherShift + 26) % 26];
  }

  try {
    const res = await act('cipher-wheel', { shift: cipherShift, keyword });
    if (res?.ok) {
      if (typeof playCipherSolvedSound === 'function') playCipherSolvedSound();
      if (fb) {
        fb.textContent = res.message || 'Decryption verified! The secret keyword BLACKTHORN is confirmed.';
        fb.className = 'puzzle-feedback puzzle-feedback--success';
      }
      setTimeout(() => {
        closeCipherWheelModal();
        showToast('Evidence secured: Holmes\'s Mirrored Pocket Timetable added to Casebook!');
      }, 1400);
    } else {
      if (typeof playMistakeSound === 'function') playMistakeSound();
      if (fb) {
        fb.textContent = res?.message || 'The cipher shift does not produce a coherent keyword.';
        fb.className = 'puzzle-feedback puzzle-feedback--error';
      }
    }
  } catch (err) {
    if (fb) {
      fb.textContent = err.message || 'Cipher mechanism error.';
      fb.className = 'puzzle-feedback puzzle-feedback--error';
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function beginInteraction() {
  if (!view) return;
  if (!$('evidence-puzzle').classList.contains('hidden')) return;
  if (!$('clock-puzzle-modal').classList.contains('hidden')) return;
  if (!$('library-puzzle-modal').classList.contains('hidden')) return;
  if (!$('basement-puzzle-modal')?.classList.contains('hidden')) return;
  if (!$('lockpick-modal')?.classList.contains('hidden')) return;
  if (!$('photoreconstruct-modal')?.classList.contains('hidden')) return;
  if (!$('cipherwheel-modal')?.classList.contains('hidden')) return;
  if (!$('thief-revealed-modal').classList.contains('hidden')) return;
  if (view.room.phase === 'capture') return;

  const me = view.me;
  const mansion = view.room.mansion || {};

  // Check mansion interactions
  const gateDist = Math.hypot(me.x - 480, me.y - 555);
  if (gateDist <= 55 && !mansion.gateOpen) {
    act('gate');
    return;
  }
  const clockDist = Math.hypot(me.x - 515, me.y - 575);
  if (clockDist <= 52 && !mansion.clockSolved) {
    openClockPuzzle();
    return;
  }
  const libDist = Math.hypot(me.x - 445, me.y - 575);
  if (libDist <= 52 && !mansion.librarySolved) {
    openLibraryPuzzle();
    return;
  }
  const basementDist = Math.hypot(me.x - 480, me.y - 585);
  if (basementDist <= 52 && !mansion.basementSolved) {
    openBasementPuzzle();
    return;
  }
  const portraitDist = Math.hypot(me.x - 480, me.y - 595);
  if (portraitDist <= 55 && mansion.secretDoorOpen && !mansion.thiefAddedToCasebook) {
    openThiefRevealedModal();
    return;
  }

  const down = nearDownPlayer(view.me, view.room.players);
  const target = nearestPoint(view.me);
  const jammed = target && view.room.sabotage?.mission === target.mission && view.room.sabotage.until > Date.now();
  if (down || jammed) { act('interact'); return; }

  // Headquarters (Central Investigation Board & Assembly)
  if (target?.mission === 'reunion') {
    openInvestigationBoardModal();
    return;
  }
  if (!target) {
    showToast('Follow the golden marker on the pavement to reach the nearest clue station.');
    return;
  }

  // Portrait piece stations or field challenges
  const challenge = FIELD_CHALLENGES[target.id] || {
    stationId: target.id,
    title: target.title || target.label,
    evidence: target.detail || `Forensic evidence discovered in London district at ${target.label}.`,
    clueType: target.category || 'footprints',
  };

  if (PORTRAIT_PIECES[target.id] || challenge) {
    advanceTutorial('investigate');
    openEvidencePuzzle(challenge);
    return;
  }

  act('interact');
}

function setBusy(busy) {
  if ($('create-room')) $('create-room').disabled = busy;
  if ($('join-room')) $('join-room').disabled = busy;
}

function setCharacter(character) {
  const allowed = ['boy', 'girl', 'sherlock', 'watson', 'detective', 'journalist', 'officer'];
  if (!allowed.includes(character)) return;
  selectedCharacter = character;
  localStorage.setItem('shadows-character', character);
  document.querySelectorAll('.character-choice').forEach((card) => {
    const selected = card.dataset.character === character;
    card.classList.toggle('is-selected', selected);
    card.setAttribute('aria-checked', String(selected));
  });
  document.querySelectorAll('.character-tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.targetChar === character);
  });
  const charNames = {
    boy: 'Sherlock Holmes',
    sherlock: 'Sherlock Holmes',
    watson: 'Dr. John Watson',
    girl: 'Irene Adler',
    detective: 'Irene Adler',
    journalist: 'Langdale Pike',
    officer: 'Inspector Lestrade',
  };
  $('character-hint').textContent = `${charNames[character] || 'Detective'} selected. Confirm to enter the room.`;
  $('character-continue').disabled = false;
}

function showCharacterGate() {
  if (!selectedCharacter) {
    selectedCharacter = localStorage.getItem('shadows-character') || 'boy';
  }
  showScreen($('character-gate'));
  $('character-back').classList.remove('hidden');
  document.querySelectorAll('.character-choice').forEach((card) => {
    const selected = card.dataset.character === selectedCharacter;
    card.classList.toggle('is-selected', selected);
    card.setAttribute('aria-checked', String(selected));
    card.disabled = false;
  });
  document.querySelectorAll('.character-tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.targetChar === selectedCharacter);
  });
  const charNames = {
    boy: 'Sherlock Holmes',
    sherlock: 'Sherlock Holmes',
    watson: 'Dr. John Watson',
    girl: 'Irene Adler',
    detective: 'Irene Adler',
    journalist: 'Langdale Pike',
    officer: 'Inspector Lestrade',
  };
  $('character-hint').textContent = `${charNames[selectedCharacter] || 'Detective'} selected. Confirm to enter the room.`;
  $('character-continue').disabled = false;
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
      next?.focus();
      if (next?.dataset?.character) setCharacter(next.dataset.character);
    });
  });
  document.querySelectorAll('.character-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.targetChar;
      if (target) setCharacter(target);
    });
  });

  // Headquarters lobby character persona chips
  document.querySelectorAll('#lobby-character-selector .hq-character-chip').forEach((chip) => {
    chip.addEventListener('click', async () => {
      if (view?.me?.ready) {
        showToast('Cancel Ready to change your detective persona.');
        return;
      }
      const char = chip.dataset.char;
      if (!char) return;
      selectedCharacter = char;
      local.character = char;
      try {
        localStorage.setItem('shadows-character', char);
      } catch {}
      try {
        await act('character', { character: char });
      } catch (err) {
        console.warn('Could not switch character in lobby:', err);
      }
    });
  });

  $('character-continue').addEventListener('click', confirmCharacterSelection);
  $('character-back').addEventListener('click', cancelCharacterSelection);
  $('identity-back').addEventListener('click', showWelcome);
  $('identity-continue').addEventListener('click', continueFromIdentity);
  window.createMultiplayerRoom = async () => {
    console.log('[SHERLOCK] >>> Create Multiplayer Room button activated.');
    if ($('menu-global-error')) $('menu-global-error').textContent = '';
    const createBtn = $('menu-create-room');
    if (!createBtn || createBtn.disabled) return;
    createBtn.disabled = true;
    const origHtml = createBtn.innerHTML;
    createBtn.innerHTML = '<span>Creating Room…</span> <span class="menu-icon">⏳</span>';
    try {
      const name = local.playerName || safeStorage.get('shadows-name') || 'Consulting Detective';
      const character = safeStorage.get('shadows-character') || 'boy';
      local.playerName = name;
      local.character = character;
      const result = await jsonRequest('create', { name, character });
      Object.assign(local, result, { playerName: name, character });
      if (result.state) {
        view = result.state;
      }
      saveCredentials(local);
      await enterRoom();
    } catch (error) {
      console.error('[SHERLOCK-FATAL] createMultiplayerRoom error:', error);
      if ($('menu-global-error')) $('menu-global-error').textContent = error.message || 'Could not create multiplayer room. Please verify the server is running.';
      showToast(error.message || 'Could not create room.');
    } finally {
      createBtn.disabled = false;
      createBtn.innerHTML = origHtml;
    }
  };

  window.toggleMenuJoin = () => {
    console.log('[SHERLOCK] >>> Join with Room Code toggle activated.');
    if ($('menu-global-error')) $('menu-global-error').textContent = '';
    const box = $('menu-join-box');
    if (box) {
      box.classList.toggle('hidden');
      if (!box.classList.contains('hidden')) {
        $('menu-room-code-input')?.focus();
      }
    }
  };
  $('menu-create-room')?.addEventListener('click', window.createMultiplayerRoom);
  $('menu-join-room')?.addEventListener('click', window.toggleMenuJoin);

  async function submitMenuJoin() {
    const input = $('menu-room-code-input');
    const errorEl = $('menu-join-error');
    const submitBtn = $('menu-join-submit');
    if (!input || !submitBtn) return;
    if (errorEl) errorEl.textContent = '';
    const code = input.value.trim().toUpperCase();
    if (code.length !== 6) {
      if (errorEl) errorEl.textContent = 'Enter the six-character room code from your host.';
      input.focus();
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Joining…';
    try {
      const name = local.playerName || safeStorage.get('shadows-name') || 'Consulting Detective';
      const character = safeStorage.get('shadows-character') || 'boy';
      local.playerName = name;
      local.character = character;
      const result = await jsonRequest('join', { code, name, character });
      Object.assign(local, result, { playerName: name, character });
      if (result.state) {
        view = result.state;
      }
      saveCredentials(local);
      await enterRoom();
    } catch (error) {
      console.error('[SHERLOCK-FATAL] submitMenuJoin error:', error);
      if (errorEl) errorEl.textContent = error.message || 'Could not join room. Check the code and try again.';
      showToast(error.message || 'Could not join room.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Join →';
    }
  }

  window.submitMenuJoin = submitMenuJoin;

  $('menu-join-submit')?.addEventListener('click', submitMenuJoin);
  $('menu-room-code-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitMenuJoin();
  });
function isInGameSession() {
  return Boolean(local.code && local.token && !$('game').classList.contains('hidden'));
}

function openPauseSettingsMenu(isPause = false) {
  const inGame = isInGameSession();
  const kicker = $('settings-kicker');
  const title = $('settings-title');
  const resumeBtnText = $('settings-resume')?.querySelector('span');
  const leaveSection = $('settings-leave-container');

  if (isPause || inGame) {
    if (kicker) kicker.innerHTML = '<span class="eyebrow-accent">✦</span> INVESTIGATION PAUSED · FIELD SETTINGS <span class="eyebrow-accent">✦</span>';
    if (title) title.textContent = 'Investigation Paused';
    if (resumeBtnText) resumeBtnText.textContent = 'Resume Investigation';
    if (leaveSection) leaveSection.classList.remove('hidden');
  } else {
    if (kicker) kicker.innerHTML = '<span class="eyebrow-accent">✦</span> CASEBOOK PREFERENCES · DETECTIVE HEADQUARTERS <span class="eyebrow-accent">✦</span>';
    if (title) title.textContent = 'Investigation Settings';
    if (resumeBtnText) resumeBtnText.textContent = 'Save & Return to Menu';
    if (leaveSection) leaveSection.classList.add('hidden');
  }

  // Reset leave confirmation box
  $('pause-leave-initial')?.classList.remove('hidden');
  $('pause-leave-confirm')?.classList.add('hidden');

  $('settings-modal').classList.remove('hidden');
}

function closePauseSettingsMenu() {
  $('settings-modal').classList.add('hidden');
  $('pause-leave-initial')?.classList.remove('hidden');
  $('pause-leave-confirm')?.classList.add('hidden');
}

function initPauseAndSettingsMenu() {
  // 1. Motion
  const reduceMotionCheck = $('reduce-motion');
  if (reduceMotionCheck) {
    reduceMotionCheck.checked = savedReducedMotion();
    document.body.classList.toggle('reduce-motion', reduceMotionCheck.checked);
    reduceMotionCheck.addEventListener('change', () => {
      const reducedMotion = reduceMotionCheck.checked;
      try { localStorage.setItem('shadows-reduce-motion', String(reducedMotion)); } catch {}
      document.body.classList.toggle('reduce-motion', reducedMotion);
      world?.setReducedMotion(reducedMotion);
      titleWorld?.setReducedMotion(reducedMotion);
      characterPreviews.forEach((preview) => preview.setReducedMotion?.(reducedMotion));
    });
  }

  // 2. Camera Look Sensitivity
  const sensitivitySlider = $('camera-sensitivity');
  const sensitivityVal = $('camera-sensitivity-val');
  let savedSensitivity = 1.0;
  try {
    const raw = localStorage.getItem('shadows-camera-sensitivity');
    if (raw) savedSensitivity = Math.max(0.5, Math.min(2.5, Number(raw)));
  } catch {}
  if (sensitivitySlider) {
    sensitivitySlider.value = savedSensitivity.toFixed(1);
    if (sensitivityVal) sensitivityVal.textContent = `${savedSensitivity.toFixed(1)}x`;
    world?.setLookSensitivity?.(savedSensitivity);
    sensitivitySlider.addEventListener('input', () => {
      const val = Number(sensitivitySlider.value) || 1.0;
      if (sensitivityVal) sensitivityVal.textContent = `${val.toFixed(1)}x`;
      try { localStorage.setItem('shadows-camera-sensitivity', String(val)); } catch {}
      world?.setLookSensitivity?.(val);
    });
  }

  // 3. Graphics Quality
  const qualitySelect = $('graphics-quality');
  let savedQuality = 'high';
  try {
    const raw = localStorage.getItem('shadows-graphics-quality');
    if (['high', 'medium', 'low'].includes(raw)) savedQuality = raw;
  } catch {}
  if (qualitySelect) {
    qualitySelect.value = savedQuality;
    world?.setGraphicsQuality?.(savedQuality);
    titleWorld?.setGraphicsQuality?.(savedQuality);
    qualitySelect.addEventListener('change', () => {
      const level = qualitySelect.value;
      try { localStorage.setItem('shadows-graphics-quality', level); } catch {}
      world?.setGraphicsQuality?.(level);
      titleWorld?.setGraphicsQuality?.(level);
    });
  }

  // 4. Control Hints
  const hintsCheck = $('control-hints');
  let savedHints = true;
  try {
    const raw = localStorage.getItem('shadows-control-hints');
    if (raw !== null) savedHints = raw === 'true';
  } catch {}
  if (hintsCheck) {
    hintsCheck.checked = savedHints;
    document.body.classList.toggle('hide-control-hints', !savedHints);
    hintsCheck.addEventListener('change', () => {
      const enabled = hintsCheck.checked;
      try { localStorage.setItem('shadows-control-hints', String(enabled)); } catch {}
      document.body.classList.toggle('hide-control-hints', !enabled);
    });
  }

  // 5. Open / Close triggers
  $('open-settings')?.addEventListener('click', () => openPauseSettingsMenu(false));
  $('open-pause-menu')?.addEventListener('click', () => openPauseSettingsMenu(true));
  $('settings-close')?.addEventListener('click', closePauseSettingsMenu);
  $('settings-done')?.addEventListener('click', closePauseSettingsMenu);
  $('settings-resume')?.addEventListener('click', closePauseSettingsMenu);
  $('settings-modal')?.addEventListener('click', (event) => {
    if (event.target === $('settings-modal')) closePauseSettingsMenu();
  });

  // 6. Leave Game Confirmation
  $('pause-leave-btn')?.addEventListener('click', () => {
    $('pause-leave-initial')?.classList.add('hidden');
    $('pause-leave-confirm')?.classList.remove('hidden');
  });
  $('pause-cancel-leave')?.addEventListener('click', () => {
    $('pause-leave-initial')?.classList.remove('hidden');
    $('pause-leave-confirm')?.classList.add('hidden');
  });
  $('pause-confirm-leave')?.addEventListener('click', () => {
    closePauseSettingsMenu();
    leaveRoom();
  });

  initAmbientAudio();
}

  $('room-back').addEventListener('click', showIdentity);
  $('player-name').addEventListener('keydown', (event) => { if (event.key === 'Enter') continueFromIdentity(); });
  $('player-name').addEventListener('input', () => { $('identity-error').textContent = ''; });
  initPauseAndSettingsMenu();
  const handleSkipOrClose = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    closeTutorial();
  };
  $('open-how-to-play')?.addEventListener('click', showTutorial);
  $('tutorial-close')?.addEventListener('click', handleSkipOrClose);
  $('tutorial-close')?.addEventListener('pointerdown', handleSkipOrClose);
  $('tutorial-skip')?.addEventListener('click', handleSkipOrClose);
  $('tutorial-skip')?.addEventListener('pointerdown', handleSkipOrClose);
  $('tutorial-minimize')?.addEventListener('click', (e) => { e.stopPropagation(); setTutorialMinimized(!tutorialMinimized); });
  $('tutorial-restore')?.addEventListener('click', (e) => { e.stopPropagation(); setTutorialMinimized(false); });
  $('replay-tutorial')?.addEventListener('click', showTutorial);

  const handleNextStep = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (tutorialIndex === -2 || tutorialIndex >= TUTORIAL_STEPS.length - 1 || TUTORIAL_STEPS[tutorialIndex]?.final) {
      closeTutorial();
    } else {
      tutorialIndex++;
      renderTutorialStep();
    }
  };
  $('tutorial-next')?.addEventListener('click', handleNextStep);
  $('tutorial-next')?.addEventListener('pointerdown', handleNextStep);
  $('tutorial')?.addEventListener('click', (event) => { if (event.target === $('tutorial')) closeTutorial(); });
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

let tutorialMinimized = false;
function setTutorialMinimized(minimized) {
  tutorialMinimized = Boolean(minimized);
  const tut = $('tutorial');
  if (tut) {
    tut.classList.toggle('is-minimized', tutorialMinimized);
  }
}

function setLandingError(message) { $('landing-error').textContent = message; }
function setConnection(message) {
  $('connection-state').textContent = message;
  $('connection-state').classList.toggle('is-offline', message !== 'CONNECTED');
  const hqStatus = $('lobby-connection-status');
  if (hqStatus) {
    let dotClass = 'conn-dot--online';
    let label = 'LINK: ONLINE';
    if (message === 'CONNECTED') {
      dotClass = 'conn-dot--online';
      label = 'LINK: ONLINE';
    } else if (message === 'CONNECTING') {
      dotClass = 'conn-dot--connecting';
      label = 'LINK: CONNECTING…';
    } else if (message === 'RECONNECTING') {
      dotClass = 'conn-dot--reconnecting';
      label = 'LINK: RECONNECTING…';
    } else {
      dotClass = 'conn-dot--offline';
      label = `LINK: ${message || 'OFFLINE'}`;
    }
    hqStatus.innerHTML = `<span class="conn-dot ${dotClass}" aria-hidden="true"></span><span>${label}</span>`;
  }
}

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

let unlockOverlayTimer = null;
function showEvidenceUnlockToast(title, badge = 'EXHIBIT') {
  const overlay = $('evidence-unlock-overlay');
  const titleEl = $('evidence-unlock-title');
  const badgeEl = $('evidence-unlock-badge');
  if (!overlay || !titleEl) return;
  titleEl.textContent = title;
  if (badgeEl) badgeEl.textContent = badge.toUpperCase();
  overlay.classList.remove('hidden');
  if (typeof playStampSlamSound === 'function') playStampSlamSound();
  if (unlockOverlayTimer) clearTimeout(unlockOverlayTimer);
  unlockOverlayTimer = setTimeout(() => {
    overlay.classList.add('hidden');
  }, 4200);
}

let lastChasePhase = false;

function updateUi() {
  if (!view) return;
  const { room: r, me } = view;
  const isLobby = r.phase === 'lobby';
  $('lobby-screen').classList.toggle('hidden', !isLobby);
  $('game-grid').classList.toggle('hidden', isLobby);
  $('bottom-drawer').classList.toggle('hidden', isLobby);
  $('room-code-display').textContent = r.code;
  $('lobby-code').textContent = r.code;
  if ($('lobby-code-hint')) $('lobby-code-hint').textContent = r.code;
  $('lobby-player-count').textContent = `${r.connectedCount} / 8 CONNECTED`;
  const hostPlayer = r.players.find((player) => player.isHost);
  const hostName = hostPlayer?.name || 'No host';
  $('host-status').textContent = me.isHost ? 'CHIEF INVESTIGATOR: YOU' : `CHIEF INVESTIGATOR: ${hostName}`;
  $('ready-toggle').textContent = me.ready ? 'Cancel Ready' : 'Declare Ready ✦';
  $('ready-toggle').classList.toggle('is-ready', Boolean(me.ready));
  $('start-game').classList.toggle('hidden', !isLobby || !me.isHost);
  $('start-game').disabled = !me.isHost || !r.allReady || r.connectedCount < 2;
  $('start-game').innerHTML = '<span class="btn-start-text">Launch Investigation</span> <span class="btn-start-arrow" aria-hidden="true">→</span>';

  // Mode banner dynamic status
  const modeCoop = $('mode-badge-coop');
  const modeDeduction = $('mode-badge-deduction');
  if (modeCoop && modeDeduction) {
    const isCoop = r.connectedCount <= 3;
    modeCoop.classList.toggle('is-active', isCoop);
    modeDeduction.classList.toggle('is-active', !isCoop);
  }

  // Team readiness progress
  const readinessPercentEl = $('lobby-readiness-percent');
  const readinessFillEl = $('lobby-readiness-fill');
  if (readinessPercentEl && readinessFillEl) {
    const pct = r.connectedCount > 0 ? Math.round((r.readyCount / r.connectedCount) * 100) : 0;
    readinessPercentEl.textContent = `${r.readyCount} / ${r.connectedCount} Ready (${pct}%)`;
    readinessFillEl.style.width = `${pct}%`;
  }

  // Headquarters wardrobe persona selection sync
  const wardrobe = $('lobby-character-selector');
  if (wardrobe) {
    const isLocked = Boolean(me.ready);
    wardrobe.classList.toggle('is-locked', isLocked);
    const lockBadge = $('wardrobe-lock-status');
    if (lockBadge) lockBadge.classList.toggle('hidden', !isLocked);

    const activeChar = me.character || selectedCharacter || local.character || 'boy';
    wardrobe.querySelectorAll('.hq-character-chip').forEach((chip) => {
      const match = chip.dataset.char === activeChar ||
        (activeChar === 'sherlock' && chip.dataset.char === 'boy') ||
        (activeChar === 'detective' && chip.dataset.char === 'girl');
      chip.classList.toggle('is-selected', Boolean(match));
      chip.setAttribute('aria-checked', String(Boolean(match)));
      chip.disabled = isLocked;
    });
  }

  // Host requirement hint
  const reqHint = $('lobby-start-requirement-hint');
  if (reqHint) {
    if (!me.isHost) {
      reqHint.textContent = `Waiting for Chief Investigator ${hostName} to launch the inquiry.`;
    } else if (r.connectedCount < 2) {
      reqHint.textContent = 'At least 2 consulting detectives required to launch inquiry (or enlist Dr. Watson AI).';
    } else if (!r.allReady) {
      const unreadyNames = r.players.filter((p) => p.connected && !p.ready).map((p) => p.name).join(', ');
      reqHint.textContent = `Awaiting readiness from: ${unreadyNames || 'all companions'}.`;
    } else {
      reqHint.textContent = 'All detectives assembled and prepared. Launch the inquiry when ready!';
    }
  }

  // Headquarters dispatch ticker
  const dispatchBody = $('hq-dispatch-log');
  if (dispatchBody && r.log && r.log.length) {
    const recent = r.log.slice(-3).reverse();
    dispatchBody.replaceChildren();
    for (const item of recent) {
      const line = document.createElement('p');
      line.className = `ticker-line ticker-line--${item.kind || 'note'}`;
      line.textContent = `✦ ${item.text}`;
      dispatchBody.appendChild(line);
    }
  }

  // Synchronized Game Start Countdown Overlay
  const countdownOverlay = $('lobby-countdown-overlay');
  if (countdownOverlay) {
    if (r.countdown && r.countdown > 0) {
      countdownOverlay.classList.remove('hidden');
      const numEl = $('lobby-countdown-number');
      if (numEl) numEl.textContent = r.countdown;
      const subEl = $('lobby-countdown-sub');
      if (subEl) subEl.textContent = r.countdown === 1 ? 'Departing into the fog now!' : `Departing in ${r.countdown} seconds...`;
    } else {
      countdownOverlay.classList.add('hidden');
    }
  }

  const addWatsonBtn = $('lobby-add-watson');
  if (addWatsonBtn) {
    addWatsonBtn.classList.toggle('hidden', !isLobby || !me.isHost || r.connectedCount >= 2);
  }
  $('lobby-hint').textContent = r.allReady
    ? (me.isHost ? (r.connectedCount === 1 ? 'You are ready! Launch your investigation now, or invite Dr. Watson above.' : 'All detectives are assembled and prepared. Launch the investigation when ready!') : 'All detectives are prepared. Waiting for the host to launch the investigation.')
    : `${r.readyCount} of ${r.connectedCount} detectives are ready. Declare readiness before departure.`;
  $('round-counter').textContent = `ROUND ${r.round} / ${r.totalRounds}`;
  $('player-count').textContent = r.phase === 'lobby' ? `${r.connectedCount} / 8 CONNECTED` : `${r.activeCount} / 8 PLAYERS`;
  $('team-summary').textContent = r.phase === 'lobby' ? `${r.readyCount} / ${r.connectedCount} READY` : `${r.activeCount} IN THE CASE`;
  $('map-title').textContent = ({ lobby: 'The waiting room', investigation: 'The streets of London', capture: 'The Blackthorn trap', reunion: 'The road to Blackthorn', results: 'Case closed' })[r.phase];
  const locName = $('hud-location-name');
  if (locName) locName.textContent = getLocationName(me);
  const chaseVignette = $('chase-vignette');
  if (chaseVignette) {
    chaseVignette.classList.toggle('hidden', r.phase !== 'capture');
  }
  if (r.phase === 'capture' && !lastChasePhase) {
    lastChasePhase = true;
    if (typeof playChaseTensionPulse === 'function') playChaseTensionPulse();
  } else if (r.phase !== 'capture') {
    lastChasePhase = false;
  }
  if (r.phase === 'capture' || r.phase === 'reunion' || (r.vote && !r.vote.resolved) || r.phase === 'results') {
    const sidePanel = $('side-panel');
    if (sidePanel) sidePanel.classList.add('is-open');
  }
  if (casebookOpen) {
    renderInvestigationDesk();
  }
  updatePhaseCard(r, me);
  updateObjectives(r, me);
  updatePortraitHud(r);
  if (r.portrait?.allCollected && world && typeof points !== 'undefined' && points.reunion) {
    world.setBeaconTarget?.(points.reunion.x, points.reunion.y);
  }
  renderClues(r.clues);
  renderTeam(r.players, me);
  renderTeam(r.players, me, 'lobby-team-list');
  renderLog(r.log);
  renderChat(r.chat);
  updateVoteUi(r, me);
  updateTrapUi(r, me);
  updateReunionUi(r, me);
  updateResults(r, me);
  updateControls(r, me);
  world?.setState(view);
  world?.setMansionState?.(r.mansion);
  drawMap();
  if (r.phase === 'investigation' && !sessionStorage.getItem('shadows-tutorial-seen')) showTutorial();
}

let casebookOpen = false;
let currentDeskTab = 'evidence';

function setCasebookOpen(open) {
  casebookOpen = Boolean(open);
  const desk = $('casebook-desk');
  if (desk) {
    desk.classList.toggle('hidden', !casebookOpen);
    if (casebookOpen) {
      renderInvestigationDesk();
    }
  }
  const panel = $('side-panel');
  if (panel) panel.classList.toggle('is-open', casebookOpen);
  const btn = $('open-casebook');
  if (btn) btn.classList.toggle('is-active', casebookOpen);
}

function setDeskTab(tabName) {
  const tabs = ['evidence', 'clues', 'suspects', 'map', 'notes'];
  if (!tabs.includes(tabName)) return;
  currentDeskTab = tabName;
  for (const t of tabs) {
    const tabEl = $(`desk-tab-${t}`);
    const viewEl = $(`desk-view-${t}`);
    const isActive = t === tabName;
    if (tabEl) {
      tabEl.classList.toggle('is-active', isActive);
      tabEl.setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
    if (viewEl) {
      viewEl.classList.toggle('hidden', !isActive);
      viewEl.classList.toggle('is-active', isActive);
    }
  }
  renderInvestigationDesk();
}

let activeConnectSource = null;
let currentInspectedFragId = null;

const DESK_EVIDENCE_ITEMS = [
  {
    id: 'fragment-footprints',
    stage: 1,
    title: 'Exhibit #1: Muddy Footprints',
    sector: 'Scotland Yard Perimeter',
    clueType: 'footprints',
    category: 'footprints',
    stationId: 'clue-footprints-yard',
    tilt: '-1.5deg',
    annotation: 'Yard boot impressions in Thames river silt. Size 9 bespoke gentleman’s riding boots.',
    connectsTo: 'fragment-fabric',
    threadLabel: 'Connected to Exhibit #2 (Fabric)',
    isRecovered: (missions) => Boolean(view?.room?.clues?.some(c => c.category === 'footprints' || c.id === 'clue-footprints-yard') || view?.room?.evidenceBoard?.fragments?.find(f => f.id === 'fragment-footprints')?.unlocked),
  },
  {
    id: 'fragment-fabric',
    stage: 2,
    title: 'Exhibit #2: Torn Fabric Sample',
    sector: 'Wrought-Iron Perimeter Fence',
    clueType: 'fabric',
    category: 'fabric',
    stationId: 'clue-fabric-fence',
    tilt: '1.2deg',
    annotation: 'Charcoal worsted wool twill fiber caught on iron spikes. Matches bespoke Savile Row tailoring.',
    connectsTo: 'fragment-photo',
    threadLabel: 'Connected to Exhibit #3 (Photograph)',
    isRecovered: (missions) => Boolean(view?.room?.clues?.some(c => c.category === 'fabric' || c.id === 'clue-fabric-fence') || view?.room?.evidenceBoard?.fragments?.find(f => f.id === 'fragment-fabric')?.unlocked),
  },
  {
    id: 'fragment-photo',
    stage: 3,
    title: 'Exhibit #3: Stolen Daguerreotype',
    sector: 'Crime Scene Camera Tripod',
    clueType: 'photograph',
    category: 'photograph',
    stationId: 'clue-photo-surveillance',
    tilt: '-1.8deg',
    annotation: 'Silver-plated daguerreotype silhouette exposing a tall figure in an Ulster overcoat.',
    connectsTo: 'fragment-letter',
    threadLabel: 'Connected to Exhibit #4 (Secret Letter)',
    isRecovered: (missions) => Boolean(view?.room?.clues?.some(c => c.category === 'photograph' || c.id === 'clue-photo-surveillance') || view?.room?.evidenceBoard?.fragments?.find(f => f.id === 'fragment-photo')?.unlocked),
  },
  {
    id: 'fragment-letter',
    stage: 4,
    title: 'Exhibit #4: Decoded Secret Letter',
    sector: 'Baker Street Study Table',
    clueType: 'letter',
    category: 'letter',
    stationId: 'cipher',
    tilt: '1.5deg',
    annotation: 'Iron-gall ink manuscript deciphered with the brass wheel to the keyword BLACKTHORN.',
    connectsTo: 'fragment-location',
    threadLabel: 'Connected to Exhibit #5 (Location & Key)',
    isRecovered: (missions) => Boolean(missions?.cipher?.done || view?.room?.clues?.some(c => c.id === 'cipher' || c.category === 'letter') || view?.room?.evidenceBoard?.fragments?.find(f => f.id === 'fragment-letter')?.unlocked),
  },
  {
    id: 'fragment-location',
    stage: 5,
    title: 'Exhibit #5: Sighting & Gutter Key',
    sector: 'East London & Hansom Cab Stand',
    clueType: 'key',
    category: 'key',
    stationId: 'clue-key-iron',
    tilt: '-1deg',
    annotation: 'Heavy brass skeleton key with 3-7-5 ward steps and cabman ledger sighting near Blackthorn House.',
    connectsTo: 'fragment-fingerprint',
    threadLabel: 'Connected to Exhibit #6 (Latent Fingerprint)',
    isRecovered: (missions) => Boolean(view?.room?.clues?.some(c => c.category === 'key' || c.id === 'clue-key-iron' || c.id === 'clue-witness-ledger') || view?.room?.evidenceBoard?.fragments?.find(f => f.id === 'fragment-location')?.unlocked),
  },
  {
    id: 'fragment-fingerprint',
    stage: 6,
    title: 'Exhibit #6: Latent Fingerprint Lift',
    sector: 'Lantern Glass at Embankment',
    clueType: 'fingerprints',
    category: 'fingerprints',
    stationId: 'clue-fingerprint-glass',
    tilt: '2deg',
    annotation: 'Graphite powder lift revealing a distinctive central dermal whorl. Conclusively proves the thief’s identity!',
    connectsTo: 'fragment-footprints',
    threadLabel: 'Conclusive Primary Suspect Match',
    isRecovered: (missions) => Boolean(view?.room?.clues?.some(c => c.category === 'fingerprints' || c.id === 'clue-fingerprint-glass') || view?.room?.evidenceBoard?.fragments?.find(f => f.id === 'fragment-fingerprint')?.unlocked),
  },
];

function renderInvestigationDesk() {
  const desk = $('casebook-desk');
  if (!desk || desk.classList.contains('hidden')) return;

  const room = view?.room;
  const me = view?.me;
  const missions = room?.missions;
  const evBoard = room?.evidenceBoard;

  // 1. Evidence tab badge & progress (6 progressive identity fragments)
  const totalCount = 6;
  const recoveredCount = evBoard && typeof evBoard.unlockedCount === 'number'
    ? evBoard.unlockedCount
    : DESK_EVIDENCE_ITEMS.filter((item) => item.isRecovered(missions)).length;

  const evCountEl = $('desk-evidence-count');
  if (evCountEl) evCountEl.textContent = `${recoveredCount} / ${totalCount}`;

  const progBadge = $('desk-progress-badge');
  if (progBadge) progBadge.textContent = `${recoveredCount} / ${totalCount} EXHIBITS RECOVERED`;

  const progFill = $('evidence-progress-fill');
  if (progFill) {
    progFill.style.width = `${Math.round((recoveredCount / totalCount) * 100)}%`;
  }

  document.querySelectorAll('.milestone-step').forEach((el) => {
    const step = Number(el.dataset.step) || 0;
    el.classList.toggle('is-reached', recoveredCount >= step);
    el.classList.toggle('is-current', recoveredCount === step - 1);
  });

  const stageHeadlines = [
    'Stage 1: Crime Scene Survey · Search London buildings for forensic traces',
    'Stage 2: Footwear Analysis · Yard bootprints logged; seek fabric samples',
    'Stage 3: Optical Surveillance · Reconstruct daguerreotype plate to isolate height',
    'Stage 4: Cryptographic Analysis · Cipher wheel decoded; inspect secret dispatch',
    'Stage 5: Cartographic Intersect · Hansom cab route & skeleton key confirmed',
    'Stage 6: Conclusive Identification · Lantern fingerprint provides definitive proof',
    'Stage: Identification Confirmed · Convene Accusation Council to spring safehouse trap!',
  ];
  const stageHeadlineEl = $('desk-evidence-stage-text');
  if (stageHeadlineEl) {
    stageHeadlineEl.textContent = stageHeadlines[Math.min(recoveredCount, 6)];
  }

  const voteBtn = $('desk-call-vote-btn');
  if (voteBtn) {
    const canAccuse = (recoveredCount >= 2 || (room?.clues?.length || 0) >= 2) && room?.mode === 'deduction' && me?.role === 'detective' && !room?.vote?.resolved;
    voteBtn.disabled = !canAccuse;
    voteBtn.title = canAccuse ? 'Convene Accusation Council with the detective team' : 'Requires at least 2 unlocked exhibits / clues';
  }

  // 2. Clues count
  const cluesCount = room?.clues?.length || 0;
  const clueCountEl = $('desk-clues-count');
  if (clueCountEl) clueCountEl.textContent = `${cluesCount} / 3`;
  const clueBadge = $('desk-clue-badge');
  if (clueBadge) clueBadge.textContent = `${cluesCount} FILED`;

  // 3. Suspects count
  const suspectsCount = evBoard?.suspects?.length || room?.players?.length || (room?.suspects?.length || 0);
  const suspCountEl = $('desk-suspects-count');
  if (suspCountEl) suspCountEl.textContent = String(suspectsCount);

  // Tab-specific rendering
  if (currentDeskTab === 'evidence') {
    renderDeskEvidence(missions);
  } else if (currentDeskTab === 'clues') {
    renderDeskClues(room?.clues);
  } else if (currentDeskTab === 'suspects') {
    renderDeskSuspects(room, me);
  } else if (currentDeskTab === 'map') {
    renderDeskMap(room, me);
  } else if (currentDeskTab === 'notes') {
    renderDeskNotes(room);
  }
}

function renderDeskEvidence(missions) {
  const grid = $('desk-evidence-grid');
  if (!grid) return;
  grid.replaceChildren();

  const room = view?.room;
  const evBoard = room?.evidenceBoard;
  const fragments = evBoard?.fragments?.length ? evBoard.fragments : DESK_EVIDENCE_ITEMS.map((item, idx) => ({
    id: item.id,
    stage: idx + 1,
    title: item.title,
    subtitle: item.sector,
    category: item.category || item.clueType,
    detail: item.annotation,
    traitSummary: item.threadLabel,
    unlocked: item.isRecovered(missions),
    matchingSuspectIds: [],
    clearedSuspectIds: [],
  }));

  fragments.forEach((frag) => {
    const card = document.createElement('article');
    card.id = `desk-card-${frag.id}`;
    card.className = `desk-evidence-card evidence-card ${frag.unlocked ? 'is-unlocked is-recovered' : 'is-locked is-unfound'}`;
    if (activeConnectSource === frag.id) {
      card.classList.add('is-connect-source');
    }

    const pin = document.createElement('div');
    pin.className = 'brass-push-pin';
    pin.setAttribute('aria-hidden', 'true');
    pin.dataset.pinFor = frag.id;

    // Header
    const head = document.createElement('div');
    head.className = 'evidence-card-header';
    const stageChip = document.createElement('span');
    stageChip.className = 'evidence-card-stage-chip';
    stageChip.textContent = `EXHIBIT #${frag.stage || 1}`;
    const statusChip = document.createElement('span');
    statusChip.className = `evidence-suspect-chip ${frag.unlocked ? (frag.stage === 6 ? 'evidence-suspect-chip--conclusive' : frag.stage >= 3 ? 'evidence-suspect-chip--narrow' : 'evidence-suspect-chip--broad') : 'evidence-suspect-chip--broad'}`;
    statusChip.textContent = !frag.unlocked ? '○ Awaiting Discovery' : (frag.stage === 6 ? '🔴 Definitive Proof (1)' : frag.stage >= 3 ? `🟠 Narrowed (${frag.matchingSuspectIds?.length || '2-3'})` : `🔵 Broad Traits (${frag.matchingSuspectIds?.length || '3+'})`);
    head.append(stageChip, statusChip);

    // Title & Subtitle
    const title = document.createElement('h3');
    title.className = 'evidence-card-title';
    title.textContent = frag.title;

    const subtitle = document.createElement('p');
    subtitle.className = 'evidence-card-subtitle';
    subtitle.textContent = frag.subtitle || frag.sector || 'London Forensic Scene';

    // Thumbnail Art
    const thumb = document.createElement('div');
    thumb.className = 'evidence-card-art';
    thumb.innerHTML = renderEvidenceIllustration(frag.category || frag.clueType);

    // Description & Forensic observation
    const desc = document.createElement('p');
    desc.className = 'evidence-card-desc';
    desc.textContent = frag.unlocked ? frag.detail : '“Forensic evidence awaiting active search and challenge resolution in London.”';

    // Footer with Inspect & Connect Buttons
    const footer = document.createElement('div');
    footer.className = 'evidence-card-footer';

    const traitLabel = document.createElement('span');
    traitLabel.className = 'desk-thread-tag';
    traitLabel.textContent = frag.unlocked ? `🔬 ${frag.traitSummary || 'Forensic Exhibit'}` : '🔒 Encrypted Lead';

    const actions = document.createElement('div');
    actions.className = 'evidence-card-actions';

    if (frag.unlocked) {
      const inspectBtn = document.createElement('button');
      inspectBtn.className = 'evidence-btn--sm';
      inspectBtn.type = 'button';
      inspectBtn.textContent = '🔍 Inspect';
      inspectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEvidenceInspector(frag.id);
      });

      const connectBtn = document.createElement('button');
      connectBtn.className = 'evidence-btn--sm';
      connectBtn.type = 'button';
      connectBtn.textContent = activeConnectSource === frag.id ? '✕ Cancel' : '🧵 Connect';
      connectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleConnectClueClick(frag.id);
      });

      actions.append(inspectBtn, connectBtn);
    }

    footer.append(traitLabel, actions);
    card.append(pin, head, title, subtitle, thumb, desc, footer);

    card.addEventListener('click', () => {
      if (activeConnectSource && activeConnectSource !== frag.id && frag.unlocked) {
        handleConnectClueClick(frag.id);
      }
    });

    grid.append(card);
  });

  requestAnimationFrame(() => drawRedThreadSvg());
}

function handleConnectClueClick(fragId) {
  if (!activeConnectSource) {
    activeConnectSource = fragId;
    showToast('🧵 Select another unlocked exhibit on the board to draw red thread.');
    renderDeskEvidence(view?.room?.missions);
  } else if (activeConnectSource === fragId) {
    activeConnectSource = null;
    showToast('Investigative thread cancelled.');
    renderDeskEvidence(view?.room?.missions);
  } else {
    const from = activeConnectSource;
    const to = fragId;
    activeConnectSource = null;
    act('connect-evidence', { from, to });
    showToast('Stringing red investigative thread between exhibits...');
    renderDeskEvidence(view?.room?.missions);
  }
}

function drawRedThreadSvg() {
  const svg = $('desk-thread-svg');
  if (!svg) return;
  svg.replaceChildren();

  if (currentDeskTab !== 'evidence' || window.innerWidth <= 768) return;

  const surface = $('casebook-desk')?.querySelector('.desk-surface');
  if (!surface) return;
  const surfaceRect = surface.getBoundingClientRect();

  const room = view?.room;
  const evBoard = room?.evidenceBoard;
  let pairs = [];

  if (evBoard?.connections?.length) {
    pairs = evBoard.connections.map((c) => [c.from, c.to]);
  } else {
    pairs = [
      ['fragment-footprints', 'fragment-fabric'],
      ['fragment-fabric', 'fragment-photo'],
      ['fragment-photo', 'fragment-letter'],
      ['fragment-letter', 'fragment-location'],
      ['fragment-location', 'fragment-fingerprint'],
    ];
  }

  pairs.forEach(([fromId, toId]) => {
    const cardA = $(`desk-card-${fromId}`);
    const cardB = $(`desk-card-${toId}`);
    if (!cardA || !cardB) return;

    const pinA = cardA.querySelector('.brass-push-pin') || cardA;
    const pinB = cardB.querySelector('.brass-push-pin') || cardB;

    const rectA = pinA.getBoundingClientRect();
    const rectB = pinB.getBoundingClientRect();

    const x1 = rectA.left + rectA.width / 2 - surfaceRect.left + surface.scrollLeft;
    const y1 = rectA.top + rectA.height / 2 - surfaceRect.top + surface.scrollTop;
    const x2 = rectB.left + rectB.width / 2 - surfaceRect.left + surface.scrollLeft;
    const y2 = rectB.top + rectB.height / 2 - surfaceRect.top + surface.scrollTop;

    const cx = (x1 + x2) / 2;
    const cy = Math.max(y1, y2) + 26;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`);
    path.setAttribute('stroke', '#c93b3b');
    path.setAttribute('stroke-width', '2.5');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('opacity', '0.85');

    const circA = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circA.setAttribute('cx', String(x1));
    circA.setAttribute('cy', String(y1));
    circA.setAttribute('r', '3');
    circA.setAttribute('fill', '#ffd700');

    const circB = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circB.setAttribute('cx', String(x2));
    circB.setAttribute('cy', String(y2));
    circB.setAttribute('r', '3');
    circB.setAttribute('fill', '#ffd700');

    svg.append(path, circA, circB);
  });
}

function openEvidenceInspector(fragId) {
  const modal = $('evidence-inspector-modal');
  if (!modal) return;
  const room = view?.room;
  const evBoard = room?.evidenceBoard;
  const frag = (evBoard?.fragments || DESK_EVIDENCE_ITEMS).find((f) => f.id === fragId);
  if (!frag) return;

  currentInspectedFragId = fragId;

  const titleEl = $('inspector-title');
  if (titleEl) titleEl.textContent = frag.title;

  const subEl = $('inspector-subtitle');
  if (subEl) subEl.textContent = `${frag.subtitle || frag.sector || 'Crime Scene'} · Recovered by ${frag.unlockedBy || 'Detective'}`;

  const descEl = $('inspector-desc');
  if (descEl) descEl.textContent = frag.detail;

  const stampEl = $('inspector-stamp');
  if (stampEl) {
    stampEl.textContent = frag.stage === 6 ? 'CONCLUSIVE IDENTIFICATION' : 'AUTHENTICATED EXHIBIT';
  }

  const artEl = $('inspector-illustration');
  if (artEl) {
    artEl.innerHTML = renderEvidenceIllustration(frag.category || frag.clueType);
  }

  const obsList = $('inspector-observations-list');
  if (obsList) {
    obsList.replaceChildren();
    const obsItems = [
      `Classification: ${frag.traitSummary || 'Forensic physical artifact'}`,
      `Stage in Evidence Chain: ${frag.stage} of 6`,
      frag.stage === 6 ? 'Dermal ridge match: 100% individual biometric certainty' : 'Forensic marker: eliminates non-matching suspects from inquiry roster',
    ];
    obsItems.forEach((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      obsList.append(li);
    });
  }

  const checklist = $('inspector-suspect-checklist');
  if (checklist) {
    checklist.replaceChildren();
    const suspects = evBoard?.suspects || (room?.players || []).map((p) => ({
      id: p.id,
      name: p.name,
      character: p.character,
    }));

    suspects.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'suspect-compatibility-row';
      const isCompat = !frag.clearedSuspectIds || !frag.clearedSuspectIds.includes(s.id);
      row.innerHTML = `
        <span><strong>${escapeHtml(s.name)}</strong> (${escapeHtml(s.archetype || s.character || 'Detective')})</span>
        <span class="suspect-compat-status ${isCompat ? 'is-compatible' : 'is-cleared'}">
          ${isCompat ? '✓ Compatible Attire' : '✕ Forensically Cleared'}
        </span>
      `;
      checklist.append(row);
    });
  }

  const connectBtn = $('inspector-connect-btn');
  if (connectBtn) {
    connectBtn.onclick = () => {
      closeEvidenceInspector();
      handleConnectClueClick(fragId);
    };
  }

  modal.classList.remove('hidden');
}

function closeEvidenceInspector() {
  const modal = $('evidence-inspector-modal');
  if (modal) modal.classList.add('hidden');
  currentInspectedFragId = null;
}

function callIdentificationVote(suspectId) {
  const room = view?.room;
  const me = view?.me;
  if (!room || room.mode !== 'deduction' || me?.role !== 'detective') {
    showToast('Accusation votes are held by detectives in deduction mode.');
    return;
  }
  if (suspectId) {
    act('vote', { target: suspectId });
    showToast(`Suspicion formally recorded against ${room.players.find(p => p.id === suspectId)?.name || 'suspect'}.`);
  } else {
    act('call-vote');
    showToast('⚖️ Accusation Council convened! Name the suspected thief.');
  }
}

function renderDeskClues(clues = []) {
  const container = $('desk-clues-list');
  if (!container) return;
  container.replaceChildren();

  if (!clues.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-note';
    empty.innerHTML = `
      <p style="font-family: 'Cinzel', serif; font-size: 15px; color: #f4d389; margin: 0 0 6px;">No deductions filed yet.</p>
      <p style="font-size: 12.5px; color: #b5a383; margin: 0;">Recover crime scene exhibits at Scotland Yard, Baker Street, and the Railway Station to synthesize Watson’s formal deductions.</p>
    `;
    container.append(empty);
    return;
  }

  clues.forEach((clue) => {
    const article = document.createElement('article');
    article.className = 'desk-clue-item';

    const head = document.createElement('div');
    head.className = 'desk-clue-head';

    const title = document.createElement('h3');
    title.className = 'desk-clue-title';
    title.textContent = clue.title;

    const time = document.createElement('span');
    time.className = 'desk-clue-time';
    time.textContent = 'RECORDED IN CASEBOOK';

    head.append(title, time);

    const detail = document.createElement('p');
    detail.className = 'desk-clue-detail';
    detail.textContent = clue.detail;

    const deduction = document.createElement('div');
    deduction.className = 'desk-clue-deduction';
    const catLabel = clue.category ? clue.category.toUpperCase() : 'FORENSIC EXHIBIT';
    const finderText = clue.foundBy ? `Filed by Detective ${escapeHtml(clue.foundBy)}` : 'Team forensic recovery';
    deduction.innerHTML = `
      <strong>${catLabel}:</strong>
      <span>${finderText} · Confirmed authentic forensic evidence.</span>
    `;

    article.append(head, detail, deduction);
    container.append(article);
  });
}

function renderDeskSuspects(room, me) {
  const grid = $('desk-suspects-grid');
  if (!grid) return;
  grid.replaceChildren();

  const isDeduction = room?.mode === 'deduction';
  const players = room?.players || [];
  const chat = room?.chat || [];
  const evBoard = room?.evidenceBoard;
  const unlockedCount = evBoard?.unlockedCount || 0;
  const suspectSummaries = evBoard?.suspects || [];
  const notes = evBoard?.suspectNotes || {};

  if (isDeduction || players.length >= 4) {
    players.forEach((player) => {
      const summary = suspectSummaries.find((s) => s.id === player.id) || {
        suspicionLevel: 'untested',
        matchedCount: 0,
        isCleared: false,
        archetype: 'Consulting Detective',
      };

      const card = document.createElement('article');
      card.className = 'desk-suspect-card suspect-card';

      // Header: Avatar, Name, Archetype, Suspicion Badge
      const header = document.createElement('div');
      header.className = 'desk-suspect-header suspect-card-header';

      const avatar = document.createElement('div');
      avatar.className = 'desk-suspect-avatar';
      const avatarImg = document.createElement('img');
      avatarImg.src = `assets/detectives/${player.character || 'boy'}.jpg`;
      avatarImg.alt = player.name;
      avatarImg.onerror = () => { avatar.innerHTML = '<span style="display:grid;place-items:center;height:100%;font-size:24px;">🕵️</span>'; };
      avatar.append(avatarImg);

      const info = document.createElement('div');
      info.className = 'desk-suspect-info';

      const name = document.createElement('h3');
      name.className = 'desk-suspect-name suspect-name';
      name.textContent = player.name + (player.id === me?.id ? ' (You)' : '');

      const status = document.createElement('p');
      status.className = 'desk-suspect-status';
      status.textContent = `${summary.archetype || 'Detective'} · ${player.eliminated ? 'Incapacitated' : player.connected ? 'Active in Case' : 'Disconnected'}`;

      const badgeLevel = summary.suspicionLevel || 'untested';
      const suspBadge = document.createElement('span');
      suspBadge.className = `suspicion-badge suspicion-badge--${badgeLevel}`;
      suspBadge.textContent = badgeLevel === 'prime' ? '🔥 PRIME SUSPECT' : badgeLevel === 'cleared' ? '✓ CLEARED' : `${badgeLevel.toUpperCase()} SUSPICION`;

      info.append(name, status, suspBadge);
      header.append(avatar, info);

      // Suspicion Meter Bar
      const meterBox = document.createElement('div');
      meterBox.style.display = 'flex';
      meterBox.style.flexDirection = 'column';
      meterBox.style.gap = '4px';

      const meterLabel = document.createElement('div');
      meterLabel.style.display = 'flex';
      meterLabel.style.justifyContent = 'space-between';
      meterLabel.style.fontSize = '10.5px';
      meterLabel.style.color = '#c9a45c';
      meterLabel.innerHTML = `
        <span>Forensic Concordance:</span>
        <strong>${summary.isCleared ? '✕ Cleared by Forensic Mismatch' : `${summary.matchedCount} / ${Math.max(1, unlockedCount)} Matches`}</strong>
      `;

      const meterBar = document.createElement('div');
      meterBar.className = 'suspicion-meter';
      const meterFill = document.createElement('div');
      meterFill.className = `suspicion-fill suspicion-fill--${badgeLevel}`;
      meterBar.append(meterFill);
      meterBox.append(meterLabel, meterBar);

      // Shared Detective Notes
      const notesBox = document.createElement('div');
      notesBox.className = 'desk-suspect-statements';
      notesBox.innerHTML = '<p class="eyebrow">SHARED INVESTIGATOR NOTES</p>';

      const existingNote = notes[player.id];
      if (existingNote?.note) {
        const noteDisplay = document.createElement('p');
        noteDisplay.className = 'suspect-note-display';
        noteDisplay.textContent = `“${existingNote.note}” — ${existingNote.author || 'Detective'}`;
        notesBox.append(noteDisplay);
      } else {
        const noNote = document.createElement('p');
        noNote.className = 'desk-suspect-quote';
        noNote.style.opacity = '0.6';
        noNote.textContent = 'No dossier annotations logged for this suspect yet.';
        notesBox.append(noNote);
      }

      // Note Input Row
      const noteInputRow = document.createElement('div');
      noteInputRow.className = 'suspect-note-input-row';
      const noteInput = document.createElement('input');
      noteInput.className = 'suspect-note-input';
      noteInput.type = 'text';
      noteInput.placeholder = 'Add deduction note...';
      noteInput.maxLength = 120;
      const noteSaveBtn = document.createElement('button');
      noteSaveBtn.className = 'evidence-btn--sm';
      noteSaveBtn.type = 'button';
      noteSaveBtn.textContent = 'Save';
      noteSaveBtn.onclick = () => {
        const text = noteInput.value.trim();
        if (text) {
          act('suspect-note', { suspectId: player.id, note: text });
          noteInput.value = '';
        }
      };
      noteInputRow.append(noteInput, noteSaveBtn);
      notesBox.append(noteInputRow);

      // Accuse Suspect Action Button
      if (isDeduction && me?.role === 'detective' && !player.eliminated) {
        const accuseBtn = document.createElement('button');
        accuseBtn.className = 'button button--gold button--sm';
        accuseBtn.style.marginTop = '4px';
        accuseBtn.type = 'button';
        accuseBtn.textContent = `⚖️ Accuse ${player.name} as Thief`;
        accuseBtn.onclick = () => callIdentificationVote(player.id);
        card.append(header, meterBox, notesBox, accuseBtn);
      } else {
        card.append(header, meterBox, notesBox);
      }

      grid.append(card);
    });
  } else {
    const personsOfInterest = [
      {
        name: 'Insp. Elias Vale',
        role: 'Implicated Yard Official',
        roleClass: 'desk-suspect-role--culprit',
        status: 'Seal Sign-Out Record No. 14',
        character: 'boy',
        quotes: ['“The seal registry is strictly Metropolitan Police business.”', '“I was stationed at the Yard until well past 9:00 PM.”'],
      },
      {
        name: 'Station Porter',
        role: 'Cleared Railway Witness',
        roleClass: 'desk-suspect-role--detective',
        status: 'Decoy Timetable Witness',
        character: 'girl',
        quotes: ['“The timetable on the wall was turned backwards, sir.”', '“A courier ran toward Signal Box B just as the bell rang.”'],
      },
    ];

    personsOfInterest.forEach((p) => {
      const card = document.createElement('article');
      card.className = 'desk-suspect-card';

      const header = document.createElement('div');
      header.className = 'desk-suspect-header';

      const avatar = document.createElement('div');
      avatar.className = 'desk-suspect-avatar';
      const avatarImg = document.createElement('img');
      avatarImg.src = `assets/detectives/${p.character}.jpg`;
      avatarImg.alt = p.name;
      avatarImg.onerror = () => { avatar.innerHTML = '<span style="display:grid;place-items:center;height:100%;font-size:24px;">👤</span>'; };
      avatar.append(avatarImg);

      const info = document.createElement('div');
      info.className = 'desk-suspect-info';

      const name = document.createElement('h3');
      name.className = 'desk-suspect-name';
      name.textContent = p.name;

      const status = document.createElement('p');
      status.className = 'desk-suspect-status';
      status.textContent = p.status;

      const rolePill = document.createElement('span');
      rolePill.className = `desk-suspect-role ${p.roleClass}`;
      rolePill.textContent = p.role;

      info.append(name, status, rolePill);
      header.append(avatar, info);

      const statementsBox = document.createElement('div');
      statementsBox.className = 'desk-suspect-statements';
      statementsBox.innerHTML = '<p class="eyebrow">FIELD DOSSIER & STATEMENTS</p>';

      p.quotes.forEach((q) => {
        const quote = document.createElement('p');
        quote.className = 'desk-suspect-quote';
        quote.textContent = q;
        statementsBox.append(quote);
      });

      card.append(header, statementsBox);
      grid.append(card);
    });

    players.forEach((player) => {
      const card = document.createElement('article');
      card.className = 'desk-suspect-card';

      const header = document.createElement('div');
      header.className = 'desk-suspect-header';

      const avatar = document.createElement('div');
      avatar.className = 'desk-suspect-avatar';
      const avatarImg = document.createElement('img');
      avatarImg.src = `assets/detectives/${player.character || 'boy'}.jpg`;
      avatarImg.alt = player.name;
      avatarImg.onerror = () => { avatar.innerHTML = '<span style="display:grid;place-items:center;height:100%;font-size:24px;">🕵️</span>'; };
      avatar.append(avatarImg);

      const info = document.createElement('div');
      info.className = 'desk-suspect-info';

      const name = document.createElement('h3');
      name.className = 'desk-suspect-name';
      name.textContent = player.name + (player.id === me?.id ? ' (You)' : '');

      const status = document.createElement('p');
      status.className = 'desk-suspect-status';
      status.textContent = player.connected ? 'Consulting Detective' : 'Disconnected';

      const rolePill = document.createElement('span');
      rolePill.className = 'desk-suspect-role desk-suspect-role--detective';
      rolePill.textContent = 'CONSULTING DETECTIVE';

      info.append(name, status, rolePill);
      header.append(avatar, info);

      const statementsBox = document.createElement('div');
      statementsBox.className = 'desk-suspect-statements';
      statementsBox.innerHTML = '<p class="eyebrow">RECORDED STATEMENTS</p>';

      const userMessages = chat.filter((msg) => msg.name === player.name).slice(-2);
      if (userMessages.length) {
        userMessages.forEach((msg) => {
          const quote = document.createElement('p');
          quote.className = 'desk-suspect-quote';
          quote.textContent = `“${msg.text}”`;
          statementsBox.append(quote);
        });
      } else {
        const noQuote = document.createElement('p');
        noQuote.className = 'desk-suspect-quote';
        noQuote.style.opacity = '0.6';
        noQuote.textContent = 'Active team member in good standing.';
        statementsBox.append(noQuote);
      }

      card.append(header, statementsBox);
      grid.append(card);
    });
  }
}

function renderDeskMap(room, me) {
  const container = $('desk-map-canvas-wrap');
  if (!container) return;
  container.replaceChildren();

  const missions = room?.missions;
  const sectors = [
    {
      sector: 'SECTOR I · WHITEHALL',
      title: 'Scotland Yard',
      coords: { x: 182, y: 145 },
      desc: 'Metropolitan Police Dispatch Lab & Seal Registry. Repository for Official Seal No. 14.',
      status: missions?.letter?.done ? 'COMPLETED (2/2)' : `${missions?.letter?.progress || 0}/2 RECOVERED`,
      isDone: Boolean(missions?.letter?.done),
    },
    {
      sector: 'SECTOR II · MARYLEBONE',
      title: '221B Baker Street',
      coords: { x: 498, y: 160 },
      desc: 'Holmes & Watson’s Consulting Quarters. Repository of the mirrored pocket timetable cipher.',
      status: missions?.cipher?.done ? 'COMPLETED (1/1)' : 'ACTIVE LEAD',
      isDone: Boolean(missions?.cipher?.done),
    },
    {
      sector: 'SECTOR III · STEPNEY',
      title: 'East London Station',
      coords: { x: 804, y: 355 },
      desc: 'Signal Box B & Commercial Cable Co. Relay. Origin of the intercepted telegraph pulse line.',
      status: missions?.telegraph?.done ? 'COMPLETED (2/2)' : `${missions?.telegraph?.progress || 0}/2 RECOVERED`,
      isDone: Boolean(missions?.telegraph?.done),
    },
    {
      sector: 'SECTOR IV · EMBANKMENT',
      title: 'Blackthorn Safehouse',
      coords: { x: 480, y: 555 },
      desc: 'Secluded Thames waterfront warehouse. Final rendezvous point for the coordinated trap.',
      status: missions?.telegraph?.done ? 'RENDEZVOUS UNLOCKED' : 'REQUISITION LOCKED',
      isDone: room?.phase === 'capture' || room?.phase === 'results',
    },
  ];

  sectors.forEach((sec) => {
    const card = document.createElement('div');
    card.className = 'desk-map-sector-card';

    const badge = document.createElement('div');
    badge.className = 'desk-sector-badge';
    badge.textContent = sec.sector;

    const title = document.createElement('h3');
    title.className = 'desk-sector-title';
    title.textContent = sec.title;

    const desc = document.createElement('p');
    desc.className = 'desk-sector-desc';
    desc.textContent = sec.desc;

    const meta = document.createElement('div');
    meta.className = 'desk-sector-meta';

    const statusSpan = document.createElement('span');
    statusSpan.style.color = sec.isDone ? '#48b868' : '#c9a45c';
    statusSpan.style.fontWeight = 'bold';
    statusSpan.textContent = sec.status;

    const distSpan = document.createElement('span');
    distSpan.className = 'desk-sector-dist';
    if (me?.x != null && me?.y != null) {
      const distance = Math.round(Math.hypot(me.x - sec.coords.x, me.y - sec.coords.y));
      distSpan.textContent = `${distance}m away`;
    } else {
      distSpan.textContent = `X: ${sec.coords.x} · Y: ${sec.coords.y}`;
    }

    meta.append(statusSpan, distSpan);
    card.append(badge, title, desc, meta);
    container.append(card);
  });
}

function renderDeskNotes(room) {
  const container = $('desk-notes-container');
  if (!container) return;
  container.replaceChildren();

  const missions = room?.missions;
  const log = room?.log || [];

  // Left: Case Objectives Checklist
  const leftCol = document.createElement('div');
  leftCol.className = 'desk-notes-col';
  leftCol.innerHTML = '<h3>CASE OBJECTIVES & TRAIL</h3>';

  const checklist = document.createElement('div');
  checklist.className = 'desk-mission-checklist';

  const items = [
    {
      title: 'Examine Scotland Yard Dispatch (2 Parts)',
      detail: 'Recover the forged letter and verify against Seal Register No. 14.',
      done: Boolean(missions?.letter?.done),
    },
    {
      title: 'Decode Baker Street Timetable (1 Part)',
      detail: 'Reverse mirror cipher script to obtain authentic train arrival time (9:28 PM).',
      done: Boolean(missions?.cipher?.done),
    },
    {
      title: 'Intercept Telegraph Signals (2 Parts)',
      detail: 'Restore Signal Box B transmitter and read the Commercial Cable receiver slip.',
      done: Boolean(missions?.telegraph?.done),
    },
    {
      title: 'Spring the Blackthorn Safehouse Trap',
      detail: 'Reunite the team at Blackthorn House and operate lever, valve, and key in sequence.',
      done: room?.phase === 'results',
    },
  ];

  items.forEach((item) => {
    const el = document.createElement('div');
    el.className = `desk-mission-item ${item.done ? 'is-done' : 'is-pending'}`;
    el.innerHTML = `
      <span style="font-size: 14px;">${item.done ? '✓' : '○'}</span>
      <div>
        <strong style="color: ${item.done ? '#48b868' : '#f4d389'};">${item.title}</strong>
        <p style="margin: 2px 0 0; color: #b8a788; font-size: 11px;">${item.detail}</p>
      </div>
    `;
    checklist.append(el);
  });

  leftCol.append(checklist);

  // Right: Baker Street Telegrams
  const rightCol = document.createElement('div');
  rightCol.className = 'desk-notes-col';
  rightCol.innerHTML = '<h3>BAKER STREET TELEGRAM LOG</h3>';

  const logList = document.createElement('div');
  logList.className = 'desk-telegram-log';

  if (!log.length) {
    logList.innerHTML = '<p style="color: #8c7859; font-style: italic; font-size: 12px;">No telegrams dispatched yet.</p>';
  } else {
    log.slice(-10).reverse().forEach((entry) => {
      const item = document.createElement('div');
      item.className = `desk-telegram-entry entry-${entry.tone || 'story'}`;
      item.textContent = entry.text;
      logList.append(item);
    });
  }

  rightCol.append(logList);
  container.append(leftCol, rightCol);
}

function initializeCasebookDesk() {
  $('desk-tab-evidence')?.addEventListener('click', () => setDeskTab('evidence'));
  $('desk-tab-clues')?.addEventListener('click', () => setDeskTab('clues'));
  $('desk-tab-suspects')?.addEventListener('click', () => setDeskTab('suspects'));
  $('desk-tab-map')?.addEventListener('click', () => setDeskTab('map'));
  $('desk-tab-notes')?.addEventListener('click', () => setDeskTab('notes'));

  $('desk-call-vote-btn')?.addEventListener('click', () => callIdentificationVote());
  $('inspector-close')?.addEventListener('click', closeEvidenceInspector);
  $('inspector-dismiss-btn')?.addEventListener('click', closeEvidenceInspector);
  $('evidence-inspector-modal')?.addEventListener('click', (event) => {
    if (event.target === $('evidence-inspector-modal')) closeEvidenceInspector();
  });

  $('casebook-desk-close')?.addEventListener('click', () => setCasebookOpen(false));
  $('desk-close-action')?.addEventListener('click', () => setCasebookOpen(false));
  $('casebook-desk')?.addEventListener('click', (event) => {
    if (event.target === $('casebook-desk')) setCasebookOpen(false);
  });
  $('casebook-desk')?.querySelector('.desk-surface')?.addEventListener('scroll', () => {
    if (currentDeskTab === 'evidence') drawRedThreadSvg();
  });
}

function getLocationName(me) {
  if (!me) return '221B BAKER STREET';
  const landmarks = [
    { name: '221B BAKER STREET', x: 498, y: 160 },
    { name: 'SCOTLAND YARD', x: 182, y: 145 },
    { name: 'EAST LONDON STATION', x: 804, y: 355 },
    { name: 'BLACKTHORN SAFEHOUSE', x: 480, y: 555 },
    { name: 'WHITECHAPEL EMBANKMENT', x: 660, y: 235 },
    { name: 'WESTMINSTER ARCHWAY', x: 315, y: 235 },
    { name: 'ST. JUDE ALLEY', x: 300, y: 414 },
    { name: 'THAMES DOCKS', x: 690, y: 450 },
  ];
  let closest = landmarks[0];
  let minDist = Infinity;
  for (const l of landmarks) {
    const dist = Math.hypot(me.x - l.x, me.y - l.y);
    if (dist < minDist) { minDist = dist; closest = l; }
  }
  return closest.name;
}

function updatePhaseCard(r, me) {
  const isCoop = r.mode === 'cooperative';
  const portrait = r.portrait || { totalPieces: 6, collectedPieces: [], allCollected: false };
  const pCount = portrait.collectedPieces?.length || 0;

  const copy = {
    lobby: ['WAITING', `Round ${r.round} of ${r.totalRounds}`, 'Mark ready when you are set. The host starts after everyone is ready.'],
    investigation: isCoop
      ? (portrait.allCollected
          ? ['HEADQUARTERS', 'Assemble Thief Picture', 'All 6 fragments recovered! Return to Headquarters (Safehouse) to complete the picture.']
          : ['EXPLORE LONDON', `Thief Picture (${pCount}/6)`, 'Discover marked clue stations and complete 5-15s mini-games to recover missing picture fragments.'])
      : ['INVESTIGATE', 'The Blackthorn case', 'Follow the active gold marker. New leads open when the evidence supports them.'],
    capture: ['FINAL TRAP', 'Catch the culprit', 'Go to Blackthorn Safehouse. Three detectives use the lever, valve, and key in order.'],
    reunion: ['REUNITE', 'Meet at Blackthorn House', 'Follow the last clue to the safehouse. Help anyone who needs it, then investigate together.'],
    results: ['CASE CLOSED', 'The truth comes to light.', 'The whole team assembled the portrait and finished the case.'],
  }[r.phase];
  $('phase-pill').textContent = copy[0];
  $('phase-title').textContent = copy[1];
  $('phase-copy').textContent = copy[2];
  const roleCard = $('role-card');
  roleCard.classList.toggle('hidden', !me.role || r.phase === 'lobby');
  $('role-kicker').textContent = isCoop ? 'COOPERATIVE DETECTIVE TEAM' : 'PRIVATE ROLE';
  $('role-name').textContent = isCoop ? 'CONSULTING DETECTIVE' : (me.role === 'culprit' ? 'THE THIEF' : 'DETECTIVE');
  $('role-name').classList.toggle('role-name--culprit', !isCoop && me.role === 'culprit');
  $('role-secret').textContent = isCoop
    ? 'Work together to find all 6 pieces of the thief’s picture across London, then assemble the picture at Headquarters!'
    : (me.role === 'culprit'
      ? (me.secretObjective || 'You are the hidden thief. Blend in with the detectives, secretly delay the investigation or strike isolated sleuths, and avoid a unanimous accusation.')
      : (me.secretObjective || 'Your role is private. Share clues, identify the thief, and coordinate their capture.'));
  $('start-hint').textContent = r.phase === 'lobby'
    ? (r.connectedCount < 2 ? 'At least two players must join.' : `${r.readyCount} of ${r.connectedCount} connected players ready · the host starts the case.`)
    : '';
  $('mission-list').classList.toggle('hidden', r.phase !== 'investigation' || me.role === 'culprit' || me.eliminated);
}

function updateObjectives(r, me) {
  const title = $('objective-title');
  const copy = $('objective-copy');
  const missions = r.missions;
  const isCoop = r.mode === 'cooperative';
  const portrait = r.portrait || { totalPieces: 6, collectedPieces: [], allCollected: false };
  const pCount = portrait.collectedPieces?.length || 0;
  const atHeadquarters = me ? distance(me, points.reunion) <= 95 : false;

  let categoryText = 'YOUR MISSION';
  let mainText = 'Find the missing portrait pieces.';
  let subText = 'Explore London and follow the golden markers.';
  let navText = 'Follow the golden marker to the nearest lead';

  if (r.phase === 'lobby') {
    categoryText = 'HEADQUARTERS LOBBY';
    mainText = 'Gather the detective team.';
    subText = 'Share room code. Mark ready when prepared to depart.';
    navText = 'Waiting for detectives to assemble';
  } else if (r.phase === 'results' || portrait.assembled) {
    categoryText = 'CASE SOLVED!';
    mainText = 'You and your team discovered the mysterious thief.';
    subText = 'The Phantom Thief Edward Blackthorn has been unmasked!';
    navText = 'Investigation concluded successfully';
  } else if (portrait.allCollected || pCount >= 6) {
    if (atHeadquarters) {
      categoryText = 'FINAL TASK';
      mainText = "Assemble the thief's portrait (6/6 pieces collected).";
      subText = 'Press E or tap Assemble Portrait on the board.';
      navText = 'Assemble the 6 portrait pieces';
    } else {
      categoryText = 'ALL PIECES FOUND (6/6)!';
      mainText = 'Return to Blackthorn Safehouse.';
      subText = 'Follow the golden marker to Headquarters.';
      const dToHQ = me ? Math.max(5, Math.round(distance(me, points.reunion) * 0.95)) : 50;
      navText = `Blackthorn Safehouse (${dToHQ}m)`;
    }
  } else if (pCount > 0) {
    categoryText = "COLLECT THE THIEF'S PORTRAIT";
    mainText = `Find the missing portrait pieces (${pCount}/6 found).`;
    subText = 'Explore London and follow the golden markers to the next clue.';
    const nearest = me ? getNearestUncollectedStation(me, r) : null;
    if (nearest) {
      const d = Math.max(5, Math.round(nearest.dist * 0.95));
      navText = `${nearest.pt.label} (${d}m)`;
    } else {
      navText = 'Follow the golden marker';
    }
  } else {
    // 0 of 6
    categoryText = 'YOUR MISSION';
    mainText = 'Find the missing portrait pieces (0/6 found).';
    subText = 'Explore London and follow the golden markers.';
    const nearest = me ? getNearestUncollectedStation(me, r) : null;
    if (nearest) {
      const d = Math.max(5, Math.round(nearest.dist * 0.95));
      navText = `${nearest.pt.label} (${d}m)`;
    } else {
      navText = 'Follow the golden marker';
    }
  }

  // Update dynamic HUD panel
  const catEl = $('hud-objective-category');
  if (catEl) catEl.textContent = categoryText;
  const mainEl = $('hud-objective-main');
  if (mainEl) mainEl.textContent = mainText;
  const subEl = $('hud-objective-sub');
  if (subEl) subEl.textContent = subText;
  const navEl = $('hud-nav-instruction');
  if (navEl) navEl.textContent = navText;

  // Update casebook drawer objective card
  if (title) title.textContent = mainText;
  if (copy) copy.textContent = subText;

  // Update in-game HUD Objectives overlay
  const hudOverlay = $('hud-objectives');
  const hudList = $('hud-objectives-list');
  if (hudOverlay && hudList) {
    const showHud = r.phase === 'investigation' || r.phase === 'capture' || r.phase === 'reunion';
    hudOverlay.classList.toggle('hidden', !showHud);
    if (showHud) {
      hudList.replaceChildren();
      const li = document.createElement('li');
      li.className = 'is-current';
      li.innerHTML = `<span class="hud-bullet">◆</span><span class="hud-text">${mainText}</span>`;
      hudList.append(li);
    }
  }

  // Update HUD portrait count and slots
  updatePortraitHud(r);
}

function renderClues(clues) {
  const signature = clues.map((clue) => clue.id).join('|');
  if (signature === lastClueSignature) return;
  const isInitialLoad = !lastClueSignature;
  lastClueSignature = signature;
  $('clue-count').textContent = `${clues.length} CLUE${clues.length === 1 ? '' : 'S'}`;
  const list = $('clue-list');
  list.replaceChildren();

  // 1. Secured Evidence Section
  if (clues.length > 0) {
    const secHeader = document.createElement('div');
    secHeader.className = 'clue-section-header';
    secHeader.innerHTML = `<p class="eyebrow">✦ SECURED EVIDENCE (${clues.length}) ✦</p>`;
    list.append(secHeader);
  }

  if (!clues.length) {
    const empty = document.createElement('p'); empty.className = 'empty-note'; empty.textContent = 'No clue yet. Examine a gold-marked place to add the first note.'; list.append(empty);
  } else {
    if (!isInitialLoad && clues.length > 0) {
      const latest = clues[clues.length - 1];
      showEvidenceUnlockToast(latest.title, latest.category || 'CASE EXHIBIT');
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

  // 2. Undiscovered Leads Section (Awaiting Discovery in London)
  const room = view?.room;
  const evBoard = room?.evidenceBoard;
  const fragments = evBoard?.fragments || [];
  const unrecovered = fragments.filter((f) => !f.unlocked);
  if (unrecovered.length > 0) {
    const pendingHeader = document.createElement('div');
    pendingHeader.className = 'clue-section-header clue-section-header--pending';
    pendingHeader.innerHTML = `<p class="eyebrow">✧ AWAITING INVESTIGATION (${unrecovered.length}) ✧</p>`;
    list.append(pendingHeader);
    unrecovered.forEach((frag) => {
      const item = document.createElement('div');
      item.className = 'clue-pending-lead';
      item.innerHTML = `
        <span class="lead-icon" aria-hidden="true">🔍</span>
        <div class="lead-text">
          <strong class="lead-title">${escapeHtml(frag.title)}</strong>
          <small class="lead-meta">Exhibit #${frag.stage} · ${escapeHtml(frag.subtitle || 'Forensic scene in London')}</small>
        </div>
      `;
      list.append(item);
    });
  }
}

function getCharacterDetails(character) {
  const map = {
    boy: { name: 'Sherlock Holmes', title: 'Master of Deduction', isGirl: false },
    sherlock: { name: 'Sherlock Holmes', title: 'Master of Deduction', isGirl: false },
    watson: { name: 'Dr. John Watson', title: 'Military Physician & Marksman', isGirl: false },
    girl: { name: 'Irene Adler', title: 'The Velvet Operative', isGirl: true },
    detective: { name: 'Irene Adler', title: 'The Velvet Operative', isGirl: true },
    journalist: { name: 'Langdale Pike', title: 'Fleet Street Informant', isGirl: false },
    officer: { name: 'Inspector Lestrade', title: 'Scotland Yard Veteran', isGirl: false },
  };
  return map[character] || map.boy;
}

function renderTeam(players, me, listId = 'team-list') {
  const list = $(listId);
  if (!list) return;
  list.replaceChildren();

  const isLobby = listId === 'lobby-team-list';

  players.forEach((player, index) => {
    const charDetails = getCharacterDetails(player.character);
    const row = document.createElement('div');
    row.className = `team-member ${player.isMe ? 'team-member--me' : ''} ${isLobby ? 'headquarters-dossier-card' : ''}`;

    const avatar = document.createElement('span');
    avatar.className = `team-avatar avatar-${index % 5} character-avatar character-${player.character || 'boy'}`;
    const isGirl = charDetails.isGirl;
    avatar.innerHTML = isGirl
      ? `<svg viewBox="0 0 24 24" class="cameo-svg" aria-hidden="true"><path fill="currentColor" d="M12 2a5 5 0 0 1 5 5c0 1.9-.9 3.6-2.3 4.4.9.4 1.7 1.1 2.3 2.1 1.2 1.9 1 4.5 1 4.5H6s-.2-2.6 1-4.5c.6-1 1.4-1.7 2.3-2.1C7.9 10.6 7 8.9 7 7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3c0 1.2.6 2.3 1.6 2.8l.4.2-.3.3c-.8.8-1.4 1.9-1.6 3.2h5.8c-.2-1.3-.8-2.4-1.6-3.2l-.3-.3.4-.2A3.01 3.01 0 0 0 15 7a3 3 0 0 0-3-3z"/></svg>`
      : `<svg viewBox="0 0 24 24" class="cameo-svg" aria-hidden="true"><path fill="currentColor" d="M12 2c2.8 0 5 2.2 5 5 0 1.8-.9 3.3-2.3 4.2.8.5 1.5 1.2 2 2.1 1.1 1.9.9 4.7.9 4.7H6.4s-.2-2.8.9-4.7c.5-.9 1.2-1.6 2-2.1C7.9 10.3 7 8.8 7 7c0-2.8 2.2-5 5-5zm-3 2a1 1 0 0 0-1 1v1h8V5a1 1 0 0 0-1-1H9zm3 3a3 3 0 0 0-3 3c0 1.2.6 2.3 1.6 2.8l.4.2-.3.3c-.8.8-1.3 1.9-1.6 3.2h5.8c-.3-1.3-.8-2.4-1.6-3.2l-.3-.3.4-.2A3 3 0 0 0 15 10a3 3 0 0 0-3-3z"/></svg>`;
    avatar.title = `${charDetails.name} (${charDetails.title})`;
    avatar.setAttribute('aria-label', avatar.title);

    const details = document.createElement('span');
    details.className = 'team-member__details';

    const nameLine = document.createElement('div');
    nameLine.className = 'team-member__name-line';
    const name = document.createElement('b');
    name.textContent = player.name;
    nameLine.append(name);

    if (player.isMe) {
      const youBadge = document.createElement('span');
      youBadge.className = 'member-tag member-tag--you';
      youBadge.textContent = 'YOU';
      nameLine.append(youBadge);
    }
    if (player.isHost) {
      const hostBadge = document.createElement('span');
      hostBadge.className = 'member-tag member-tag--host';
      hostBadge.innerHTML = `<span class="crown-icon" aria-hidden="true">👑</span> ${isLobby ? 'CHIEF' : 'HOST'}`;
      nameLine.append(hostBadge);
    }

    if (isLobby) {
      const archetypeLine = document.createElement('div');
      archetypeLine.className = 'team-member__archetype-line';
      archetypeLine.textContent = `${charDetails.name} · ${charDetails.title}`;
      details.append(nameLine, archetypeLine);
    } else {
      details.append(nameLine);
    }

    const connStatus = document.createElement('div');
    connStatus.className = 'team-member__conn-line';
    const connDot = document.createElement('span');
    connDot.className = `conn-dot ${player.connected ? 'conn-dot--online' : 'conn-dot--offline'}`;
    const connLabel = document.createElement('small');
    connLabel.textContent = player.connected ? 'Connected' : 'Disconnected';
    connStatus.append(connDot, connLabel);
    details.append(connStatus);

    const badge = document.createElement('span');
    badge.className = 'team-member__badge';
    if (view?.room.phase === 'lobby' || isLobby) {
      if (!player.connected) {
        badge.textContent = 'DISCONNECTED';
        badge.classList.add('badge-disconnected');
      } else if (player.ready) {
        badge.textContent = isLobby ? '✦ READY' : 'READY';
        badge.classList.add('badge-ready');
      } else {
        badge.textContent = isLobby ? '⌛ PREPARING' : 'NOT READY';
        badge.classList.add('badge-waiting');
      }
    } else if (player.incapacitated) {
      badge.textContent = 'DOWN';
    } else if (player.eliminated) {
      badge.textContent = 'CAUGHT';
    } else if (player.revealedRole) {
      badge.textContent = player.revealedRole === 'culprit' ? 'CULPRIT' : 'DETECTIVE';
    } else {
      badge.textContent = player.isMe && me.role === 'culprit' ? 'YOU' : '•';
    }
    if (player.revealedRole === 'culprit') badge.classList.add('badge-danger');

    row.append(avatar, details, badge);
    list.append(row);
  });

  // In lobby, render clean compact empty seats up to 8
  if (isLobby && players.length < 8) {
    for (let slot = players.length; slot < 8; slot++) {
      const emptyRow = document.createElement('div');
      emptyRow.className = 'team-member team-member--empty-slot';

      const emptyAvatar = document.createElement('span');
      emptyAvatar.className = 'team-avatar team-avatar--empty';
      emptyAvatar.innerHTML = `<svg viewBox="0 0 24 24" class="empty-seat-silhouette" aria-hidden="true"><path fill="currentColor" d="M12 4a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm-5 11c-1.1 0-2 .9-2 2v2h14v-2c0-1.1-.9-2-2-2H7z"/></svg>`;

      const emptyName = document.createElement('span');
      emptyName.className = 'empty-slot-name';
      emptyName.textContent = `Seat 0${slot + 1} · Open Seat`;

      const emptyBadge = document.createElement('span');
      emptyBadge.className = 'team-member__badge badge-empty';
      emptyBadge.textContent = 'AVAILABLE';

      emptyRow.append(emptyAvatar, emptyName, emptyBadge);
      list.append(emptyRow);
    }
  }
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

function getVictorianCameoSvg(character, index) {
  const isGirl = character === 'girl';
  const variant = (index || 0) % 3;
  if (isGirl) {
    if (variant === 0) {
      return `<svg viewBox="0 0 24 24" class="suspect-silhouette" aria-hidden="true"><path fill="currentColor" d="M12 2a5 5 0 0 1 5 5c0 1.9-.9 3.6-2.3 4.4.9.4 1.7 1.1 2.3 2.1 1.2 1.9 1 4.5 1 4.5H6s-.2-2.6 1-4.5c.6-1 1.4-1.7 2.3-2.1C7.9 10.6 7 8.9 7 7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3c0 1.2.6 2.3 1.6 2.8l.4.2-.3.3c-.8.8-1.4 1.9-1.6 3.2h5.8c-.2-1.3-.8-2.4-1.6-3.2l-.3-.3.4-.2A3.01 3.01 0 0 0 15 7a3 3 0 0 0-3-3z"/></svg>`;
    }
    return `<svg viewBox="0 0 24 24" class="suspect-silhouette" aria-hidden="true"><path fill="currentColor" d="M12 2C8.7 2 6 4.7 6 8c0 1.9.9 3.5 2.2 4.6C6.9 13.7 6 15.7 6 18h12c0-2.3-.9-4.3-2.2-5.4 1.3-1.1 2.2-2.7 2.2-4.6 0-3.3-2.7-6-6-6zm0 2.5c1.9 0 3.5 1.6 3.5 3.5S13.9 11.5 12 11.5 8.5 9.9 8.5 8s1.6-3.5 3.5-3.5zm-4 13.5c.5-1.9 2-3.3 4-3.3s3.5 1.4 4 3.3H8z"/></svg>`;
  }
  if (variant === 0) {
    return `<svg viewBox="0 0 24 24" class="suspect-silhouette" aria-hidden="true"><path fill="currentColor" d="M12 2c2.8 0 5 2.2 5 5 0 1.8-.9 3.3-2.3 4.2.8.5 1.5 1.2 2 2.1 1.1 1.9.9 4.7.9 4.7H6.4s-.2-2.8.9-4.7c.5-.9 1.2-1.6 2-2.1C7.9 10.3 7 8.8 7 7c0-2.8 2.2-5 5-5zm-3 2a1 1 0 0 0-1 1v1h8V5a1 1 0 0 0-1-1H9zm3 3a3 3 0 0 0-3 3c0 1.2.6 2.3 1.6 2.8l.4.2-.3.3c-.8.8-1.3 1.9-1.6 3.2h5.8c-.3-1.3-.8-2.4-1.6-3.2l-.3-.3.4-.2A3 3 0 0 0 15 10a3 3 0 0 0-3-3z"/></svg>`;
  }
  if (variant === 1) {
    return `<svg viewBox="0 0 24 24" class="suspect-silhouette" aria-hidden="true"><path fill="currentColor" d="M12 1.5c-3.5 0-6 2.2-7 5.5h14c-1-3.3-3.5-5.5-7-5.5zM4 8c0 2 1.5 3.8 3.5 4.5-.8 1-1.3 2.3-1.5 3.7h12c-.2-1.4-.7-2.7-1.5-3.7C18.5 11.8 20 10 20 8H4zm8 1.5c1.4 0 2.5 1.1 2.5 2.5s-1.1 2.5-2.5 2.5-2.5-1.1-2.5-2.5 1.1-2.5 2.5-2.5zM6 18c.6 2.2 2.6 3.8 5 4h2c2.4-.2 4.4-1.8 5-4H6z"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" class="suspect-silhouette" aria-hidden="true"><path fill="currentColor" d="M12 2a4.5 4.5 0 0 0-4.5 4.5c0 1.7.9 3.1 2.3 3.9C7.8 11.3 6.5 13.2 6.5 15.5V18h11v-2.5c0-2.3-1.3-4.2-3.3-5.1 1.4-.8 2.3-2.2 2.3-3.9A4.5 4.5 0 0 0 12 2zm0 2c1.4 0 2.5 1.1 2.5 2.5S13.4 9 12 9s-2.5-1.1-2.5-2.5S10.6 4 12 4zm-3.5 12c.3-1.9 1.7-3.4 3.5-3.5 1.8.1 3.2 1.6 3.5 3.5h-7z"/></svg>`;
}

function getSuspectNotes(player, room) {
  if (!player.connected) return 'Disconnected from inquiry';
  if (player.incapacitated) return 'Incapacitated in the district';
  const notes = [];
  if (room.missions?.letter?.parts?.ink === player.id) notes.push('Examined Yard dispatch ink');
  if (room.missions?.letter?.parts?.seal === player.id) notes.push('Examined Yard seal register');
  if (room.missions?.telegraph?.parts?.sender === player.id) notes.push('Repaired station sender');
  if (room.missions?.telegraph?.parts?.receiver === player.id) notes.push('Connected telegraph relay');
  const logs = room.log || [];
  if (logs.some((l) => l.text && l.text.includes(player.name) && l.text.includes('timetable'))) {
    notes.push('Decoded Baker St. timetable');
  }
  if (logs.some((l) => l.text && l.text.includes(player.name) && l.text.includes('cleared the interference'))) {
    notes.push('Cleared station interference');
  }
  if (notes.length === 0) return 'Present at crime scene · Alibi unverified';
  return notes.join(' · ');
}

function updateVoteUi(r, me) {
  const isCulpritInquiry = (me.role === 'culprit' && r.mode === 'deduction' && (r.voteAvailable || (r.vote && !r.vote.resolved)));
  const showVote = me.voteEligible && (r.voteAvailable || (r.vote && !r.vote.resolved));
  const showSummary = Boolean(r.vote?.resolved);
  const isVisible = showVote || showSummary || isCulpritInquiry;

  const voteCard = $('vote-card');
  if (voteCard) voteCard.classList.toggle('hidden', !isVisible);

  const sidePanel = $('side-panel');
  if (sidePanel) sidePanel.classList.toggle('has-vote-active', isVisible && (showVote || (r.vote && !r.vote.resolved)));

  if (!isVisible) return;

  // 1. Evidence Table on the Interrogation Desk
  const evidenceList = $('vote-evidence-list');
  const evidenceCount = $('vote-evidence-count');
  if (evidenceList) {
    evidenceList.replaceChildren();
    const clues = r.clues || [];
    if (evidenceCount) evidenceCount.textContent = `${clues.length} CLUE${clues.length === 1 ? '' : 'S'} VERIFIED`;
    if (clues.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'vote-evidence-empty';
      empty.textContent = 'No physical exhibits lodged on the table yet.';
      evidenceList.append(empty);
    } else {
      clues.forEach((clue, idx) => {
        const item = document.createElement('div');
        item.className = 'vote-evidence-item';
        item.innerHTML = `
          <span class="vote-evidence-seal">EXHIBIT #${idx + 1}</span>
          <div class="vote-evidence-body">
            <strong class="vote-evidence-title">${escapeHtml(clue.title)}</strong>
            <p class="vote-evidence-detail">${escapeHtml(clue.detail)}</p>
          </div>
        `;
        evidenceList.append(item);
      });
    }
  }

  // 2. Culprit Private Notification (DO NOT reveal role to other players!)
  const culpritNotice = $('vote-culprit-notice');
  if (culpritNotice) {
    culpritNotice.classList.toggle('hidden', me.role !== 'culprit');
  }

  // 3. Real Countdown Timer (CRITICAL: Do NOT show fake countdown if no server deadline exists!)
  const hasActiveTimer = Boolean(r.vote && r.vote.open && !r.vote.resolved && r.vote.deadline && Date.now() < r.vote.deadline);
  const timerWrap = $('vote-countdown-wrap');
  const timerLabel = $('vote-timer-seconds');
  const timerBar = $('vote-countdown-bar');

  if (hasActiveTimer) {
    if (timerWrap) timerWrap.classList.remove('hidden');
    const secondsLeft = Math.max(0, Math.ceil((r.vote.deadline - Date.now()) / 1000));
    if (timerLabel) timerLabel.textContent = `00:${String(secondsLeft).padStart(2, '0')}`;
    if (timerBar) timerBar.style.width = `${Math.min(100, Math.max(0, (secondsLeft / 30) * 100))}%`;
  } else {
    if (timerWrap) timerWrap.classList.add('hidden');
    if (timerLabel) timerLabel.textContent = '';
  }

  // 4. Update Header Copy & Prompt
  const voteTitle = $('vote-title');
  if (voteTitle) voteTitle.textContent = 'Who is the Culprit?';

  if (showVote) {
    fillSuspects($('vote-target'), r.players, me, true);
    $('vote-submit').disabled = me.hasVoted || me.role === 'culprit';
    $('vote-result').textContent = '';

    if (me.hasVoted) {
      const targetPlayer = r.players?.find((p) => p.id === ($('vote-target').value || me.vote));
      const targetName = targetPlayer ? targetPlayer.name : 'the suspect';
      $('vote-copy').textContent = `Your accusation is formally recorded against ${targetName}. Every detective must reach the same consensus for the trap to spring.`;
    } else if (me.role === 'culprit') {
      $('vote-copy').textContent = 'The detectives are examining the evidence to uncover the culprit. Mislead the inquiry in chat and prevent a unanimous consensus.';
    } else {
      $('vote-copy').textContent = 'Two or more verified clues are on the board. Review the evidence table, confer with your fellow detectives, and cast one formal accusation.';
    }

    // 5. Suspect Cards Gallery (Only real players / suspects!)
    const gallery = $('suspect-gallery');
    if (gallery) {
      gallery.replaceChildren();
      const candidates = (r.players || []).filter((p) => !p.eliminated);

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        const isMe = candidate.id === me.id;
        const isChosenVote = Boolean(me.hasVoted && ($('vote-target').value === candidate.id || me.vote === candidate.id));

        const card = document.createElement('article');
        card.className = 'suspect-card' + (isChosenVote ? ' is-voted' : '');
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `Accuse ${candidate.name}`);

        if (isChosenVote) {
          const stamp = document.createElement('span');
          stamp.className = 'suspect-voted-stamp';
          stamp.textContent = 'ACCUSED';
          card.append(stamp);
        }

        const frame = document.createElement('div');
        frame.className = 'suspect-frame';
        const svgPortrait = getVictorianCameoSvg(candidate.character, i);
        frame.innerHTML = `<span class="suspect-daguerreotype">${svgPortrait}</span>`;

        const name = document.createElement('strong');
        name.className = 'suspect-name';
        name.textContent = candidate.name + (isMe ? ' (You)' : '');

        const subrole = document.createElement('span');
        subrole.className = 'suspect-subrole';
        subrole.textContent = candidate.connected ? 'Consulting Detective' : 'Disconnected';

        const notes = document.createElement('p');
        notes.className = 'suspect-evidence-notes';
        notes.textContent = getSuspectNotes(candidate, r);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'button button--gold button--vote-card';

        if (me.hasVoted) {
          btn.disabled = true;
          btn.textContent = isChosenVote ? 'Accused' : 'Vote Cast';
        } else if (me.role === 'culprit') {
          btn.disabled = true;
          btn.textContent = 'Observer';
        } else {
          btn.disabled = false;
          btn.textContent = 'Accuse';
        }

        const castVoteForCandidate = () => {
          if (me.hasVoted || me.role === 'culprit' || btn.disabled) return;
          $('vote-target').value = candidate.id;
          $('vote-submit').click();
        };

        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          castVoteForCandidate();
        });

        card.addEventListener('click', () => {
          castVoteForCandidate();
        });

        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            castVoteForCandidate();
          }
        });

        card.append(frame, name, subrole, notes, btn);
        gallery.append(card);
      }
    }
  } else if (showSummary) {
    $('vote-copy').textContent = r.vote.outcome === 'capture'
      ? 'The accusation was verified. The culprit is making a run for Blackthorn Safehouse—coordinate the final trap.'
      : 'The team has concluded its formal inquiry vote. Finish the clues and meet at Blackthorn Safehouse.';
    $('vote-result').textContent = voteText(r.vote);
  }

  // 6. Server Authoritative Outcome Card
  const outcomeCard = $('vote-outcome-card');
  if (outcomeCard) {
    if (r.vote?.resolved) {
      outcomeCard.classList.remove('hidden');
      outcomeCard.className = `vote-outcome-card is-${r.vote.outcome || 'split'}`;
      const badge = $('vote-outcome-badge');
      const headline = $('vote-outcome-headline');
      const desc = $('vote-outcome-description');
      const tallyList = $('vote-tally-list');

      if (r.vote.outcome === 'capture') {
        if (badge) badge.textContent = 'CULPRIT CORNERED';
        if (headline) headline.textContent = `Unanimous Accusation: ${r.vote.suspectName} Identified`;
        if (desc) desc.textContent = 'The detectives unanimously exposed the true culprit. They are now fleeing toward Blackthorn Safehouse—spring the trap!';
      } else if (r.vote.outcome === 'wrong') {
        if (badge) badge.textContent = 'MISTAKEN ACCUSATION';
        if (headline) headline.textContent = `False Accusation: ${r.vote.suspectName} Is Innocent`;
        if (desc) desc.textContent = 'The evidence did not support this accusation. The true culprit remains hidden among us; complete the investigation at Blackthorn House.';
      } else {
        if (badge) badge.textContent = 'DIVIDED COUNCIL';
        if (headline) headline.textContent = 'Divided Deliberation: No Consensus';
        if (desc) desc.textContent = 'The detectives could not reach a unanimous accusation within the allotted time. The culprit remains hidden.';
      }

      if (tallyList) {
        tallyList.replaceChildren();
        if (r.vote.tally) {
          Object.entries(r.vote.tally).forEach(([pName, count]) => {
            const chip = document.createElement('span');
            chip.className = 'tally-chip';
            chip.textContent = `${pName}: ${count} vote${count === 1 ? '' : 's'}`;
            tallyList.append(chip);
          });
        }
      }
    } else {
      outcomeCard.classList.add('hidden');
    }
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

let lastResultsRound = -1;

function updateResults(r, me) {
  const show = r.phase === 'results';
  const card = $('result-card');
  card.classList.toggle('hidden', !show);

  const sidePanel = $('side-panel');
  if (sidePanel) sidePanel.classList.toggle('has-results-active', show);

  if (!show) {
    lastResultsRound = -1;
    return;
  }

  const isCoopPortraitWin = r.result?.reason === 'portrait_assembled' || r.portrait?.assembled || r.result?.winner === 'detectives';
  const solved = Boolean(r.result?.caseSolved || isCoopPortraitWin);
  card.classList.toggle('is-victory', solved);
  card.classList.toggle('is-defeat', !solved);

  // Subtle procedural sound cue upon initial reveal
  if (lastResultsRound !== r.round) {
    lastResultsRound = r.round;
    playOutcomeChime(solved);
  }

  // Stamp and Masthead
  const stamp = $('result-stamp');
  if (stamp) {
    stamp.textContent = r.matchComplete ? 'MATCH OVER' : (solved ? 'CASE SOLVED' : 'UNSOLVED');
    stamp.classList.toggle('result-stamp--fail', !solved);
    stamp.classList.toggle('result-stamp--solved', solved);
  }

  const kicker = $('result-kicker');
  if (kicker) {
    kicker.innerHTML = isCoopPortraitWin
      ? '<span class="eyebrow-accent">✦</span> THE PHANTOM THIEF UNMASKED · COOPERATIVE VICTORY <span class="eyebrow-accent">✦</span>'
      : (solved
        ? '<span class="eyebrow-accent">✦</span> SCOTLAND YARD FINAL REPORT · CASE SOLVED <span class="eyebrow-accent">✦</span>'
        : '<span class="eyebrow-accent">✦</span> SCOTLAND YARD INCIDENT REPORT · CULPRIT AT LARGE <span class="eyebrow-accent">✦</span>');
  }

  const newspaperBanner = $('newspaper-banner');
  if (newspaperBanner) {
    newspaperBanner.textContent = solved ? 'CAPTURED!' : 'ELUDED!';
    if (isCoopPortraitWin) newspaperBanner.textContent = 'CASE SOLVED!';
  }

  // Title
  const winners = r.result?.matchWinnerNames || [];
  const title = $('result-title');
  if (title) {
    if (r.matchComplete) {
      title.textContent = winners.length === 1 ? `${winners[0]} wins Watson’s casebook.` : `Joint winners: ${winners.join(' & ')}.`;
    } else {
      title.textContent = solved ? 'CASE SOLVED' : 'CASE UNSOLVED';
    }
  }

  // Subheading / Copy
  const copy = $('result-copy');
  if (copy) {
    copy.textContent = isCoopPortraitWin
      ? 'All 6 missing fragments recovered! The detective team assembled the complete portrait and unmasked the thief.'
      : `Round ${r.round} of ${r.totalRounds} · ${r.result?.caseOutcome || ''}`;
  }

  // Failure Explanation Box (Shown only in defeat)
  const failureBox = $('result-failure-box');
  const failureHeadline = $('failure-headline');
  const failureExplanation = $('failure-explanation');
  if (failureBox) {
    failureBox.classList.toggle('hidden', solved);
    if (!solved) {
      if (r.vote?.outcome === 'wrong') {
        if (failureHeadline) failureHeadline.textContent = 'MISTAKEN ACCUSATION · INNOCENT DETECTIVE ACCUSED';
        if (failureExplanation) failureExplanation.textContent = `The detectives unanimously accused ${r.vote.suspectName || 'an innocent detective'}, allowing the true culprit to slip away into the fog.`;
      } else if (r.vote?.outcome === 'split') {
        if (failureHeadline) failureHeadline.textContent = 'DIVIDED COUNCIL · DELIBERATION TIMEOUT';
        if (failureExplanation) failureExplanation.textContent = 'The detectives could not reach a unanimous consensus within the time limit. Without an agreed lead, the culprit escaped.';
      } else if (r.result?.culpritObjectiveAchieved) {
        if (failureHeadline) failureHeadline.textContent = 'STATION SABOTAGE · DETECTIVES DELAYED';
        if (failureExplanation) failureExplanation.textContent = 'The culprit successfully jammed critical telegraph and dispatch stations, preventing the team from securing the evidence trail in time.';
      } else {
        if (failureHeadline) failureHeadline.textContent = 'CULPRIT EVADED CAPTURE';
        if (failureExplanation) failureExplanation.textContent = 'The culprit escaped custody and vanished into the shadows before the safehouse trap could be sprung.';
      }
    }
  }

  // Canonical Truth
  const truthEl = $('result-truth');
  if (truthEl) {
    truthEl.textContent = isCoopPortraitWin
      ? 'The Phantom Thief Edward Blackthorn was unmasked through all 6 forensic picture fragments assembled by the cooperative detective team.'
      : (r.result?.truth || '');
  }

  // Suspect / Culprit Placard
  const placardBadge = $('placard-badge');
  const placardName = $('placard-name');
  const placardDesc = $('placard-desc');
  if (isCoopPortraitWin) {
    if (placardBadge) placardBadge.textContent = 'UNMASKED';
    if (placardName) placardName.textContent = 'Edward Blackthorn';
    if (placardDesc) placardDesc.textContent = 'Mastermind of the London Art Heists, unmasked by the cooperative detective team at Headquarters.';
  } else if (r.result?.culpritName) {
    if (placardBadge) placardBadge.textContent = solved ? 'CAPTURED' : 'AT LARGE';
    if (placardName) placardName.textContent = r.result.culpritName;
    if (placardDesc) placardDesc.textContent = solved
      ? 'Cornered and taken into custody at Blackthorn Safehouse.'
      : 'Slipped past the police cordon and escaped into the London fog.';
  } else {
    if (placardBadge) placardBadge.textContent = 'CONSPIRACY EXPOSED';
    if (placardName) placardName.textContent = 'Inspector Elias Vale';
    if (placardDesc) placardDesc.textContent = 'The Yard dispatch forgery was exposed; Holmes’s authentic ledger secured.';
  }

  // Evidence Summary
  const evidenceSummary = $('result-evidence-summary');
  if (evidenceSummary) {
    evidenceSummary.replaceChildren();
    const clues = r.clues || [];
    if (clues.length === 0) {
      const chip = document.createElement('span');
      chip.className = 'evidence-pill';
      chip.textContent = 'No physical exhibits secured.';
      evidenceSummary.append(chip);
    } else {
      for (const clue of clues) {
        const chip = document.createElement('span');
        chip.className = 'evidence-pill';
        chip.textContent = `✓ ${clue.title}`;
        evidenceSummary.append(chip);
      }
    }
  }

  // Personal Tracked Contributions
  const award = r.result?.roundAwards?.find((entry) => entry.playerId === me.id);
  const ptsBadge = $('personal-points-badge');
  if (ptsBadge) {
    ptsBadge.textContent = `+${award?.pointsEarned ?? 0} PTS`;
  }

  const breakdown = award?.notes?.length ? award.notes.join(' · ') : 'No bonus points recorded this round.';
  $('round-score').textContent = `Your round performance: ${award?.pointsEarned ?? 0} points earned. ${breakdown}`;

  const personalNotesList = $('personal-notes-list');
  if (personalNotesList) {
    personalNotesList.replaceChildren();
    if (award?.notes?.length) {
      award.notes.forEach((note) => {
        const noteChip = document.createElement('span');
        noteChip.className = 'note-chip';
        noteChip.textContent = `✓ ${note}`;
        personalNotesList.append(noteChip);
      });
    }
  }

  // Case Rewards
  const rewardXp = $('reward-xp');
  if (rewardXp) rewardXp.textContent = solved ? '+350 XP' : '+150 XP';
  const rewardBounty = $('reward-bounty');
  if (rewardBounty) rewardBounty.textContent = solved ? '125 £' : '40 £';
  const rewardBadge = $('reward-badge');
  if (rewardBadge) rewardBadge.textContent = solved ? 'TRUTH SEEKER' : 'VIGILANT EYE';

  // Tournament Scoreboard
  const standingsRound = $('standings-round-label');
  if (standingsRound) {
    standingsRound.textContent = `ROUND ${r.round} OF ${r.totalRounds}`;
  }

  const board = $('scoreboard');
  board.replaceChildren();
  for (const [index, entry] of (r.result?.scoreboard || []).entries()) {
    const row = document.createElement('li');
    const isWinner = r.matchComplete && r.result?.matchWinnerNames?.includes(entry.name);
    const label = document.createElement('span');
    label.innerHTML = `${isWinner ? '👑 ' : ''}${index + 1}. ${escapeHtml(entry.name)}${entry.playerId === me.id ? ' <strong>(you)</strong>' : ''}`;
    const points = document.createElement('b');
    points.textContent = `${entry.score} pts`;
    row.append(label, points);
    board.append(row);
  }

  // Action Buttons: Rematch (Host only) vs Waiting notice
  const rematchBtn = $('rematch');
  const waitingBox = $('waiting-host-box');
  if (rematchBtn) {
    rematchBtn.classList.toggle('hidden', !me.isHost);
    rematchBtn.innerHTML = r.matchComplete ? 'Start a new match <span>↻</span>' : 'Next round <span>→</span>';
  }
  if (waitingBox) {
    waitingBox.classList.toggle('hidden', me.isHost);
  }
}

function updateTrapUi(r, me) {
  const active = r.phase === 'capture';
  const trapCard = $('trap-card');
  if (trapCard) trapCard.classList.toggle('hidden', !active);
  if (!active) return;
  const capture = r.capture || { progress: 0, total: 3, next: 'lever', mechanisms: [] };
  const trapProgress = $('trap-progress');
  if (trapProgress) trapProgress.textContent = `${capture.progress} / ${capture.total} SET`;
  const atSafehouse = Math.hypot(me.x - 484, me.y - 552) <= 82;
  const nextLabel = ({ lever: 'Pull lever', valve: 'Turn valve', key: 'Insert key' })[capture.next] || 'Trap set';
  const trapCopy = $('trap-copy');
  if (trapCopy) {
    trapCopy.textContent = me.role === 'culprit'
      ? 'The detectives have identified you as the thief! Flee towards Blackthorn Safehouse and evade the trap.'
      : atSafehouse
        ? `${capture.progress} of 3 mechanisms are set. Next: ${nextLabel}. Different detectives must coordinate each step.`
        : 'Move to Blackthorn Safehouse to corner the thief and coordinate the 3-step trap (lever, valve, key).';
  }
  const activeDets = (r.players || []).filter((p) => p.role === 'detective' && p.connected && !p.dropped);
  const alreadyOperated = activeDets.length >= 3
    ? capture.mechanisms.some((entry) => entry.playerId === me.id)
    : capture.mechanisms.length > 0 && capture.mechanisms[capture.mechanisms.length - 1].playerId === me.id;

  for (const mechanism of ['lever', 'valve', 'key']) {
    const used = capture.mechanisms.some((entry) => entry.mechanism === mechanism);
    const button = $(`trap-${mechanism}`);
    if (button) {
      button.classList.toggle('is-ready', used);
      button.disabled = me.role !== 'detective' || me.incapacitated || !atSafehouse || mechanism !== capture.next || alreadyOperated;
    }
  }
}

let cinematicBannerDismissTimer = null;
let lastReunionReady = false;

function updateReunionUi(r, me) {
  const active = r.phase === 'reunion';
  const card = $('reunion-card');
  if (card) card.classList.toggle('hidden', !active);
  const cinematicBanner = $('cinematic-reunion-banner');

  if (!active) {
    if (cinematicBanner) cinematicBanner.classList.add('hidden');
    lastReunionReady = false;
    return;
  }

  const reunion = r.reunion || {
    ready: false,
    arrivedCount: 0,
    totalCount: (r.players || []).length,
    players: [],
  };

  const progress = $('reunion-progress');
  if (progress) progress.textContent = `${reunion.arrivedCount} / ${reunion.totalCount} REUNITED`;

  const copy = $('reunion-copy');
  if (copy) {
    copy.textContent = me.role === 'culprit'
      ? 'You have been taken into custody. Walk to Blackthorn Safehouse door to conclude the case with the detectives.'
      : 'The thief is in custody! Escort them to Blackthorn Safehouse door. Every active investigator must assemble before closing the case.';
  }

  const list = $('reunion-status-list');
  if (list) {
    list.replaceChildren();
    const playerList = reunion.players.length ? reunion.players : (r.players || []).map((p) => ({
      id: p.id,
      name: p.name,
      character: p.character,
      role: p.role,
      captured: Boolean(p.captured),
      arrived: Boolean(p.atSafehouse || p.safehouse),
      distance: p.safehouseDist ?? Math.round(Math.hypot(p.x - 484, p.y - 552)),
      status: (p.atSafehouse || p.safehouse) ? 'arrived' : 'en_route',
    }));

    for (const player of playerList) {
      const row = document.createElement('div');
      row.className = `reunion-player-row ${player.arrived ? 'is-arrived' : ''}`;

      const info = document.createElement('div');
      info.className = 'reunion-player-info';

      const avatar = document.createElement('div');
      const isThief = player.role === 'culprit' || player.captured;
      avatar.className = `reunion-player-avatar ${isThief ? 'avatar--thief' : ''}`;
      avatar.textContent = initials(player.name);

      const meta = document.createElement('div');
      meta.className = 'reunion-player-meta';

      const nameEl = document.createElement('span');
      nameEl.className = 'reunion-player-name';
      nameEl.textContent = player.name + (player.id === me.id ? ' (You)' : '');

      const roleEl = document.createElement('span');
      roleEl.className = `reunion-player-role ${isThief ? 'role--thief' : ''}`;
      roleEl.textContent = isThief ? 'The Thief · In Custody' : 'Detective';

      meta.append(nameEl, roleEl);
      info.append(avatar, meta);

      const badge = document.createElement('span');
      badge.className = `arrival-badge ${player.arrived ? 'arrival-badge--arrived' : 'arrival-badge--en-route'}`;
      badge.textContent = player.arrived ? '✓ At Safehouse' : `En Route (${player.distance}m)`;

      row.append(info, badge);
      list.append(row);
    }
  }

  const completeBanner = $('reunion-complete-banner');
  if (completeBanner) {
    completeBanner.classList.toggle('hidden', !r.reunionReady);
  }

  // Trigger cinematic reunion celebration banner once when all players are assembled
  if (r.reunionReady && !lastReunionReady) {
    lastReunionReady = true;
    if (typeof playSafehouseAssembleChime === 'function') playSafehouseAssembleChime();
    if (cinematicBanner) {
      cinematicBanner.classList.remove('hidden');
      if (cinematicBannerDismissTimer) clearTimeout(cinematicBannerDismissTimer);
      cinematicBannerDismissTimer = setTimeout(() => {
        if (cinematicBanner) cinematicBanner.classList.add('hidden');
      }, 7000);
    }
  } else if (!r.reunionReady) {
    lastReunionReady = false;
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

  const mansion = r.mansion || {};
  const gateDist = Math.hypot(me.x - 480, me.y - 555);
  const nearGate = gateDist <= 55 && !mansion.gateOpen;
  const clockDist = Math.hypot(me.x - 515, me.y - 575);
  const nearClock = clockDist <= 52 && !mansion.clockSolved;
  const libDist = Math.hypot(me.x - 445, me.y - 575);
  const nearLib = libDist <= 52 && !mansion.librarySolved;
  const basementDist = Math.hypot(me.x - 480, me.y - 585);
  const nearBasement = basementDist <= 52 && !mansion.basementSolved;
  const portraitDist = Math.hypot(me.x - 480, me.y - 595);
  const nearPortrait = portraitDist <= 55 && mansion.secretDoorOpen && !mansion.thiefAddedToCasebook;

  const mansionPrompt = nearGate
    ? 'Open Gate'
    : nearClock
      ? 'Inspect Grandfather Clock'
      : nearLib
        ? 'Examine Library Books'
        : nearBasement
          ? 'Solve Basement Mechanism'
          : nearPortrait
            ? 'Examine Thief’s Portrait'
            : null;

  const contextualLabel = target
    ? target.category === 'footprints'
      ? 'Examine Muddy Footprints'
      : target.category === 'fabric'
        ? 'Inspect Torn Fabric Sample'
        : target.category === 'photograph'
          ? 'Examine Crime Scene Photograph'
          : target.category === 'key'
            ? 'Inspect Antique Skeleton Key'
            : target.category === 'fingerprints'
              ? 'Dust Latent Fingerprint'
              : target.category === 'witness'
                ? 'Examine Witness Cab Ledger'
                : target.mission === 'reunion'
                  ? (r.portrait?.allCollected ? 'Assemble Thief Portrait at Headquarters' : 'Inspect Investigation Board')
                  : `Examine ${target.label}`
    : null;

  const canInteract = canUseTarget || canRescue || Boolean(mansionPrompt);
  $('interact').disabled = !active || r.phase === 'capture' || me.incapacitated || me.eliminated || !canInteract;
  $('interact').innerHTML = canRescue
    ? `<span>✚</span> Rescue`
    : mansionPrompt
      ? `<span>⌕</span> ${mansionPrompt}`
      : target?.mission === 'reunion'
        ? (r.portrait?.allCollected ? `<span>✨</span> Assemble Portrait` : `<span>📋</span> Investigation Board`)
        : `<span>⌕</span> ${contextualLabel || 'Examine'}`;

  const canUseKey = !me.incapacitated && !me.eliminated && r.phase !== 'capture' && (canRescue || (active && canInteract));
  $('interaction-keycap')?.classList.toggle('hidden', !canUseKey);
  const promptCard = $('hud-interaction-card');
  if (promptCard) promptCard.classList.toggle('hidden', !canUseKey);

  const pieceInfo = target ? PORTRAIT_PIECES[target.id] : null;
  const isPieceCollected = pieceInfo && (r.portrait?.collectedPieces || []).includes(pieceInfo.id);
  const promptBadge = promptCard?.querySelector('.prompt-badge');

  if (target?.mission === 'reunion') {
    if (promptBadge) promptBadge.textContent = r.portrait?.allCollected ? 'FINAL TASK' : 'INVESTIGATE';
    if ($('interaction-hint')) $('interaction-hint').textContent = r.portrait?.allCollected ? 'Press E to assemble thief portrait' : 'Press E to examine investigation board';
  } else if (isPieceCollected) {
    if (promptBadge) promptBadge.textContent = 'CLUE RECOVERED';
    if ($('interaction-hint')) $('interaction-hint').textContent = 'Portrait piece added to team collection.';
  } else if (target) {
    if (promptBadge) promptBadge.textContent = 'INVESTIGATE';
    if ($('interaction-hint')) $('interaction-hint').textContent = 'Press E to examine';
  } else {
    if (promptBadge) promptBadge.textContent = 'INVESTIGATE';
    if ($('interaction-hint')) $('interaction-hint').textContent = 'Stand near a marked station to investigate.';
  }
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
  if (!view || !view.room) return null;
  const points = view.room.points || [];
  const mission = view.room.missions || {};
  return points.map((p) => ({ ...p, distance: distance(me, p) }))
    .filter((p) => p.distance <= (p.mission === 'reunion' ? 95 : 85))
    .filter((p) => {
      if (p.mission === 'reunion') return true;
      if (PORTRAIT_PIECES[p.id]) return true;
      if (p.category && !p.mission) return true;
      if (p.mission === 'letter') return !mission.letter?.done && !mission.letter?.parts?.[p.part];
      if (p.mission === 'cipher') return mission.letter?.done && !mission.cipher?.done;
      if (p.mission === 'telegraph') return mission.cipher?.done && !mission.telegraph?.done && !mission.telegraph?.parts?.[p.part];
      return true;
    })
    .sort((a, b) => a.distance - b.distance)[0] || null;
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function initials(name) { return name.split(/\s+/).map((word) => word[0] || '').join('').slice(0, 2).toUpperCase(); }

let touchSprinting = false;

function moveVector() {
  let x = 0, y = 0;
  if (keys.has('ArrowLeft') || keys.has('a')) x--;
  if (keys.has('ArrowRight') || keys.has('d')) x++;
  if (keys.has('ArrowUp') || keys.has('w')) y--;
  if (keys.has('ArrowDown') || keys.has('s')) y++;
  x += touchMove.x;
  y += touchMove.y;
  const isSprint = keys.has('Shift') || keys.has('shift') || touchSprinting;
  const speedMult = isSprint ? 1.6 : 1.0;
  const magnitude = Math.hypot(x, y);
  if (magnitude > 0) {
    x = (x / Math.max(magnitude, 1)) * speedMult;
    y = (y / Math.max(magnitude, 1)) * speedMult;
  }
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
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawCompass();
    return;
  }
  for (const location of (view.room.locations || [])) drawLocation(location, view.room.phase);
  for (const point of (view.room.points || [])) drawPoint(point);
  const currentIds = new Set();
  for (const p of (view.room.players || [])) {
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
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawCompass();
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

function drawPlayer(player, me) {
  if (world) {
    const projected = world.projectGame(player.x, player.y, 0.9);
    if (!projected?.visible) return;
    const isMe = player.id === me?.id;
    ctx.save();
    ctx.translate(projected.x, projected.y);
    if (isMe) {
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(201, 164, 92, 0.25)';
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  const isMe = player.id === me?.id;
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.beginPath();
  ctx.arc(0, 0, isMe ? 12 : 9, 0, Math.PI * 2);
  ctx.fillStyle = isMe ? 'rgba(201, 164, 92, 0.35)' : 'rgba(0, 0, 0, 0.4)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, isMe ? 7 : 5, 0, Math.PI * 2);
  ctx.fillStyle = isMe ? '#f4d389' : player.character === 'girl' ? '#b67a5d' : '#788276';
  ctx.fill();
  ctx.strokeStyle = '#080e15';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (player.name) {
    ctx.font = 'bold 10px Cinzel, serif';
    ctx.fillStyle = isMe ? '#ffd584' : '#d8c7a4';
    ctx.textAlign = 'center';
    ctx.fillText(player.name, 0, isMe ? -15 : -11);
  }
  ctx.restore();
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
  const distanceUnits = distWorld(me, p);
  const distanceMeters = Math.max(1, Math.round(distanceUnits * 0.45));
  if (world) {
    const projected = world.projectGame(p.x, p.y, 0.45);
    if (!projected?.visible) return;
    p = { ...p, x: projected.x, y: projected.y };
  }
  const jammed = room.sabotage?.mission === p.mission && room.sabotage.until > Date.now();
  const nearby = distanceUnits < 52;
  const time = Date.now() / 460;
  const radius = 16 + Math.sin(time) * 2.5;

  ctx.save();
  const glow = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, radius * 2.6);
  glow.addColorStop(0, jammed ? 'rgba(235, 75, 60, 0.45)' : 'rgba(244, 180, 94, 0.4)');
  glow.addColorStop(0.5, jammed ? 'rgba(235, 75, 60, 0.15)' : 'rgba(201, 164, 92, 0.12)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow; ctx.fillRect(p.x - radius * 2.6, p.y - radius * 2.6, radius * 5.2, radius * 5.2);

  // Outer pulse ring
  ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = jammed ? 'rgba(244, 110, 90, 0.85)' : nearby ? 'rgba(255, 235, 185, 0.95)' : 'rgba(244, 180, 94, 0.72)';
  ctx.lineWidth = nearby ? 2 : 1.2;
  ctx.setLineDash(nearby ? [] : [3, 4]); ctx.stroke(); ctx.setLineDash([]);

  // Central floating diamond
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4 + Math.sin(time * 0.8) * 0.1);
  ctx.fillStyle = jammed ? '#f1624f' : '#f8ce78';
  ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 14;
  ctx.fillRect(-5, -5, 10, 10); ctx.restore();

  // Floating waypoint placard with distance
  const mainLabel = jammed ? 'JAMMED · CLEAR' : nearby ? `EXAMINE · ${p.label.toUpperCase()}` : p.label.toUpperCase();
  const subLabel = nearby ? 'PRESS [E]' : `${distanceMeters} m`;
  ctx.font = '600 10px Cinzel, Georgia, serif';
  const mainWidth = ctx.measureText(mainLabel).width;
  ctx.font = '600 8px var(--mono)';
  const subWidth = ctx.measureText(subLabel).width;
  const cardWidth = Math.max(mainWidth, subWidth) + 24;
  const cardHeight = 27;
  const cardTop = p.y - 42;

  ctx.fillStyle = 'rgba(8, 14, 22, 0.92)';
  roundedRect(ctx, p.x - cardWidth / 2, cardTop, cardWidth, cardHeight, 3);
  ctx.fill();
  ctx.strokeStyle = jammed ? 'rgba(235, 80, 60, 0.75)' : nearby ? 'rgba(244, 211, 137, 0.9)' : 'rgba(201, 164, 92, 0.5)';
  ctx.lineWidth = 1; ctx.stroke();

  // Text inside placard
  ctx.font = '600 9px Cinzel, Georgia, serif';
  ctx.fillStyle = jammed ? '#ff8e7d' : nearby ? '#ffe7b3' : '#e6d3af';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(mainLabel, p.x, cardTop + 4);

  ctx.font = '600 8px var(--mono)';
  ctx.fillStyle = jammed ? '#fca597' : '#c9a45c';
  ctx.fillText(subLabel, p.x, cardTop + 16);

  ctx.restore();
}

function distWorld(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function drawCompass() {
  if (!view || !view.room || !view.me) return;
  const yaw = world?.getYaw?.() || 0;
  const centerX = 56;
  const centerY = 82;
  const radius = 34;

  ctx.save();
  ctx.translate(centerX, centerY);

  // Outer dark background & drop shadow
  ctx.fillStyle = 'rgba(8, 14, 22, 0.88)';
  ctx.beginPath(); ctx.arc(0, 0, radius + 2, 0, Math.PI * 2); ctx.fill();

  // Ornate double antique gold brass bezel
  ctx.strokeStyle = 'rgba(201, 164, 92, 0.72)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(244, 211, 137, 0.35)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.arc(0, 0, radius - 4, 0, Math.PI * 2); ctx.stroke();

  // Radar range ring
  ctx.strokeStyle = 'rgba(100, 140, 160, 0.18)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.arc(0, 0, radius * 0.55, 0, Math.PI * 2); ctx.stroke();

  // Fine crosshairs
  ctx.strokeStyle = 'rgba(201, 164, 92, 0.15)';
  ctx.beginPath(); ctx.moveTo(-radius + 5, 0); ctx.lineTo(radius - 5, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -radius + 5); ctx.lineTo(0, radius - 5); ctx.stroke();

  const me = view.me;

  // Real teammate blips on radar
  for (const player of view.room.players) {
    if (player.id === me.id || !player.connected || player.eliminated) continue;
    const dx = player.x - me.x;
    const dy = player.y - me.y;
    const angle = Math.atan2(dy, dx) - yaw + Math.PI / 2;
    const d = Math.hypot(dx, dy);
    const dist = Math.min(radius - 5, Math.max(5, d * 0.12));
    const px = Math.sin(angle) * dist;
    const py = -Math.cos(angle) * dist;
    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = player.incapacitated ? '#ff6655' : '#55ccee';
    ctx.fill();
  }

  // Active Lead Marker relative to player
  const target = nearestPoint(me);
  if (target) {
    const dx = target.x - me.x;
    const dy = target.y - me.y;
    const targetAngle = Math.atan2(dy, dx) - yaw + Math.PI / 2;
    const markerDistance = Math.min(radius - 6, Math.max(10, distWorld(me, target) * 0.12));
    const mx = Math.sin(targetAngle) * markerDistance;
    const my = -Math.cos(targetAngle) * markerDistance;

    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#f4b45e';
    ctx.shadowColor = '#f4b45e'; ctx.shadowBlur = 8;
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  }

  // Rotating Cardinal Directions
  ctx.save();
  ctx.rotate(-yaw);
  const cardinals = [
    { text: 'N', angle: 0, color: '#f4d389', bold: true },
    { text: 'E', angle: Math.PI / 2, color: '#c9a45c', bold: false },
    { text: 'S', angle: Math.PI, color: '#a89474', bold: false },
    { text: 'W', angle: -Math.PI / 2, color: '#c9a45c', bold: false },
  ];
  for (const c of cardinals) {
    ctx.save();
    ctx.rotate(c.angle);
    ctx.font = c.bold ? '700 8px Cinzel, Georgia, serif' : '600 7px Cinzel, Georgia, serif';
    ctx.fillStyle = c.color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(c.text, 0, -radius + 8);
    ctx.restore();
  }
  ctx.restore();

  // Central Player Indicator Arrow
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(4, 4);
  ctx.lineTo(0, 1.5);
  ctx.lineTo(-4, 4);
  ctx.closePath();
  ctx.fillStyle = '#f4d389';
  ctx.shadowColor = '#f4b45e'; ctx.shadowBlur = 8;
  ctx.fill();

  ctx.restore();

  // Update DOM Circular Compass Minimap needle
  const needleEl = $('compass-needle');
  if (needleEl) {
    needleEl.style.transform = `rotate(${-yaw * (180 / Math.PI)}deg)`;
  }

  // Update Floating 3D Gold Objective Beacon Overlay (Panel 2 Art Reference)
  const beaconEl = $('hud-beacon-distance');
  const beaconMeters = $('beacon-meters');
  if (beaconEl && world) {
    const portrait = view.room.portrait || { totalPieces: 6, collectedPieces: [], allCollected: false };
    const pCount = portrait.collectedPieces?.length || 0;
    let targetX = points.reunion.x, targetY = points.reunion.y;
    let targetLabel = 'Blackthorn Safehouse';

    if (portrait.allCollected || pCount >= 6) {
      targetX = points.reunion.x;
      targetY = points.reunion.y;
      targetLabel = 'Blackthorn Safehouse';
    } else {
      const nearest = getNearestUncollectedStation(me, view.room);
      if (nearest) {
        targetX = nearest.pt.x;
        targetY = nearest.pt.y;
        targetLabel = nearest.pt.label;
      }
    }

    world.setBeaconTarget(targetX, targetY);
    const dUnits = Math.hypot(me.x - targetX, me.y - targetY);
    const meters = Math.max(5, Math.round(dUnits * 0.95));
    if (beaconMeters) beaconMeters.textContent = `${targetLabel} · ${meters} m`;

    const proj = world.projectGame(targetX, targetY, 1.45);
    if (proj?.visible && ['investigation', 'reunion', 'capture'].includes(view.room.phase)) {
      beaconEl.classList.remove('hidden');
      beaconEl.style.left = `${proj.x}px`;
      beaconEl.style.top = `${proj.y}px`;
    } else {
      beaconEl.classList.add('hidden');
    }
  }
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath(); context.roundRect(x, y, width, height, radius);
}

function showTutorial() {
  const tut = $('tutorial');
  if (tut) {
    tut.classList.remove('hidden');
    tut.style.removeProperty('display');
    tut.style.removeProperty('pointer-events');
  }
  setTutorialMinimized(false);
  sessionStorage.setItem('shadows-tutorial-seen', 'true');
  localStorage.setItem('shadows-tutorial-seen', 'true');
  tutorialIndex = 0;
  renderTutorialStep();
}

function renderTutorialStep() {
  const step = TUTORIAL_STEPS[tutorialIndex];
  if (!step) { closeTutorial(); return; }
  const tut = $('tutorial');
  if (tut) {
    tut.classList.remove('hidden');
    tut.style.removeProperty('display');
  }
  if ($('tutorial-counter')) $('tutorial-counter').textContent = `COOPERATIVE GUIDE · STEP ${tutorialIndex + 1} OF ${TUTORIAL_STEPS.length}`;
  if ($('tutorial-title')) $('tutorial-title').textContent = step.title;
  if ($('tutorial-copy')) $('tutorial-copy').textContent = step.copy;
  if ($('tutorial-hint')) $('tutorial-hint').textContent = step.hint;
  if ($('tutorial-next')) {
    $('tutorial-next').textContent = step.final ? 'Start Investigating →' : 'Next Step →';
    $('tutorial-next').disabled = false;
  }
  if ($('tutorial-min-label')) $('tutorial-min-label').textContent = `Investigation Guide (Step ${tutorialIndex + 1}/${TUTORIAL_STEPS.length})`;
}

function advanceTutorial(action) {
  const step = TUTORIAL_STEPS[tutorialIndex];
  if (!step || step.trigger !== action) return;
  tutorialIndex++;
  if (tutorialIndex >= TUTORIAL_STEPS.length) {
    closeTutorial();
  } else {
    renderTutorialStep();
  }
}

function closeTutorial() {
  const tut = $('tutorial');
  if (tut) {
    tut.classList.add('hidden');
    tut.style.setProperty('display', 'none', 'important');
    tut.style.setProperty('pointer-events', 'none', 'important');
  }
  tutorialIndex = -1;
  setTutorialMinimized(false);
  sessionStorage.setItem('shadows-tutorial-seen', 'true');
  localStorage.setItem('shadows-tutorial-seen', 'true');
}

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
  const code = local.code || view?.room?.code || '';
  try {
    await navigator.clipboard.writeText(code);
    const feedback = $('lobby-copy-feedback');
    if (feedback) {
      feedback.classList.remove('hidden');
      setTimeout(() => feedback.classList.add('hidden'), 2500);
    }
    showToast(`Telegraph code ${code} copied!`);
    $('lobby-hint').textContent = `Room code ${code} copied. Send it to your friends.`;
  }
  catch {
    $('lobby-hint').textContent = `Share room code ${code} with your friends.`;
    showToast(`Share room code: ${code}`);
  }
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
$('open-casebook')?.addEventListener('click', () => setCasebookOpen(!casebookOpen));
$('close-casebook')?.addEventListener('click', () => setCasebookOpen(false));
initializeCasebookDesk();
$('interact').addEventListener('click', beginInteraction);
$('role-action').addEventListener('click', () => act('sabotage'));
$('vote-submit').addEventListener('click', () => { if ($('vote-target').value) act('vote', { target: $('vote-target').value }); });
$('rematch').addEventListener('click', () => act('rematch'));
$('result-return-lobby')?.addEventListener('click', leaveRoom);
$('result-main-menu')?.addEventListener('click', leaveRoom);
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
$('board-close')?.addEventListener('click', () => $('investigation-board-modal')?.classList.add('hidden'));
$('investigation-board-modal')?.addEventListener('click', (event) => { if (event.target === $('investigation-board-modal')) $('investigation-board-modal')?.classList.add('hidden'); });
$('team-portrait-hud')?.addEventListener('click', openInvestigationBoardModal);
$('leave-game').addEventListener('click', (event) => {
  event.preventDefault(); leaveRoom();
});

// Event Listeners for 3D Mansion Puzzle Modals (Panels 5, 6, 9)
$('clock-puzzle-close')?.addEventListener('click', closeClockPuzzle);
$('clock-hour-down')?.addEventListener('click', () => setClockHour(currentClockHour - 1));
$('clock-hour-up')?.addEventListener('click', () => setClockHour(currentClockHour + 1));
$('clock-confirm')?.addEventListener('click', submitClockPuzzle);
$('clock-reset')?.addEventListener('click', resetClockPuzzle);
$('clock-hint-btn')?.addEventListener('click', toggleClockHint);
$('clock-puzzle-modal')?.addEventListener('click', (event) => {
  if (event.target === $('clock-puzzle-modal')) closeClockPuzzle();
});

$('library-puzzle-close')?.addEventListener('click', closeLibraryPuzzle);
document.querySelectorAll('.library-book-btn').forEach((btn) => {
  btn.addEventListener('click', () => toggleLibraryBook(Number(btn.dataset.book)));
});
$('library-submit')?.addEventListener('click', submitLibraryPuzzle);
$('library-reset')?.addEventListener('click', resetLibraryPuzzle);
$('library-hint-btn')?.addEventListener('click', toggleLibraryHint);
$('library-puzzle-modal')?.addEventListener('click', (event) => {
  if (event.target === $('library-puzzle-modal')) closeLibraryPuzzle();
});

// Basement Mechanism Puzzle Event Listeners (Panel 11 Art Reference)
$('basement-puzzle-close')?.addEventListener('click', closeBasementPuzzle);
document.querySelectorAll('.dial-arrow').forEach((btn) => {
  btn.addEventListener('click', () => {
    rotateCryptexDial(Number(btn.dataset.dial), Number(btn.dataset.dir));
  });
});
document.querySelectorAll('.cryptex-dial-unit').forEach((unit) => {
  unit.addEventListener('click', (e) => {
    if (e.target.classList.contains('dial-arrow')) return;
    activeCryptexDial = Number(unit.dataset.dialIndex) || 0;
    updateCryptexDisplay();
  });
});
$('basement-submit')?.addEventListener('click', submitBasementPuzzle);
$('basement-reset')?.addEventListener('click', resetBasementPuzzle);
$('basement-hint-btn')?.addEventListener('click', toggleBasementHint);
$('basement-puzzle-modal')?.addEventListener('click', (event) => {
  if (event.target === $('basement-puzzle-modal')) closeBasementPuzzle();
});

// Mini-Game 1: Lock Picking Event Listeners
$('lockpick-close')?.addEventListener('click', closeLockpickModal);
$('lockpick-modal')?.addEventListener('click', (event) => {
  if (event.target === $('lockpick-modal')) closeLockpickModal();
});
$('lockpick-submit')?.addEventListener('click', submitLockpick);
$('lockpick-reset')?.addEventListener('click', resetLockpick);
$('lockpick-hint-btn')?.addEventListener('click', toggleLockpickHint);
$('lockpick-turn-left')?.addEventListener('click', () => rotateLockpickRing(-1));
$('lockpick-turn-right')?.addEventListener('click', () => rotateLockpickRing(1));
document.querySelectorAll('.ring-select-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    activeLockpickRing = Number(btn.dataset.selectRing) || 0;
    updateLockpickDisplay();
  });
});
document.querySelectorAll('.lock-ring').forEach((ring) => {
  ring.addEventListener('click', () => {
    activeLockpickRing = Number(ring.dataset.ring) || 0;
    updateLockpickDisplay();
  });
});

// Mini-Game 2: Photograph Reconstruction Event Listeners
$('photo-puzzle-close')?.addEventListener('click', closePhotoReconstructModal);
$('photoreconstruct-modal')?.addEventListener('click', (event) => {
  if (event.target === $('photoreconstruct-modal')) closePhotoReconstructModal();
});
$('photo-submit')?.addEventListener('click', submitPhotoReconstruct);
$('photo-reset')?.addEventListener('click', resetPhotoReconstruct);
$('photo-hint-btn')?.addEventListener('click', togglePhotoHint);
document.querySelectorAll('.photo-slot').forEach((slot) => {
  slot.addEventListener('click', () => {
    const s = Number(slot.dataset.slot);
    if (photoSlotAssignments[s] !== null) removePhotoPieceFromSlot(s);
    else if (selectedPhotoPieceId !== null) placePhotoPieceInSlot(s);
  });
  slot.addEventListener('dragover', (e) => {
    e.preventDefault();
    slot.classList.add('is-hovered');
  });
  slot.addEventListener('dragleave', () => slot.classList.remove('is-hovered'));
  slot.addEventListener('drop', (e) => {
    e.preventDefault();
    slot.classList.remove('is-hovered');
    const pieceId = Number(e.dataTransfer.getData('text/plain'));
    if (!isNaN(pieceId)) {
      selectedPhotoPieceId = pieceId;
      placePhotoPieceInSlot(Number(slot.dataset.slot));
    }
  });
});
$('photo-pieces-tray')?.addEventListener('dragover', (e) => e.preventDefault());
$('photo-pieces-tray')?.addEventListener('drop', (e) => {
  e.preventDefault();
  const pieceId = Number(e.dataTransfer.getData('text/plain'));
  const slotIdx = photoSlotAssignments.indexOf(pieceId);
  if (slotIdx !== -1) removePhotoPieceFromSlot(slotIdx);
});

// Mini-Game 3: Secret Code Cipher Wheel Event Listeners
$('cipher-wheel-close')?.addEventListener('click', closeCipherWheelModal);
$('cipherwheel-modal')?.addEventListener('click', (event) => {
  if (event.target === $('cipherwheel-modal')) closeCipherWheelModal();
});
$('cipher-submit')?.addEventListener('click', submitCipherWheel);
$('cipher-reset')?.addEventListener('click', resetCipherWheel);
$('cipher-hint-btn')?.addEventListener('click', toggleCipherHint);
$('cipher-step-down')?.addEventListener('click', () => rotateCipherWheel(-1));
$('cipher-step-up')?.addEventListener('click', () => rotateCipherWheel(1));
$('cipher-shift-slider')?.addEventListener('input', (e) => {
  cipherShift = Number(e.target.value) || 0;
  updateCipherWheelDisplay();
  if (typeof playGearClick === 'function') playGearClick();
});

$('thief-modal-close')?.addEventListener('click', closeThiefRevealedModal);
$('thief-add-casebook')?.addEventListener('click', addThiefToCasebook);
$('thief-revealed-modal')?.addEventListener('click', (event) => {
  if (event.target === $('thief-revealed-modal')) closeThiefRevealedModal();
});

// Mobile Action Buttons (Panel 2)
$('mobile-sprint-btn')?.addEventListener('click', () => {
  touchSprinting = !touchSprinting;
  $('mobile-sprint-btn')?.classList.toggle('is-active', touchSprinting);
  if (touchSprinting) keys.add('Shift');
  else keys.delete('Shift');
});
$('mobile-examine-btn')?.addEventListener('click', beginInteraction);

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (key === 'escape') {
    if (!$('clock-puzzle-modal').classList.contains('hidden')) closeClockPuzzle();
    else if (!$('library-puzzle-modal').classList.contains('hidden')) closeLibraryPuzzle();
    else if (!$('basement-puzzle-modal')?.classList.contains('hidden')) closeBasementPuzzle();
    else if (!$('lockpick-modal')?.classList.contains('hidden')) closeLockpickModal();
    else if (!$('photoreconstruct-modal')?.classList.contains('hidden')) closePhotoReconstructModal();
    else if (!$('cipherwheel-modal')?.classList.contains('hidden')) closeCipherWheelModal();
    else if (!$('thief-revealed-modal').classList.contains('hidden')) closeThiefRevealedModal();
    else if (!$('casebook-desk').classList.contains('hidden')) setCasebookOpen(false);
    else if (!$('evidence-puzzle').classList.contains('hidden')) closeEvidencePuzzle();
    else if (!$('investigation-board-modal')?.classList.contains('hidden')) $('investigation-board-modal').classList.add('hidden');
    else if (!$('tutorial').classList.contains('hidden')) closeTutorial();
    else if (casebookOpen) setCasebookOpen(false);
    else if (!$('settings-modal').classList.contains('hidden')) closePauseSettingsMenu();
    else if (!$('character-gate').classList.contains('hidden')) cancelCharacterSelection();
    else if (!$('vote-card').classList.contains('hidden') && document.activeElement?.tagName === 'SELECT') document.activeElement.blur();
    else if (isInGameSession()) openPauseSettingsMenu(true);
    return;
  }
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

  // Active Lockpick Modal Keyboard Controls
  if (!$('lockpick-modal')?.classList.contains('hidden')) {
    if (key === 'e' || key === 'enter') { event.preventDefault(); submitLockpick(); return; }
    if (key === 'r') { event.preventDefault(); resetLockpick(); return; }
    if (key === 'h') { event.preventDefault(); toggleLockpickHint(); return; }
    if (key === 'arrowleft' || key === 'a') { event.preventDefault(); rotateLockpickRing(-1); return; }
    if (key === 'arrowright' || key === 'd') { event.preventDefault(); rotateLockpickRing(1); return; }
    if (['1', '2', '3'].includes(key)) {
      event.preventDefault();
      activeLockpickRing = Number(key) - 1;
      updateLockpickDisplay();
      return;
    }
    return;
  }

  // Active Photograph Reconstruction Modal Keyboard Controls
  if (!$('photoreconstruct-modal')?.classList.contains('hidden')) {
    if (key === 'e' || key === 'enter') { event.preventDefault(); submitPhotoReconstruct(); return; }
    if (key === 'r') { event.preventDefault(); resetPhotoReconstruct(); return; }
    if (key === 'h') { event.preventDefault(); togglePhotoHint(); return; }
    return;
  }

  // Active Cipher Wheel Modal Keyboard Controls
  if (!$('cipherwheel-modal')?.classList.contains('hidden')) {
    if (key === 'e' || key === 'enter') { event.preventDefault(); submitCipherWheel(); return; }
    if (key === 'r') { event.preventDefault(); resetCipherWheel(); return; }
    if (key === 'h') { event.preventDefault(); toggleCipherHint(); return; }
    if (key === 'arrowleft' || key === 'a') { event.preventDefault(); rotateCipherWheel(-1); return; }
    if (key === 'arrowright' || key === 'd') { event.preventDefault(); rotateCipherWheel(1); return; }
    return;
  }

  // Active Clock Puzzle Modal Keyboard Controls
  if (!$('clock-puzzle-modal').classList.contains('hidden')) {
    if (key === 'e' || key === 'enter') { event.preventDefault(); submitClockPuzzle(); return; }
    if (key === 'r') { event.preventDefault(); resetClockPuzzle(); return; }
    if (key === 'h') { event.preventDefault(); toggleClockHint(); return; }
    if (key === 'arrowleft' || key === 'a') { event.preventDefault(); setClockHour(currentClockHour - 1); return; }
    if (key === 'arrowright' || key === 'd') { event.preventDefault(); setClockHour(currentClockHour + 1); return; }
    return;
  }

  // Active Library Code Puzzle Modal Keyboard Controls
  if (!$('library-puzzle-modal').classList.contains('hidden')) {
    if (key === 'e' || key === 'enter') { event.preventDefault(); submitLibraryPuzzle(); return; }
    if (key === 'r') { event.preventDefault(); resetLibraryPuzzle(); return; }
    if (key === 'h') { event.preventDefault(); toggleLibraryHint(); return; }
    if (['1', '2', '3', '4', '5'].includes(key)) { event.preventDefault(); toggleLibraryBook(Number(key)); return; }
    return;
  }

  // Active Basement Mechanism Puzzle Keyboard Controls
  if (!$('basement-puzzle-modal')?.classList.contains('hidden')) {
    if (key === 'e' || key === 'enter') { event.preventDefault(); submitBasementPuzzle(); return; }
    if (key === 'r') { event.preventDefault(); resetBasementPuzzle(); return; }
    if (key === 'h') { event.preventDefault(); toggleBasementHint(); return; }
    if (key === 'arrowleft' || key === 'a') {
      event.preventDefault();
      activeCryptexDial = (activeCryptexDial - 1 + 4) % 4;
      updateCryptexDisplay();
      return;
    }
    if (key === 'arrowright' || key === 'd') {
      event.preventDefault();
      activeCryptexDial = (activeCryptexDial + 1) % 4;
      updateCryptexDisplay();
      return;
    }
    if (key === 'arrowup' || key === 'w') {
      event.preventDefault();
      rotateCryptexDial(activeCryptexDial, -1);
      return;
    }
    if (key === 'arrowdown' || key === 's') {
      event.preventDefault();
      rotateCryptexDial(activeCryptexDial, 1);
      return;
    }
    if (['1', '2', '3', '4'].includes(key)) {
      event.preventDefault();
      activeCryptexDial = Number(key) - 1;
      updateCryptexDisplay();
      return;
    }
    return;
  }

  // Active Thief Revealed Modal Keyboard Controls
  if (!$('thief-revealed-modal').classList.contains('hidden')) {
    if (key === 'e' || key === 'enter') { event.preventDefault(); addThiefToCasebook(); return; }
    return;
  }

  if (key === 'p' && isInGameSession()) {
    event.preventDefault();
    if ($('settings-modal').classList.contains('hidden')) openPauseSettingsMenu(true);
    else closePauseSettingsMenu();
    return;
  }
  if (!$('casebook-desk').classList.contains('hidden')) {
    if (key === '1') { event.preventDefault(); setDeskTab('evidence'); return; }
    if (key === '2') { event.preventDefault(); setDeskTab('clues'); return; }
    if (key === '3') { event.preventDefault(); setDeskTab('suspects'); return; }
    if (key === '4') { event.preventDefault(); setDeskTab('map'); return; }
    if (key === '5') { event.preventDefault(); setDeskTab('notes'); return; }
    if (key === 'tab' || key === 'j') {
      event.preventDefault();
      setCasebookOpen(false);
      return;
    }
  }
  if (!$('evidence-puzzle').classList.contains('hidden')) {
    if (key === 'enter' || key === 'e') {
      event.preventDefault();
      const submitBtn = $('puzzle-submit');
      if (submitBtn && !submitBtn.disabled) submitBtn.click();
    }
    return;
  }
  if (key === 'tab' || key === 'j') {
    event.preventDefault();
    setCasebookOpen(!casebookOpen);
    return;
  }
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) event.preventDefault();
  if (['w', 'a', 's', 'd', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) keys.add(key.length === 1 ? key : ({ arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', arrowup: 'ArrowUp', arrowdown: 'ArrowDown' })[key]);
  if (key === 'e' && !event.repeat && view) beginInteraction();
});
window.addEventListener('keyup', (event) => {
  const key = event.key.toLowerCase();
  keys.delete(key.length === 1 ? key : ({ arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', arrowup: 'ArrowUp', arrowdown: 'ArrowDown' })[key]);
});
window.addEventListener('blur', () => { keys.clear(); resetJoystick(); });
window.addEventListener('resize', () => {
  resizeCanvas();
  if (casebookOpen && currentDeskTab === 'evidence') drawRedThreadSvg();
});
window.addEventListener('beforeunload', () => {
  clearInterval(pollLoop); clearInterval(movementLoop); clearInterval(demoLoop);
  characterPreviews.forEach((preview) => preview.dispose());
  world?.dispose();
});

function resetJoystick() {
  touchMove.x = 0; touchMove.y = 0; touchMove.pointerId = null;
  const thumb = $('joystick-thumb');
  if (thumb) thumb.style.transform = 'translate(0, 0)';
}

function updateJoystick(event) {
  const ring = $('virtual-joystick')?.querySelector('.joystick-ring');
  if (!ring || touchMove.pointerId !== event.pointerId) return;
  const rect = ring.getBoundingClientRect();
  const radius = Math.max(1, Math.min(rect.width, rect.height) * .34);
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  const length = Math.hypot(dx, dy);
  const scale = length > radius ? radius / length : 1;
  const nx = dx * scale / radius;
  const ny = dy * scale / radius;
  touchMove.x = Math.abs(nx) < .13 ? 0 : nx;
  touchMove.y = Math.abs(ny) < .13 ? 0 : ny;
  $('joystick-thumb').style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
}

const joystick = $('virtual-joystick');
joystick?.addEventListener('pointerdown', (event) => {
  if (touchMove.pointerId !== null) return;
  event.preventDefault();
  event.stopPropagation();
  touchMove.pointerId = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  updateJoystick(event);
});
joystick?.addEventListener('pointermove', (event) => {
  if (touchMove.pointerId === event.pointerId) {
    event.preventDefault();
    event.stopPropagation();
    updateJoystick(event);
  }
});
for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) joystick?.addEventListener(eventName, (event) => {
  if (touchMove.pointerId === event.pointerId) {
    event.stopPropagation();
    resetJoystick();
  }
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
  selectedCharacter = ['boy', 'girl', 'sherlock', 'watson', 'detective', 'journalist', 'officer'].includes(restored.character) ? restored.character : null;
  enterRoom().catch((error) => { showWelcome(); showToast(error.message || 'Could not reconnect to your saved case.'); });
} else if (sessionStorage.getItem('shadows-pending-room')) {
  try {
    Object.assign(local, JSON.parse(sessionStorage.getItem('shadows-pending-room')));
    selectedCharacter = ['boy', 'girl', 'sherlock', 'watson', 'detective', 'journalist', 'officer'].includes(localStorage.getItem('shadows-character')) ? localStorage.getItem('shadows-character') : null;
    showCharacterGate();
  } catch { sessionStorage.removeItem('shadows-pending-room'); showWelcome(); }
} else {
  local.playerName = localStorage.getItem('shadows-name') || '';
  selectedCharacter = ['boy', 'girl', 'sherlock', 'watson', 'detective', 'journalist', 'officer'].includes(localStorage.getItem('shadows-character')) ? localStorage.getItem('shadows-character') : null;
  resizeCanvas();
  showWelcome();
}

window.__sherlockClientReady = true;
window.local = local;
window.getView = () => view;
window.dispatchEvent(new Event('sherlock-client-ready'));
