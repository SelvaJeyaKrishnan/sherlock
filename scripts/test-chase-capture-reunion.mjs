import assert from 'node:assert/strict';
import {
  newRoom,
  makePlayer,
  doAction,
  publicRoom,
  points,
} from '../lib/game-core.mjs';

console.log('🧪 Testing Synchronized Final Chase, Coordinated Trap Capture, and Safehouse Reunion...\n');

// 1. Setup 4-player deduction room
const { room, player: p1 } = newRoom('CHASE1', 'Sherlock Holmes', 'boy');
const p2 = makePlayer('Dr. Watson', 'watson');
const p3 = makePlayer('Irene Adler', 'girl');
const p4 = makePlayer('Insp. Lestrade', 'officer');

room.players.set(p2.id, p2);
room.players.set(p3.id, p3);
room.players.set(p4.id, p4);

p1.ready = true;
p2.ready = true;
p3.ready = true;
p4.ready = true;

room.mode = 'deduction';
const startRes = doAction(room, p1, { action: 'start' });
assert.equal(startRes.ok, true, 'Room must start successfully');
assert.equal(room.mode, 'deduction', 'Must be in deduction mode for 4 players');
assert.equal(room.phase, 'investigation', 'Should start in investigation phase');

const allPlayers = [...room.players.values()];
const thief = allPlayers.find((p) => p.role === 'culprit');
const detectives = allPlayers.filter((p) => p.role === 'detective');

assert.ok(thief, 'One actual player must be the thief');
assert.equal(detectives.length, 3, 'Three detectives must be assigned');
console.log(`✓ 4-player room initialized. Thief: ${thief.name}, Detectives: ${detectives.map((d) => d.name).join(', ')}`);

// 2. Unlock minimum evidence for accusation and complete telegraph route
room.missions.telegraph.done = true;
room.clues.push({ id: 'c1', title: 'Clue 1', category: 'footprints' });
room.clues.push({ id: 'c2', title: 'Clue 2', category: 'fabric' });

// 3. Initiate Accusation Council
const conveneRes = doAction(room, detectives[0], { action: 'call-vote' });
assert.equal(conveneRes.ok, true, 'Detective can convene accusation council');
assert.equal(room.vote.open, true, 'Vote must be open');

// Cast unanimous vote identifying the thief
for (const det of detectives) {
  const voteRes = doAction(room, det, { action: 'vote', target: thief.id });
  assert.equal(voteRes.ok, true, `${det.name} cast vote against thief`);
}

// 4. Verify Chase Initiation
assert.equal(room.phase, 'capture', 'Room phase must switch to capture');
assert.equal(room.vote.outcome, 'capture', 'Vote outcome must be capture');
assert.ok(room.capture, 'room.capture state must be initialized');
assert.deepEqual(room.capture.sequence, ['lever', 'valve', 'key'], 'Must require lever, valve, key sequence');
console.log('✓ Unanimous accusation successfully triggered synchronized chase event');

// 5. Verify Thief Movement in Chase Phase
const thiefStartPos = { x: thief.x, y: thief.y };
thief.moveAt = Date.now() - 300;
const moveRes = doAction(room, thief, { action: 'move', dx: 1, dy: 0 });
assert.equal(moveRes.ok, true, 'Thief can move during capture phase');
assert.ok(thief.x > thiefStartPos.x, 'Thief position must advance with sprint speed');
console.log('✓ Thief has active escape movement with speed multiplier in capture phase');

// 6. Verify Public State Chase Notification
const pubState = publicRoom(room, detectives[0]);
assert.ok(pubState.room.chase, 'Chase payload should be present');
assert.equal(pubState.room.chase.active, true, 'Chase must be marked active');
assert.equal(pubState.room.chase.thiefId, thief.id, 'Thief identity identified in chase objective');
console.log('✓ Thief identity properly tracked in chase objective during pursuit');

// 7. Test Capture Trap Mechanics & Multi-Detective Coordination
// Position thief and detectives near Blackthorn Safehouse (x: 484, y: 552)
thief.x = points.reunion.x + 20;
thief.y = points.reunion.y + 20;
detectives[0].x = points.reunion.x;
detectives[0].y = points.reunion.y;
detectives[1].x = points.reunion.x;
detectives[1].y = points.reunion.y;
detectives[2].x = points.reunion.x;
detectives[2].y = points.reunion.y;

// Detective cannot trigger wrong mechanism (out of order)
const wrongMechRes = doAction(room, detectives[0], { action: 'trap', mechanism: 'key' });
assert.equal(wrongMechRes.ok, false, 'Cannot trigger key before lever');
assert.match(wrongMechRes.message, /lever/i, 'Message indicates next expected mechanism');

// Detective 0 pulls lever
const leverRes = doAction(room, detectives[0], { action: 'trap', mechanism: 'lever' });
assert.equal(leverRes.ok, true, 'Detective 0 pulls lever');
assert.equal(room.capture.mechanisms.length, 1);

