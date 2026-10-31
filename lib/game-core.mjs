import { randomBytes, randomUUID } from 'node:crypto';
import { CITY_BUILDINGS } from '../public/world-layout.js';

const rooms = new Map();
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;
const MATCH_ROUNDS = 3;
const CHARACTERS = new Set(['boy', 'girl', 'sherlock', 'watson', 'detective', 'journalist', 'officer']);
const HEARTBEAT_MS = 12_000;
const RECONNECT_GRACE_MS = 90_000;
const MAP_W = 960;
const MAP_H = 640;
const SPEED = 145;

const points = {
  ink: { id: 'letter-ink', x: 112, y: 108, label: 'Ink sample', mission: 'letter', part: 'ink', category: 'letter' },
  seal: { id: 'letter-seal', x: 252, y: 182, label: 'Seal register', mission: 'letter', part: 'seal', category: 'letter' },
  cipher: { id: 'cipher', x: 494, y: 154, label: 'Cipher table', mission: 'cipher', category: 'letter' },
  wire: { id: 'wire', x: 738, y: 306, label: 'Signal box', mission: 'telegraph', part: 'sender', category: 'telegraph' },
  relay: { id: 'relay', x: 874, y: 410, label: 'Relay cable', mission: 'telegraph', part: 'receiver', category: 'relay' },
  reunion: { id: 'reunion', x: 484, y: 552, label: 'Headquarters & Investigation Board', mission: 'reunion' },

  // Searchable Clue Objects across London (Footprints, Fabric, Photo, Keys, Fingerprints, Witness)
  footprintsYard: {
    id: 'clue-footprints-yard',
    x: 146,
    y: 198,
    label: 'Muddy Footprints',
    category: 'footprints',
    title: 'Muddy Yard Bootprints',
    detail: 'Deep left-tread indentations in river mud, size 9 bespoke gentleman’s riding boots matching Edward Blackthorn.',
  },
  fabricFence: {
    id: 'clue-fabric-fence',
    x: 290,
    y: 140,
    label: 'Torn Tweed Fabric',
    category: 'fabric',
    title: 'Torn Tweed Fabric Hem',
    detail: 'A jagged swatch of French combed charcoal worsted wool caught on an iron fence spearhead, matching the suspect’s overcoat.',
  },
  photoSurveillance: {
    id: 'clue-photo-surveillance',
    x: 540,
    y: 195,
    label: 'Crime Scene Photograph',
    category: 'photograph',
    title: 'Stolen Daguerreotype Plate',
    detail: 'A silver-plated copper daguerreotype plate exposing the silhouette of a tall figure surveying Blackthorn House.',
  },
  keyIron: {
    id: 'clue-key-iron',
    x: 810,
    y: 460,
    label: 'Antique Skeleton Key',
    category: 'key',
    title: 'Antique Gutter Skeleton Key',
    detail: 'A heavy brass skeleton key stamped with the Blackthorn crest and stepped 3-1-4 wards, retrieved from a gutter crevice.',
  },
  fingerprintGlass: {
    id: 'clue-fingerprint-glass',
    x: 440,
    y: 220,
    label: 'Latent Fingerprint',
    category: 'fingerprints',
    title: 'Lantern Glass Latent Fingerprint',
    detail: 'Forensic graphite powder exposes a 14-ridge double-whorl pattern on lantern glass, matching Edward Blackthorn’s thumb.',
  },
  witnessLedger: {
    id: 'clue-witness-ledger',
    x: 690,
    y: 360,
    label: 'Witness Cab Ledger',
    category: 'witness',
    title: 'Hansom Cab Route Ledger',
    detail: 'Cab No. 42 recorded an unscheduled midnight pickup at East Docks delivering directly to Blackthorn House.',
  },
};

const PORTRAIT_PIECES = Object.freeze({
  'clue-footprints-yard': { id: 1, name: 'Top-Left Fragment (Ulster Cap & Brow)', gameType: 'find-objects', location: 'footprintsYard', hint: 'Look for the muddy bootprints near Scotland Yard.' },
  'clue-fabric-fence': { id: 2, name: 'Top-Center Fragment (Phantom Mask & Eyes)', gameType: 'match-symbols', location: 'fabricFence', hint: 'Check the torn cloth on the iron spearhead fence.' },
  'clue-photo-surveillance': { id: 3, name: 'Top-Right Fragment (High Velvet Collar)', gameType: 'unlock-box', location: 'photoSurveillance', hint: 'Inspect the daguerreotype camera near Baker Street.' },
  'clue-key-iron': { id: 4, name: 'Bottom-Left Fragment (Engraved Pocket Watch)', gameType: 'find-objects', location: 'keyIron', hint: 'Search the gutter crevice by the railway station.' },
  'clue-fingerprint-glass': { id: 5, name: 'Bottom-Center Fragment (Crimson Silk Cravat)', gameType: 'match-symbols', location: 'fingerprintGlass', hint: 'Examine the lantern glass across from the study.' },
  'clue-witness-ledger': { id: 6, name: 'Bottom-Right Fragment (Gloved Hand & Vault Key)', gameType: 'unlock-box', location: 'witnessLedger', hint: 'Review the midnight hansom cab route ledger.' },
});

export const DEDUCTION_ANSWERS = Object.freeze({
  'letter-ink': 'iron-gall',
  'letter-seal': 'after-departure',
  cipher: 'east-928',
  wire: 'triple-short-long',
  relay: 'blackthorn-house',
  'clue-footprints-yard': 'tread-riding',
  'clue-fabric-fence': 'charcoal-tweed',
  'clue-photo-surveillance': 'silver-pyro',
  'clue-key-iron': 'tumbler-314',
  'clue-fingerprint-glass': 'whorl-pattern',
  'clue-witness-ledger': 'cab-eastdocks',
});

const locations = [
  { id: 'yard', name: 'Scotland Yard', x: 182, y: 145, icon: '✦' },
  { id: 'baker', name: '221B Baker Street', x: 498, y: 160, icon: '⌂' },
  { id: 'station', name: 'East London Station', x: 804, y: 355, icon: '▤' },
  { id: 'safehouse', name: 'Blackthorn Safehouse', x: 480, y: 555, icon: '◈' },
];

const randomCode = () => randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const PLAYER_RADIUS = 10;

function canStandAt(x, y) {
  if (x < 25 || x > MAP_W - 25 || y < 25 || y > MAP_H - 25) return false;
  return !CITY_BUILDINGS.some((building) => (
    x > building.x - PLAYER_RADIUS && x < building.x + building.w + PLAYER_RADIUS
    && y > building.y - PLAYER_RADIUS && y < building.y + building.h + PLAYER_RADIUS
  ));
}

function addLog(room, text, kind = 'note') {
  room.log.push({ id: randomUUID(), time: Date.now(), text, kind });
  if (room.log.length > 36) room.log.shift();
}

const CHARACTER_TRAITS = Object.freeze({
  boy: {
    character: 'boy',
    title: 'The Young Sleuth',
    bootCategory: 'Bespoke Riding',
    bootSize: 10,
    bootLabel: 'Size 10 Bevel Riding Boot',
    bootDesc: 'Deep left-tread indentations in river mud, size 10 bespoke gentleman\'s riding boots with right-heel diagonal wear groove.',
    fabricCategory: 'Worsted Wool',
    fabricDesc: 'A jagged swatch of French combed charcoal slate worsted wool with fine twill weave.',
    photoSilhouette: 'Silhouette of a lean, tall figure wearing a long traveling overcoat and structured cap.',
    silhouetteHeight: 'Lean Tall Silhouette · Traveling Overcoat',
    letterScript: 'Iron-gall ink penmanship with cursive flourishes, signed with an ornate cipher monogram.',
    locationSighting: 'Witness placed suspect near Baker Street study and the north alley conduit before the alarm sounded.',
    fingerprintClass: 'Central Loop with scar',
    fingerprintDesc: 'Accidental Central Loop pattern (14 counted ridges) with a fine diagonal knife scar on the right thumb core.',
    compatibleCharacters: ['boy', 'sherlock'],
  },
  sherlock: {
    character: 'sherlock',
    title: 'The Master Detective',
    bootCategory: 'Bespoke Riding',
    bootSize: 10,
    bootLabel: 'Size 10 Bevel Riding Boot',
    bootDesc: 'Deep left-tread indentations in river mud, size 10 bespoke gentleman\'s riding boots with right-heel diagonal wear groove.',
    fabricCategory: 'Worsted Wool',
    fabricDesc: 'A jagged swatch of French combed charcoal slate worsted wool with fine twill weave.',
    photoSilhouette: 'Silhouette of a tall, lean figure in a long double-breasted coat and structured brimmed hat.',
    silhouetteHeight: 'Lean Tall Silhouette · Traveling Overcoat',
    letterScript: 'Iron-gall ink penmanship with cursive flourishes, signed with an ornate cipher monogram.',
    locationSighting: 'Witness placed suspect near Baker Street study and the north alley conduit before the alarm sounded.',
    fingerprintClass: 'Central Loop with scar',
    fingerprintDesc: 'Accidental Central Loop pattern (14 counted ridges) with a fine diagonal knife scar on the right thumb core.',
    compatibleCharacters: ['sherlock', 'boy'],
  },
  watson: {
    character: 'watson',
    title: 'The Military Physician',
    bootCategory: 'Military Broad',
    bootSize: 9,
    bootLabel: 'Size 9 Hobnailed Military Brogue',
    bootDesc: 'Broad-soled impressions in Thames silt, size 9 stout military walking brogues with cross-hatched steel heel studs.',
    fabricCategory: 'Medical Tweed',
    fabricDesc: 'Rough-hewn double-twist hazel brown tweed and dark flannel fiber with lanolin traces.',
    photoSilhouette: 'Broad-shouldered silhouette in a stout bowler hat with a rigid military bearing.',
    silhouetteHeight: 'Broad Stout Silhouette · Bowler Hat',
    letterScript: 'Standard army carbon lampblack ink with clinical pharmaceutical abbreviations.',
    locationSighting: 'Telegraph ledger confirms suspect lingering near the Commercial Relay and railway sidings.',
    fingerprintClass: 'Tented Arch with stippling',
    fingerprintDesc: 'Tented Arch pattern (12 counted ridges) with faint powder stippling on the right forefinger.',
    compatibleCharacters: ['watson', 'officer'],
  },
  girl: {
    character: 'girl',
    title: 'The Velvet Operative',
    bootCategory: 'Slender Bespoke',
    bootSize: 6,
    bootLabel: 'Size 6 Slender Victorian Heeled Boot',
    bootDesc: 'Slender, high-heeled impressions in courtyard lime, size 6 tapered Victorian boot with a narrow arch strike.',
    fabricCategory: 'Silk Damask',
    fabricDesc: 'Crimson-tinged silk damask thread and dark velvet trim caught on an iron fence spearhead.',
    photoSilhouette: 'Graceful, high-collared tailored travelling cape and veiled hat silhouette.',
    silhouetteHeight: 'Graceful Slender Silhouette · Tailored Cape',
    letterScript: 'Slanted French-style penmanship on scented vellum with numerical substitution cryptograms.',
    locationSighting: 'Seen consulting the Scotland Yard dispatch registry before slipping into a carriage at the river docks.',
    fingerprintClass: 'Double Loop Whorl',
    fingerprintDesc: 'Double Loop Whorl pattern (16 counted ridges) with delicate, high-density dermal ridges.',
    compatibleCharacters: ['girl', 'detective'],
  },
  detective: {
    character: 'detective',
    title: 'The Velvet Operative',
    bootCategory: 'Slender Bespoke',
    bootSize: 6,
    bootLabel: 'Size 6 Slender Victorian Heeled Boot',
    bootDesc: 'Slender, high-heeled impressions in courtyard lime, size 6 tapered Victorian boot with a narrow arch strike.',
    fabricCategory: 'Silk Damask',
    fabricDesc: 'Crimson-tinged silk damask thread and dark velvet trim caught on an iron fence spearhead.',
    photoSilhouette: 'Graceful, high-collared tailored travelling cape and veiled hat silhouette.',
    silhouetteHeight: 'Graceful Slender Silhouette · Tailored Cape',
    letterScript: 'Slanted French-style penmanship on scented vellum with numerical substitution cryptograms.',
    locationSighting: 'Seen consulting the Scotland Yard dispatch registry before slipping into a carriage at the river docks.',
    fingerprintClass: 'Double Loop Whorl',
    fingerprintDesc: 'Double Loop Whorl pattern (16 counted ridges) with delicate, high-density dermal ridges.',
    compatibleCharacters: ['detective', 'girl'],
  },
  journalist: {
    character: 'journalist',
    title: 'The Press Informant',
    bootCategory: 'Light Street',
    bootSize: 8,
    bootLabel: 'Size 8 Light Oxford Walking Shoe',
    bootDesc: 'Light oxford lace-up shoe prints, size 8, showing distinct ink-spattered outer rim impressions.',
    fabricCategory: 'Corduroy Tweed',
    fabricDesc: 'Frayed corduroy thread and ink-speckled ash grey wool weave from an overworked jacket.',
    photoSilhouette: 'Slightly stooped silhouette in a slouch cap carrying a folio dossier bag.',
    silhouetteHeight: 'Medium Stooped Silhouette · Slouch Cap',
    letterScript: 'Rapid telegraphic shorthand notes in purple aniline ink with Fleet Street newspaper references.',
    locationSighting: 'Signal Box records place suspect near Signal Box B siding and the railway drop.',
    fingerprintClass: 'Accidental Whorl with ink stain',
    fingerprintDesc: 'Accidental Whorl pattern (13 counted ridges) with chronic printing ink saturation at the core.',
    compatibleCharacters: ['journalist', 'boy'],
  },
  officer: {
    character: 'officer',
    title: 'The Yard Inspector',
    bootCategory: 'Heavy Service',
    bootSize: 11,
    bootLabel: 'Size 11 Heavy Regulation Constable Boot',
    bootDesc: 'Heavy regulation constable boot prints with 16 iron hobnails, size 11, impressed deep into Thames mud.',
    fabricCategory: 'Police Wool Serge',
    fabricDesc: 'Heavy navy blue police wool serge with polished brass metal filings from an official uniform.',
    photoSilhouette: 'Sturdy, tall silhouette wearing a high-domed Scotland Yard custodian helmet.',
    silhouetteHeight: 'Broad Heavy Silhouette · Custodian Helmet',
    letterScript: 'Precinct log block script with stamped divisional seals and official warrant citations.',
    locationSighting: 'Patrol logs place suspect near the Blackthorn Safehouse boundary and riverbank embankment.',
    fingerprintClass: 'Plain Whorl with triradius',
    fingerprintDesc: 'Plain Whorl pattern (14 counted ridges) with distinct triradius ridge divergence on the index finger.',
    compatibleCharacters: ['officer', 'watson'],
  }
});

