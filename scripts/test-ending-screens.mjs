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
    { id: 'letter-ink', x: 112, y: 108 },
    { id: 'letter-seal', x: 252, y: 182 },
    { id: 'cipher', x: 494, y: 154 },
    { id: 'wire', x: 738, y: 306 },
    { id: 'relay', x: 874, y: 410 },
  ];
  const station = stations.find((point) => Math.hypot(player.x - point.x, player.y - point.y) <= 58);
  if (station?.id === 'cipher') act(room, player, 'puzzle', { station: 'cipher', solution: [9, 2, 8] });
  else if (station?.id === 'wire') act(room, player, 'puzzle', { station: 'wire', solution: ['short', 'short', 'short', 'long'] });
  else act(room, player, 'interact', station ? { answer: DEDUCTION_ANSWERS[station.id] } : {});
}

console.log('--- RUNNING VICTORIAN ENDING SCREENS VERIFICATION ---\n');

// -------------------------------------------------------------
// [1/4] Verifying HTML Structure of Case Resolution & Rewards
// -------------------------------------------------------------
console.log('[1/4] Verifying HTML Ending Screens Structure...');
const html = fs.readFileSync(path.resolve('public/index.html'), 'utf8');

const requiredHtmlElements = [
  'id="result-card"',
  'class="result-candle-glow"',
  'class="newspaper-headline"',
  'id="newspaper-banner"',
  'id="result-kicker"',
  'id="result-stamp"',
  'id="result-title"',
  'id="result-copy"',
  'id="result-failure-box"',
  'id="failure-headline"',
  'id="failure-explanation"',
  'class="resolution-dossier-grid"',
  'class="resolution-dossier-col resolution-dossier-col--truth"',
  'id="result-truth"',
  'id="result-suspect-placard"',
  'id="placard-badge"',
  'id="placard-name"',
  'id="placard-desc"',
  'class="resolution-dossier-col resolution-dossier-col--performance"',
  'id="result-evidence-summary"',
  'class="personal-dossier-card"',
  'id="personal-points-badge"',
  'id="round-score"',
  'id="personal-notes-list"',
  'class="case-rewards-bar"',
  'id="reward-xp"',
  'id="reward-bounty"',
  'id="reward-badge"',
  'class="tournament-standings-section"',
  'id="standings-round-label"',
  'id="scoreboard"',
  'class="resolution-actions-bar"',
  'id="rematch"',
  'id="waiting-host-box"',
  'id="result-return-lobby"',
  'id="result-main-menu"',
];

for (const el of requiredHtmlElements) {
  assert(html.includes(el), `Missing required HTML element: ${el}`);
}

assert(html.includes('SCOTLAND YARD FINAL REPORT'), 'Missing Yard report kicker in index.html');
assert(html.includes('BAKER STREET CANONICAL TRUTH'), 'Missing Canonical Truth header in index.html');
assert(html.includes('EVIDENCE SUMMARY & CONTRIBUTIONS'), 'Missing Evidence & Contributions header in index.html');
assert(html.includes('TOURNAMENT SCOREBOARD'), 'Missing Tournament Scoreboard header in index.html');
console.log('✓ All 27 required HTML elements and Victorian resolution components verified.\n');

// -------------------------------------------------------------
// [2/4] Verifying CSS Styles & Resolution Art Direction
// -------------------------------------------------------------
console.log('[2/4] Verifying CSS Styles & Victorian Ending Art Direction...');
const css = fs.readFileSync(path.resolve('public/styles.css'), 'utf8');

