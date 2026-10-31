import assert from 'node:assert/strict';
import {
  newRoom,
  makePlayer,
  doAction,
  publicRoom,
  CHARACTER_TRAITS,
  buildCulpritEvidenceBoard,
  unlockEvidenceFragment,
  getSuspectsSummary,
} from '../lib/game-core.mjs';

console.log('🧪 Testing Shared Evidence and Progressive Thief Identification System...\n');

// 1. Setup 4-player deduction room
const { room: r1, player: host } = newRoom('EV0001', 'Sherlock Holmes', 'boy');
const p2 = makePlayer('Dr. Watson', 'watson');
const p3 = makePlayer('Irene Adler', 'girl');
const p4 = makePlayer('Insp. Lestrade', 'officer');

r1.players.set(p2.id, p2);
r1.players.set(p3.id, p3);
r1.players.set(p4.id, p4);

// Ready up all players
host.ready = true;
p2.ready = true;
p3.ready = true;
p4.ready = true;

// Start game in 4-player deduction mode
r1.mode = 'deduction';
const startRes = doAction(r1, host, { action: 'start' });
assert.equal(startRes.ok, true, 'Room should start successfully');
assert.equal(r1.mode, 'deduction', '4 players should initiate deduction mode');

const players = [...r1.players.values()];
const culprit = players.find((p) => p.role === 'culprit');
const detectives = players.filter((p) => p.role === 'detective');

assert.ok(culprit, 'Exactly one player must be secretly assigned as culprit/thief');
assert.equal(detectives.length, 3, 'Remaining 3 players must be detectives');
console.log(`✓ 4-player deduction room started. Secret thief: ${culprit.name} (${culprit.character})`);

// 2. Verify Role Privacy in publicRoom state
const pubDetective = publicRoom(r1, detectives[0]);
for (const p of pubDetective.room.players) {
  assert.equal(p.revealedRole, undefined, 'Player role must remain hidden in public state');
  if (!p.isMe) {
    assert.equal(p.role, undefined, 'Secret role must not leak to peers');
  }
}
assert.equal(pubDetective.me.role, 'detective', 'Detective sees own role');

const pubThief = publicRoom(r1, culprit);
assert.equal(pubThief.me.role, 'culprit', 'Thief sees own secret role');
console.log('✓ Secret role privacy strictly maintained across public network payloads');

// 3. Verify Evidence Board Generation (6 Progressive Exhibits)
const board = r1.evidenceBoard;
assert.ok(Array.isArray(board), 'Evidence board must be an array');
assert.equal(board.length, 6, 'Evidence board must contain exactly 6 progressive exhibits');

const expectedCategories = ['footprints', 'fabric', 'photograph', 'letter', 'location', 'fingerprints'];
board.forEach((frag, idx) => {
  assert.equal(frag.stage, idx + 1, `Exhibit ${idx + 1} stage mismatch`);
  assert.equal(frag.category, expectedCategories[idx], `Exhibit ${idx + 1} category mismatch`);
  assert.equal(frag.unlocked, false, `Exhibit ${idx + 1} must start locked`);
  assert.ok(frag.title, `Exhibit ${idx + 1} must have a title`);
  assert.ok(frag.detail, `Exhibit ${idx + 1} must have forensic detail`);
  assert.ok(frag.traitSummary, `Exhibit ${idx + 1} must have traitSummary`);
});
console.log('✓ Evidence board initialized with 6 progressive forensic exhibits: Footprints, Fabric, Photo, Letter, Location, Fingerprint');

// 4. Test Progressive Narrowing & Clue 1 Non-Revelation
// Unlock Clue 1: Footprints
unlockEvidenceFragment(r1, 'clue-footprints-yard', detectives[0]);
assert.equal(board[0].unlocked, true, 'Exhibit #1 (Footprints) should be unlocked');
assert.equal(board[1].unlocked, false, 'Exhibit #2 should still be locked');

// Check suspect summary after Clue 1
let summary1 = getSuspectsSummary(r1);
const matchingSuspectsClue1 = summary1.filter((s) => s.matchedCount > 0);
assert.ok(matchingSuspectsClue1.length >= 2, `Clue 1 must match multiple suspects (found ${matchingSuspectsClue1.length}) to prevent premature reveal`);
console.log(`✓ Clue 1 (Footprints) does not reveal thief automatically: ${matchingSuspectsClue1.length} suspects match`);

