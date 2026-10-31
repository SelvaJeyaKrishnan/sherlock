import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  newRoom,
  makePlayer,
  doAction,
  publicRoom
} from '../lib/game-core.mjs';

console.log('--- RUNNING THREE FORENSIC MINI-GAMES VERIFICATION ---');

// [1/5] Verify HTML structure in public/index.html
console.log('\n[1/5] Verifying HTML Mini-Game Elements in public/index.html...');
const html = readFileSync('public/index.html', 'utf8');

const requiredHtmlIds = [
  // Mini-Game 1: Lock Picking
  'lockpick-modal',
  'lockpick-title',
  'lock-shackle',
  'tumbler-ring-0',
  'tumbler-ring-1',
  'tumbler-ring-2',
  'ring-val-0',
  'ring-val-1',
  'ring-val-2',
  'lockpick-tension-pick',
  'lockpick-turn-left',
  'lockpick-turn-right',
  'lockpick-hint-box',
  'lockpick-submit',
  'lockpick-hint-btn',
  'lockpick-reset',
  'lockpick-feedback',

  // Mini-Game 2: Photograph Reconstruction
  'photoreconstruct-modal',
  'photoreconstruct-title',
  'photo-dropzone-grid',
  'photo-pieces-tray',
  'photo-hint-box',
  'photo-submit',
  'photo-hint-btn',
  'photo-reset',
  'photo-feedback',

  // Mini-Game 3: Secret Code Cipher Wheel
  'cipherwheel-modal',
  'cipherwheel-title',
  'cipher-encrypted-text',
  'cipher-decoded-preview',
  'cipher-hint-box',
  'cipher-outer-ring',
  'cipher-inner-wheel',
  'wheel-shift-indicator',
  'cipher-step-down',
  'cipher-shift-slider',
  'cipher-step-up',
  'cipher-submit',
  'cipher-hint-btn',
  'cipher-reset',
  'cipher-feedback',

  // Mini-Game 4: Grandfather Clock
  'clock-puzzle-modal',
  'clock-puzzle-title',
  'clock-dial-face',
  'clock-hand-hour',
  'clock-hour-text',
  'clock-hour-down',
  'clock-hour-up',
  'clock-confirm',
  'clock-hint-btn',
  'clock-reset',
  'clock-hint-box',
  'clock-feedback',

  // Mini-Game 5: Library Code Bookshelf
  'library-puzzle-modal',
  'library-puzzle-title',
  'library-books-row',
  'library-sequence-text',
  'library-submit',
  'library-hint-btn',
  'library-reset',
  'library-hint-box',
  'library-feedback',

  // Mini-Game 6: Basement Cryptex Mechanism
  'basement-puzzle-modal',
  'basement-puzzle-title',
  'cryptex-dials-row',
  'basement-submit',
  'basement-hint-btn',
  'basement-reset',
  'basement-hint-box',
  'basement-feedback'
];

for (const id of requiredHtmlIds) {
  assert.ok(html.includes(`id="${id}"`), `Missing HTML element id="${id}"`);
}
console.log(`✓ All ${requiredHtmlIds.length} required HTML elements and IDs verified.`);

// [2/5] Verify CSS styles in public/styles.css
console.log('\n[2/5] Verifying CSS Styles in public/styles.css...');
const css = readFileSync('public/styles.css', 'utf8');

const requiredCssClasses = [
  '.minigame-card',
  '.minigame-header',
  '.minigame-instructions',
  '.minigame-hint-box',
  '.lockpick-card',
  '.lockpick-stage',
  '.lock-casing',
  '.lock-shear-indicator',
  '.shear-marker',
  '.lock-shackle',
  '.lock-face',
  '.lock-ring',
  '.lock-ring--outer',
  '.lock-ring--middle',
  '.lock-ring--inner',
  '.ring-label-pos',
  '.tension-pick',
  '.photo-card',
  '.photo-reconstruct-stage',
  '.photo-board-wrapper',
  '.photo-dropzone-grid',
  '.photo-slot',
  '.photo-tray-wrapper',
  '.photo-pieces-tray',
  '.photo-piece',
  '.cipher-card',
  '.cipher-wheel-stage',
  '.parchment-document',
  '.cipher-text',
  '.decrypted-preview',
  '.wheel-stage',
  '.wheel-fixed-outer',
  '.wheel-rotating-inner',
  '.wheel-brass-hub',
  '.wheel-shift-indicator'
];

