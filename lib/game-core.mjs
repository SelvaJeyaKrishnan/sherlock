import { randomBytes, randomUUID } from 'node:crypto';

const rooms = new Map();
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;
const MATCH_ROUNDS = 3;
const HEARTBEAT_MS = 12_000;
const RECONNECT_GRACE_MS = 90_000;
const MAP_W = 960;
const MAP_H = 640;
const SPEED = 145;

const points = {
  ink: { id: 'letter-ink', x: 112, y: 108, label: 'Ink sample', mission: 'letter', part: 'ink' },
  seal: { id: 'letter-seal', x: 252, y: 182, label: 'Seal register', mission: 'letter', part: 'seal' },
  cipher: { id: 'cipher', x: 494, y: 154, label: 'Cipher table', mission: 'cipher' },
  wire: { id: 'wire', x: 738, y: 306, label: 'Signal box', mission: 'telegraph', part: 'sender' },
  relay: { id: 'relay', x: 874, y: 410, label: 'Relay cable', mission: 'telegraph', part: 'receiver' },
  reunion: { id: 'reunion', x: 484, y: 552, label: 'Safehouse door', mission: 'reunion' },
};

const locations = [
  { id: 'yard', name: 'Scotland Yard', x: 182, y: 145, icon: '✦' },
  { id: 'baker', name: '221B Baker Street', x: 498, y: 160, icon: '⌂' },
  { id: 'station', name: 'East London Station', x: 804, y: 355, icon: '▤' },
  { id: 'safehouse', name: 'Blackthorn Safehouse', x: 480, y: 555, icon: '◈' },
];

const randomCode = () => randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function addLog(room, text, kind = 'note') {
  room.log.push({ id: randomUUID(), time: Date.now(), text, kind });
  if (room.log.length > 36) room.log.shift();
}

function newRoom(code, host) {
  const player = makePlayer(host);
  const room = {
    code,
    createdAt: Date.now(),
    hostId: player.id,
    players: new Map([[player.id, player]]),
    phase: 'lobby',
    round: 1,
    mode: null,
    scores: new Map([[player.id, 0]]),
    missions: {
      letter: { done: false, parts: { ink: null, seal: null } },
      cipher: { done: false },
      telegraph: { done: false, parts: { sender: null, receiver: null } },
    },
    clues: [],
    log: [],
    chat: [],
    sabotage: null,
    sabotageCooldownAt: 0,
    ambushCooldownAt: 0,
    vote: null,
    culpritCaught: false,
    culpritObjective: false,
    sabotagedMissions: [],
    reunionComplete: false,
    result: null,
    lastTouched: Date.now(),
  };
  room.players.set(player.id, player);
  addLog(room, 'A telegram from Sherlock Holmes is waiting. The team is gathering at Scotland Yard.');
  return { room, player };
}

