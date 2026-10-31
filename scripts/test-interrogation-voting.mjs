import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  newRoom,
  makePlayer,
  doAction,
  publicRoom,
  sweepRoom,
  DEDUCTION_ANSWERS,
} from '../lib/game-core.mjs';

function addPlayer(room, name, character = 'boy') {
  const player = makePlayer(name);
  player.character = character;
  room.players.set(player.id, player);
  room.scores.set(player.id, 0);
  return player;
}

console.log('--- RUNNING VICTORIAN INTERROGATION ROOM & VOTING VERIFICATION ---\n');

// -------------------------------------------------------------
// [1/4] Verifying HTML Structure of the Interrogation Room
// -------------------------------------------------------------
console.log('[1/4] Verifying HTML Interrogation Room Structure...');
const html = fs.readFileSync(path.resolve('public/index.html'), 'utf8');

const requiredHtmlElements = [
  'id="vote-card"',
  'class="interrogation-candle-glow"',
  'class="panel-card__head interrogation-head"',
  'id="vote-title"',
  'class="interrogation-divider"',
  'id="vote-copy"',
  'id="vote-evidence-table"',
  'id="vote-evidence-count"',
  'id="vote-evidence-list"',
  'id="vote-culprit-notice"',
  'class="suspect-gallery-section"',
  'id="suspect-gallery"',
  'id="vote-countdown-wrap"',
  'id="vote-timer-seconds"',
  'id="vote-countdown-bar"',
  'id="vote-target"',
  'id="vote-submit"',
  'id="vote-outcome-card"',
  'id="vote-outcome-badge"',
  'id="vote-outcome-headline"',
  'id="vote-outcome-description"',
  'id="vote-tally-list"',
  'id="vote-result"',
];

for (const el of requiredHtmlElements) {
  assert(html.includes(el), `Missing required HTML element: ${el}`);
}
assert(html.includes('Who is the Culprit?'), 'Missing "Who is the Culprit?" title in index.html');
assert(html.includes('EVIDENCE LODGED ON THE TABLE'), 'Missing evidence table title in index.html');
console.log('✓ All 23 required HTML elements and interrogation desk components verified.\n');

// -------------------------------------------------------------
// [2/4] Verifying CSS Styles & Interrogation Art Direction
// -------------------------------------------------------------
console.log('[2/4] Verifying CSS Styles & Victorian Interrogation Art Direction...');
const css = fs.readFileSync(path.resolve('public/styles.css'), 'utf8');

const requiredCssSelectors = [
  '.side-panel.has-vote-active',
  '.vote-card',
  '.interrogation-candle-glow',
  '@keyframes candleFlicker',
  '.interrogation-head',
  '.vote-heading',
  '.interrogation-divider',
  '.vote-copy',
  '.vote-evidence-table',
  '.evidence-table-head',
  '.evidence-table-title',
  '.vote-evidence-item',
  '.vote-evidence-seal',
  '.vote-culprit-notice',
  '.culprit-skull-icon',
  '.suspect-gallery-section',
  '.suspect-gallery',
  '.suspect-card',
  '.suspect-card.is-voted',
  '.suspect-voted-stamp',
  '.suspect-frame',
  '.suspect-daguerreotype',
  '.suspect-silhouette',
  '.suspect-name',
  '.suspect-subrole',
  '.suspect-evidence-notes',
  '.button--vote-card',
  '.vote-countdown-wrap',
  '.vote-countdown-bar',
  '.vote-outcome-card',
  '.vote-outcome-card.is-capture',
  '.vote-outcome-card.is-wrong',
  '.vote-outcome-card.is-split',
  '.tally-chip',
];

for (const sel of requiredCssSelectors) {
  assert(css.includes(sel), `Missing required CSS selector: ${sel}`);
}
console.log('✓ All 34 required CSS classes, candlelight animations, and outcome styles verified.\n');

// -------------------------------------------------------------
// [3/4] Verifying JavaScript Logic, No-Fake-Timer & Role Privacy
// -------------------------------------------------------------
console.log('[3/4] Verifying JavaScript Logic, Role Privacy, and Real Timer...');
const js = fs.readFileSync(path.resolve('public/app.js'), 'utf8');

assert(js.includes('function updateVoteUi'), 'Missing updateVoteUi function in app.js');
assert(js.includes('function getVictorianCameoSvg'), 'Missing getVictorianCameoSvg function in app.js');
assert(js.includes('function getSuspectNotes'), 'Missing getSuspectNotes function in app.js');
assert(js.includes('hasActiveTimer'), 'Missing hasActiveTimer verification in app.js (ensuring no fake countdown)');
assert(js.includes('culpritNotice.classList.toggle'), 'Missing culprit secret role notice handling in app.js');
assert(js.includes('card.setAttribute(\'tabindex\', \'0\')'), 'Missing keyboard accessibility tabindex on suspect cards');
assert(js.includes('card.addEventListener(\'keydown\''), 'Missing keyboard Enter/Space activation on suspect cards');
console.log('✓ JavaScript interrogation logic, role privacy, and keyboard navigation verified.\n');