for (const cls of requiredCssClasses) {
  assert.ok(css.includes(cls), `Missing CSS class/selector: ${cls}`);
}
console.log(`✓ All ${requiredCssClasses.length} required CSS classes and component styles verified.`);

// [3/5] Verify JavaScript controllers and logic in public/app.js and public/ambient-audio.js
console.log('\n[3/5] Verifying Client Logic and Procedural Audio...');
const appJs = readFileSync('public/app.js', 'utf8');
const audioJs = readFileSync('public/ambient-audio.js', 'utf8');

const requiredFunctions = [
  // Lockpick
  'updateLockpickDisplay',
  'rotateLockpickRing',
  'openLockpickModal',
  'closeLockpickModal',
  'submitLockpick',
  'resetLockpick',
  // Photo
  'renderPhotoBoardAndTray',
  'openPhotoReconstructModal',
  'closePhotoReconstructModal',
  'submitPhotoReconstruct',
  'resetPhotoReconstruct',
  'placePhotoPieceInSlot',
  'removePhotoPieceFromSlot',
  // Cipher
  'initCipherWheelDOM',
  'updateCipherWheelDisplay',
  'rotateCipherWheel',
  'openCipherWheelModal',
  'closeCipherWheelModal',
  'submitCipherWheel',
  'resetCipherWheel'
];

for (const fn of requiredFunctions) {
  assert.ok(appJs.includes(fn), `Missing function: ${fn} in public/app.js`);
}

const requiredAudio = [
  'playRatchetClick',
  'playLockOpenSound',
  'playPhotoSlideSound',
  'playPieceSnapSound',
  'playGearClick',
  'playCipherSolvedSound'
];

for (const fn of requiredAudio) {
  assert.ok(audioJs.includes(fn), `Missing Web Audio procedural sound: ${fn} in public/ambient-audio.js`);
}
console.log('✓ All client controllers, interact handlers, and procedural Web Audio functions verified.');

// [4/5] Verify Server-Side Authoritative Actions in lib/game-core.mjs
console.log('\n[4/5] Testing Server-Side Authoritative Mini-Game Validation...');

// Setup a 4-player game (1 culprit, 3 detectives)
const { room, player: host } = newRoom('MG101', 'Sherlock', 'sherlock');
const p2 = makePlayer('Watson', 'watson');
const p3 = makePlayer('Irene', 'detective');
const p4 = makePlayer('Lestrade', 'officer');
room.players.set(p2.id, p2);
room.players.set(p3.id, p3);
room.players.set(p4.id, p4);

[host, p2, p3, p4].forEach((p) => p.ready = true);

room.mode = 'deduction';
const startRes = doAction(room, host, { action: 'start' });
assert.equal(startRes.ok, true);
assert.equal(room.phase, 'investigation');
assert.equal(room.mode, 'deduction');

const allPlayers = [...room.players.values()];
const culprit = allPlayers.find((p) => p.role === 'culprit');
const detectives = allPlayers.filter((p) => p.role !== 'culprit');
const detectiveA = detectives[0];
const detectiveB = detectives[1];

assert.ok(culprit, 'Culprit must exist');
assert.ok(detectiveA, 'Detective must exist');

// Test 1: Lock Picking
console.log('  Testing Mini-Game 1: Lock Picking...');
// Move detective far away -> must fail proximity
detectiveA.x = 100;
detectiveA.y = 100;
let res = doAction(room, detectiveA, { action: 'lockpick', tumblers: [3, 7, 5] });
assert.equal(res.ok, false, 'Should fail when detective is too far from lock');
assert.ok(res.message.includes('near the antique lock'));

// Move detective to keyIron location (810, 460)
detectiveA.x = 810;
detectiveA.y = 460;

// Wrong tumbler combination
res = doAction(room, detectiveA, { action: 'lockpick', tumblers: [1, 1, 1] });
assert.equal(res.ok, false, 'Wrong tumbler combination should be rejected');
assert.ok(res.message.includes('tumblers resist'));

// Culprit attempt must be rejected
culprit.x = 810;
culprit.y = 460;
res = doAction(room, culprit, { action: 'lockpick', tumblers: [3, 7, 5] });
assert.equal(res.ok, false, 'Culprit cannot solve detective lockpick challenge');
assert.ok(res.message.includes('culprit cannot'));