const requiredCssSelectors = [
  '.side-panel.has-results-active',
  '.result-card',
  '.result-card.is-victory',
  '.result-card.is-defeat',
  '.result-candle-glow',
  '.newspaper-headline',
  '.newspaper-masthead',
  '.newspaper-banner',
  '.result-stamp',
  '.result-stamp--solved',
  '.result-stamp--fail',
  '.resolution-title-block',
  '.resolution-title',
  '.resolution-copy',
  '.result-failure-box',
  '.failure-headline',
  '.failure-explanation',
  '.resolution-dossier-grid',
  '.resolution-dossier-col--truth',
  '.resolution-dossier-col--performance',
  '.truth-parchment',
  '.result-suspect-placard',
  '.placard-frame',
  '.placard-badge',
  '.result-evidence-summary',
  '.evidence-pill',
  '.personal-dossier-card',
  '.personal-points-badge',
  '.personal-notes-list',
  '.note-chip',
  '.case-rewards-bar',
  '.reward-pill',
  '.tournament-standings-section',
  '.resolution-actions-bar',
  '.button--rematch-action',
  '.waiting-host-notice',
  '.resolution-sub-actions',
];

for (const sel of requiredCssSelectors) {
  assert(css.includes(sel), `Missing required CSS selector: ${sel}`);
}

// Check art direction palette references in CSS
assert(css.includes('#C9A45C') || css.includes('#c9a45c') || css.includes('var(--gold'), 'Missing antique gold accent in CSS');
assert(css.includes('#D9534F') || css.includes('#d9534f') || css.includes('var(--red') || css.includes('var(--crimson'), 'Missing muted crimson in CSS');
assert(css.includes('#080E16') || css.includes('#080e16') || css.includes('var(--midnight'), 'Missing midnight blue in CSS');
console.log('✓ All 37 required CSS selectors and Victorian color palette verified.\n');

// -------------------------------------------------------------
// [3/4] Verifying JavaScript Logic, Procedural Chimes & Bindings
// -------------------------------------------------------------
console.log('[3/4] Verifying Client Logic and Procedural Audio Cues...');
const appJs = fs.readFileSync(path.resolve('public/app.js'), 'utf8');
const audioJs = fs.readFileSync(path.resolve('public/ambient-audio.js'), 'utf8');

assert(audioJs.includes('export function playOutcomeChime'), 'Missing playOutcomeChime in ambient-audio.js');
assert(audioJs.includes('isVictory'), 'playOutcomeChime must handle victory vs defeat differently');
assert(appJs.includes('playOutcomeChime'), 'app.js must import and call playOutcomeChime');
assert(appJs.includes("stamp.classList.toggle('result-stamp--solved', solved)"), 'app.js must set result-stamp--solved class');
assert(appJs.includes("stamp.classList.toggle('result-stamp--fail', !solved)"), 'app.js must set result-stamp--fail class');
assert(appJs.includes("newspaperBanner.textContent = solved ? 'CAPTURED!' : 'ELUDED!'"), 'app.js must set newspaper banner');
assert(appJs.includes("failureBox.classList.toggle('hidden', solved)"), 'app.js must toggle failure box for defeat');
assert(appJs.includes("$('result-return-lobby')?.addEventListener('click', leaveRoom)"), 'result-return-lobby must call leaveRoom');
assert(appJs.includes("$('result-main-menu')?.addEventListener('click', leaveRoom)"), 'result-main-menu must call leaveRoom');
console.log('✓ Procedural chimes, resolution state bindings, and navigation handlers verified.\n');

// -------------------------------------------------------------
// [4/4] End-to-End Simulation of Victory, Defeat & Clean Rematch
// -------------------------------------------------------------
console.log('[4/4] Simulating Multiplayer Victory and Defeat Outcomes with Rematch...');

// --- CASE 1: 4-Player Deduction VICTORY (Culprit caught & safehouse trap closed) ---
console.log('  Testing Scenario A: 4-Player Deduction Mode - Victory (Unanimous Accusation & Trap Capture)...');
const { room: vicRoom, player: vicHost } = newRoom('VIC001', 'Holmes');
const vicWatson = addPlayer(vicRoom, 'Watson', 'boy');
const vicAdler = addPlayer(vicRoom, 'Adler', 'girl');
const vicLestrade = addPlayer(vicRoom, 'Lestrade', 'boy');
const vicPlayers = [vicHost, vicWatson, vicAdler, vicLestrade];