// -------------------------------------------------------------
// [4/4] Testing Real Multiplayer Voting with Independent Sessions
// -------------------------------------------------------------
console.log('[4/4] Testing Real Multiplayer Voting with 4 Independent Sessions...');

// Setup 4 independent sessions in memory
const { room, player: host } = newRoom('VOTE01', 'Sherlock Holmes', 'boy');
const p2 = addPlayer(room, 'Dr Watson', 'boy');
const p3 = addPlayer(room, 'Irene Adler', 'girl');
const p4 = addPlayer(room, 'Inspector Lestrade', 'boy');

assert.equal(room.players.size, 4, 'Room should have 4 players');

// Ready all players
for (const p of room.players.values()) {
  doAction(room, p, { action: 'ready', ready: true });
}

// Start deduction game
room.mode = 'deduction';
const startRes = doAction(room, host, { action: 'start' });
assert.equal(startRes.ok, true, 'Game start should succeed');
assert.equal(room.mode, 'deduction', 'Game mode must be deduction for 4 players');

const culprit = [...room.players.values()].find((p) => p.role === 'culprit');
const detectives = [...room.players.values()].filter((p) => p.role === 'detective');

assert(culprit, 'There must be a secret culprit');
assert.equal(detectives.length, 3, 'There must be 3 detectives');

// Verify Role Privacy: Detectives must NOT see who the culprit is in public serialPlayer
for (const det of detectives) {
  const pub = publicRoom(room, det);
  for (const player of pub.room.players) {
    assert.equal(player.role, undefined, 'Player role must remain secret during investigation');
    assert.equal(player.revealedRole, undefined, 'Revealed role must be undefined');
  }
}

// 1. Voting should NOT be available before 2 clues
assert.equal(publicRoom(room, detectives[0]).room.voteAvailable, false, 'Vote must be unavailable before 2 clues');
const prematureVote = doAction(room, detectives[0], { action: 'vote', target: culprit.id });
assert.equal(prematureVote.ok, false, 'Premature vote should be rejected');

// 2. Discover Clue 1: Yard Ink
detectives[0].x = 112; detectives[0].y = 108;
doAction(room, detectives[0], { action: 'interact', answer: DEDUCTION_ANSWERS['letter-ink'] });

// 3. Discover Clue 2: Yard Seal
detectives[1].x = 252; detectives[1].y = 182;
doAction(room, detectives[1], { action: 'interact', answer: DEDUCTION_ANSWERS['letter-seal'] });

assert.equal(room.clues.length, 1, 'Letter comparison yielded Clue 1');

// 4. Decode Timetable -> Clue 2
detectives[0].x = 494; detectives[0].y = 154;
doAction(room, detectives[0], { action: 'puzzle', station: 'cipher', solution: [9, 2, 8] });

assert.equal(room.clues.length, 2, 'Two clues now recorded');
assert.equal(publicRoom(room, detectives[0]).room.voteAvailable, true, 'Vote is now available');

// 5. Verify timer does NOT exist yet on server (no fake timer!)
assert.equal(room.vote, null, 'Server room.vote must be null before first vote is cast');

// 6. Test Culprit cannot cast investigation vote
const culpritVote = doAction(room, culprit, { action: 'vote', target: detectives[0].id });
assert.equal(culpritVote.ok, false, 'Culprit cannot vote in the detective inquiry');

// 7. Detective 0 casts vote -> Vote opens with authoritative deadline
const vote1 = doAction(room, detectives[0], { action: 'vote', target: culprit.id });
assert.equal(vote1.ok, true, 'Detective 1 vote should succeed');
assert(room.vote, 'room.vote must now exist');
assert.equal(room.vote.open, true, 'Vote should be open');
assert(room.vote.deadline > Date.now(), 'Server deadline must be active');

// 8. Test Duplicate Vote Prevention
const dupVote = doAction(room, detectives[0], { action: 'vote', target: culprit.id });
assert.equal(dupVote.ok, false, 'Duplicate vote must be rejected');
assert(dupVote.message.includes('already recorded'), 'Should report vote already recorded');

// 9. Detective 1 votes for someone else -> Split vote simulation
const vote2 = doAction(room, detectives[1], { action: 'vote', target: detectives[2].id });
assert.equal(vote2.ok, true);

// 10. Detective 2 votes for someone else -> Vote resolves as split
const vote3 = doAction(room, detectives[2], { action: 'vote', target: detectives[0].id });
assert.equal(vote3.ok, true);
assert.equal(room.vote.resolved, true, 'All detectives voted, vote must resolve');
assert.equal(room.vote.outcome, 'split', 'Split vote outcome must be "split"');
assert(room.vote.tally, 'Tally should be populated');