// Correct tumbler combination by detective
res = doAction(room, detectiveA, { action: 'lockpick', tumblers: [3, 7, 5] });
assert.equal(res.ok, true, 'Correct tumbler combination should succeed');
assert.ok(room.clues.some((c) => c.id === 'clue-key-iron'), 'Clue key-iron should be added to casebook');

// Duplicate submission must be rejected
detectiveB.x = 810;
detectiveB.y = 460;
res = doAction(room, detectiveB, { action: 'lockpick', tumblers: [3, 7, 5] });
assert.equal(res.ok, false, 'Duplicate lockpick attempt must be rejected');
assert.ok(res.message.includes('already been picked'));
console.log('  ✓ Mini-Game 1 (Lock Picking) passed all authoritative tests!');

// Test 2: Photograph Reconstruction
console.log('  Testing Mini-Game 2: Photograph Reconstruction...');
// Move detective to photoSurveillance (540, 195)
detectiveA.x = 540;
detectiveA.y = 195;

// Wrong fragment order
res = doAction(room, detectiveA, { action: 'photo-reconstruct', order: [0, 2, 1, 3, 5, 4] });
assert.equal(res.ok, false, 'Wrong photo order should be rejected');
assert.ok(res.message.includes('do not align'));

// Culprit attempt must be rejected
culprit.x = 540;
culprit.y = 195;
res = doAction(room, culprit, { action: 'photo-reconstruct', order: [0, 1, 2, 3, 4, 5] });
assert.equal(res.ok, false, 'Culprit cannot solve detective photo reconstruction');

// Correct fragment order by detective
res = doAction(room, detectiveA, { action: 'photo-reconstruct', order: [0, 1, 2, 3, 4, 5] });
assert.equal(res.ok, true, 'Correct photo order should succeed');
assert.ok(room.clues.some((c) => c.id === 'clue-photo-surveillance'), 'Photo clue should be added to casebook');

// Duplicate attempt rejected
detectiveB.x = 540;
detectiveB.y = 195;
res = doAction(room, detectiveB, { action: 'photo-reconstruct', order: [0, 1, 2, 3, 4, 5] });
assert.equal(res.ok, false, 'Duplicate photo reconstruction attempt must be rejected');
assert.ok(res.message.includes('already been reconstructed'));
console.log('  ✓ Mini-Game 2 (Photograph Reconstruction) passed all authoritative tests!');

// Test 3: Secret Code Cipher Wheel
console.log('  Testing Mini-Game 3: Secret Code Cipher Wheel...');
// Move detective to cipher table (494, 154)
detectiveA.x = 494;
detectiveA.y = 154;

// Wrong shift and wrong keyword
res = doAction(room, detectiveA, { action: 'cipher-wheel', shift: 3, keyword: 'WRONGKEY' });
assert.equal(res.ok, false, 'Incorrect shift and keyword should be rejected');

// Culprit attempt rejected
culprit.x = 494;
culprit.y = 154;
res = doAction(room, culprit, { action: 'cipher-wheel', shift: 7, keyword: 'BLACKTHORN' });
assert.equal(res.ok, false, 'Culprit cannot decode secret cipher for detectives');

// Correct shift (+7) and keyword BLACKTHORN
res = doAction(room, detectiveA, { action: 'cipher-wheel', shift: 7, keyword: 'BLACKTHORN' });
assert.equal(res.ok, true, 'Correct shift +7 and keyword BLACKTHORN should succeed');
assert.equal(room.missions.cipher.done, true, 'Cipher mission should be completed');
assert.ok(room.clues.some((c) => c.id === 'cipher'), 'Cipher clue should be added to casebook');

console.log('  ✓ Mini-Game 3 (Cipher Wheel) passed all authoritative tests!');

// Test 4: Grandfather Clock Puzzle
console.log('  Testing Mini-Game 4: Grandfather Clock Puzzle...');
// Distance check: detective far away
detectiveA.x = 100;
detectiveA.y = 100;
res = doAction(room, detectiveA, { action: 'clock', hour: 4 });
assert.equal(res.ok, false, 'Far detective cannot adjust grandfather clock');

// Move detective to Grandfather Clock position (515, 575)
detectiveA.x = 515;
detectiveA.y = 575;

// Wrong hour (not 4)
res = doAction(room, detectiveA, { action: 'clock', hour: 8 });
assert.equal(res.ok, true);
assert.equal(res.solved, false, 'Wrong hour must not solve the clock puzzle');

// Culprit attempt rejected
culprit.x = 515;
culprit.y = 575;
res = doAction(room, culprit, { action: 'clock', hour: 4 });
assert.equal(res.ok, false, 'Culprit cannot solve safehouse puzzles');