function makePlayer(name) {
  return {
    id: randomUUID(),
    token: randomBytes(24).toString('base64url'),
    name: cleanName(name),
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

function activePlayers(room) {
  const now = Date.now();
  return [...room.players.values()].filter((p) => {
    if (p.dropped && room.phase !== 'results') return false;
    if (!p.connected && now - p.lastSeen > RECONNECT_GRACE_MS && room.phase !== 'results') return false;
    return true;
  });
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
}

function checkReunion(room) {
  const players = activePlayers(room).filter((p) => !p.eliminated);
  if (!players.length || !room.missions.telegraph.done) return false;
  return players.every((p) => !p.incapacitated && dist(p, points.reunion) <= 76);
}

function serialPlayer(p, room, me) {
  return {
    id: p.id,
    name: p.name,
    x: p.x,
    y: p.y,
    connected: p.connected,
    incapacitated: p.incapacitated,
    eliminated: p.eliminated,
    ready: p.ready,
    safehouse: dist(p, points.reunion) <= 76,
    isMe: p.id === me.id,
    isHost: p.id === room.hostId,
    ...(room.culpritCaught || room.phase === 'results' ? { revealedRole: p.role } : {}),
  };
}

function publicRoom(room, me) {
  sweepRoom(room);
  const players = activePlayers(room);
  const connectedPlayers = players.filter((p) => p.connected);
  const readyCount = connectedPlayers.filter((p) => p.ready).length;
  const detectives = players.filter((p) => p.role === 'detective' && !p.eliminated);
  const mePlayer = room.players.get(me.id);
  const missionSummary = {
    letter: { done: room.missions.letter.done, progress: Object.values(room.missions.letter.parts).filter(Boolean).length, total: 2 },
    cipher: { done: room.missions.cipher.done, progress: room.missions.cipher.done ? 1 : 0, total: 1 },
    telegraph: { done: room.missions.telegraph.done, progress: Object.values(room.missions.telegraph.parts).filter(Boolean).length, total: 2 },
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
      clues: room.clues,
      log: room.log,
      chat: room.chat,
      locations,
      points: Object.values(points).map(({ id, x, y, label, mission }) => ({ id, x, y, label, mission })),
      sabotage: room.sabotage ? { mission: room.sabotage.mission, until: room.sabotage.until } : null,
      vote: voteSummary,
      voteAvailable: room.mode === 'deduction' && detectives.length >= 2 && room.clues.length >= 2 && !room.vote && ['investigation', 'reunion'].includes(room.phase),
      culpritCaught: room.culpritCaught,
      activeCount: players.filter((p) => !p.eliminated).length,
      connectedCount: players.filter((p) => p.connected && !p.eliminated).length,
      readyCount,
      allReady: connectedPlayers.length >= MIN_PLAYERS && connectedPlayers.every((p) => p.ready),
      result: room.result,
      reunionReady: room.phase === 'reunion' && checkReunion(room),
    },
    me: {
      ...serialPlayer(mePlayer, room, mePlayer),
      role: mePlayer.role,
      secretObjective: room.mode === 'deduction' && mePlayer.role === 'culprit' ? 'Slow the detectives, avoid a unanimous accusation, and escape with the forged letter.' : 'Work with the other detectives, recover every clue, and reach Blackthorn Safehouse together.',
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

function nearestTarget(player, maxDistance = 58) {
  return Object.values(points)
    .map((point) => ({ ...point, distance: dist(player, point) }))
    .filter((point) => point.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)[0];
}

function missionCanInteract(room, target) {
  if (!target) return 'There is nothing close enough to examine.';
  if (target.mission === 'letter' && room.missions.letter.done) return 'The letter evidence has already been recorded.';
  if (target.mission === 'cipher' && !room.missions.letter.done) return 'Finish comparing the letter fragments first.';
  if (target.mission === 'cipher' && room.missions.cipher.done) return 'The cipher has already been decoded.';
  if (target.mission === 'telegraph' && !room.missions.cipher.done) return 'The cipher points here, but the route is still unknown.';
  if (target.mission === 'telegraph' && room.missions.telegraph.done) return 'The telegraph evidence is already secured.';
  if (target.mission === 'reunion' && room.phase !== 'reunion') return 'The safehouse route is not open yet.';
  if (target.mission === 'reunion' && !checkReunion(room)) return 'Wait until every active player is at the door and safe.';
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
      addClue(room, 'A letter out of time', 'The seal was borrowed from the Yard desk, but the iron-gall ink came from its dispatch office. Holmes left London at 8:40; this letter was stamped at 9:10. Someone forged it after he had gone.');
      addLog(room, 'The two letter fragments do not agree with Holmes’s timeline.', 'good');
    } else {
      addClue(room, 'A wire signed E. Vale', 'The signal ledger records a 9:28 pm evidence transfer to Blackthorn House, countersigned by Inspector Elias Vale. A planted timetable had made the station porter look guilty.');
      addLog(room, 'The repaired telegraph reveals the hidden transfer route and the forger’s name.', 'good');
      room.phase = 'reunion';
      addLog(room, 'The route to Blackthorn Safehouse is open. Every active player must reach the door.', 'story');
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
    room.vote.outcome = 'caught';
    room.culpritCaught = true;
    culprit.eliminated = true;
    addLog(room, `The detectives unanimously identify ${culprit.name} as the culprit and take them into custody. The team must still recover the ledger and reach Blackthorn House together.`, 'good');
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
  if (room.phase !== 'reunion' || !checkReunion(room)) return { ok: false, message: 'The whole team must reach the safehouse door before the case can close.' };
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
    } else {
      const fragments = [room.missions.letter.parts, room.missions.telegraph.parts]
        .flatMap((parts) => Object.values(parts)).filter((contributor) => contributor === p.id).length;
      if (fragments) notes.push(`${fragments} evidence point${fragments === 1 ? '' : 's'}`);
      pointsEarned += fragments;
      if (!p.eliminated && dist(p, points.reunion) <= 76 && !p.incapacitated) { pointsEarned += 1; notes.push('1 reunion point'); }
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
    truth: `Inspector Elias Vale forged the 9:10 letter after Holmes left London. At 9:28 he sent the genuine case ledger by telegraph to Blackthorn House, hoping the false seal would frame the Yard porter.${culprit ? ` The inside culprit was ${culprit.name}.` : ''} Holmes left the real timetable as a counter-trail.`,
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
  room.clues = [];
  room.log = [];
  room.chat = [];
  room.sabotage = null;
  room.sabotageCooldownAt = 0;
  room.ambushCooldownAt = 0;
  room.vote = null;
  room.mode = null;
  room.culpritCaught = false;
  room.culpritObjective = false;
  room.sabotagedMissions = [];
  room.reunionComplete = false;
  room.result = null;
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
  const players = activePlayers(room).filter((p) => p.connected);
  if (players.length < MIN_PLAYERS) return { ok: false, message: `The case needs at least ${MIN_PLAYERS} connected players.` };
  if (players.length > MAX_PLAYERS) return { ok: false, message: `A room can hold at most ${MAX_PLAYERS} players.` };
  if (!players.every((p) => p.ready)) return { ok: false, message: 'Every connected player must be ready before the case can begin.' };
  room.mode = players.length >= 4 ? 'deduction' : 'cooperative';
  const culprit = room.mode === 'deduction' ? players[Math.floor(Math.random() * players.length)] : null;
  players.forEach((p, i) => {
    p.ready = false;
    p.role = p === culprit ? 'culprit' : 'detective';
    p.eliminated = false;
    p.incapacitated = false;
    p.incapacitatedAt = 0;
    p.vote = null;
    p.safehouse = false;
    const spawn = [points.ink, points.seal, points.cipher, points.wire, points.relay, { x: 480, y: 420 }, { x: 390, y: 265 }, { x: 660, y: 245 }][i % 8];
    p.x = spawn.x + (Math.random() - 0.5) * 52;
    p.y = spawn.y + (Math.random() - 0.5) * 42;
  });
  room.phase = 'investigation';
  addLog(room, room.mode === 'cooperative'
    ? 'A blast scatters the detective team through the fog. Work together to recover the letter, cipher, and telegraph clues, then reunite at Blackthorn House.'
    : 'A blast scatters the team through the fog. One player is secretly the culprit. Recover the clues, compare suspicions, and reunite at Blackthorn House.', 'story');
  return { ok: true, message: 'The case has begun. Check your private role card.' };
}

function doAction(room, player, body) {
  sweepRoom(room);
  const action = body.action;
  const now = Date.now();
  if (action === 'start') return startGame(room, player);
  if (action === 'ready') {
    if (room.phase !== 'lobby') return { ok: false, message: 'The ready button is only available in the waiting room.' };
    player.ready = Boolean(body.ready);
    room.lastTouched = now;
    const connectedPlayers = activePlayers(room).filter((p) => p.connected);
    if (connectedPlayers.length >= MIN_PLAYERS && connectedPlayers.every((p) => p.ready)) return startGame(room, player);
    const readyCount = connectedPlayers.filter((p) => p.ready).length;
    return { ok: true, message: player.ready ? `You are ready. ${readyCount} of ${connectedPlayers.length} players are ready.` : 'You are not marked ready.' };
  }
  if (action === 'move') {
    if (!['investigation', 'reunion'].includes(room.phase) || player.incapacitated || player.eliminated) return { ok: false, message: 'You cannot move right now.' };
    const dx = clamp(Number(body.dx) || 0, -1, 1);
    const dy = clamp(Number(body.dy) || 0, -1, 1);
    const len = Math.hypot(dx, dy) || 1;
    const dt = clamp((now - player.moveAt) / 1000, 0, 0.35);
    player.x = clamp(player.x + (dx / len) * SPEED * dt, 25, MAP_W - 25);
    player.y = clamp(player.y + (dy / len) * SPEED * dt, 25, MAP_H - 25);
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
    if (target.mission === 'letter' || target.mission === 'telegraph') return recordPart(room, player, target.mission, target.part);
    if (target.mission === 'cipher') {
      room.missions.cipher.done = true;
      addClue(room, 'A timetable with a second meaning', 'Holmes’s pencilled cipher points to East London Station at 9:28 pm. The porter’s name was copied onto a decoy timetable; the dispatch signature is still hidden on the live telegraph.');
      addLog(room, `${player.name} decodes Holmes’s timetable. The East London signal box is the next lead.`, 'good');
      return { ok: true, message: 'Cipher decoded. New evidence added to the journal.' };
    }
    if (target.mission === 'reunion') {
      room.reunionComplete = true;
      return completeCase(room);
    }
    return { ok: false, message: 'There is nothing to use here yet.' };
  }
  if (action === 'sabotage') {
    if (player.role !== 'culprit' || room.culpritCaught || player.eliminated || room.mode !== 'deduction') return { ok: false, message: 'That action is unavailable.' };
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
    if (room.clues.length < 2 || !['investigation', 'reunion'].includes(room.phase)) return { ok: false, message: 'The investigation needs two clues before a vote can open.' };
    if (room.vote?.resolved) return { ok: false, message: 'The team already held its investigation vote.' };
    const target = room.players.get(String(body.target || ''));
    if (!target || target.dropped) return { ok: false, message: 'Choose a player who is still in the case.' };
    if (!room.vote) {
      room.vote = { open: true, resolved: false, deadline: now + 30_000, tally: null, outcome: null };
      addLog(room, 'Two clues are on the board. Each detective may name one suspect. Only a unanimous vote captures the culprit.', 'story');
    }
    if (player.vote) return { ok: false, message: 'Your investigation vote is already recorded.' };
    player.vote = target.id;
    maybeResolveVote(room);
    return { ok: true, message: 'Suspicion recorded. The culprit is caught only if every detective names the same player.' };
  }
  if (action === 'chat') {
    const text = String(body.text || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 180);
    if (!text) return { ok: false, message: 'Write a message first.' };
    room.chat.push({ id: randomUUID(), playerId: player.id, name: player.name, text, time: now });
    if (room.chat.length > 50) room.chat.shift();
    return { ok: true };
  }
  if (action === 'rematch') {
    if (player.id !== room.hostId || room.phase !== 'results') return { ok: false, message: 'The host starts the next case from the results screen.' };
    resetForRematch(room);
    return { ok: true, message: 'Rematch room is ready. Players can start when everyone is connected.' };
  }
  return { ok: false, message: 'Unknown action.' };
}


export { rooms, randomCode, newRoom, makePlayer, cleanName, activePlayers, authenticate, publicRoom, doAction, addLog, httpError, sweepRoom, findByCode, MAX_PLAYERS, MIN_PLAYERS, RECONNECT_GRACE_MS };