// Unlock Clue 2: Fabric
unlockEvidenceFragment(r1, 'clue-fabric-fence', detectives[0]);
assert.equal(board[1].unlocked, true, 'Exhibit #2 (Fabric) should be unlocked');

// Unlock Clue 3: Photo via photo-reconstruct mini-game
const photoPlayer = detectives[0];
photoPlayer.x = 540; photoPlayer.y = 195; // Near photo plate
const photoRes = doAction(r1, photoPlayer, {
  action: 'photo-reconstruct',
  order: [0, 1, 2, 3, 4, 5],
});
assert.equal(photoRes.ok, true, 'Photo reconstruction challenge should succeed');
assert.equal(board[2].unlocked, true, 'Exhibit #3 (Photo) should be unlocked via photo-reconstruct mini-game');
console.log('✓ Clue 3 unlocked via daguerreotype reconstruction challenge');

// Unlock Clue 4: Letter via cipher wheel mini-game
const cipherPlayer = detectives[1];
cipherPlayer.x = 494; cipherPlayer.y = 154; // Near Baker Street study
const cipherRes = doAction(r1, cipherPlayer, {
  action: 'cipher-wheel',
  shift: 7,
  keyword: 'BLACKTHORN',
});
assert.equal(cipherRes.ok, true, 'Cipher wheel challenge should succeed');
assert.equal(board[3].unlocked, true, 'Exhibit #4 (Letter) should be unlocked via cipher-wheel challenge');
console.log('✓ Clue 4 unlocked via cipher wheel challenge');

// Unlock Clue 5: Location via lockpick mini-game
const lockPlayer = detectives[0];
lockPlayer.x = 810; lockPlayer.y = 460; // Near antique lock mechanism
const lockRes = doAction(r1, lockPlayer, {
  action: 'lockpick',
  tumblers: [3, 7, 5],
});
assert.equal(lockRes.ok, true, 'Lockpicking challenge should succeed');
assert.equal(board[4].unlocked, true, 'Exhibit #5 (Location & Key) should be unlocked via lockpick mini-game');
console.log('✓ Clue 5 unlocked via Victorian lockpick challenge');

// Unlock Clue 6: Final Fingerprint Lift
unlockEvidenceFragment(r1, 'clue-fingerprint-glass', detectives[1]);
assert.equal(board[5].unlocked, true, 'Exhibit #6 (Fingerprint) should be unlocked');

// Check suspect summary after Clue 6: Conclusive Identification
const summary6 = getSuspectsSummary(r1);
const primeSuspects = summary6.filter((s) => s.suspicionLevel === 'prime');
assert.equal(primeSuspects.length, 1, 'Exactly one suspect must be designated as prime suspect after all 6 exhibits');
assert.equal(primeSuspects[0].id, culprit.id, 'The prime suspect must be the hidden thief');
assert.equal(primeSuspects[0].matchedCount, 6, 'Thief must match all 6 forensic exhibits');

// Verify that other detectives are cleared or low/medium
const nonCulprits = summary6.filter((s) => s.id !== culprit.id);
assert.ok(nonCulprits.every((s) => s.suspicionLevel !== 'prime'), 'Non-culprits must not be prime suspects');
console.log(`✓ Clue 6 (Fingerprint) provides 100% conclusive proof! Prime suspect identified: ${primeSuspects[0].name}`);

// 5. Test Evidence Connection (`action === 'connect-evidence'`)
// Attempt connecting locked or nonexistent fragments (should fail)
const badConn = doAction(r1, detectives[0], { action: 'connect-evidence', from: 'fake', to: 'fake' });
assert.equal(badConn.ok, false, 'Invalid fragment connection should fail');

// Connect Exhibit 1 to Exhibit 2
const goodConn = doAction(r1, detectives[0], {
  action: 'connect-evidence',
  from: 'fragment-footprints',
  to: 'fragment-fabric',
});
assert.equal(goodConn.ok, true, 'Connecting two unlocked exhibits should succeed');
assert.equal(r1.evidenceConnections.length, 1, 'Connection should be saved on evidence board');
assert.equal(r1.evidenceConnections[0].from, 'fragment-footprints');
assert.equal(r1.evidenceConnections[0].to, 'fragment-fabric');