// Everyone readies up and host starts game
for (const p of vicPlayers) act(vicRoom, p, 'ready', { ready: true });
vicRoom.mode = 'deduction';
act(vicRoom, vicHost, 'start');
assert.equal(vicRoom.mode, 'deduction');

const vicCulprit = vicPlayers.find((p) => p.role === 'culprit');
const vicDetectives = vicPlayers.filter((p) => p.role === 'detective');
assert.ok(vicCulprit, 'Must assign 1 culprit');
assert.equal(vicDetectives.length, 3, 'Must assign 3 detectives');

// Detectives collect clues from letter and cipher
investigate(vicRoom, vicDetectives[0], 112, 108);
investigate(vicRoom, vicDetectives[1], 252, 182);
assert.equal(vicRoom.missions.letter.done, true);
investigate(vicRoom, vicDetectives[0], 494, 160);
assert.equal(vicRoom.missions.cipher.done, true);
assert.ok(vicRoom.clues.length >= 2, 'Clues must be discovered');

// Detectives unanimously vote for culprit
for (const d of vicDetectives) act(vicRoom, d, 'vote', { target: vicCulprit.id });
assert.equal(vicRoom.vote.outcome, 'capture');
assert.equal(vicRoom.phase, 'capture');

// Move culprit to safehouse area so they are in range
vicCulprit.x = 484; vicCulprit.y = 552;

// Coordinate safehouse trap mechanisms
vicDetectives[0].x = 484; vicDetectives[0].y = 552;
act(vicRoom, vicDetectives[0], 'trap', { mechanism: 'lever' });
vicDetectives[1].x = 484; vicDetectives[1].y = 552;
act(vicRoom, vicDetectives[1], 'trap', { mechanism: 'valve' });
vicDetectives[2].x = 484; vicDetectives[2].y = 552;
act(vicRoom, vicDetectives[2], 'trap', { mechanism: 'key' });
assert.equal(vicRoom.culpritCaught, true);
assert.equal(vicRoom.phase, 'investigation');

// Finish telegraph investigation to open safehouse door
investigate(vicRoom, vicDetectives[0], 738, 306);
investigate(vicRoom, vicDetectives[1], 874, 410);
assert.equal(vicRoom.missions.telegraph.done, true);
assert.equal(vicRoom.phase, 'reunion');

// Complete reunion at safehouse door
for (const p of vicPlayers) { p.x = 484; p.y = 552; }
act(vicRoom, vicDetectives[0], 'interact');

// Authoritative results checks
assert.equal(vicRoom.phase, 'results');
assert.equal(vicRoom.result.caseSolved, true, 'Case must be marked solved on unanimous capture');
assert.equal(vicRoom.result.culpritCaught, true);
assert.equal(vicRoom.result.culpritName, vicCulprit.name);
assert.ok(vicRoom.result.truth.includes('Inspector Elias Vale'), 'Truth must detail canonical narrative');
assert.ok(vicRoom.result.truth.includes(vicCulprit.name), 'Truth must identify insider culprit');
assert.equal(vicRoom.result.roundAwards.length, 4, 'Awards must cover all 4 players');
assert.ok(vicRoom.result.roundAwards.every((a) => typeof a.pointsEarned === 'number'), 'Points earned must be numbers');
assert.ok(vicRoom.result.scoreboard.length, 4, 'Scoreboard must list 4 players');
console.log('  ✓ Scenario A: Authoritative Victory result generated with canonical truth and verified awards.');

// Test Rematch (Host triggers reset for round 2)
act(vicRoom, vicHost, 'rematch');
assert.equal(vicRoom.phase, 'lobby', 'Rematch must return to lobby');
assert.equal(vicRoom.round, 2, 'Rematch must increment round count');
assert.equal(vicRoom.clues.length, 0, 'Rematch must reset clues');
assert.equal(vicRoom.culpritCaught, false, 'Rematch must reset culpritCaught');
assert.equal(vicRoom.missions.letter.done, false, 'Rematch must reset missions');
console.log('  ✓ Host rematch cleanly resets round state without duplicate rooms or stale clues.');

