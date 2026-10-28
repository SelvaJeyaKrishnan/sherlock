import assert from 'node:assert/strict';
import { newRoom, makePlayer, publicRoom, doAction, DEDUCTION_ANSWERS } from '../lib/game-core.mjs';

const originalRandom = Math.random;

function addPlayer(room, name, character = 'boy') {
  const player = makePlayer(name, character);
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
  const characterRoom = newRoom('GIRL01', 'Irene', 'girl');
  const characterGuest = addPlayer(characterRoom.room, 'Watson', 'boy');
  const characterState = publicRoom(characterRoom.room, characterRoom.player);
  assert.equal(characterState.me.character, 'girl', 'The selected character is part of the authenticated player state.');
  assert.equal(characterState.room.players.find((player) => player.id === characterGuest.id).character, 'boy', 'Teammates receive the selected character in shared roster data.');
  assert.ok(characterState.room.players.every((player) => !Object.hasOwn(player, 'role')), 'Public character data must not reveal hidden roles.');

  const { room, player: host } = newRoom('COOP01', 'Holmes');
  const guest = addPlayer(room, 'Watson');

  for (let round = 1; round <= 3; round++) {
    Math.random = () => round === 2 ? 0 : 0.99;
    act(room, host, 'ready', { ready: true });
    assert.equal(room.phase, 'lobby', 'One ready player cannot start the case alone.');
    assert.equal(doAction(room, host, { action: 'start' }).ok, false, 'Direct start attempts must also require everyone ready.');
    act(room, host, 'ready', { ready: false });
    assert.equal(publicRoom(room, host).me.ready, false, 'A player can change their readiness before the case begins.');
    act(room, host, 'ready', { ready: true });
    act(room, guest, 'ready', { ready: true });
    assert.equal(room.phase, 'lobby', 'All-ready rooms wait for the host to start explicitly.');
    assert.equal(doAction(room, guest, { action: 'start' }).ok, false, 'Only the host can start the case.');
    act(room, host, 'start');
    assert.equal(room.mode, 'cooperative', 'Two players should play co-op mode.');
    assert.equal(host.role, 'detective');
    assert.equal(guest.role, 'detective');
    assert.equal(publicRoom(room, host).room.voteAvailable, false, 'Co-op mode must not offer culprit voting.');

    host.x = 190; host.y = 70; host.moveAt = Date.now() - 350;
    act(room, host, 'move', { dx: -1, dy: 0 });
    assert.ok(host.x >= 184, 'Server-side movement must stop at the expanded building collision boundary.');

    for (const viewer of [host, guest]) {
      const state = publicRoom(room, viewer);
      assert.equal(state.me.role, 'detective');
      assert.equal(state.room.players.some((player) => player.revealedRole), false);
    }

    host.x = 112; host.y = 108;
    const badReading = doAction(room, host, { action: 'interact', answer: 'lampblack' });
    assert.equal(badReading.ok, false, 'The server must reject an incorrect evidence conclusion.');
    assert.equal(room.missions.letter.parts.ink, null, 'Wrong answers cannot advance shared mission progress.');
    investigate(room, host, 112, 108);
    investigate(room, guest, 252, 182);
    assert.equal(room.missions.letter.done, true);
    investigate(room, host, 494, 160);
    investigate(room, guest, 738, 306);
    investigate(room, host, 874, 410);
    assert.equal(room.phase, 'reunion');

    host.x = 484; host.y = 552;
    const early = doAction(room, host, { action: 'interact' });
    assert.equal(early.ok, false, 'One player cannot finish before the teammate arrives.');
    guest.x = 484; guest.y = 552;
    act(room, host, 'interact');
    assert.equal(room.phase, 'results', 'The reunion should close the co-op case without a final vote.');
    assert.equal(room.result.caseSolved, true);
    assert.equal(room.result.round, round);

    if (round < 3) {
      act(room, host, 'rematch');
      assert.equal(room.phase, 'lobby');
      assert.equal(room.round, round + 1);
    }
  }

  assert.equal(room.result.matchComplete, true);
  assert.deepEqual(room.result.matchWinnerNames, ['Holmes', 'Watson']);

  const trio = newRoom('TRIO01', 'Holmes');
  const trioPlayers = [trio.player, addPlayer(trio.room, 'Watson'), addPlayer(trio.room, 'Lestrade')];
  readyAll(trio.room, trioPlayers);
  assert.equal(trio.room.mode, 'cooperative', 'Three players should also play co-op mode.');
  assert.ok([...trio.room.players.values()].every((player) => player.role === 'detective'));

  // Four players unlock the hidden culprit and unanimous-capture twist.
  Math.random = () => 0;
  const party = newRoom('PARTY1', 'Inspector');
  const partyPlayers = [party.player, addPlayer(party.room, 'Irene'), addPlayer(party.room, 'Lestrade'), addPlayer(party.room, 'Moriarty')];
  readyAll(party.room, partyPlayers);
  assert.equal(party.room.mode, 'deduction');
  const culprit = partyPlayers.find((player) => player.role === 'culprit');
  const detectives = partyPlayers.filter((player) => player.role === 'detective');
  assert.ok(culprit && detectives.length === 3, 'Four players must create one culprit and three detectives.');
  for (const viewer of partyPlayers) {
    const state = publicRoom(party.room, viewer);
    assert.equal(state.me.role, viewer.role, 'Each player sees their own role.');
    assert.equal(state.room.players.some((player) => player.revealedRole), false, 'The culprit role stays hidden before capture.');
  }
  party.room.clues.push({ id: 'clue-1' }, { id: 'clue-2' });
  assert.equal(publicRoom(party.room, detectives[0]).room.voteAvailable, true);
  for (const detective of detectives) act(party.room, detective, 'vote', { target: culprit.id });
  assert.equal(party.room.phase, 'capture', 'A correct unanimous accusation must start the coordinated capture sequence.');
  assert.equal(party.room.culpritCaught, false, 'The culprit stays at large until the trap is completed.');
  assert.equal(publicRoom(party.room, detectives[0]).room.capture.next, 'lever');
  assert.equal(publicRoom(party.room, detectives[0]).room.players.some((player) => player.revealedRole), false, 'The culprit stays hidden during the trap sequence.');
  culprit.x = 484; culprit.y = 552;
  for (const detective of detectives) { detective.x = 484; detective.y = 552; }
  assert.equal(doAction(party.room, detectives[0], { action: 'trap', mechanism: 'valve' }).ok, false, 'The trap enforces the mechanism order.');
  act(party.room, detectives[0], 'trap', { mechanism: 'lever' });
  assert.equal(doAction(party.room, detectives[0], { action: 'trap', mechanism: 'valve' }).ok, false, 'Each trap step requires a different detective.');
  act(party.room, detectives[1], 'trap', { mechanism: 'valve' });
  act(party.room, detectives[2], 'trap', { mechanism: 'key' });
  assert.equal(party.room.culpritCaught, true, 'The coordinated trap captures the unanimously identified culprit.');
  assert.equal(culprit.eliminated, true);
  assert.equal(publicRoom(party.room, detectives[0]).room.activeCount, 3);
  assert.equal(publicRoom(party.room, detectives[0]).room.players.find((p) => p.id === culprit.id).revealedRole, 'culprit');
  assert.equal(doAction(party.room, culprit, { action: 'sabotage' }).ok, false, 'A captured culprit can no longer interfere.');
  party.room.missions.telegraph.done = true;
  party.room.phase = 'reunion';
  for (const detective of detectives) { detective.x = 484; detective.y = 552; }
  act(party.room, detectives[0], 'interact');
  assert.equal(party.room.phase, 'results', 'The remaining team must still reunite and solve the case after catching the culprit.');
  assert.equal(party.room.result.caseSolved, true);

  // A unanimous wrong suspect does not remove an innocent player.
  const wrong = newRoom('WRONG1', 'Inspector');
  const wrongPlayers = [wrong.player, addPlayer(wrong.room, 'Irene'), addPlayer(wrong.room, 'Lestrade'), addPlayer(wrong.room, 'Moriarty')];
  readyAll(wrong.room, wrongPlayers);
  const wrongCulprit = wrongPlayers.find((player) => player.role === 'culprit');
  const wrongDetectives = wrongPlayers.filter((player) => player.role === 'detective');
  const innocent = wrongDetectives[0];
  wrong.room.clues.push({ id: 'clue-1' }, { id: 'clue-2' });
  for (const detective of wrongDetectives) act(wrong.room, detective, 'vote', { target: innocent.id });
  assert.equal(wrong.room.vote.outcome, 'wrong');
  assert.equal(innocent.eliminated, false);
  assert.equal(wrongCulprit.eliminated, false);

  console.log('PASS: 2–3 players cooperate; three two-player rounds require both to reunite; 4-player games hide one culprit; correct and incorrect unanimous votes behave as expected.');
} finally {
  Math.random = originalRandom;
}