console.log('✓ Duplicate vote rejection, split vote resolution, and role privacy verified.');

// 11. Test Unanimous Correct Accusation in fresh room
const { room: testRoom, player: testHost } = newRoom('VOTE02', 'Holmes');
addPlayer(testRoom, 'Watson', 'boy');
addPlayer(testRoom, 'Adler', 'girl');
addPlayer(testRoom, 'Lestrade', 'boy');

for (const p of testRoom.players.values()) doAction(testRoom, p, { action: 'ready', ready: true });
doAction(testRoom, testHost, { action: 'start' });

const tpCulprit = [...testRoom.players.values()].find((p) => p.role === 'culprit');
const tpDetectives = [...testRoom.players.values()].filter((p) => p.role === 'detective');

// Add 2 clues
testRoom.clues.push({ id: '1', title: 'Clue 1', detail: 'Detail 1', time: Date.now() });
testRoom.clues.push({ id: '2', title: 'Clue 2', detail: 'Detail 2', time: Date.now() });

// Unanimous vote on culprit
for (const d of tpDetectives) {
  const v = doAction(testRoom, d, { action: 'vote', target: tpCulprit.id });
  assert.equal(v.ok, true);
}
assert.equal(testRoom.vote.resolved, true);
assert.equal(testRoom.vote.outcome, 'capture', 'Unanimous vote on culprit must trigger capture outcome');
assert.equal(testRoom.phase, 'capture', 'Phase must transition to capture');

console.log('✓ Unanimous correct vote triggers capture and sets safehouse trap sequence.');

// 12. Test Unanimous Wrong Accusation in fresh room
const { room: wrongRoom, player: wrongHost } = newRoom('VOTE03', 'Holmes');
addPlayer(wrongRoom, 'Watson', 'boy');
addPlayer(wrongRoom, 'Adler', 'girl');
addPlayer(wrongRoom, 'Lestrade', 'boy');

for (const p of wrongRoom.players.values()) doAction(wrongRoom, p, { action: 'ready', ready: true });
doAction(wrongRoom, wrongHost, { action: 'start' });

const wpDetectives = [...wrongRoom.players.values()].filter((p) => p.role === 'detective');
wrongRoom.clues.push({ id: '1', title: 'Clue 1', detail: 'Detail 1', time: Date.now() });
wrongRoom.clues.push({ id: '2', title: 'Clue 2', detail: 'Detail 2', time: Date.now() });

// Detectives unanimously accuse an innocent detective
for (const d of wpDetectives) {
  doAction(wrongRoom, d, { action: 'vote', target: wpDetectives[0].id });
}
assert.equal(wrongRoom.vote.resolved, true);
assert.equal(wrongRoom.vote.outcome, 'wrong', 'Unanimous vote on innocent detective must result in "wrong" outcome');

console.log('✓ Unanimous mistaken vote correctly recorded and culprit remains at large.');

// 13. Test Vote Timeout in fresh room
const { room: timeoutRoom, player: timeoutHost } = newRoom('VOTE04', 'Holmes');
addPlayer(timeoutRoom, 'Watson', 'boy');
addPlayer(timeoutRoom, 'Adler', 'girl');
addPlayer(timeoutRoom, 'Lestrade', 'boy');

for (const p of timeoutRoom.players.values()) doAction(timeoutRoom, p, { action: 'ready', ready: true });
doAction(timeoutRoom, timeoutHost, { action: 'start' });

const topDetectives = [...timeoutRoom.players.values()].filter((p) => p.role === 'detective');
timeoutRoom.clues.push({ id: '1', title: 'Clue 1', detail: 'Detail 1', time: Date.now() });
timeoutRoom.clues.push({ id: '2', title: 'Clue 2', detail: 'Detail 2', time: Date.now() });

// Only 1 detective votes, then deadline expires
doAction(timeoutRoom, topDetectives[0], { action: 'vote', target: topDetectives[1].id });
assert.equal(timeoutRoom.vote.open, true);
assert.equal(timeoutRoom.vote.resolved, false);

// Simulate time passing beyond deadline
timeoutRoom.vote.deadline = Date.now() - 100;
publicRoom(timeoutRoom, topDetectives[0]); // triggers sweepRoom

assert.equal(timeoutRoom.vote.resolved, true, 'Sweep must resolve expired vote');
assert.equal(timeoutRoom.vote.outcome, 'split', 'Timeout without unanimity must be split outcome');

console.log('✓ Server-authoritative vote timeout and missing votes sweep verified.');

console.log('\n=== ALL VICTORIAN INTERROGATION ROOM & VOTING TESTS PASSED! ===');