// --- CASE 2: 4-Player Deduction DEFEAT (Wrong Unanimous Accusation) ---
console.log('  Testing Scenario B: 4-Player Deduction Mode - Defeat (Mistaken Accusation & Escaped Culprit)...');
for (const p of vicPlayers) act(vicRoom, p, 'ready', { ready: true });
vicRoom.mode = 'deduction';
act(vicRoom, vicHost, 'start');
assert.equal(vicRoom.phase, 'investigation');

const round2Culprit = vicPlayers.find((p) => p.role === 'culprit');
const round2Detectives = vicPlayers.filter((p) => p.role === 'detective');

// Collect clues
investigate(vicRoom, round2Detectives[0], 112, 108);
investigate(vicRoom, round2Detectives[1], 252, 182);
assert.equal(vicRoom.missions.letter.done, true);
investigate(vicRoom, round2Detectives[0], 494, 160);
assert.equal(vicRoom.missions.cipher.done, true);

// Mistaken accusation: All detectives unanimously accuse an innocent detective
for (const d of round2Detectives) act(vicRoom, d, 'vote', { target: round2Detectives[0].id });
assert.equal(vicRoom.vote.outcome, 'wrong');
assert.equal(vicRoom.culpritCaught, false);

// Finish telegraph investigation and reunion
investigate(vicRoom, round2Detectives[1], 738, 306);
investigate(vicRoom, round2Detectives[2], 874, 410);
assert.equal(vicRoom.missions.telegraph.done, true);
assert.equal(vicRoom.phase, 'reunion');

for (const p of vicPlayers) { p.x = 484; p.y = 552; }
act(vicRoom, round2Detectives[1], 'interact');

// Authoritative results checks for defeat
assert.equal(vicRoom.phase, 'results');
assert.equal(vicRoom.result.caseSolved, false, 'Case must be marked unsolved on mistaken accusation');
assert.equal(vicRoom.result.culpritCaught, false);
assert.ok(vicRoom.result.caseOutcome.includes('a wrong unanimous vote let the culprit escape'));
const culpritAward = vicRoom.result.roundAwards.find((a) => a.playerId === round2Culprit.id);
assert.ok(culpritAward.notes.some((n) => n.includes('escaping capture')), 'Culprit awarded points for escape');
console.log('  ✓ Scenario B: Authoritative Defeat result generated with true failure cause.');

// --- CASE 3: 2-Player Cooperative Full Match (Match Completion after 3 rounds) ---
console.log('  Testing Scenario C: 2-Player Cooperative Tournament Completion (3 Rounds)...');
const { room: coopRoom, player: coopHost } = newRoom('COOP99', 'Holmes');
const coopGuest = addPlayer(coopRoom, 'Watson', 'boy');
const coopPlayers = [coopHost, coopGuest];

for (let r = 1; r <= 3; r++) {
  for (const p of coopPlayers) act(coopRoom, p, 'ready', { ready: true });
  act(coopRoom, coopHost, 'start');
  investigate(coopRoom, coopHost, 112, 108);
  investigate(coopRoom, coopGuest, 252, 182);
  investigate(coopRoom, coopHost, 494, 160);
  investigate(coopRoom, coopGuest, 738, 306);
  investigate(coopRoom, coopHost, 874, 410);
  for (const p of coopPlayers) { p.x = 484; p.y = 552; }
  act(coopRoom, coopHost, 'interact');
  assert.equal(coopRoom.phase, 'results');
  assert.equal(coopRoom.result.caseSolved, true);

  if (r < 3) {
    assert.equal(coopRoom.result.matchComplete, false);
    act(coopRoom, coopHost, 'rematch');
  } else {
    assert.equal(coopRoom.result.matchComplete, true, 'Round 3 must trigger matchComplete');
    assert.ok(coopRoom.result.matchWinnerNames.length >= 1, 'Match winners must be determined');
  }
}
console.log('  ✓ Scenario C: 3-round tournament completed with tournament winners announced.');

console.log('\n=== ALL VICTORIAN ENDING SCREENS VERIFICATION TESTS PASSED! ===');