// Attempt duplicate connection
const dupConn = doAction(r1, detectives[0], {
  action: 'connect-evidence',
  from: 'fragment-fabric',
  to: 'fragment-footprints',
});
assert.equal(dupConn.ok, false, 'Duplicate connection should be rejected');
console.log('✓ Clue connection & red thread pinning validated');

// 6. Test Suspect Notes (`action === 'suspect-note'`)
const noteRes = doAction(r1, detectives[0], {
  action: 'suspect-note',
  suspectId: culprit.id,
  note: 'Boot size 9 and French worsted wool match crime scene gate evidence!',
});
assert.equal(noteRes.ok, true, 'Dossier note should be accepted');
assert.equal(r1.suspectNotes[culprit.id].note, 'Boot size 9 and French worsted wool match crime scene gate evidence!');
assert.equal(r1.suspectNotes[culprit.id].author, detectives[0].name);
console.log('✓ Shared suspect notes & dossier annotations validated');

// 7. Test Accusation Council & Identification Voting (`call-vote` & `vote`)
// Culprit cannot convene accusation or vote
const culpritVote = doAction(r1, culprit, { action: 'call-vote' });
assert.equal(culpritVote.ok, false, 'Hidden thief cannot call accusation vote');

// Detective convenes accusation vote
const callVoteRes = doAction(r1, detectives[0], { action: 'call-vote', target: culprit.id });
assert.equal(callVoteRes.ok, true, 'Detective can convene accusation council');
assert.equal(r1.vote.open, true, 'Vote should be in session');

// Remaining detectives vote for culprit
doAction(r1, detectives[1], { action: 'vote', target: culprit.id });
doAction(r1, detectives[2], { action: 'vote', target: culprit.id });

assert.equal(r1.vote.resolved, true, 'Unanimous vote should resolve');
assert.equal(r1.vote.outcome, 'capture', 'Unanimous vote against culprit triggers capture phase');
assert.equal(r1.phase, 'capture', 'Game must transition to capture phase');
console.log('✓ Unanimous accusation council triggers capture sequence');

// 8. Test Coordinated Safehouse Trap & Final Reunion
// Sequence: lever -> valve -> key
const [detA, detB, detC] = detectives;
detA.x = 484; detA.y = 552;
detB.x = 484; detB.y = 552;
detC.x = 484; detC.y = 552;
culprit.x = 484; culprit.y = 552;

// Finish telegraph if not already done so reunion condition is satisfied
r1.missions.telegraph.done = true;

const t1 = doAction(r1, detA, { action: 'trap', mechanism: 'lever' });
assert.equal(t1.ok, true, 'Mechanism 1 (lever) operated');

const t2 = doAction(r1, detB, { action: 'trap', mechanism: 'valve' });
assert.equal(t2.ok, true, 'Mechanism 2 (valve) operated');

const t3 = doAction(r1, detC, { action: 'trap', mechanism: 'key' });
assert.equal(t3.ok, true, 'Mechanism 3 (key) operated');
assert.equal(r1.culpritCaught, true, 'Culprit is now caught and in custody');
assert.equal(r1.phase, 'reunion', 'Phase transitions to final safehouse reunion');
console.log('✓ Safehouse trap springs shut. Thief taken into custody!');

// Detectives and captured thief at safehouse door complete the case
const finishRes = doAction(r1, detA, { action: 'interact' });
assert.equal(finishRes.ok, true, 'Final safehouse reunion completes the case');
assert.equal(r1.phase, 'results', 'Game concludes at results screen');
assert.equal(r1.result.culpritCaught, true, 'Culprit caught recorded in case results');
console.log('✓ Complete deduction cycle: Clues -> Mini-games -> Evidence Board -> Identification -> Capture -> Reunion -> Solved!');

console.log('\n==========================================');
console.log('ALL EVIDENCE & THIEF IDENTIFICATION TESTS PASSED!');
console.log('==========================================\n');