function buildCulpritEvidenceBoard(room, culprit) {
  const char = culprit?.character || 'sherlock';
  const traits = CHARACTER_TRAITS[char] || CHARACTER_TRAITS.sherlock;
  const culpritId = culprit?.id || null;
  const players = activePlayers(room);

  // Helper to ensure early exhibits keep at least minCount candidates active in the suspect pool
  const ensureAmbiguity = (initialMatches, minCount = 2) => {
    const set = new Set(initialMatches);
    if (culpritId) set.add(culpritId);
    if (set.size < minCount && players.length >= minCount) {
      for (const p of players) {
        set.add(p.id);
        if (set.size >= minCount) break;
      }
    }
    return [...set];
  };

  // Clue 1: Footprints (broadest: at least 2-3 suspects)
  const rawFootprints = players.filter((p) => {
    const t = CHARACTER_TRAITS[p.character];
    return t && (t.bootCategory === traits.bootCategory || t.compatibleCharacters.includes(char) || Math.abs((t.bootSize || 9) - traits.bootSize) <= 2);
  }).map((p) => p.id);
  const footprintMatches = ensureAmbiguity(rawFootprints, Math.min(players.length, 3));
  const footprintCleared = players.filter((p) => !footprintMatches.includes(p.id)).map((p) => p.id);

  // Clue 2: Fabric (at least 2 suspects)
  const rawFabric = players.filter((p) => {
    const t = CHARACTER_TRAITS[p.character];
    return t && (t.fabricCategory === traits.fabricCategory || t.compatibleCharacters.includes(char));
  }).map((p) => p.id);
  const fabricMatches = ensureAmbiguity(rawFabric, Math.min(players.length, 2));
  const fabricCleared = players.filter((p) => !fabricMatches.includes(p.id)).map((p) => p.id);

  // Clue 3: Photograph (at least 2 suspects)
  const rawPhoto = players.filter((p) => {
    const t = CHARACTER_TRAITS[p.character];
    return t && t.compatibleCharacters.includes(char);
  }).map((p) => p.id);
  const photoMatches = ensureAmbiguity(rawPhoto, Math.min(players.length, 2));
  const photoCleared = players.filter((p) => !photoMatches.includes(p.id)).map((p) => p.id);

  // Clue 4: Letter (corroborates narrowed pool)
  const letterMatches = photoMatches.slice();
  const letterCleared = players.filter((p) => !letterMatches.includes(p.id)).map((p) => p.id);

  // Clue 5: Location (corroborates narrowed pool)
  const locationMatches = photoMatches.slice();
  const locationCleared = players.filter((p) => !locationMatches.includes(p.id)).map((p) => p.id);

  // Clue 6: Latent Fingerprint Lift (Conclusive: EXACTLY 1 suspect, the thief!)
  const fingerprintMatches = culpritId ? [culpritId] : (players.length ? [players[0].id] : []);
  const fingerprintCleared = players.filter((p) => !fingerprintMatches.includes(p.id)).map((p) => p.id);

  return [
    {
      id: 'fragment-footprints',
      stage: 1,
      order: 1,
      category: 'footprints',
      stationId: 'clue-footprints-yard',
      title: 'Exhibit #1: Muddy Footprint Cast',
      subtitle: 'Scotland Yard Perimeter Wall',
      detail: traits.bootDesc,
      traitSummary: `${traits.bootLabel} (${traits.bootCategory})`,
      unlocked: false,
      unlockedAt: null,
      unlockedBy: null,
      matchingSuspectIds: footprintMatches,
      clearedSuspectIds: footprintCleared,
      connections: ['fragment-fabric', 'fragment-location'],
      threadLabel: 'Connected to Suspect Route & Wardrobe',
    },
    {
      id: 'fragment-fabric',
      stage: 2,
      order: 2,
      category: 'fabric',
      stationId: 'clue-fabric-fence',
      title: 'Exhibit #2: Torn Fabric Thread',
      subtitle: 'Savile Row Iron Railing',
      detail: traits.fabricDesc,
      traitSummary: `${traits.fabricCategory}`,
      unlocked: false,
      unlockedAt: null,
      unlockedBy: null,
      matchingSuspectIds: fabricMatches,
      clearedSuspectIds: fabricCleared,
      connections: ['fragment-footprints', 'fragment-photo'],
      threadLabel: 'Connected to Suspect Overcoat Silhouette',
    },
    {
      id: 'fragment-photo',
      stage: 3,
      order: 3,
      category: 'photograph',
      stationId: 'clue-photo-surveillance',
      title: 'Exhibit #3: Stolen Daguerreotype Plate',
      subtitle: 'Darkroom Surveillance Recovery',
      detail: traits.photoSilhouette,
      traitSummary: traits.silhouetteHeight,
      unlocked: false,
      unlockedAt: null,
      unlockedBy: null,
      matchingSuspectIds: photoMatches,
      clearedSuspectIds: photoCleared,
      connections: ['fragment-fabric', 'fragment-letter'],
      threadLabel: 'Connected to Coded Dispatch Ledger',
    },
    {
      id: 'fragment-letter',
      stage: 4,
      order: 4,
      category: 'letter',
      stationId: 'cipher',
      title: 'Exhibit #4: Decrypted Cipher Letter',
      subtitle: 'Baker Street Study Desk',
      detail: traits.letterScript,
      traitSummary: 'Keyword: BLACKTHORN',
      unlocked: false,
      unlockedAt: null,
      unlockedBy: null,
      matchingSuspectIds: letterMatches,
      clearedSuspectIds: letterCleared,
      connections: ['fragment-photo', 'fragment-location'],
      threadLabel: 'Connected to Hansom Cab Transit Route',
    },
    {
      id: 'fragment-location',
      stage: 5,
      order: 5,
      category: 'location',
      stationId: 'clue-witness-ledger',
      title: 'Exhibit #5: Hansom Cab Route Record',
      subtitle: 'East London Station & Docks',
      detail: traits.locationSighting,
      traitSummary: 'Direct Route to Blackthorn Safehouse',
      unlocked: false,
      unlockedAt: null,
      unlockedBy: null,
      matchingSuspectIds: locationMatches,
      clearedSuspectIds: locationCleared,
      connections: ['fragment-footprints', 'fragment-fingerprint'],
      threadLabel: 'Connected to Safehouse Perimeter Fingerprint',
    },
    {
      id: 'fragment-fingerprint',
      stage: 6,
      order: 6,
      category: 'fingerprints',
      stationId: 'clue-fingerprint-glass',
      title: 'Exhibit #6: Latent Graphite Fingerprint',
      subtitle: 'Lantern Glass Forensic Lift',
      detail: traits.fingerprintDesc,
      traitSummary: `${traits.fingerprintClass} (Definitive Match)`,
      unlocked: false,
      unlockedAt: null,
      unlockedBy: null,
      matchingSuspectIds: fingerprintMatches,
      clearedSuspectIds: fingerprintCleared,
      connections: ['fragment-location'],
      threadLabel: 'Conclusive Primary Suspect Identification',
    },
  ];
}

