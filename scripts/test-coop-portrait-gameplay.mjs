import assert from 'node:assert/strict';
import {
  newRoom,
  makePlayer,
  doAction,
  publicRoom,
  points,
  PORTRAIT_PIECES,
} from '../lib/game-core.mjs';

console.log('--- RUNNING COOPERATIVE MULTIPLAYER PORTRAIT GAMEPLAY TESTS ---');

// -------------------------------------------------------------
// TEST 1: 2, 4, AND 8-PLAYER LOBBY CREATION & COOPERATIVE MODE
// -------------------------------------------------------------
console.log('\n[1/5] Testing 2, 4, and 8-Player Cooperative Detective Lobby...');

// 2-Player Test
const { room: r2, player: host2 } = newRoom('COOP02', 'Sherlock Holmes', 'sherlock');
const guest2 = makePlayer('Dr. John Watson', 'watson');
r2.players.set(guest2.id, guest2);
r2.scores.set(guest2.id, 0);
doAction(r2, host2, { action: 'ready', ready: true });
doAction(r2, guest2, { action: 'ready', ready: true });
const start2Res = doAction(r2, host2, { action: 'start' });
assert.equal(start2Res.ok, true, '2-player start succeeds');
assert.equal(r2.mode, 'cooperative', '2-player mode is cooperative');
for (const p of r2.players.values()) {
  assert.equal(p.role, 'detective', 'All 2 players must be detectives');
}
assert.equal(r2.portrait.totalPieces, 6, 'Portrait must require 6 pieces');
assert.equal(r2.portrait.collectedPieces.length, 0, 'Initial collected pieces must be 0');
console.log('✓ 2-player cooperative setup verified.');

// 8-Player Test
const { room: r8, player: host8 } = newRoom('COOP08', 'Sherlock', 'sherlock');
const chars = ['watson', 'detective', 'journalist', 'officer', 'boy', 'girl', 'watson'];
const guests8 = [];
for (let i = 0; i < 7; i++) {
  const g = makePlayer(`Det #${i + 1}`, chars[i]);
  r8.players.set(g.id, g);
  r8.scores.set(g.id, 0);
  guests8.push(g);
}
assert.equal(r8.players.size, 8, '8 players connected');
doAction(r8, host8, { action: 'ready', ready: true });
guests8.forEach(g => doAction(r8, g, { action: 'ready', ready: true }));
const start8Res = doAction(r8, host8, { action: 'start' });
assert.equal(start8Res.ok, true, '8-player start succeeds');
assert.equal(r8.mode, 'cooperative', '8-player mode is cooperative (no secret culprit)');
for (const p of r8.players.values()) {
  assert.equal(p.role, 'detective', 'All 8 players are cooperative detectives');
  assert.notEqual(p.role, 'culprit', 'No player is assigned culprit');
}
console.log('✓ 8-player cooperative setup verified: 100% detective team.');

// -------------------------------------------------------------
// TEST 2: MINI-GAME CHALLENGE REWARDS & SHARED PORTRAIT PIECES
// -------------------------------------------------------------
console.log('\n[2/5] Testing Mini-Game Station Solving & Server Authority...');

const room = r2;
const p1 = host2;
const p2 = guest2;

// Station 1: clue-footprints-yard (Find Objects) -> Piece 1
const st1 = PORTRAIT_PIECES['clue-footprints-yard'];
assert.equal(st1.id, 1);
assert.equal(st1.gameType, 'find-objects');

// Distance check: fail if too far
p1.x = 900;
p1.y = 900;
const farAttempt = doAction(room, p1, { action: 'solve-mini-game', stationId: 'clue-footprints-yard' });
assert.equal(farAttempt.ok, false, 'Solving from far away must be rejected');

// Move to station location
const pos1 = points[st1.location];
p1.x = pos1.x;
p1.y = pos1.y;