// Detective 0 cannot pull valve immediately (requires different detective)
const dupDetRes = doAction(room, detectives[0], { action: 'trap', mechanism: 'valve' });
assert.equal(dupDetRes.ok, false, 'Same detective cannot operate back-to-back mechanisms');
assert.match(dupDetRes.message, /different detective/i);

// Detective 1 turns valve
const valveRes = doAction(room, detectives[1], { action: 'trap', mechanism: 'valve' });
assert.equal(valveRes.ok, true, 'Detective 1 turns valve');
assert.equal(room.capture.mechanisms.length, 2);

// Detective 2 inserts key (final step)
const keyRes = doAction(room, detectives[2], { action: 'trap', mechanism: 'key' });
assert.equal(keyRes.ok, true, 'Detective 2 inserts key');
console.log('✓ 3-step trap coordinated and validated across 3 distinct detectives');

// 8. Verify Post-Capture State (Thief captured NOT eliminated!)
assert.equal(room.culpritCaught, true, 'culpritCaught must be true');
assert.equal(thief.captured, true, 'thief.captured must be true');
assert.equal(thief.eliminated, false, 'CRITICAL: thief.eliminated must remain FALSE so they can participate in reunion');
assert.equal(room.phase, 'reunion', 'Phase must advance directly to reunion');
console.log('✓ Thief safely apprehended in custody (captured: true, eliminated: false)');

// 9. Verify Safehouse Reunion Logic
// Case cannot complete before all participants assemble at safehouse
// Move thief away from safehouse
thief.x = 200;
thief.y = 200;
const prematureComplete = doAction(room, detectives[0], { action: 'interact' });
assert.equal(prematureComplete.ok, false, 'Cannot complete case while thief is away from safehouse');
assert.match(prematureComplete.message, /safehouse door/i);

// Thief can still move while captured to reach the safehouse
thief.moveAt = Date.now() - 300;
const thiefReunionMove = doAction(room, thief, { action: 'move', dx: 1, dy: 1 });
assert.equal(thiefReunionMove.ok, true, 'Captured thief must be able to move during reunion');

// Move thief and all detectives to safehouse door (<= 82 units)
thief.x = points.reunion.x;
thief.y = points.reunion.y;
for (const det of detectives) {
  det.x = points.reunion.x;
  det.y = points.reunion.y;
}

// Check reunion state in publicRoom
const pubReunion = publicRoom(room, detectives[0]);
assert.equal(pubReunion.room.reunion.arrivedCount, 4, 'All 4 participants are at safehouse');
assert.equal(pubReunion.room.reunion.totalCount, 4, 'Total participants is 4');
assert.equal(pubReunion.room.reunion.ready, true, 'Reunion must be ready');
assert.equal(pubReunion.room.reunionReady, true, 'reunionReady must be true');
console.log('✓ Live individual arrival tracking confirmed (4/4 arrived)');

// 10. Complete Case at Safehouse Door
const completeRes = doAction(room, detectives[0], { action: 'interact' });
assert.equal(completeRes.ok, true, 'Case must successfully complete');
assert.equal(room.phase, 'results', 'Room phase must be results');
assert.equal(room.result.caseSolved, true, 'Team solved the case together');
assert.equal(room.result.culpritCaught, true, 'Culprit was caught');
assert.equal(room.result.culpritName, thief.name, 'Culprit name matched');
console.log('✓ Full chase -> trap -> reunion -> case completion cycle succeeded!');

// 11. Edge Case: Disconnected Player during Reunion
const { room: r2, player: host2 } = newRoom('CHASE2', 'Holmes', 'boy');
const pB = makePlayer('Watson', 'watson');
const pC = makePlayer('Lestrade', 'officer');
const pD = makePlayer('Moriarty', 'thief');

r2.players.set(pB.id, pB);
r2.players.set(pC.id, pC);
r2.players.set(pD.id, pD);
host2.ready = true;
pB.ready = true;
pC.ready = true;
pD.ready = true;
doAction(r2, host2, { action: 'start' });

r2.phase = 'reunion';
r2.culpritCaught = true;
const r2Thief = [...r2.players.values()].find((p) => p.role === 'culprit');
r2Thief.captured = true;
r2Thief.eliminated = false;

// Place everyone at safehouse except 1 dropped player
for (const p of r2.players.values()) {
  p.x = points.reunion.x;
  p.y = points.reunion.y;
}
pC.connected = false;
pC.dropped = true;

const pubR2 = publicRoom(r2, host2);
assert.equal(pubR2.room.reunion.ready, true, 'Dropped players must not block reunion readiness');
const finishRes = doAction(r2, host2, { action: 'interact' });
assert.equal(finishRes.ok, true, 'Active team can complete case even if dropped player is absent');
console.log('✓ Disconnected / dropped player safety verified');

console.log('\n✨ ALL CHASE, CAPTURE & REUNION VERIFICATIONS PASSED!\n');