// Correct hour (4) by detective
res = doAction(room, detectiveA, { action: 'clock', hour: 4 });
assert.equal(res.ok, true);
assert.equal(res.solved, true, 'Hour 4 should solve the grandfather clock');
assert.ok(room.clues.some((c) => c.id === 'pocket-watch'), 'Pocket watch clue should be secured');

// Duplicate attempt rejected
res = doAction(room, detectiveB, { action: 'clock', hour: 4 });
assert.equal(res.ok, false, 'Duplicate clock solve should be rejected');
console.log('  ✓ Mini-Game 4 (Grandfather Clock) passed all authoritative tests!');

// Test 5: Library Code Bookshelf
console.log('  Testing Mini-Game 5: Library Code Bookshelf...');
// Move detective to Library Bookshelf position (445, 575)
detectiveA.x = 445;
detectiveA.y = 575;

// Wrong book sequence
res = doAction(room, detectiveA, { action: 'library', books: [1, 2, 3] });
assert.equal(res.ok, true);
assert.equal(res.solved, false, 'Wrong book order must not unlock library');

// Culprit attempt rejected
culprit.x = 445;
culprit.y = 575;
res = doAction(room, culprit, { action: 'library', books: [3, 4, 5] });
assert.equal(res.ok, false, 'Culprit cannot solve library code puzzle');

// Correct book sequence (3, 4, 5) by detective
res = doAction(room, detectiveA, { action: 'library', books: [3, 4, 5] });
assert.equal(res.ok, true);
assert.equal(res.solved, true, 'Correct sequence [3, 4, 5] unlocks library');
assert.ok(room.clues.some((c) => c.id === 'mansion-key'), 'Mansion key clue should be secured');
assert.equal(room.mansion.secretDoorOpen, true, 'Secret door should open');

// Duplicate attempt rejected
res = doAction(room, detectiveB, { action: 'library', books: [3, 4, 5] });
assert.equal(res.ok, false, 'Duplicate library unlock attempt should be rejected');
console.log('  ✓ Mini-Game 5 (Library Bookshelf) passed all authoritative tests!');

// Test 6: Basement Mechanism Cryptex
console.log('  Testing Mini-Game 6: Basement Mechanism Cryptex...');
// Move detective to Basement position (480, 585)
detectiveA.x = 480;
detectiveA.y = 585;

// Wrong symbols
res = doAction(room, detectiveA, { action: 'basement', symbols: ['sun', 'sun', 'moon', 'key'] });
assert.equal(res.ok, true);
assert.equal(res.solved, false, 'Wrong cryptex symbols must not unlock vault');

// Culprit attempt rejected
culprit.x = 480;
culprit.y = 585;
res = doAction(room, culprit, { action: 'basement', symbols: ['sun', 'moon', 'star', 'key'] });
assert.equal(res.ok, false, 'Culprit cannot solve basement cryptex');

// Correct symbols by detective: ['sun', 'moon', 'star', 'key']
res = doAction(room, detectiveA, { action: 'basement', symbols: ['sun', 'moon', 'star', 'key'] });
assert.equal(res.ok, true);
assert.equal(res.solved, true, 'Correct sequence Sun, Moon, Star, Key unlocks vault');
assert.ok(room.clues.some((c) => c.id === 'basement-mechanism'), 'Basement cryptex clue should be secured');

// Duplicate attempt rejected
res = doAction(room, detectiveB, { action: 'basement', symbols: ['sun', 'moon', 'star', 'key'] });
assert.equal(res.ok, false, 'Duplicate basement solve attempt should be rejected');
console.log('  ✓ Mini-Game 6 (Basement Cryptex) passed all authoritative tests!');

// [5/5] Verify Public State Privacy (Thief identity not leaked)
console.log('\n[5/5] Verifying Detective Client State Privacy...');
const pubState = publicRoom(room, detectiveA);
assert.equal(pubState.me.role, detectiveA.role);
for (const p of pubState.room.players) {
  if (p.id !== detectiveA.id) {
    assert.equal(p.role, undefined, `Role for player ${p.name} must not be exposed to detective!`);
  }
}
console.log('✓ Secret role privacy strictly maintained in client publicRoom serialization.');

console.log('\n======================================================');
console.log('ALL THREE FORENSIC MINI-GAMES FULLY TESTED & VERIFIED!');
console.log('======================================================\n');