function unlockEvidenceFragment(room, clueId, player) {
  if (!room.evidenceBoard) return;
  const fragMap = {
    'clue-footprints-yard': 'fragment-footprints',
    'clue-fabric-fence': 'fragment-fabric',
    'clue-photo-surveillance': 'fragment-photo',
    'cipher': 'fragment-letter',
    'letter-ink': 'fragment-letter',
    'clue-witness-ledger': 'fragment-location',
    'clue-key-iron': 'fragment-location',
    'clue-fingerprint-glass': 'fragment-fingerprint',
  };
  const fragId = fragMap[clueId];
  if (!fragId) return;
  const frag = room.evidenceBoard.find((f) => f.id === fragId);
  if (frag && !frag.unlocked) {
    frag.unlocked = true;
    frag.unlockedAt = Date.now();
    frag.unlockedBy = player ? player.name : 'Detective';
    addLog(room, `EXHIBIT UNLOCKED: ${frag.title} added to the shared evidence board!`, 'progress');
  }
}

function getSuspectsSummary(room) {
  const players = activePlayers(room);
  const unlocked = (room.evidenceBoard || []).filter((f) => f.unlocked);
  return players.map((p) => {
    const traits = CHARACTER_TRAITS[p.character] || CHARACTER_TRAITS.boy;
    const matchedFragments = unlocked.filter((f) => f.matchingSuspectIds?.includes(p.id));
    const clearedFragments = unlocked.filter((f) => f.clearedSuspectIds?.includes(p.id));
    const matchCount = matchedFragments.length;
    const isCleared = clearedFragments.length > 0;
    let suspicionLevel = 'untested';
    if (unlocked.length > 0) {
      if (isCleared) suspicionLevel = 'cleared';
      else if (matchCount >= 5) suspicionLevel = 'prime';
      else if (matchCount >= 3) suspicionLevel = 'high';
      else if (matchCount >= 2) suspicionLevel = 'medium';
      else suspicionLevel = 'low';
    }
    return {
      id: p.id,
      name: p.name,
      character: p.character,
      archetype: traits.title || traits.archetype || 'Detective',
      connected: p.connected,
      eliminated: p.eliminated,
      matchedCount: matchCount,
      isCleared,
      suspicionLevel,
      matchedFragmentIds: matchedFragments.map((f) => f.id),
      clearedFragmentIds: clearedFragments.map((f) => f.id)
    };
  });
}

function newRoom(code, host, character = 'boy') {
  const player = makePlayer(host, character);
  const room = {
    code,
    createdAt: Date.now(),
    hostId: player.id,
    players: new Map([[player.id, player]]),
    phase: 'lobby',
    round: 1,
    mode: 'cooperative',
    portrait: {
      totalPieces: 6,
      collectedPieces: [],
      allCollected: false,
      assembled: false,
    },
    scores: new Map([[player.id, 0]]),
    missions: {
      letter: { done: false, parts: { ink: null, seal: null } },
      cipher: { done: false },
      telegraph: { done: false, parts: { sender: null, receiver: null } },
    },
    mansion: {
      gateOpen: false,
      clockHour: 12,
      clockSolved: false,
      selectedBooks: [],
      librarySolved: false,
      basementSymbols: ['sun', 'sun', 'sun', 'sun'],
      basementSolved: false,
      secretDoorOpen: false,
      thiefRevealed: false,
      thiefAddedToCasebook: false,
    },
    clues: [],
    evidenceBoard: [],
    evidenceConnections: [],
    suspectNotes: {},
    log: [],
    chat: [],
    sabotage: null,
    sabotageCooldownAt: 0,
    ambushCooldownAt: 0,
    vote: null,
    capture: null,
    culpritCaught: false,
    culpritObjective: false,
    sabotagedMissions: [],
    reunionComplete: false,
    result: null,
    countdownUntil: null,
    startedAt: null,
    lastTouched: Date.now(),
  };
  room.players.set(player.id, player);
  room.evidenceBoard = buildCulpritEvidenceBoard(room, player);
  addLog(room, 'A telegram from Sherlock Holmes is waiting. The team is gathering at Scotland Yard.');
  return { room, player };
}

function makePlayer(name, character = 'boy') {
  return {
    id: randomUUID(),
    token: randomBytes(24).toString('base64url'),
    name: cleanName(name),
    character: CHARACTERS.has(character) ? character : 'boy',
    x: 165 + Math.random() * 38,
    y: 320 + Math.random() * 50,
    role: null,
    eliminated: false,
    ready: false,
    connected: true,
    dropped: false,
    lastSeen: Date.now(),
    moveAt: Date.now(),
    incapacitated: false,
    incapacitatedAt: 0,
    safehouse: false,
    vote: null,
  };
}

function cleanName(value) {
  const name = String(value || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 18);
  return name || 'Detective';
}

function validateName(value) {
  if (typeof value !== 'string') throw httpError(400, 'Enter a detective name of 2–18 characters.');
  const name = value.trim();
  if (name.length < 2 || name.length > 18 || /[<>\u0000-\u001f]/.test(name)) {
    throw httpError(400, 'Enter a detective name of 2–18 characters. Avoid angle brackets or control characters.');
  }
  return name;
}

function activePlayers(room) {
  const now = Date.now();
  return [...room.players.values()].filter((p) => {
    if (p.dropped && room.phase !== 'results') return false;
    if (!p.connected && now - p.lastSeen > RECONNECT_GRACE_MS && room.phase !== 'results') return false;
    return true;
  });
}

function hasPlayerName(room, name) {
  const normalized = cleanName(name).toLocaleLowerCase();
  return activePlayers(room).some((player) => player.name.toLocaleLowerCase() === normalized);
}

function sweepRoom(room) {
  const now = Date.now();
  for (const p of room.players.values()) {
    if (!p.dropped && p.connected && now - p.lastSeen > HEARTBEAT_MS) p.connected = false;
    if (p.incapacitated && p.incapacitatedAt && now - p.incapacitatedAt >= 18_000) {
      p.incapacitated = false;
      p.incapacitatedAt = 0;
      addLog(room, `${p.name} recovered and returned to the investigation.`, 'good');
    }
  }
  if (room.sabotage && now >= room.sabotage.until) {
    room.sabotage = null;
    addLog(room, 'The interference fades. The mission station is clear again.', 'good');
  }
  if (room.vote?.open && now >= room.vote.deadline) resolveVote(room);
  const host = room.players.get(room.hostId);
  if (host && (host.dropped || (!host.connected && now - host.lastSeen > RECONNECT_GRACE_MS))) {
    const successor = activePlayers(room).find((player) => player.connected && !player.dropped);
    if (successor) {
      room.hostId = successor.id;
      addLog(room, `${successor.name} is now hosting the room.`, 'note');
    }
  }
}

function checkReunion(room) {
  if (room.phase !== 'reunion') return false;
  if (room.mode === 'deduction' && room.vote?.outcome === 'capture' && !room.culpritCaught) return false;
  const connectedActive = activePlayers(room).filter((p) => p.connected && !p.dropped);
  if (!connectedActive.length) return false;
  return connectedActive.every((p) => !p.incapacitated && dist(p, points.reunion) <= 82);
}

function serialPlayer(p, room, me) {
  const atDoor = dist(p, points.reunion) <= 82;
  const isMe = p.id === me.id;
  const data = {
    id: p.id,
    name: p.name,
    character: CHARACTERS.has(p.character) ? p.character : 'boy',
    x: p.x,
    y: p.y,
    connected: p.connected,
    incapacitated: p.incapacitated,
    eliminated: p.eliminated,
    captured: Boolean(p.captured),
    ready: p.ready,
    safehouse: atDoor,
    atSafehouse: atDoor,
    safehouseDist: Math.round(dist(p, points.reunion)),
    arrivalStatus: atDoor ? 'arrived' : 'en_route',
    isMe,
    isHost: p.id === room.hostId,
  };
  if (room.phase !== 'lobby') {
    if (room.mode === 'deduction') {
      const isPostCapture = room.culpritCaught || room.phase === 'results';
      data.revealedRole = (isPostCapture && p.role === 'culprit') ? 'culprit' : undefined;
      if (room.phase === 'results' || isMe || isPostCapture) {
        data.role = p.role;
      }
    } else {
      data.role = 'detective';
    }
  }
  return data;
}

