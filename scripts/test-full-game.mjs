import assert from 'node:assert/strict';
import { newRoom, makePlayer, publicRoom, doAction, sweepRoom, DEDUCTION_ANSWERS, RECONNECT_GRACE_MS } from '../lib/game-core.mjs';

const originalRandom = Math.random;

function addPlayer(room, name) {
  const player = makePlayer(name);
  room.players.set(player.id, player);
  room.scores.set(player.id, 0);
  return player;
}

function act(room, player, action, extra = {}) {
  const result = doAction(room, player, { action, ...extra });
  assert.equal(result.ok, true, `${action} failed: ${result.message}`);
  return result;
}

function investigate(room, player, x, y) {
  player.x = x;
  player.y = y;
  const stations = [
    { id: 'letter-ink', x: 112, y: 108 }, { id: 'letter-seal', x: 252, y: 182 },
    { id: 'cipher', x: 494, y: 154 }, { id: 'wire', x: 738, y: 306 }, { id: 'relay', x: 874, y: 410 },
  ];
  const station = stations.find((point) => Math.hypot(player.x - point.x, player.y - point.y) <= 58);
  if (station?.id === 'cipher') act(room, player, 'puzzle', { station: 'cipher', solution: [9, 2, 8] });
  else if (station?.id === 'wire') act(room, player, 'puzzle', { station: 'wire', solution: ['short', 'short', 'short', 'long'] });
  else act(room, player, 'interact', station ? { answer: DEDUCTION_ANSWERS[station.id] } : {});
}

function readyAll(room, players) {
  for (const player of players) act(room, player, 'ready', { ready: true });
  act(room, players[0], 'start');
}