const solve1 = doAction(room, p1, { action: 'solve-mini-game', stationId: 'clue-footprints-yard' });
assert.equal(solve1.ok, true, 'Solving near footprintsYard succeeds');
assert.equal(solve1.pieceId, 1);
assert.equal(room.portrait.collectedPieces.includes(1), true, 'Piece 1 added to shared portrait');

// Verify shared synchronization across both players
const pubP1 = publicRoom(room, p1);
const pubP2 = publicRoom(room, p2);
assert.deepEqual(pubP1.room.portrait.collectedPieces, [1]);
assert.deepEqual(pubP2.room.portrait.collectedPieces, [1]);
assert.equal(pubP2.room.portrait.allCollected, false);
console.log('✓ Mini-game solve validated: distance checked & synchronized to entire team.');

// -------------------------------------------------------------
// TEST 3: DUPLICATE PIECE PREVENTION
// -------------------------------------------------------------
console.log('\n[3/5] Testing Duplicate Reward Prevention...');

// P2 attempts to solve the same station
p2.x = pos1.x;
p2.y = pos1.y;
const dupAttempt = doAction(room, p2, { action: 'solve-mini-game', stationId: 'clue-footprints-yard' });
assert.equal(dupAttempt.ok, false, 'Duplicate reward must be strictly rejected');
assert.equal(room.portrait.collectedPieces.length, 1, 'Still only 1 piece in collection');
console.log('✓ Duplicate piece rejection verified.');

// -------------------------------------------------------------
// TEST 4: COLLECT ALL 6 PIECES ACROSS LONDON
// -------------------------------------------------------------
console.log('\n[4/5] Testing Full 6-Piece London Portrait Collection...');

const remainingStations = [
  'clue-fabric-fence',       // Piece 2: match-symbols
  'clue-photo-surveillance', // Piece 3: unlock-box
  'clue-key-iron',           // Piece 4: find-objects
  'clue-fingerprint-glass',  // Piece 5: match-symbols
  'clue-witness-ledger',     // Piece 6: unlock-box
];

for (const stationId of remainingStations) {
  const info = PORTRAIT_PIECES[stationId];
  const targetPos = points[info.location];
  p2.x = targetPos.x;
  p2.y = targetPos.y;
  const res = doAction(room, p2, { action: 'solve-mini-game', stationId });
  assert.equal(res.ok, true, `Piece #${info.id} (${info.gameType}) solved`);
}

assert.equal(room.portrait.collectedPieces.length, 6, 'All 6 pieces collected');
assert.equal(room.portrait.allCollected, true, 'allCollected flag is true');
console.log('✓ All 6 portrait pieces recovered across London.');

// -------------------------------------------------------------
// TEST 5: CENTRAL INVESTIGATION BOARD & FINAL PORTRAIT ASSEMBLY
// -------------------------------------------------------------
console.log('\n[5/5] Testing Headquarters Central Board & Final Victory...');

// Attempt to assemble when far away from Headquarters
p1.x = 100;
p1.y = 100;
const farAssemble = doAction(room, p1, { action: 'assemble-portrait' });
assert.equal(farAssemble.ok, false, 'Assemble far from Headquarters must fail');

// Gather at Headquarters (Blackthorn Safehouse / 221B points.reunion)
const hq = points.reunion;
p1.x = hq.x;
p1.y = hq.y;
p2.x = hq.x;
p2.y = hq.y;

const assembleRes = doAction(room, p1, { action: 'assemble-portrait' });
assert.equal(assembleRes.ok, true, 'Assemble at Headquarters succeeds');
assert.equal(room.portrait.assembled, true, 'Portrait assembled is true');
assert.equal(room.phase, 'results', 'Phase transitions to results');
assert.equal(room.result.winner, 'detectives', 'Winner is detectives');
assert.equal(room.result.caseSolved, true, 'Case solved is true');
assert.equal(room.result.reason, 'portrait_assembled');

console.log('✓ Central Investigation Board portrait assembled & victory confirmed.');

console.log('\n======================================================');
console.log('ALL COOPERATIVE PORTRAIT GAMEPLAY TESTS PASSED (100%)!');
console.log('======================================================\n');