function publicRoom(room, me) {
  sweepRoom(room);
  const players = activePlayers(room);
  const connectedPlayers = players.filter((p) => p.connected);
  const readyCount = connectedPlayers.filter((p) => p.ready).length;
  const detectives = players.filter((p) => p.role === 'detective' && !p.eliminated);
  const mePlayer = room.players.get(me.id);
  const missionSummary = {
    letter: {
      done: room.missions.letter.done,
      progress: Object.values(room.missions.letter.parts).filter(Boolean).length,
      total: 2,
      parts: { ink: Boolean(room.missions.letter.parts.ink), seal: Boolean(room.missions.letter.parts.seal) },
    },
    cipher: { done: room.missions.cipher.done, progress: room.missions.cipher.done ? 1 : 0, total: 1 },
    telegraph: {
      done: room.missions.telegraph.done,
      progress: Object.values(room.missions.telegraph.parts).filter(Boolean).length,
      total: 2,
      parts: { sender: Boolean(room.missions.telegraph.parts.sender), receiver: Boolean(room.missions.telegraph.parts.receiver) },
    },
  };
  const voteSummary = room.vote ? {
    resolved: room.vote.resolved,
    deadline: room.vote.deadline,
    tally: room.vote.resolved ? room.vote.tally : null,
    outcome: room.vote.outcome,
    suspectName: room.vote.suspectName || null,
  } : null;
  const scoreboard = [...room.scores.entries()]
    .map(([playerId, score]) => ({ playerId, name: room.players.get(playerId)?.name || 'Detective', score }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return {
    room: {
      code: room.code,
      phase: room.phase,
      mode: room.mode,
      round: room.round,
      totalRounds: MATCH_ROUNDS,
      matchComplete: room.phase === 'results' && room.round === MATCH_ROUNDS,
      scoreboard,
      hostId: room.hostId,
      players: players.map((p) => serialPlayer(p, room, me)),
      suspects: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, active: !p.dropped })),
      missions: missionSummary,
      mansion: room.mansion || {
        gateOpen: false,
        clockHour: 12,
        clockSolved: false,
        selectedBooks: [],
        librarySolved: false,
        basementSymbols: ['sun', 'sun', 'sun', 'sun'],
        basementSolved: false,
        secretDoorOpen: false,
        thiefRevealed: false,
        thiefAddedToCasebook: false,
      },
      portrait: {
        totalPieces: 6,
        collectedPieces: room.portrait?.collectedPieces || [],
        allCollected: Boolean(room.portrait?.allCollected || (room.portrait?.collectedPieces?.length >= 6)),
        assembled: Boolean(room.portrait?.assembled),
        remainingPieces: Math.max(0, 6 - (room.portrait?.collectedPieces?.length || 0)),
        canAssemble: Boolean((room.portrait?.allCollected || (room.portrait?.collectedPieces?.length >= 6)) && dist(mePlayer, points.reunion) <= 95),
        piecesInfo: Object.entries(PORTRAIT_PIECES).map(([stId, info]) => ({
          stationId: stId,
          pieceId: info.id,
          name: info.name,
          gameType: info.gameType,
          collected: (room.portrait?.collectedPieces || []).includes(info.id),
          foundBy: room.clues.find((c) => c.stationId === stId || c.id === stId)?.foundBy || null,
        })),
      },
      clues: room.clues,
      evidenceBoard: {
        fragments: room.evidenceBoard || [],
        connections: room.evidenceConnections || [],
        unlockedCount: (room.evidenceBoard || []).filter((f) => f.unlocked).length,
        totalCount: 6,
        suspects: getSuspectsSummary(room),
        suspectNotes: room.suspectNotes || {},
      },
      log: room.log,
      chat: room.chat,
      locations,
      points: Object.values(points).map(({ id, x, y, label, mission, category, title, detail }) => ({ id, x, y, label, mission, category: category || mission, title: title || label, detail })),
      sabotage: room.sabotage ? { mission: room.sabotage.mission, until: room.sabotage.until } : null,
      vote: voteSummary,
      capture: room.capture ? {
        progress: room.capture.mechanisms.length,
        total: room.capture.sequence.length,
        next: room.capture.sequence[room.capture.mechanisms.length] || null,
        mechanisms: room.capture.mechanisms.map(({ mechanism, playerId }) => ({ mechanism, playerId })),
      } : null,
      chase: room.phase === 'capture' ? {
        active: true,
        thiefName: [...room.players.values()].find((p) => p.role === 'culprit')?.name || 'The Thief',
        thiefId: [...room.players.values()].find((p) => p.role === 'culprit')?.id || null,
        mechanismsSet: room.capture?.mechanisms?.length || 0,
        totalMechanisms: room.capture?.sequence?.length || 3,
        nextMechanism: room.capture?.sequence?.[room.capture?.mechanisms?.length] || null,
      } : null,
      reunion: {
        ready: checkReunion(room),
        arrivedCount: connectedPlayers.filter((p) => !p.incapacitated && dist(p, points.reunion) <= 82).length,
        totalCount: connectedPlayers.length,
        players: connectedPlayers.map((p) => ({
          id: p.id,
          name: p.name,
          character: p.character,
          role: (room.phase === 'capture' || room.culpritCaught || room.phase === 'reunion' || room.phase === 'results') ? p.role : undefined,
          captured: Boolean(p.captured),
          arrived: !p.incapacitated && dist(p, points.reunion) <= 82,
          distance: Math.round(dist(p, points.reunion)),
          status: (!p.incapacitated && dist(p, points.reunion) <= 82) ? 'arrived' : 'en_route',
        })),
      },
      voteAvailable: room.mode === 'deduction' && detectives.length >= 2 && room.clues.length >= 2 && !room.vote && ['investigation', 'reunion'].includes(room.phase),
      culpritCaught: room.culpritCaught,
      activeCount: players.filter((p) => !p.eliminated).length,
      connectedCount: players.filter((p) => p.connected && !p.eliminated).length,
      readyCount,
      allReady: connectedPlayers.length >= MIN_PLAYERS && connectedPlayers.every((p) => p.ready),
      countdown: room.countdownUntil && Date.now() < room.countdownUntil ? Math.max(1, Math.ceil((room.countdownUntil - Date.now()) / 1000)) : 0,
      countdownUntil: room.countdownUntil || null,
      startedAt: room.startedAt || null,
      result: room.result,
      reunionReady: room.phase === 'reunion' && checkReunion(room),
    },
    me: {
      ...serialPlayer(mePlayer, room, mePlayer),
      role: mePlayer.role,
      secretObjective: room.mode === 'deduction' && mePlayer.role === 'culprit'
        ? (room.phase === 'capture'
          ? 'You have been exposed as the thief! Flee towards Blackthorn Safehouse and evade the detectives\' safehouse trap.'
          : mePlayer.captured
            ? 'You have been apprehended in the safehouse trap! Accompany your captors to Blackthorn Safehouse door to conclude the case.'
            : 'You are the hidden thief. Blend in with the detectives, secretly delay the investigation or strike isolated sleuths, and avoid a unanimous accusation.')
        : (room.phase === 'capture'
          ? 'The thief has been identified! Corner the thief near Blackthorn Safehouse and coordinate the 3-step trap (lever, valve, key).'
          : room.phase === 'reunion'
            ? 'The thief is in custody! Escort them to Blackthorn Safehouse door with all active detectives to finish the case.'
            : 'Work with the other detectives, recover every clue, identify the hidden thief, chase and capture them, and reunite at Blackthorn Safehouse.'),
      objectiveAchieved: mePlayer.role === 'culprit' ? room.culpritObjective : null,
      canMove: room.phase !== 'lobby' && room.phase !== 'results' && !mePlayer.incapacitated && !mePlayer.eliminated,
      cooldowns: {
        sabotage: Math.max(0, room.sabotageCooldownAt - Date.now()),
        ambush: Math.max(0, room.ambushCooldownAt - Date.now()),
      },
      hasVoted: Boolean(mePlayer.vote),
      ready: Boolean(mePlayer.ready),
      voteEligible: room.mode === 'deduction' && mePlayer.role === 'detective' && !mePlayer.eliminated,
    },
  };
}

function findByCode(code, roomStore = rooms) {
  return roomStore.get(String(code || '').toUpperCase());
}