try {
  // One-player rooms can collect readiness but cannot launch; the host starts after all are ready.
  const lobby = newRoom('READY1', 'Holmes');
  act(lobby.room, lobby.player, 'ready', { ready: true });
  assert.equal(lobby.room.phase, 'lobby');
  assert.equal(publicRoom(lobby.room, lobby.player).room.allReady, false);
  const guest = addPlayer(lobby.room, 'Watson');
  assert.equal(publicRoom(lobby.room, lobby.player).room.readyCount, 1);
  act(lobby.room, guest, 'ready', { ready: true });
  assert.equal(lobby.room.phase, 'lobby', 'A room does not start just because its players are ready.');
  assert.equal(doAction(lobby.room, guest, { action: 'start' }).ok, false, 'A guest cannot start the case.');
  act(lobby.room, lobby.player, 'start');
  assert.equal(lobby.room.phase, 'investigation');
  assert.equal(lobby.room.mode, 'cooperative');

  // Eight seats still create exactly one hidden culprit, and the role stays private.
  Math.random = () => 0.37;
  const full = newRoom('EIGHT1', 'Holmes');
  const fullPlayers = [full.player, ...Array.from({ length: 7 }, (_, i) => addPlayer(full.room, `Detective ${i + 2}`))];
  readyAll(full.room, fullPlayers);
  assert.equal(full.room.mode, 'deduction');
  const hiddenCulprit = fullPlayers.find((p) => p.role === 'culprit');
  assert.equal([...full.room.players.values()].filter((p) => p.role === 'culprit').length, 1);
  assert.equal(publicRoom(full.room, full.player).room.players.some((p) => p.revealedRole), false);
  hiddenCulprit.x = 112; hiddenCulprit.y = 108;
  assert.equal(doAction(full.room, hiddenCulprit, { action: 'interact', answer: DEDUCTION_ANSWERS['letter-ink'] }).ok, false, 'The hidden culprit cannot submit detective evidence.');
  assert.equal(full.room.missions.letter.parts.ink, null);

  // Exercise a complete four-player case: unanimous capture, all missions, and shared reunion.
  Math.random = () => 0;
  const party = newRoom('CASE01', 'Inspector');
  const players = [party.player, addPlayer(party.room, 'Irene'), addPlayer(party.room, 'Lestrade'), addPlayer(party.room, 'Moriarty')];
  readyAll(party.room, players);
  const culprit = players.find((p) => p.role === 'culprit');
  const detectives = players.filter((p) => p.role === 'detective');
  assert.equal(detectives.length, 3);
  assert.equal(doAction(party.room, detectives[0], { action: 'vote', target: culprit.id }).ok, false, 'Voting must wait for two clues.');
  party.room.clues.push({ id: 'clue-a' }, { id: 'clue-b' });
  for (const detective of detectives) act(party.room, detective, 'vote', { target: culprit.id });
  assert.equal(party.room.phase, 'capture');
  assert.equal(party.room.culpritCaught, false, 'The unanimous accusation starts the final trap, rather than capturing instantly.');
  culprit.x = 484; culprit.y = 552;
  for (const detective of detectives) { detective.x = 484; detective.y = 552; }
  assert.equal(doAction(party.room, detectives[0], { action: 'trap', mechanism: 'key' }).ok, false, 'A trap cannot skip the lever and valve.');
  culprit.x = 400; culprit.y = 350; culprit.moveAt = Date.now() - 350;
  assert.equal(doAction(party.room, culprit, { action: 'move', dx: 1, dy: 1 }).ok, true, 'The culprit can move during the trap chase.');
  assert.ok(culprit.x > 400 && culprit.y > 350, 'The server applies movement after the accusation instead of softlocking the culprit away from the safehouse.');
  culprit.x = 484; culprit.y = 552;
  act(party.room, detectives[0], 'trap', { mechanism: 'lever' });
  act(party.room, detectives[1], 'trap', { mechanism: 'valve' });
  act(party.room, detectives[2], 'trap', { mechanism: 'key' });
  assert.equal(party.room.culpritCaught, true);
  assert.equal(culprit.eliminated, true);
  assert.equal(publicRoom(party.room, detectives[0]).room.players.find((p) => p.id === culprit.id).revealedRole, 'culprit');

  investigate(party.room, detectives[0], 112, 108);
  investigate(party.room, detectives[1], 252, 182);
  assert.equal(party.room.missions.letter.done, true);
  detectives[2].x = 494; detectives[2].y = 154;
  assert.equal(doAction(party.room, detectives[2], { action: 'interact', answer: DEDUCTION_ANSWERS.cipher }).ok, false, 'The former one-click cipher answer cannot bypass the mechanism.');
  assert.equal(doAction(party.room, detectives[2], { action: 'puzzle', station: 'cipher', solution: [9, 2, 7] }).ok, false, 'An incorrect timetable dial cannot advance the case.');
  assert.equal(party.room.missions.cipher.done, false);
  investigate(party.room, detectives[2], 494, 154);
  detectives[1].x = 738; detectives[1].y = 306;
  assert.equal(doAction(party.room, detectives[1], { action: 'puzzle', station: 'wire', solution: ['long', 'short', 'short', 'short'] }).ok, false, 'An incorrect telegraph route cannot record the sender fragment.');
  assert.equal(party.room.missions.telegraph.parts.sender, null);
  investigate(party.room, detectives[1], 738, 306);
  investigate(party.room, detectives[0], 874, 410);
  assert.equal(party.room.phase, 'reunion');
  for (const detective of detectives) { detective.x = 484; detective.y = 552; }
  assert.equal(publicRoom(party.room, detectives[0]).room.reunionReady, true);
  act(party.room, detectives[2], 'interact');
  assert.equal(party.room.phase, 'results');
  assert.equal(party.room.result.caseSolved, true);
  assert.equal(party.room.result.culpritCaught, true);
  assert.equal(party.room.result.roundAwards.length, 4);

  // Verify culprit strike, teammate rescue, station sabotage, and cooldown.
  const actionRoom = newRoom('ACT001', 'Inspector');
  const actionPlayers = [actionRoom.player, addPlayer(actionRoom.room, 'Irene'), addPlayer(actionRoom.room, 'Lestrade'), addPlayer(actionRoom.room, 'Moriarty')];
  readyAll(actionRoom.room, actionPlayers);
  const actionCulprit = actionPlayers.find((p) => p.role === 'culprit');
  const actionDetectives = actionPlayers.filter((p) => p.role === 'detective');
  actionCulprit.x = actionDetectives[0].x = 500;
  actionCulprit.y = actionDetectives[0].y = 500;
  actionDetectives[1].x = 500;
  actionDetectives[1].y = 500;
  act(actionRoom.room, actionCulprit, 'sabotage');
  assert.equal(actionDetectives[0].incapacitated, true);
  act(actionRoom.room, actionDetectives[1], 'interact');
  assert.equal(actionDetectives[0].incapacitated, false, 'A teammate can rescue a struck detective.');

  actionCulprit.x = 112; actionCulprit.y = 108;
  for (const detective of actionDetectives) { detective.x = 700; detective.y = 600; }
  act(actionRoom.room, actionCulprit, 'sabotage');
  assert.equal(actionRoom.room.sabotage?.mission, 'letter');
  investigate(actionRoom.room, actionDetectives[0], 112, 108);
  assert.equal(actionRoom.room.sabotage, null, 'A detective can clear station interference.');

  actionRoom.room.sabotageCooldownAt = 0;
  actionCulprit.x = 494; actionCulprit.y = 154;
  act(actionRoom.room, actionCulprit, 'sabotage');
  assert.equal(actionRoom.room.culpritObjective, true, 'Jamming two different stations completes the culprit objective.');
  const cooldown = doAction(actionRoom.room, actionCulprit, { action: 'sabotage' });
  assert.equal(cooldown.ok, false);
  assert.match(cooldown.message, /recharges/);

  actionDetectives[0].incapacitated = true;
  actionDetectives[0].incapacitatedAt = Date.now() - 19_000;
  sweepRoom(actionRoom.room);
  assert.equal(actionDetectives[0].incapacitated, false, 'An unrecovered detective returns after the recovery timer.');

  // A ballot that times out without unanimity is a split and does not expose anyone.
  const timeout = newRoom('TIME01', 'Inspector');
  const timeoutPlayers = [timeout.player, addPlayer(timeout.room, 'Irene'), addPlayer(timeout.room, 'Lestrade'), addPlayer(timeout.room, 'Moriarty')];
  readyAll(timeout.room, timeoutPlayers);
  const timeoutDetectives = timeoutPlayers.filter((p) => p.role === 'detective');
  const timeoutCulprit = timeoutPlayers.find((p) => p.role === 'culprit');
  timeout.room.clues.push({ id: 'clue-a' }, { id: 'clue-b' });
  act(timeout.room, timeoutDetectives[0], 'vote', { target: timeoutCulprit.id });
  timeout.room.vote.deadline = Date.now() - 1;
  publicRoom(timeout.room, timeoutDetectives[0]);
  assert.equal(timeout.room.vote.outcome, 'split');
  assert.equal(timeout.room.culpritCaught, false);

  // A host who does not return within the reconnection window must not leave a lobby ownerless.
  const abandonedHost = newRoom('HOST01', 'Holmes');
  const successor = addPlayer(abandonedHost.room, 'Watson');
  abandonedHost.player.connected = false;
  abandonedHost.player.lastSeen = Date.now() - RECONNECT_GRACE_MS - 1;
  publicRoom(abandonedHost.room, successor);
  assert.equal(abandonedHost.room.hostId, successor.id, 'The connected player inherits hosting after the host reconnect window expires.');

  console.log('PASS: ready gate, 8-player secret-role privacy, full 4-player case, capture chase movement, clue route, reunion, culprit strikes, rescue, sabotage, cooldown, recovery, vote timeout, and stale-host recovery.');
} finally {
  Math.random = originalRandom;
}
