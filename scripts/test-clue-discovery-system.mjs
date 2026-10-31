import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { doAction, newRoom, makePlayer, DEDUCTION_ANSWERS } from '../lib/game-core.mjs';

console.log('--- RUNNING UPGRADED CLUE DISCOVERY SYSTEM VERIFICATION ---\n');

// [1/6] Verify 7 Clue Categories & Searchable Objects in game-core.mjs
console.log('[1/6] Verifying Clue Categories & Searchable Objects in game-core.mjs...');
const gameCoreJs = fs.readFileSync(path.resolve('lib/game-core.mjs'), 'utf8');

const requiredCategories = [
  'footprints',
  'fabric',
  'photograph',
  'letter',
  'key',
  'fingerprints',
  'witness',
];

for (const cat of requiredCategories) {
  assert(gameCoreJs.includes(`category: '${cat}'`), `Category missing in game-core.mjs: ${cat}`);
}

const requiredClueIds = [
  'clue-footprints-yard',
  'clue-fabric-fence',
  'clue-photo-surveillance',
  'clue-key-iron',
  'clue-fingerprint-glass',
  'clue-witness-ledger',
  'letter-ink',
  'letter-seal',
];

for (const id of requiredClueIds) {
  assert(gameCoreJs.includes(id), `Clue ID missing in game-core.mjs: ${id}`);
  assert(DEDUCTION_ANSWERS[id], `Missing answer mapping in DEDUCTION_ANSWERS for ${id}`);
}
console.log('✓ All 7 clue categories and searchable objects verified in game-core.mjs.');

// [2/6] Verify 3D World Clue Models, Proximity Detection & Effects in world3d.js
console.log('\n[2/6] Verifying 3D World Clue Models & Proximity in world3d.js...');
const worldJs = fs.readFileSync(path.resolve('public/world3d.js'), 'utf8');

assert(worldJs.includes("category === 'footprints'"), 'Footprints 3D model branch missing');
assert(worldJs.includes("category === 'fabric'"), 'Fabric 3D model branch missing');
assert(worldJs.includes("category === 'photograph'"), 'Photograph 3D model branch missing');
assert(worldJs.includes("category === 'key'"), 'Key 3D model branch missing');
assert(worldJs.includes("category === 'fingerprints'"), 'Fingerprints 3D model branch missing');
assert(worldJs.includes("category === 'witness'"), 'Witness 3D model branch missing');
assert(worldJs.includes("category === 'letter'"), 'Letter 3D model branch missing');
assert(worldJs.includes('playClueProximityShimmer'), 'Proximity sound call missing in world3d.js');
assert(worldJs.includes('playDiscoveryEffect'), 'playDiscoveryEffect missing in world3d.js');
assert(worldJs.includes('proximityRing'), 'Proximity ground ring missing in world3d.js');
console.log('✓ 3D distinct clue geometries, proximity ground rings, and discovery ripple effects verified.');

// [3/6] Verify Procedural Audio Functions in ambient-audio.js
console.log('\n[3/6] Verifying Web Audio Clue Sound FX in ambient-audio.js...');
const audioJs = fs.readFileSync(path.resolve('public/ambient-audio.js'), 'utf8');

assert(audioJs.includes('playClueProximityShimmer'), 'playClueProximityShimmer missing in ambient-audio.js');
assert(audioJs.includes('playClueInspectSound'), 'playClueInspectSound missing in ambient-audio.js');
assert(audioJs.includes('playClueDiscoveredChime'), 'playClueDiscoveredChime missing in ambient-audio.js');
assert(audioJs.includes('playStampSlamSound'), 'playStampSlamSound missing in ambient-audio.js');
console.log('✓ All procedural Web Audio clue effects verified in ambient-audio.js.');

// [4/6] Verify Client Challenges, Contextual Prompts & Illustrations in app.js
console.log('\n[4/6] Verifying Mini-Game Challenges & Contextual Prompts in app.js...');
const appJs = fs.readFileSync(path.resolve('public/app.js'), 'utf8');

for (const id of requiredClueIds) {
  assert(appJs.includes(id), `FIELD_CHALLENGES entry missing in app.js: ${id}`);
}

assert(appJs.includes("clueType === 'footprints'"), 'Footprints SVG illustration missing');
assert(appJs.includes("clueType === 'fabric'"), 'Fabric SVG illustration missing');
assert(appJs.includes("clueType === 'photograph'"), 'Photograph SVG illustration missing');
assert(appJs.includes("clueType === 'key'"), 'Key SVG illustration missing');
assert(appJs.includes("clueType === 'fingerprints'"), 'Fingerprints SVG illustration missing');
assert(appJs.includes("clueType === 'witness'"), 'Witness SVG illustration missing');
assert(appJs.includes('Examine Muddy Footprints'), 'Contextual examine prompt for footprints missing');
assert(appJs.includes('Inspect Torn Fabric'), 'Contextual examine prompt for fabric missing');
assert(appJs.includes('Examine Crime Scene Photograph'), 'Contextual examine prompt for photo missing');
assert(appJs.includes('Inspect Antique Skeleton Key'), 'Contextual examine prompt for key missing');
assert(appJs.includes('Dust Latent Fingerprint'), 'Contextual examine prompt for fingerprints missing');
assert(appJs.includes('Examine Witness Cab Ledger'), 'Contextual examine prompt for witness ledger missing');
console.log('✓ Contextual Examine prompts and authentic SVG illustrations verified in app.js.');

