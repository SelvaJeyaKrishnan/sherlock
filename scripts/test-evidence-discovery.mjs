import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { doAction, newRoom, makePlayer } from '../lib/game-core.mjs';

console.log('Testing Victorian Evidence Discovery Experience...\n');

// 1. Verify HTML Structure
const html = fs.readFileSync(path.resolve('public/index.html'), 'utf8');
const requiredHtmlElements = [
  'id="evidence-puzzle"',
  'id="evidence-stage"',
  'id="evidence-magnifier"',
  'id="evidence-illustration"',
  'id="puzzle-stamp"',
  'id="puzzle-evidence"',
  'id="puzzle-observations"',
  'id="puzzle-question"',
  'id="puzzle-options"',
  'id="puzzle-submit"',
  'id="puzzle-feedback"',
  'class="puzzle-instructions"',
];

for (const id of requiredHtmlElements) {
  assert(html.includes(id), `Missing element in index.html: ${id}`);
}
console.log('✓ All evidence discovery HTML elements exist in public/index.html');

// 2. Verify CSS Styles & Animations
const css = fs.readFileSync(path.resolve('public/styles.css'), 'utf8');
const requiredCss = [
  'evidenceDiscoverIn',
  'stampSlam',
  '.evidence-stage',
  '.evidence-magnifier',
  '.magnifier-rim',
  '.magnifier-glass',
  '.puzzle-success-stamp',
  '.button--collect-evidence',
  '.puzzle-observations',
  '.puzzle-option.is-selected',
];

for (const rule of requiredCss) {
  assert(css.includes(rule), `Missing CSS rule in styles.css: ${rule}`);
}
console.log('✓ All evidence discovery CSS styles & animations exist in public/styles.css');

// 3. Verify Frontend Logic in app.js
const appJs = fs.readFileSync(path.resolve('public/app.js'), 'utf8');
assert(appJs.includes('renderEvidenceIllustration'), 'renderEvidenceIllustration missing in app.js');
assert(appJs.includes('isClueAlreadyCollected'), 'isClueAlreadyCollected missing in app.js');
assert(appJs.includes('handleEvidenceCollection'), 'handleEvidenceCollection missing in app.js');
assert(appJs.includes('setupEvidenceMagnifier'), 'setupEvidenceMagnifier missing in app.js');
assert(appJs.includes("stamp.classList.add('is-stamped')"), 'Success stamp trigger missing in app.js');
assert(appJs.includes("key === 'enter' || key === 'e'"), 'Enter / E key handler missing in app.js');
console.log('✓ All evidence discovery logic and safety checks verified in public/app.js');

// 4. Test Game Core Clue Collection with Duplicate Handling
const { room, player: p1 } = newRoom('TEST01', 'Holmes', 'boy');
const p2 = makePlayer('Watson', 'girl');
room.players.set(p2.id, p2);
p1.ready = true;
p2.ready = true;

// Start game into investigation phase
const startRes = doAction(room, p1, { action: 'start' });
assert.equal(startRes.ok, true, 'Start game must succeed');
assert.equal(room.phase, 'investigation');

// Position p1 near Scotland Yard ink station (x: 112, y: 108)
p1.x = 112;
p1.y = 108;

// Test incorrect conclusion: MUST FAIL without recording clue
const wrongRes = doAction(room, p1, { action: 'interact', answer: 'lampblack' });
assert.equal(wrongRes.ok, false, 'Incorrect conclusion must be rejected');
assert.equal(room.clues.length, 0, 'No clue should be recorded on wrong deduction');

// Test correct conclusion: MUST SUCCEED and record part
const correctRes = doAction(room, p1, { action: 'interact', answer: 'iron-gall' });
assert.equal(correctRes.ok, true, 'Correct conclusion must be accepted');
assert.equal(room.missions.letter.parts.ink, p1.id, 'Mission part ink must be recorded for p1');

// Test duplicate collection by same player: MUST BE REJECTED SAFELY
const duplicateRes = doAction(room, p1, { action: 'interact', answer: 'iron-gall' });
assert.equal(duplicateRes.ok, false, 'Duplicate collection attempt must be safely rejected');
assert(duplicateRes.message.includes('already being handled') || duplicateRes.message.includes('different detective'), 'Appropriate safety message');

// Test second detective completing letter-seal (x: 252, y: 182)
p2.x = 252;
p2.y = 182;
const sealRes = doAction(room, p2, { action: 'interact', answer: 'after-departure' });
assert.equal(sealRes.ok, true, 'Second detective must complete seal fragment');
assert.equal(room.missions.letter.done, true, 'Letter mission must be complete');
assert.equal(room.clues.length, 1, 'Clue "A letter out of time" must be added to casebook');
assert.equal(room.clues[0].title, 'A letter out of time');

console.log('✓ Clue collection state updates, verification, and duplicate prevention verified!');

console.log('\n==========================================');
console.log('ALL EVIDENCE DISCOVERY VERIFICATION TESTS PASSED!');
console.log('==========================================');
