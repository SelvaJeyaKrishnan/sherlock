import assert from 'node:assert/strict';
import fs from 'node:fs';

console.log('--- RUNNING CINEMATIC MAIN MENU VERIFICATION AUDIT ---');

const indexHtml = fs.readFileSync('public/index.html', 'utf8');
const stylesCss = fs.readFileSync('public/styles.css', 'utf8');
const world3dJs = fs.readFileSync('public/world3d.js', 'utf8');
const appJs = fs.readFileSync('public/app.js', 'utf8');

// [Check 1 & 3] Title Presentation & Typography
console.log('\n[Check 1 & 3] Verifying Title Presentation & Typography...');
assert.ok(indexHtml.includes('<span class="title-main">SHERLOCK</span>'), 'Dominant title must be SHERLOCK without trailing colon');
assert.ok(indexHtml.includes('SHADOWS OF LONDON'), 'Subtitle must be SHADOWS OF LONDON');
assert.ok(indexHtml.includes('A MULTIPLAYER DETECTIVE MYSTERY'), 'Eyebrow must contain A MULTIPLAYER DETECTIVE MYSTERY');
assert.ok(indexHtml.includes('Trust No One. Find the Truth.'), 'Tagline must be present');

assert.ok(stylesCss.includes('font-family: var(--serif)'), 'Title must use Cinzel serif font');
assert.ok(stylesCss.includes('linear-gradient(180deg, #ffffff 0%'), 'Title must use rich metallic antique gold gradient');
assert.ok(stylesCss.includes('letter-spacing: 0.12em'), 'Title spacing verified');
assert.ok(stylesCss.includes('.title-mystery-eyebrow'), 'Subtitle styling verified');
console.log('✓ Title typography and visual hierarchy verified.');

// [Check 2] 3D Title Scene & Detective Silhouette
console.log('\n[Check 2] Verifying 3D Title Scene & Detective Silhouette in world3d.js...');
assert.ok(world3dJs.includes('createTitleWorld'), 'createTitleWorld must be exported');
assert.ok(world3dJs.includes('createForegroundDetective'), 'Foreground detective must exist');
assert.ok(world3dJs.includes('caneStick'), 'Victorian walking cane must be added to detective silhouette');
assert.ok(world3dJs.includes('detMoonRimLight'), 'Dedicated cool moonlight rim light must highlight silhouette');
assert.ok(world3dJs.includes('titleLampLights'), 'Gas lamps must have flicker tracking');
assert.ok(world3dJs.includes('mistPlanes'), 'Drifting London river mist planes must be present');
assert.ok(world3dJs.includes('chimney'), 'Victorian rooftop chimneys must be present');
console.log('✓ 3D background depth, lighting, and detective silhouette verified.');

// [Check 4, 5, 6, 7, 8] Button Hierarchy & Handlers
console.log('\n[Check 4-8] Verifying Button Hierarchy & Handlers...');
assert.ok(indexHtml.includes('id="menu-create-room"'), 'Create room button ID preserved');
assert.ok(indexHtml.includes('CREATE MULTIPLAYER ROOM'), 'Create room label must be CREATE MULTIPLAYER ROOM');
assert.ok(indexHtml.includes('id="menu-join-room"'), 'Join room button ID preserved');
assert.ok(indexHtml.includes('JOIN EXISTING ROOM'), 'Join room label must be JOIN EXISTING ROOM');
assert.ok(!indexHtml.includes('id="play-game"'), 'Solo play button removed in pure multiplayer mode');
assert.ok(!indexHtml.includes('Practice Solo with Watson'), 'Solo label removed');
assert.ok(indexHtml.includes('id="menu-join-box"'), 'Join code input box preserved');
assert.ok(indexHtml.includes('id="menu-room-code-input"'), 'Room code input ID preserved');
assert.ok(indexHtml.includes('id="menu-join-submit"'), 'Join submit button ID preserved');
assert.ok(indexHtml.includes('id="open-settings"'), 'Settings button ID preserved');
assert.ok(indexHtml.includes('id="open-how-to-play"'), 'How to play button ID preserved');

// Verify button order inside menu card
const createIdx = indexHtml.indexOf('id="menu-create-room"');
const joinIdx = indexHtml.indexOf('id="menu-join-room"');
const subRowIdx = indexHtml.indexOf('class="menu-sub-row"');
assert.ok(createIdx < joinIdx, 'CREATE MULTIPLAYER ROOM must precede JOIN EXISTING ROOM');
assert.ok(joinIdx < subRowIdx, 'JOIN EXISTING ROOM must precede Settings and How to play');
console.log('✓ Button order matches AAA multiplayer cooperative design (Create -> Join -> Settings).');

// Verify Handlers
assert.ok(appJs.includes('window.createMultiplayerRoom ='), 'window.createMultiplayerRoom handler intact');
assert.ok(appJs.includes('window.toggleMenuJoin ='), 'window.toggleMenuJoin handler intact');
assert.ok(appJs.includes('submitMenuJoin'), 'submitMenuJoin handler intact');
console.log('✓ All multiplayer button handlers wired cleanly without solo mode.');

// [Check 9] Mobile & Responsive Layout
console.log('\n[Check 9] Verifying Mobile & Responsive Layout Rules...');
assert.ok(stylesCss.includes('@media (max-width: 768px)'), 'Mobile portrait media query verified');
assert.ok(stylesCss.includes('@media (max-height: 520px) and (orientation: landscape)'), 'Landscape short viewport verified');
assert.ok(stylesCss.includes('min-height: 48px') || stylesCss.includes('min-height: 50px'), 'Touch friendly button sizing verified');
assert.ok(stylesCss.includes('env(safe-area-inset-top)'), 'Safe area insets verified');
console.log('✓ Responsive design rules verified.');

// [Check 10] ID Uniqueness & Safety
console.log('\n[Check 10] Verifying HTML ID Uniqueness...');
const ids = [...indexHtml.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
const idCounts = {};
for (const id of ids) {
  idCounts[id] = (idCounts[id] || 0) + 1;
  assert.equal(idCounts[id], 1, `HTML ID must be unique: #${id}`);
}
console.log(`✓ All ${ids.length} HTML IDs in index.html are strictly unique.`);

console.log('\n======================================================');
console.log('ALL CINEMATIC MAIN MENU AUDIT CHECKS PASSED (10/10)!');
console.log('======================================================');