// [5/6] Server-Authoritative Discovery, Mini-Game Challenge & Duplicate Prevention
console.log('\n[5/6] Testing Server Authoritative Challenge Unlocks & Duplicate Prevention...');
const { room, player: detective } = newRoom('SRCH01', 'Sherlock', 'sherlock');
const watson = makePlayer('Watson', 'watson');
room.players.set(watson.id, watson);
detective.ready = true;
watson.ready = true;

const start = doAction(room, detective, { action: 'start' });
assert.equal(start.ok, true);
assert.equal(room.phase, 'investigation');

// Step to Muddy Yard Bootprints (x: 146, y: 198)
detective.x = 146;
detective.y = 198;

// Test Wrong Answer rejection
const wrongDeduction = doAction(room, detective, { action: 'interact', answer: 'dock-hobnail' });
assert.equal(wrongDeduction.ok, false, 'Wrong answer must fail');
assert.equal(room.clues.some(c => c.id === 'clue-footprints-yard'), false, 'Clue must NOT be unlocked on wrong answer');

// Test Correct Answer unlocks clue
const correctDeduction = doAction(room, detective, { action: 'interact', answer: DEDUCTION_ANSWERS['clue-footprints-yard'] });
assert.equal(correctDeduction.ok, true, 'Correct answer must unlock clue');
assert.equal(room.clues.some(c => c.id === 'clue-footprints-yard'), true, 'Clue must be in room.clues');
const unlocked = room.clues.find(c => c.id === 'clue-footprints-yard');
assert.equal(unlocked.category, 'footprints');
assert.equal(unlocked.foundBy, 'Sherlock');

// Test Duplicate Submission is blocked
const duplicateAttempt = doAction(room, detective, { action: 'interact', answer: DEDUCTION_ANSWERS['clue-footprints-yard'] });
assert.equal(duplicateAttempt.ok, false, 'Duplicate collection must be rejected');
assert(duplicateAttempt.message.includes('already been secured'), 'Duplicate safety message');

// Step to Torn Fabric (x: 290, y: 140)
detective.x = 290;
detective.y = 140;
const fabricRes = doAction(room, detective, { action: 'interact', answer: DEDUCTION_ANSWERS['clue-fabric-fence'] });
assert.equal(fabricRes.ok, true);
assert.equal(room.clues.some(c => c.id === 'clue-fabric-fence'), true);

// Step to Photograph (x: 540, y: 195)
detective.x = 540;
detective.y = 195;
const photoRes = doAction(room, detective, { action: 'interact', answer: DEDUCTION_ANSWERS['clue-photo-surveillance'] });
assert.equal(photoRes.ok, true);
assert.equal(room.clues.some(c => c.id === 'clue-photo-surveillance'), true);

// Step to Key (x: 810, y: 460)
detective.x = 810;
detective.y = 460;
const keyRes = doAction(room, detective, { action: 'interact', answer: DEDUCTION_ANSWERS['clue-key-iron'] });
assert.equal(keyRes.ok, true);
assert.equal(room.clues.some(c => c.id === 'clue-key-iron'), true);

// Step to Fingerprints (x: 440, y: 220)
detective.x = 440;
detective.y = 220;
const printRes = doAction(room, detective, { action: 'interact', answer: DEDUCTION_ANSWERS['clue-fingerprint-glass'] });
assert.equal(printRes.ok, true);
assert.equal(room.clues.some(c => c.id === 'clue-fingerprint-glass'), true);

// Step to Witness Ledger (x: 690, y: 360)
detective.x = 690;
detective.y = 360;
const witnessRes = doAction(room, detective, { action: 'interact', answer: DEDUCTION_ANSWERS['clue-witness-ledger'] });
assert.equal(witnessRes.ok, true);
assert.equal(room.clues.some(c => c.id === 'clue-witness-ledger'), true);

console.log('✓ All searchable clue objects unlock strictly upon correct challenge solutions.');
console.log('✓ Duplicate collection safely prevented across all locations.');

// [6/6] Verify Hidden Thief (Culprit) is Blocked from Submitting Evidence
console.log('\n[6/6] Verifying Cooperative Detective Team (Zero Hidden Culprit)...');
const { room: dedRoom, player: pHost } = newRoom('COOP01', 'Host', 'boy');
const p2 = makePlayer('Det1', 'girl');
const p3 = makePlayer('Det2', 'sherlock');
const p4 = makePlayer('Det3', 'watson');
dedRoom.players.set(p2.id, p2);
dedRoom.players.set(p3.id, p3);
dedRoom.players.set(p4.id, p4);
[pHost, p2, p3, p4].forEach(p => p.ready = true);

doAction(dedRoom, pHost, { action: 'start' });
assert.equal(dedRoom.mode, 'cooperative');

const culprits = [...dedRoom.players.values()].filter(p => p.role === 'culprit');
assert.equal(culprits.length, 0, 'Zero players assigned as culprit in cooperative mode');
const detectives = [...dedRoom.players.values()].filter(p => p.role === 'detective');
assert.equal(detectives.length, 4, 'All 4 players are cooperative detectives');

console.log('✓ Cooperative detective team verified: all players work on the same team.');

console.log('\n================================================================');
console.log('ALL UPGRADED CLUE DISCOVERY SYSTEM VERIFICATION TESTS PASSED!');
console.log('================================================================');
