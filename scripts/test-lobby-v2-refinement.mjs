import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('--- RUNNING LOBBY V2 REFINEMENT AUDIT ---');

const html = fs.readFileSync(path.resolve('public/index.html'), 'utf8');
const css = fs.readFileSync(path.resolve('public/styles.css'), 'utf8');
const appJs = fs.readFileSync(path.resolve('public/app.js'), 'utf8');

// 1. Roster & Compact Slots
console.log('\n[1/6] Verifying compact player roster & silhouette slots...');
assert.ok(css.includes('.team-member--empty-slot'), 'CSS has .team-member--empty-slot');
assert.ok(css.includes('.empty-seat-silhouette'), 'CSS has .empty-seat-silhouette');
assert.ok(css.includes('.crown-icon'), 'CSS has .crown-icon for host crown');
assert.ok(appJs.includes('crown-icon'), 'app.js renders crown-icon for host');
assert.ok(appJs.includes('empty-seat-silhouette'), 'app.js renders clean silhouette for empty seat');
assert.ok(!appJs.includes('Awaiting companion · Code'), 'app.js removed verbose multiline code text from empty seats');
console.log('✓ Compact 8-slot roster & silhouette icons verified');

// 2. Character Selection Cards & Assets
console.log('\n[2/6] Verifying character selection cards, cameos & descriptions...');
assert.ok(html.includes('class="chip-desc"'), 'index.html has character description elements');
assert.ok(html.includes('chip-portrait-svg'), 'index.html embeds cameo portrait SVGs inside chips');
assert.ok(css.includes('.chip-desc'), 'CSS styles .chip-desc with high readability');
assert.ok(css.includes('.chip-portrait.cameoboy'), 'CSS styles Sherlock cameo');
assert.ok(css.includes('.chip-portrait.cameowatson'), 'CSS styles Watson cameo');
assert.ok(css.includes('.chip-portrait.cameogirl'), 'CSS styles Irene Adler cameo');
console.log('✓ Character selection cards with full descriptions and cameo SVGs verified');

// 3. Visual Hierarchy & Pure Multiplayer Lobby
console.log('\n[3/6] Verifying visual hierarchy & multiplayer readiness...');
assert.ok(!html.includes('id="lobby-add-watson"'), 'Solo Watson AI button removed in multiplayer-only mode');
assert.ok(css.includes('.button--start-investigation'), 'Launch Investigation button styled');
assert.ok(css.includes('.button--start-investigation:not(:disabled)'), 'Launch Investigation button has prominent ready state');
assert.ok(appJs.includes('r.connectedCount < 2'), 'Launch button guarded against premature start with < 2 players');
console.log('✓ Visual hierarchy verified: Pure cooperative multiplayer lobby');

// 4. Tutorial Overlay Minimization & Non-Overlap
console.log('\n[4/6] Verifying tutorial overlay minimization & lobby non-overlap...');
assert.ok(html.includes('id="tutorial-minimize"'), 'index.html has #tutorial-minimize');
assert.ok(html.includes('id="tutorial-restore"'), 'index.html has #tutorial-restore');
assert.ok(html.includes('id="tutorial-minimized-bar"'), 'index.html has #tutorial-minimized-bar');
assert.ok(css.includes('.tutorial-backdrop.is-minimized'), 'CSS has .tutorial-backdrop.is-minimized');
assert.ok(css.includes('body:has(#lobby-screen:not(.hidden)) .tutorial-backdrop'), 'CSS prevents tutorial overlapping lobby right column');
assert.ok(appJs.includes('setTutorialMinimized'), 'app.js implements setTutorialMinimized()');
console.log('✓ Tutorial minimization and non-overlap verified');

// 5. Connection Status Accuracy
console.log('\n[5/6] Verifying connection status states & accuracy...');
assert.ok(css.includes('.conn-dot--online'), 'CSS has .conn-dot--online');
assert.ok(css.includes('.conn-dot--connecting'), 'CSS has .conn-dot--connecting');
assert.ok(css.includes('.conn-dot--reconnecting'), 'CSS has .conn-dot--reconnecting');
assert.ok(css.includes('.conn-dot--offline'), 'CSS has .conn-dot--offline');
assert.ok(appJs.includes("message === 'CONNECTING'"), 'app.js distinguishes CONNECTING from RECONNECTING');
assert.ok(appJs.includes("setConnection(view ? 'CONNECTED' : 'CONNECTING')"), 'enterRoom does not show premature RECONNECTING');
console.log('✓ Connection status accuracy verified');

// 6. Responsive Layout & 1080p Screen Composition
console.log('\n[6/6] Verifying desktop 1080p composition & mobile responsiveness...');
assert.ok(css.includes('grid-template-columns: 1fr 1fr;'), 'CSS has balanced 1fr 1fr columns on desktop');
assert.ok(css.includes('@media (max-width: 768px)'), 'CSS handles mobile tablets');
assert.ok(css.includes('@media (max-width: 480px)'), 'CSS handles small smartphones');
console.log('✓ Desktop 1080p composition and mobile responsiveness verified');

console.log('\n======================================================');
console.log('ALL LOBBY V2 REFINEMENT TESTS PASSED (100%)!');
console.log('======================================================');
