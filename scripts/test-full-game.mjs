import assert from 'node:assert/strict';
import { newRoom, makePlayer, publicRoom, doAction, sweepRoom } from '../lib/game-core.mjs';

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
  act(room, player, 'interact');
}

function readyAll(room, players) {
  for (const player of players) act(room, player, 'ready', { ready: true });
}

try {
  // One-player rooms can collect readiness but never launch; a guest's ready signal starts it.
  const lobby = newRoom('READY1', 'Holmes');
  act(lobby.room, lobby.player, 'ready', { ready: true });
  assert.equal(lobby.room.phase, 'lobby');
  assert.equal(publicRoom(lobby.room, lobby.player).room.allReady, false);
  const guest = addPlayer(lobby.room, 'Watson');
  assert.equal(publicRoom(lobby.room, lobby.player).room.readyCount, 1);
  act(lobby.room, guest, 'ready', { ready: true });
  assert.equal(lobby.room.phase, 'investigation');
  assert.equal(lobby.room.mode, 'cooperative');

  // Eight seats still create exactly one hidden culprit, and the role stays private.
  Math.random = () => 0.37;
  const full = newRoom('EIGHT1', 'Holmes');
  const fullPlayers = [full.player, ...Array.from({ length: 7 }, (_, i) => addPlayer(full.room, `Detective ${i + 2}`))];
  readyAll(full.room, fullPlayers);
  assert.equal(full.room.mode, 'deduction');
  assert.equal([...full.room.players.values()].filter((p) => p.role === 'culprit').length, 1);
  assert.equal(publicRoom(full.room, full.player).room.players.some((p) => p.revealedRole), false);

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
  assert.equal(party.room.culpritCaught, true);
  assert.equal(culprit.eliminated, true);
  assert.equal(publicRoom(party.room, detectives[0]).room.players.find((p) => p.id === culprit.id).revealedRole, 'culprit');

  investigate(party.room, detectives[0], 112, 108);
  investigate(party.room, detectives[1], 252, 182);
  assert.equal(party.room.missions.letter.done, true);
  investigate(party.room, detectives[2], 494, 154);
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

  console.log('PASS: ready gate, 8-player secret-role privacy, full 4-player case, capture vote, clue route, reunion, culprit strikes, rescue, sabotage, cooldown, recovery, and vote timeout.');
} finally {
  Math.random = originalRandom;
}