function authenticate(body, roomStore = rooms) {
  const room = findByCode(body.code, roomStore);
  if (!room) throw httpError(404, 'Room not found. Check the code and try again.');
  const player = [...room.players.values()].find((p) => p.token === body.token);
  if (!player) throw httpError(401, 'Your seat could not be restored. Rejoin with the room code.');
  player.lastSeen = Date.now();
  player.connected = true;
  player.dropped = false;
  room.lastTouched = Date.now();
  return { room, player };
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function addClue(room, title, detail) {
  room.clues.push({ id: randomUUID(), title, detail, time: Date.now() });
}

function nearestTarget(player, maxDistance = 85) {
  return Object.values(points)
    .map((point) => ({ ...point, distance: dist(player, point) }))
    .filter((point) => point.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)[0];
}

function missionCanInteract(room, target) {
  if (!target) return 'There is nothing close enough to examine.';
  if (target.category && !target.mission) {
    if (room.clues.some((c) => c.id === target.id)) return 'This evidence has already been secured.';
    return null;
  }
  if (target.mission === 'letter' && room.missions.letter.done) return 'The letter evidence has already been recorded.';
  if (target.mission === 'cipher' && !room.missions.letter.done) return 'Finish comparing the letter fragments first.';
  if (target.mission === 'cipher' && room.missions.cipher.done) return 'The cipher has already been decoded.';
  if (target.mission === 'telegraph' && !room.missions.cipher.done) return 'The cipher points here, but the route is still unknown.';
  if (target.mission === 'telegraph' && room.missions.telegraph.done) return 'The telegraph evidence is already secured.';
  if (target.mission === 'reunion' && room.phase !== 'reunion') return 'The safehouse route is not open yet.';
  if (target.mission === 'reunion' && !checkReunion(room)) {
    if (room.mode === 'deduction' && room.vote?.outcome === 'capture' && !room.culpritCaught) return 'The identified thief must be captured before the case can close.';
    return 'Wait until every active player and the captured thief are at the safehouse door.';
  }
  if (room.sabotage && room.sabotage.mission === target.mission && room.sabotage.until > Date.now()) return 'This station is jammed. Clear the interference first.';
  return null;
}

function recordPart(room, player, missionName, part) {
  const mission = room.missions[missionName];
  if (mission.parts[part]) return { ok: false, message: 'That piece of evidence is already being handled.' };
  const needsSecondDetective = activePlayers(room).filter((p) => p.role === 'detective' && !p.eliminated).length > 1;
  if (needsSecondDetective && Object.values(mission.parts).includes(player.id)) return { ok: false, message: 'A different detective must examine the other part.' };
  mission.parts[part] = player.id;
  const done = Object.values(mission.parts).every(Boolean);
  if (done) {
    mission.done = true;
    if (missionName === 'letter') {
      addClue(room, 'A letter out of time', 'The iron-gall ink belongs to the Yard dispatch office. Its register shows Inspector Elias Vale signed out the seal at 8:52—twelve minutes after Holmes left London. The letter stamped at 9:10 could not have come from Holmes.');
      addLog(room, 'The ink and seal register expose a forgery made after Holmes left London.', 'good');
    } else {
      addClue(room, 'The Blackthorn telegram', 'The live signal decodes to BLACKTHORN HOUSE. Its 9:28 pm transfer is signed by Inspector Elias Vale; the porter’s name appears only on a planted timetable. Vale used a Yard insider to delay the team and frame the porter.');
      addLog(room, 'The repaired telegraph reveals the false timetable and the transfer to Blackthorn House.', 'good');
      if (room.phase !== 'capture') {
        room.phase = 'reunion';
        addLog(room, 'The route to Blackthorn Safehouse is open. Every active player must reach the door.', 'story');
      }
    }
  } else {
    addLog(room, `${player.name} examined the ${part === 'ink' ? 'dispatch ink' : part === 'seal' ? 'seal register' : part === 'sender' ? 'sender coil' : 'relay cable'}.`, 'mission');
  }
  const otherPartRule = needsSecondDetective ? ' A different detective must complete the comparison.' : ' You may examine the other fragment yourself.';
  return { ok: true, message: done ? 'Mission complete. New evidence added to the journal.' : `Evidence recorded.${otherPartRule}` };
}

function resolveVote(room) {
  if (!room.vote?.open || room.vote.resolved) return;
  const detectives = activePlayers(room).filter((p) => p.role === 'detective' && !p.eliminated);
  const counts = {};
  for (const p of detectives) if (p.vote) counts[p.vote] = (counts[p.vote] || 0) + 1;
  const candidate = detectives.length && detectives.every((p) => p.vote && p.vote === detectives[0].vote) ? detectives[0].vote : null;
  const culprit = [...room.players.values()].find((p) => p.role === 'culprit');
  room.vote.resolved = true;
  room.vote.open = false;
  room.vote.tally = Object.fromEntries(Object.entries(counts).map(([id, count]) => [room.players.get(id)?.name || 'Detective', count]));
  room.vote.suspectName = room.players.get(candidate)?.name || null;
  if (candidate && candidate === culprit?.id) {
    room.vote.outcome = 'capture';
    room.phase = 'capture';
    room.capture = { sequence: ['lever', 'valve', 'key'], mechanisms: [] };
    addLog(room, `🚨 FINAL CHASE INITIATED! The detectives unanimously identify ${culprit.name} as the thief! Pursue the thief and coordinate the 3-step safehouse trap (lever, valve, key) to capture them!`, 'alert');
  } else if (candidate) {
    room.vote.outcome = 'wrong';
    addLog(room, `The detectives unanimously suspect ${room.players.get(candidate)?.name}, but the clues do not support it. The real culprit is still at large.`, 'alert');
  } else {
    room.vote.outcome = 'split';
    addLog(room, 'The detectives cannot agree on one suspect. The culprit stays hidden; finish the evidence trail and reunite at Blackthorn House.', 'note');
  }
}

function maybeResolveVote(room) {
  if (!room.vote?.open) return;
  const detectives = activePlayers(room).filter((p) => p.role === 'detective' && !p.eliminated);
  if (detectives.length && detectives.every((p) => p.vote)) resolveVote(room);
}

function completeCase(room) {
  if (room.phase !== 'reunion' || !checkReunion(room)) return { ok: false, message: 'Every participant, including the captured thief, must reach the safehouse door before the case can close.' };
  if (room.mode === 'deduction' && room.vote?.outcome === 'capture' && !room.culpritCaught) {
    return { ok: false, message: 'The identified thief must be captured before the case can close.' };
  }
  const players = activePlayers(room);
  const culprit = [...room.players.values()].find((p) => p.role === 'culprit');
  const teamSolved = room.mode === 'cooperative' || room.culpritCaught;
  const roundAwards = players.map((p) => {
    let pointsEarned = 0;
    const notes = [];
    if (p.role === 'culprit') {
      const sabotagePoints = room.sabotagedMissions.length;
      if (sabotagePoints) notes.push(`${sabotagePoints} sabotage point${sabotagePoints === 1 ? '' : 's'}`);
      pointsEarned += sabotagePoints;
      if (room.culpritObjective) { pointsEarned += 2; notes.push('2 secret-objective points'); }
      if (!room.culpritCaught) { pointsEarned += 2; notes.push('2 points for escaping capture'); }
      if (dist(p, points.reunion) <= 82) { notes.push('Escorted to Blackthorn Safehouse'); }
    } else {
      const fragments = [room.missions.letter.parts, room.missions.telegraph.parts]
        .flatMap((parts) => Object.values(parts)).filter((contributor) => contributor === p.id).length;
      if (fragments) notes.push(`${fragments} evidence point${fragments === 1 ? '' : 's'}`);
      pointsEarned += fragments;
      if (!p.eliminated && dist(p, points.reunion) <= 82 && !p.incapacitated) { pointsEarned += 1; notes.push('1 reunion point'); }
      if (teamSolved) { pointsEarned += 2; notes.push('2 points for solving the case together'); }
      if (room.culpritCaught && p.vote === culprit?.id) { pointsEarned += 3; notes.push('3 points for identifying the culprit'); }
    }
    room.scores.set(p.id, (room.scores.get(p.id) || 0) + pointsEarned);
    return { playerId: p.id, name: p.name, pointsEarned, notes };
  }).sort((a, b) => b.pointsEarned - a.pointsEarned || a.name.localeCompare(b.name));
  const scoreboard = [...room.scores.entries()]
    .map(([playerId, score]) => ({ playerId, name: room.players.get(playerId)?.name || 'Detective', score }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const highestScore = scoreboard[0]?.score ?? 0;
  const matchWinners = scoreboard.filter((entry) => entry.score === highestScore);
  room.result = {
    round: room.round,
    caseSolved: teamSolved,
    culpritCaught: room.culpritCaught,
    caseOutcome: room.mode === 'cooperative'
      ? 'The detectives worked together, recovered Holmes’s original ledger, and solved the case.'
      : room.culpritCaught
        ? `The detectives unanimously caught ${culprit?.name || 'the culprit'} and recovered Holmes’s original ledger together.`
        : room.vote?.outcome === 'wrong'
          ? 'The detectives recovered Holmes’s original ledger together, but a wrong unanimous vote let the culprit escape.'
          : 'The detectives recovered Holmes’s original ledger together, but the split vote let the culprit escape.',
    culpritObjectiveAchieved: room.culpritObjective,
    roundAwards,
    scoreboard,
    matchComplete: room.round === MATCH_ROUNDS,
    matchWinnerNames: room.round === MATCH_ROUNDS ? matchWinners.map((entry) => entry.name) : [],
    culpritName: culprit?.name || null,
    truth: `Inspector Elias Vale forged the 9:10 letter after Holmes left London and sent the genuine case ledger to Blackthorn House at 9:28. He planted a decoy timetable to frame the Yard porter.${culprit ? ` ${culprit.name} was Vale’s insider, delaying the detectives from within.` : ''} Holmes left the reversed timetable as a counter-trail.`,
  };
  room.phase = 'results';
  addLog(room, room.culpritCaught ? 'With the culprit in custody and the team reunited, Holmes’s case is solved.' : room.mode === 'cooperative' ? 'The team reaches Blackthorn House together and solves the case.' : 'The team reaches Blackthorn House and solves the mystery, but the culprit escapes.', room.culpritCaught || room.mode === 'cooperative' ? 'good' : 'alert');
  if (room.culpritObjective) addLog(room, 'The culprit’s interference objective was achieved before the case closed.', 'story');
  return { ok: true, message: 'The team is together. The case is closed.' };
}

function resetForRematch(room) {
  if (room.round >= MATCH_ROUNDS) {
    room.round = 1;
    room.scores = new Map([...room.players.keys()].map((playerId) => [playerId, 0]));
  } else {
    room.round += 1;
  }
  room.phase = 'lobby';
  const now = Date.now();
  for (const p of room.players.values()) {
    p.role = null;
    p.eliminated = false;
    p.ready = false;
    p.incapacitated = false;
    p.incapacitatedAt = 0;
    p.safehouse = false;
    p.vote = null;
    p.connected = now - p.lastSeen <= HEARTBEAT_MS;
    p.dropped = false;
    if (p.connected) p.lastSeen = now;
    p.x = 165 + Math.random() * 38;
    p.y = 320 + Math.random() * 50;
  }
  room.missions = {
    letter: { done: false, parts: { ink: null, seal: null } },
    cipher: { done: false },
    telegraph: { done: false, parts: { sender: null, receiver: null } },
  };
  room.mansion = {
    gateOpen: false,
    clockHour: 12,
    clockSolved: false,
    selectedBooks: [],
    librarySolved: false,
    basementSymbols: ['sun', 'sun', 'sun', 'sun'],
    basementSolved: false,
    secretDoorOpen: false,
    thiefRevealed: false,
    thiefAddedToCasebook: false,
  };
  room.clues = [];
  room.log = [];
  room.chat = [];
  room.sabotage = null;
  room.sabotageCooldownAt = 0;
  room.ambushCooldownAt = 0;
  room.vote = null;
  room.capture = null;
  room.mode = null;
  room.culpritCaught = false;
  room.culpritObjective = false;
  room.sabotagedMissions = [];
  room.reunionComplete = false;
  room.result = null;
  room.countdownUntil = null;
  room.startedAt = null;
  addLog(room, `Round ${room.round} of ${MATCH_ROUNDS} is ready. Holmes has sent another telegram.`);
}

async function readJson(req) {
  if (req.parsedBody) return req.parsedBody;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 12_000) throw httpError(413, 'Request is too large.');
  }
  try { return raw ? JSON.parse(raw) : {}; }
  catch { throw httpError(400, 'That request could not be read. Please try again.'); }
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  res.end(JSON.stringify(data));
}

function startGame(room, host) {
  if (room.phase !== 'lobby') return { ok: false, message: 'This case has already started.' };
  if (host.id !== room.hostId) return { ok: false, message: 'Only the room host can start the case.' };
  const players = activePlayers(room).filter((p) => p.connected);
  if (players.length < MIN_PLAYERS) return { ok: false, message: `The case needs at least ${MIN_PLAYERS} connected players.` };
  if (players.length > MAX_PLAYERS) return { ok: false, message: `A room can hold at most ${MAX_PLAYERS} players.` };
  if (!players.every((p) => p.ready)) return { ok: false, message: 'Every connected player must be ready before the case can begin.' };

  // Default to cooperative detective adventure, while supporting legacy deduction mode if explicitly set
  const isDeduction = room.mode === 'deduction';
  if (!isDeduction) {
    room.mode = 'cooperative';
  }
  room.portrait = {
    totalPieces: 6,
    collectedPieces: [],
    allCollected: false,
    assembled: false,
  };
  room.clues = [];

  const culpritIdx = isDeduction ? Math.floor(Math.random() * players.length) : -1;

  players.forEach((p, i) => {
    p.ready = false;
    p.role = i === culpritIdx ? 'culprit' : 'detective';
    p.eliminated = false;
    p.incapacitated = false;
    p.incapacitatedAt = 0;
    p.vote = null;
    p.safehouse = false;
    const spawn = [
      { x: 112, y: 110 }, { x: 252, y: 182 }, { x: 494, y: 154 }, { x: 738, y: 306 },
      { x: 874, y: 410 }, { x: 460, y: 470 }, { x: 430, y: 240 }, { x: 660, y: 235 },
    ][i % 8];
    p.x = spawn.x;
    p.y = spawn.y;
  });
  room.evidenceBoard = buildCulpritEvidenceBoard(room, culpritIdx >= 0 ? players[culpritIdx] : players[0]);
  room.evidenceConnections = [];
  room.suspectNotes = {};
  room.phase = 'investigation';
  room.startedAt = Date.now();
  room.countdownUntil = Date.now() + 3200;
  addLog(room, 'The cooperative investigation begins! Explore London, solve forensic mini-games, and recover all 6 pieces of the Phantom Thief\'s portrait!', 'story');
  return { ok: true, message: 'The cooperative investigation has begun. Recover all 6 portrait pieces together!' };
}

function doAction(room, player, body) {
  sweepRoom(room);
  const action = body.action;
  const now = Date.now();
  if (action === 'start') return startGame(room, player);
  if (action === 'character') {
    if (room.phase !== 'lobby') return { ok: false, message: 'Character selection is closed once the case begins.' };
    if (player.ready) return { ok: false, message: 'Mark yourself not ready before changing detectives.' };
    if (!CHARACTERS.has(body.character)) return { ok: false, message: 'Choose a valid detective persona.' };
    player.character = body.character;
    addLog(room, `${player.name} joined the case as the ${body.character} detective.`, 'note');
    return { ok: true, message: 'Detective saved to the room.' };
  }
  if (action === 'leave') {
    const wasHost = player.id === room.hostId;
    player.connected = false;
    player.dropped = true;
    player.ready = false;
    player.token = randomBytes(24).toString('base64url');
    if (wasHost) {
      room.hostId = [...room.players.values()].find((candidate) => candidate.id !== player.id && candidate.connected && !candidate.dropped)?.id || null;
      if (room.hostId) addLog(room, `${room.players.get(room.hostId).name} is now hosting the room.`, 'note');
    }
    addLog(room, `${player.name} left the room.`, 'note');
    return { ok: true, message: 'You left the room.' };
  }
  if (action === 'ready') {
    if (room.phase !== 'lobby') return { ok: false, message: 'The ready button is only available in the waiting room.' };
    player.ready = Boolean(body.ready);
    room.lastTouched = now;
    const connectedPlayers = activePlayers(room).filter((p) => p.connected);
    const readyCount = connectedPlayers.filter((p) => p.ready).length;
    return { ok: true, message: player.ready ? `You are ready. ${readyCount} of ${connectedPlayers.length} players are ready.` : 'You are not marked ready.' };
  }
  if (action === 'move') {
    if (!['investigation', 'capture', 'reunion'].includes(room.phase) || player.incapacitated || player.eliminated) return { ok: false, message: 'You cannot move right now.' };
    const dx = clamp(Number(body.dx) || 0, -1, 1);
    const dy = clamp(Number(body.dy) || 0, -1, 1);
    const len = Math.hypot(dx, dy) || 1;
    const dt = clamp((now - player.moveAt) / 1000, 0, 0.35);
    const speedMult = (room.phase === 'capture' && player.role === 'culprit') ? 1.15 : 1.0;
    const moveX = (dx / len) * (SPEED * speedMult) * dt;
    const moveY = (dy / len) * (SPEED * speedMult) * dt;
    const steps = Math.max(1, Math.ceil(Math.hypot(moveX, moveY) / 6));
    for (let step = 0; step < steps; step++) {
      const nextX = player.x + moveX / steps;
      const nextY = player.y + moveY / steps;
      if (canStandAt(nextX, nextY)) {
        player.x = nextX;
        player.y = nextY;
      } else {
        if (canStandAt(nextX, player.y)) player.x = nextX;
        if (canStandAt(player.x, nextY)) player.y = nextY;
      }
    }
    player.moveAt = now;
    return { ok: true };
  }
  if (action === 'interact') {
    if (player.eliminated) return { ok: false, message: 'You have been taken into custody and are out of the chase.' };
    if (player.incapacitated) return { ok: false, message: 'Wait for a teammate to rescue you.' };
    const down = activePlayers(room).find((p) => p.incapacitated && dist(player, p) <= 43);
    if (down && player.role !== 'culprit') {
      down.incapacitated = false;
      down.incapacitatedAt = 0;
      addLog(room, `${player.name} helped ${down.name} back to their feet.`, 'good');
      return { ok: true, message: `${down.name} is back in the investigation.` };
    }
    const target = nearestTarget(player);
    if (target && room.sabotage && room.sabotage.mission === target.mission && room.sabotage.until > now && player.role !== 'culprit') {
      room.sabotage = null;
      addLog(room, `${player.name} cleared the interference at the mission station.`, 'good');
      return { ok: true, message: 'Interference cleared. The team can continue the mission.' };
    }
    const error = missionCanInteract(room, target);
    if (error) return { ok: false, message: error };
    if (room.mode === 'deduction' && player.role === 'culprit' && target.mission !== 'reunion') {
      return { ok: false, message: 'You cannot submit evidence as the hidden culprit.' };
    }
    if (target.id === 'cipher' || target.id === 'wire') {
      return { ok: false, message: 'This exhibit needs its field mechanism. Open the investigation and solve it there.' };
    }
    const correctAnswer = DEDUCTION_ANSWERS[target.id];
    if (correctAnswer && body.answer !== correctAnswer) {
      return { ok: false, message: 'That conclusion does not fit the exhibit. Re-examine the evidence and try again.' };
    }
    if (target.mission === 'letter' || target.mission === 'telegraph') return recordPart(room, player, target.mission, target.part);
    if (target.category && !target.mission) {
      if (room.clues.some((c) => c.id === target.id)) {
        return { ok: false, message: 'This evidence has already been secured.' };
      }
      room.clues.push({
        id: target.id,
        title: target.title || target.label,
        detail: target.detail,
        category: target.category,
        foundBy: player.name,
        time: Date.now(),
      });
      addLog(room, `${player.name} discovered ${target.title || target.label} (${target.category.toUpperCase()}) and cataloged it into the casebook.`, 'good');
      unlockEvidenceFragment(room, target.id, player);

      // Award matching portrait piece
      if (PORTRAIT_PIECES[target.id]) {
        const piece = PORTRAIT_PIECES[target.id];
        room.portrait = room.portrait || { totalPieces: 6, collectedPieces: [], allCollected: false, assembled: false };
        if (!room.portrait.collectedPieces.includes(piece.id)) {
          room.portrait.collectedPieces.push(piece.id);
          if (room.portrait.collectedPieces.length >= 6) {
            room.portrait.allCollected = true;
            addLog(room, 'ALL 6 PORTRAIT PIECES RECOVERED! Return to Headquarters to assemble the complete thief portrait!', 'story');
          }
        }
      }

      return { ok: true, message: `${target.title || target.label} secured! Evidence logged in casebook.` };
    }
    if (target.mission === 'cipher') {
      room.missions.cipher.done = true;
      addClue(room, 'Holmes’s reverse timetable', 'The reversed margin note decodes to EAST LONDON · 9:28. The porter’s name appears on a decoy timetable, not in the live dispatch. The signal box holds the authentic transfer record.');
      addLog(room, `${player.name} decodes Holmes’s timetable. The East London signal box is the next lead.`, 'good');
      unlockEvidenceFragment(room, 'cipher', player);
      return { ok: true, message: 'Cipher decoded. New evidence added to the journal.' };
    }
    if (target.mission === 'reunion') {
      if (room.portrait?.allCollected || room.portrait?.collectedPieces?.length >= 6) {
        room.portrait.assembled = true;
        room.phase = 'results';
        room.reunionComplete = true;
        room.result = {
          winner: 'detectives',
          title: 'CASE SOLVED',
          reason: 'portrait_assembled',
          durationSeconds: Math.round((now - (room.startedAt || now)) / 1000),
          totalPieces: 6,
          detectives: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, character: p.character })),
        };
        addLog(room, `CASE SOLVED! ${player.name} and the detective team assembled the complete portrait of Edward Blackthorn!`, 'story');
        return { ok: true, message: 'The thief portrait is fully assembled! Case Solved!' };
      }
      room.reunionComplete = true;
      return completeCase(room);
    }
    return { ok: false, message: 'There is nothing to use here yet.' };
  }
  if (action === 'solve-mini-game' || action === 'solve-puzzle' || action === 'collect-piece') {
    if (player.eliminated) return { ok: false, message: 'You are eliminated from the case.' };
    const stationId = body.stationId || body.clueId || body.id;
    const pieceInfo = PORTRAIT_PIECES[stationId];
    if (!pieceInfo) return { ok: false, message: 'Unknown investigation station.' };

    const targetPos = points[pieceInfo.location];
    if (!targetPos) return { ok: false, message: 'Invalid target location.' };
    if (dist(player, targetPos) > 85) {
      return { ok: false, message: `You must approach ${targetPos.label} to investigate.` };
    }

    room.portrait = room.portrait || { totalPieces: 6, collectedPieces: [], allCollected: false, assembled: false };

    // Prevent duplicate rewards
    if (room.portrait.collectedPieces.includes(pieceInfo.id)) {
      return { ok: false, message: 'Your detective team has already recovered this portrait piece!' };
    }

    room.portrait.collectedPieces.push(pieceInfo.id);
    const pieceClue = {
      id: stationId,
      stationId,
      pieceId: pieceInfo.id,
      title: pieceInfo.name,
      detail: `Secured by ${player.name} at ${targetPos.label}.`,
      category: pieceInfo.gameType,
      foundBy: player.name,
      time: now,
    };
    room.clues.push(pieceClue);
    room.scores.set(player.id, (room.scores.get(player.id) || 0) + 150);

    unlockEvidenceFragment(room, stationId, player);
    addLog(room, `${player.name} completed the ${pieceInfo.gameType.replace('-', ' ')} challenge and secured Portrait Piece #${pieceInfo.id} (${room.portrait.collectedPieces.length}/6)!`, 'good');

    if (room.portrait.collectedPieces.length >= 6) {
      room.portrait.allCollected = true;
      addLog(room, 'ALL 6 PORTRAIT PIECES RECOVERED! Return to Headquarters to assemble the complete thief portrait!', 'story');
    }

    return {
      ok: true,
      message: `Portrait piece #${pieceInfo.id} secured for the team!`,
      pieceId: pieceInfo.id,
      collectedCount: room.portrait.collectedPieces.length,
      allCollected: room.portrait.allCollected,
    };
  }
  if (action === 'assemble-portrait') {
    room.portrait = room.portrait || { totalPieces: 6, collectedPieces: [], allCollected: false, assembled: false };
    if (!room.portrait.allCollected && room.portrait.collectedPieces.length < 6) {
      return { ok: false, message: 'You must recover all 6 portrait pieces before assembling the picture.' };
    }
    const hqPos = points.reunion;
    if (dist(player, hqPos) > 95) {
      return { ok: false, message: 'You must gather at Headquarters to assemble the portrait.' };
    }

    room.portrait.assembled = true;
    room.phase = 'results';
    room.reunionComplete = true;
    room.result = {
      winner: 'detectives',
      title: 'CASE SOLVED',
      caseSolved: true,
      reason: 'portrait_assembled',
      caseOutcome: 'All 6 portrait pieces recovered and the phantom thief unmasked!',
      truth: 'The Phantom Thief Edward Blackthorn was identified through forensic evidence assembled by the cooperative detective team.',
      durationSeconds: Math.round((now - (room.startedAt || now)) / 1000),
      totalPieces: 6,
      detectives: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, character: p.character })),
    };
    addLog(room, `CASE SOLVED! ${player.name} and the detective team assembled the complete portrait of Edward Blackthorn!`, 'story');
    return { ok: true, message: 'The thief portrait is fully assembled! Case Solved!' };
  }
  if (action === 'puzzle') {
    if (player.eliminated) return { ok: false, message: 'You have been taken into custody and are out of the chase.' };
    if (player.incapacitated) return { ok: false, message: 'Wait for a teammate to rescue you.' };
    const target = nearestTarget(player);
    const error = missionCanInteract(room, target);
    if (error) return { ok: false, message: error };
    if (room.mode === 'deduction' && player.role === 'culprit') return { ok: false, message: 'You cannot submit detective evidence as the hidden culprit.' };
    const station = String(body.station || '');
    if (target.id !== station || !['cipher', 'wire'].includes(station)) return { ok: false, message: 'Move close to the matching field mechanism before using it.' };
    const solution = Array.isArray(body.solution) ? body.solution : [];
    const expected = station === 'cipher' ? [9, 2, 8] : ['short', 'short', 'short', 'long'];
    if (solution.length !== expected.length || solution.some((value, index) => value !== expected[index])) {
      return { ok: false, message: station === 'cipher' ? 'The timetable dial does not match Holmes’s reversed note. Try again.' : 'No live current. Recheck the pulse order and try again.' };
    }
    if (station === 'cipher') {
      room.missions.cipher.done = true;
      addClue(room, 'Holmes’s reverse timetable', 'The reversed margin note decodes to EAST LONDON · 9:28. The porter’s name appears on a decoy timetable, not in the live dispatch. The signal box holds the authentic transfer record.');
      addLog(room, `${player.name} sets the Baker Street timetable dial to 9:28. The East London signal box is the next lead.`, 'good');
      unlockEvidenceFragment(room, 'cipher', player);
      return { ok: true, message: 'The dial clicks into place. Cipher decoded; new evidence added to the casebook.' };
    }
    addLog(room, `${player.name} restores the signal with three short pulses and one long pulse.`, 'good');
    return recordPart(room, player, 'telegraph', 'sender');
  }
  if (action === 'sabotage') {
    if (player.role !== 'culprit' || room.culpritCaught || player.eliminated || room.mode !== 'deduction' || !['investigation', 'reunion'].includes(room.phase)) return { ok: false, message: 'That action is unavailable.' };
    const detectiveCount = activePlayers(room).filter((p) => p.role === 'detective' && !p.eliminated).length;
    const targetPlayer = detectiveCount > 1 ? activePlayers(room).find((p) => p.id !== player.id && p.role === 'detective' && !p.incapacitated && !p.eliminated && dist(player, p) <= 38) : null;
    if (targetPlayer) {
      if (now < room.ambushCooldownAt) return { ok: false, message: `Ambush recharges in ${Math.ceil((room.ambushCooldownAt - now) / 1000)}s.` };
      targetPlayer.incapacitated = true;
      targetPlayer.incapacitatedAt = now;
      room.ambushCooldownAt = now + 38_000;
      addLog(room, `${targetPlayer.name} has been knocked down. A nearby detective can rescue them.`, 'alert');
      return { ok: true, message: 'Your ambush succeeded. Keep your distance; a teammate can rescue them.' };
    }
    if (now < room.sabotageCooldownAt) return { ok: false, message: `Sabotage recharges in ${Math.ceil((room.sabotageCooldownAt - now) / 1000)}s.` };
    const unfinished = ['letter', 'cipher', 'telegraph'].filter((id) => !room.missions[id].done);
    const mission = unfinished.find((id) => Object.values(points).some((p) => p.mission === id && dist(player, p) <= 110));
    if (!mission) return { ok: false, message: 'Move closer to an unfinished mission station to sabotage it.' };
    room.sabotage = { mission, until: now + 16_000 };
    room.sabotageCooldownAt = now + 27_000;
    if (!room.sabotagedMissions.includes(mission)) room.sabotagedMissions.push(mission);
    if (room.sabotagedMissions.length >= 2) room.culpritObjective = true;
    addLog(room, 'A mission station flickers and jams. Someone must clear the interference.', 'alert');
    return { ok: true, message: room.culpritObjective ? 'Interference objective achieved. Keep the team from completing its case.' : 'Station jammed. Your interference will clear after 16 seconds.' };
  }
  if (action === 'vote') {
    if (room.mode !== 'deduction' || player.role !== 'detective' || player.eliminated) return { ok: false, message: 'Only detectives can vote in a four-or-more-player case.' };
    if (activePlayers(room).filter((p) => p.role === 'detective' && !p.eliminated).length < 2) return { ok: false, message: 'There are not enough detectives to hold a vote.' };
    const unlockedFrags = (room.evidenceBoard || []).filter((f) => f.unlocked).length;
    if ((room.clues.length < 2 && unlockedFrags < 2) || !['investigation', 'reunion'].includes(room.phase)) return { ok: false, message: 'The investigation needs two clues before a vote can open.' };
    if (room.vote?.resolved) return { ok: false, message: 'The team already held its investigation vote.' };
    const target = room.players.get(String(body.target || ''));
    if (!target || target.dropped) return { ok: false, message: 'Choose a player who is still in the case.' };
    if (!room.vote) {
      room.vote = { open: true, resolved: false, deadline: now + 30_000, tally: null, outcome: null };
      addLog(room, 'Two clues are on the board. Each detective may name one suspect. A unanimous vote opens a coordinated safehouse trap.', 'story');
    }
    if (player.vote) return { ok: false, message: 'Your investigation vote is already recorded.' };
    player.vote = target.id;
    maybeResolveVote(room);
    return { ok: true, message: 'Suspicion recorded. A unanimous vote opens the safehouse trap.' };
  }
  if (action === 'call-vote') {
    if (room.mode !== 'deduction' || player.role !== 'detective' || player.eliminated) return { ok: false, message: 'Only detectives can convene an accusation vote.' };
    const detectives = activePlayers(room).filter((p) => p.role === 'detective' && !p.eliminated);
    if (detectives.length < 2) return { ok: false, message: 'There are not enough detectives to hold a vote.' };
    const unlockedExhibits = (room.evidenceBoard || []).filter((f) => f.unlocked).length;
    if (unlockedExhibits < 2 && room.clues.length < 2) return { ok: false, message: 'At least two exhibits or clues must be unlocked before convening an accusation.' };
    if (room.vote?.resolved) return { ok: false, message: 'The accusation vote has already been resolved.' };
    if (!room.vote) {
      room.vote = { open: true, resolved: false, deadline: now + 35_000, tally: null, outcome: null };
      addLog(room, `⚖️ ${player.name} convened an Accusation Council! Review the evidence board and name the thief.`, 'alert');
    }
    if (body.target) {
      const target = room.players.get(String(body.target));
      if (target && !target.dropped && !player.vote) {
        player.vote = target.id;
        maybeResolveVote(room);
      }
    }
    return { ok: true, message: 'Accusation Council convened. All detectives must cast their vote.' };
  }
  if (action === 'connect-evidence') {
    if (player.eliminated) return { ok: false, message: 'You are eliminated from the case.' };
    const { from, to } = body;
    if (!from || !to || from === to) return { ok: false, message: 'Select two distinct evidence fragments to connect.' };
    const board = room.evidenceBoard || [];
    const fragA = board.find((f) => f.id === from);
    const fragB = board.find((f) => f.id === to);
    if (!fragA || !fragB) return { ok: false, message: 'Evidence fragments could not be found on the board.' };
    if (!fragA.unlocked || !fragB.unlocked) return { ok: false, message: 'Both evidence fragments must be unlocked before drawing deductions.' };
    room.evidenceConnections = room.evidenceConnections || [];
    const alreadyConnected = room.evidenceConnections.some((c) => (c.from === from && c.to === to) || (c.from === to && c.to === from));
    if (alreadyConnected) return { ok: false, message: 'These two pieces of evidence are already connected by thread.' };
    room.evidenceConnections.push({ from, to, by: player.name, time: now });
    addLog(room, `${player.name} strung red thread between [${fragA.title}] and [${fragB.title}].`, 'progress');
    return { ok: true, message: 'Investigative thread pinned to the evidence board.' };
  }
  if (action === 'suspect-note') {
    if (player.eliminated) return { ok: false, message: 'You are eliminated from the case.' };
    const { suspectId, note } = body;
    if (!suspectId || !room.players.has(suspectId)) return { ok: false, message: 'Select an active suspect to annotate.' };
    const cleanNote = String(note || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 140);
    room.suspectNotes = room.suspectNotes || {};
    room.suspectNotes[suspectId] = {
      note: cleanNote,
      author: player.name,
      time: now,
    };
    const suspect = room.players.get(suspectId);
    if (cleanNote) {
      addLog(room, `${player.name} added dossier notes on suspect ${suspect.name}: "${cleanNote}".`, 'note');
    }
    return { ok: true, message: 'Suspect dossier updated.' };
  }
  if (action === 'trap') {
    if (room.phase !== 'capture' || !room.capture) return { ok: false, message: 'The safehouse trap is not active.' };
    if (player.role !== 'detective' || player.eliminated || player.incapacitated || !player.connected) return { ok: false, message: 'Only a connected, active detective can operate the trap.' };
    if (dist(player, points.reunion) > 82) return { ok: false, message: 'Move to the Blackthorn Safehouse mechanism first.' };
    const culprit = [...room.players.values()].find((p) => p.role === 'culprit');
    if (!culprit || dist(culprit, points.reunion) > 150) return { ok: false, message: 'The culprit is not in range. Bring the team together at the safehouse.' };
    const activeDets = activePlayers(room).filter((p) => p.role === 'detective' && p.connected && !p.dropped);
    if (activeDets.length >= 3) {
      if (room.capture.mechanisms.some((entry) => entry.playerId === player.id)) {
        return { ok: false, message: 'A different detective must operate the next mechanism.' };
      }
    } else {
      const lastOp = room.capture.mechanisms[room.capture.mechanisms.length - 1];
      if (lastOp && lastOp.playerId === player.id) {
        return { ok: false, message: 'A different detective must alternate operating the mechanisms.' };
      }
    }
    const expected = room.capture.sequence[room.capture.mechanisms.length];
    if (body.mechanism !== expected) return { ok: false, message: `The next mechanism is ${expected}. Follow the trap sequence.` };
    room.capture.mechanisms.push({ mechanism: expected, playerId: player.id });
    if (room.capture.mechanisms.length === room.capture.sequence.length) {
      room.culpritCaught = true;
      culprit.eliminated = false;
      culprit.captured = true;
      if (room.missions.telegraph.done) {
        room.phase = 'reunion';
        addLog(room, `The team triggers the final key! ${culprit.name} (The Thief) has been cornered and taken into custody. All participants must now assemble at Blackthorn Safehouse to complete the case!`, 'good');
      } else {
        room.phase = 'investigation';
        addLog(room, `The team triggers the final key! ${culprit.name} (The Thief) has been cornered and taken into custody. Complete the telegraph dispatch to unseal Blackthorn Safehouse.`, 'good');
      }
      return { ok: true, message: 'The trap is complete. The thief is in custody.' };
    }
    addLog(room, `${player.name} operates the ${expected} at Blackthorn Safehouse.`, 'mission');
    return { ok: true, message: `${expected[0].toUpperCase()}${expected.slice(1)} set. Another detective must operate the next mechanism.` };
  }
  if (action === 'chat') {
    const text = String(body.text || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 180);
    if (!text) return { ok: false, message: 'Write a message first.' };
    room.chat.push({ id: randomUUID(), playerId: player.id, name: player.name, text, time: now });
    if (room.chat.length > 50) room.chat.shift();
    return { ok: true };
  }
  if (action === 'gate') {
    room.mansion = room.mansion || {};
    room.mansion.gateOpen = true;
    addLog(room, `${player.name} unlatched the wrought-iron gate to Blackthorn House.`, 'progress');
    return { ok: true, message: 'The courtyard gate swings open.' };
  }
  if (action === 'lockpick') {
    if (player.eliminated) return { ok: false, message: 'You are eliminated from the case.' };
    if (player.incapacitated) return { ok: false, message: 'Wait for a teammate to rescue you.' };
    if (room.mode === 'deduction' && player.role === 'culprit') return { ok: false, message: 'The culprit cannot solve lock puzzles for the detective team.' };
    const target = points.keyIron;
    if (dist(player, target) > 75) return { ok: false, message: 'You must be near the antique lock mechanism to pick it.' };
    if (room.clues.some((c) => c.id === 'clue-key-iron')) return { ok: false, message: 'This lock has already been picked and evidence secured.' };
    const tumblers = Array.isArray(body.tumblers) ? body.tumblers.map(Number) : [];
    if (tumblers.length !== 3 || tumblers[0] !== 3 || tumblers[1] !== 7 || tumblers[2] !== 5) {
      return { ok: false, message: 'The tumblers resist your pick. Listen for the pin alignment click.' };
    }
    room.clues.push({
      id: 'clue-key-iron',
      title: 'Antique Gutter Skeleton Key',
      detail: 'A heavy brass skeleton key stamped with the Blackthorn crest and stepped 3-1-4 wards, retrieved from a gutter crevice.',
      category: 'key',
      foundBy: player.name,
      time: now,
    });
    unlockEvidenceFragment(room, 'clue-key-iron', player);
    room.portrait = room.portrait || { totalPieces: 6, collectedPieces: [], allCollected: false, assembled: false };
    if (!room.portrait.collectedPieces.includes(4)) {
      room.portrait.collectedPieces.push(4);
      if (room.portrait.collectedPieces.length >= 6) {
        room.portrait.allCollected = true;
        addLog(room, 'ALL 6 PORTRAIT PIECES RECOVERED! Return to Headquarters to assemble the complete thief portrait!', 'story');
      }
    }
    addLog(room, `${player.name} picked the antique Victorian lock (3-7-5) and secured the Skeleton Key!`, 'good');
    return { ok: true, message: 'Lock picked! Heavy brass mechanism popped open.' };
  }
  if (action === 'photo-reconstruct') {
    if (player.eliminated) return { ok: false, message: 'You are eliminated from the case.' };
    if (player.incapacitated) return { ok: false, message: 'Wait for a teammate to rescue you.' };
    if (room.mode === 'deduction' && player.role === 'culprit') return { ok: false, message: 'The culprit cannot reconstruct crime scene evidence.' };
    const target = points.photoSurveillance;
    if (dist(player, target) > 75) return { ok: false, message: 'You must be near the crime scene photo plate to inspect it.' };
    if (room.clues.some((c) => c.id === 'clue-photo-surveillance')) return { ok: false, message: 'This photograph has already been reconstructed.' };
    const order = Array.isArray(body.order) ? body.order.map(Number) : [];
    if (order.length !== 6 || order.some((val, idx) => val !== idx)) {
      return { ok: false, message: 'The photo fragments do not align cleanly. Re-examine the torn edges.' };
    }
    room.clues.push({
      id: 'clue-photo-surveillance',
      title: 'Stolen Daguerreotype Plate',
      detail: 'A silver-plated copper daguerreotype plate exposing the silhouette of a tall figure surveying Blackthorn House.',
      category: 'photograph',
      foundBy: player.name,
      time: now,
    });
    unlockEvidenceFragment(room, 'clue-photo-surveillance', player);
    room.portrait = room.portrait || { totalPieces: 6, collectedPieces: [], allCollected: false, assembled: false };
    if (!room.portrait.collectedPieces.includes(3)) {
      room.portrait.collectedPieces.push(3);
      if (room.portrait.collectedPieces.length >= 6) {
        room.portrait.allCollected = true;
        addLog(room, 'ALL 6 PORTRAIT PIECES RECOVERED! Return to Headquarters to assemble the complete thief portrait!', 'story');
      }
    }
    addLog(room, `${player.name} successfully assembled the torn photograph, revealing the suspect in an Ulster coat!`, 'good');
    return { ok: true, message: 'Photograph assembled! Suspect identity silhouette confirmed.' };
  }
  if (action === 'cipher-wheel') {
    if (player.eliminated) return { ok: false, message: 'You are eliminated from the case.' };
    if (player.incapacitated) return { ok: false, message: 'Wait for a teammate to rescue you.' };
    if (room.mode === 'deduction' && player.role === 'culprit') return { ok: false, message: 'The culprit cannot decode secret ciphers for the detectives.' };
    const target = points.cipher;
    if (dist(player, target) > 75) return { ok: false, message: 'You must be at the Baker Street study table to use the cipher wheel.' };
    if (room.missions.cipher.done || room.clues.some((c) => c.id === 'cipher')) return { ok: false, message: 'This cipher has already been decoded.' };
    const shift = Number(body.shift);
    const keyword = String(body.keyword || '').toUpperCase().trim();
    if (shift !== 7 || keyword !== 'BLACKTHORN') {
      return { ok: false, message: 'The cipher wheel alignment is incorrect. The decrypted text does not resolve.' };
    }
    room.missions.cipher.done = true;
    if (!room.clues.some((c) => c.id === 'cipher')) {
      room.clues.push({
        id: 'cipher',
        title: 'Holmes’s Mirrored Pocket Timetable',
        detail: 'The brass cipher wheel decrypted the secret dispatch keyword to BLACKTHORN with a 7-step shift.',
        category: 'letter',
        foundBy: player.name,
        time: now,
      });
    }
    unlockEvidenceFragment(room, 'cipher', player);
    room.portrait = room.portrait || { totalPieces: 6, collectedPieces: [], allCollected: false, assembled: false };
    if (!room.portrait.collectedPieces.includes(1)) {
      room.portrait.collectedPieces.push(1);
      if (room.portrait.collectedPieces.length >= 6) {
        room.portrait.allCollected = true;
        addLog(room, 'ALL 6 PORTRAIT PIECES RECOVERED! Return to Headquarters to assemble the complete thief portrait!', 'story');
      }
    }
    addLog(room, `${player.name} aligned the brass cipher wheel (Shift +7) and decrypted: BLACKTHORN!`, 'good');
    return { ok: true, message: 'Cipher wheel solved! Keyword BLACKTHORN decoded.' };
  }
  if (action === 'clock') {
    if (player.eliminated) return { ok: false, message: 'You are eliminated from the case.' };
    if (player.incapacitated) return { ok: false, message: 'Wait for a teammate to rescue you.' };
    if (room.mode === 'deduction' && player.role === 'culprit') return { ok: false, message: 'The culprit cannot solve safehouse puzzles for the detective team.' };
    const clockPos = { x: 515, y: 575 };
    if (dist(player, clockPos) > 85) return { ok: false, message: 'You must be near the Grandfather Clock to adjust its hands.' };
    room.mansion = room.mansion || {};
    if (room.mansion.clockSolved) return { ok: false, message: 'The Grandfather Clock compartment has already been unlocked.' };
    const hour = Number(body.hour) || 12;
    room.mansion.clockHour = hour;
    if (hour === 4) {
      room.mansion.clockSolved = true;
      if (!room.clues.some((c) => c.id === 'pocket-watch')) {
        room.clues.push({
          id: 'pocket-watch',
          title: 'Antique Pocket Watch',
          detail: 'Halted precisely at 04:00. Engraved with "E.B. - London".',
          foundBy: player.name,
        });
      }
      addLog(room, `${player.name} solved the Grandfather Clock! An antique pocket watch dropped from the case.`, 'lead');
      return { ok: true, solved: true, message: 'Chimes ring out! The grandfather clock compartment has opened.' };
    }
    return { ok: true, solved: false, message: `Hands set to ${hour}:00.` };
  }
  if (action === 'library') {
    if (player.eliminated) return { ok: false, message: 'You are eliminated from the case.' };
    if (player.incapacitated) return { ok: false, message: 'Wait for a teammate to rescue you.' };
    if (room.mode === 'deduction' && player.role === 'culprit') return { ok: false, message: 'The culprit cannot solve safehouse puzzles for the detective team.' };
    const libPos = { x: 445, y: 575 };
    if (dist(player, libPos) > 85) return { ok: false, message: 'You must be near the library bookshelf to examine the volumes.' };
    room.mansion = room.mansion || {};
    if (room.mansion.librarySolved) return { ok: false, message: 'The library bookcase has already swung open.' };
    const books = Array.isArray(body.books) ? body.books : [];
    room.mansion.selectedBooks = books;
    const isCorrect = books.length === 3 && books[0] === 3 && books[1] === 4 && books[2] === 5;
    if (isCorrect) {
      room.mansion.librarySolved = true;
      room.mansion.secretDoorOpen = true;
      if (!room.clues.some((c) => c.id === 'mansion-key')) {
        room.clues.push({
          id: 'mansion-key',
          title: 'Crypt Vault Key & Muddy Footprint',
          detail: 'Heavy iron key with fresh mud matching a London boot print. The bookcase swung open!',
          foundBy: player.name,
        });
      }
      addLog(room, `${player.name} decoded the Library book sequence! A hidden passage opened in the floor.`, 'lead');
      return { ok: true, solved: true, message: 'The library wall unlocks! The secret crypt chamber is now open.' };
    }
    return { ok: true, solved: false, message: 'The books tilt, but the lock mechanism remains engaged.' };
  }
  if (action === 'basement') {
    if (player.eliminated) return { ok: false, message: 'You are eliminated from the case.' };
    if (player.incapacitated) return { ok: false, message: 'Wait for a teammate to rescue you.' };
    if (room.mode === 'deduction' && player.role === 'culprit') return { ok: false, message: 'The culprit cannot solve safehouse puzzles for the detective team.' };
    const basePos = { x: 480, y: 585 };
    if (dist(player, basePos) > 85) return { ok: false, message: 'You must be in the basement vault to manipulate the cryptex.' };
    room.mansion = room.mansion || {};
    if (room.mansion.basementSolved) return { ok: false, message: 'The subterranean vault cryptex has already been solved.' };
    const symbols = Array.isArray(body.symbols) ? body.symbols : ['sun', 'sun', 'sun', 'sun'];
    room.mansion.basementSymbols = symbols;
    // Target sequence: Morning Sun, Midnight Moon, Guiding Star, Master Key
    const isCorrect = symbols.length === 4 && symbols[0] === 'sun' && symbols[1] === 'moon' && symbols[2] === 'star' && symbols[3] === 'key';
    if (isCorrect) {
      room.mansion.basementSolved = true;
      room.mansion.secretDoorOpen = true;
      if (!room.clues.some((c) => c.id === 'basement-mechanism')) {
        room.clues.push({
          id: 'basement-mechanism',
          title: 'Unlocked Basement Cryptex',
          detail: 'Celestial cryptex sequence solved: Sun, Moon, Star, Key. The subterranean vault chamber is unsealed!',
          foundBy: player.name,
        });
      }
      addLog(room, `${player.name} aligned the Basement Mechanism cryptex! The subterranean vault chamber unlocked.`, 'lead');
      return { ok: true, solved: true, message: 'Heavy tumblers align with a metallic clunk! The secret vault chamber opens.' };
    }
    return { ok: true, solved: false, message: 'The cylinders click into place, but the locking bolt remains rigid.' };
  }
  if (action === 'portrait') {
    room.mansion = room.mansion || {};
    room.mansion.thiefRevealed = true;
    if (body.addToCasebook) {
      room.mansion.thiefAddedToCasebook = true;
      if (!room.clues.some((c) => c.id === 'thief-portrait')) {
        room.clues.push({
          id: 'thief-portrait',
          title: 'Edward Blackthorn Revealed',
          detail: 'Mastermind of the London Art Heists. Case deductions confirmed.',
          foundBy: player.name,
        });
      }
      addLog(room, `${player.name} added Edward Blackthorn’s portrait to the Casebook! Case solved.`, 'lead');
      return { ok: true, message: 'Edward Blackthorn pinned to the caseboard!' };
    }
    return { ok: true, message: 'Portrait examined.' };
  }
  if (action === 'rematch') {
    if (player.id !== room.hostId || room.phase !== 'results') return { ok: false, message: 'The host starts the next case from the results screen.' };
    resetForRematch(room);
    return { ok: true, message: 'Rematch room is ready. Players can start when everyone is connected.' };
  }
  return { ok: false, message: 'Unknown action.' };
}


export { rooms, randomCode, newRoom, makePlayer, cleanName, validateName, activePlayers, hasPlayerName, authenticate, publicRoom, doAction, addLog, httpError, sweepRoom, findByCode, MAX_PLAYERS, MIN_PLAYERS, RECONNECT_GRACE_MS, CHARACTERS, CHARACTER_TRAITS, buildCulpritEvidenceBoard, unlockEvidenceFragment, getSuspectsSummary, points, PORTRAIT_PIECES };

