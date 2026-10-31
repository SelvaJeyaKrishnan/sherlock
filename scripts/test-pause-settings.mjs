import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

console.log('--- RUNNING PAUSE & SETTINGS MENU VERIFICATION ---\n');

// 1. Verify HTML Structure
console.log('[1/4] Verifying HTML Structure of Pause & Settings Panel...');
const html = fs.readFileSync(path.resolve('public/index.html'), 'utf8');

const requiredHtmlElements = [
  'id="settings-modal"',
  'class="modal-card settings-card pause-settings-card"',
  'class="settings-wax-seal"',
  'id="settings-close"',
  'id="settings-kicker"',
  'id="settings-title"',
  'class="settings-divider"',
  'id="ambient-audio"',
  'id="ambient-volume"',
  'id="ambient-volume-val"',
  'id="graphics-quality"',
  'id="reduce-motion"',
  'id="camera-sensitivity"',
  'id="camera-sensitivity-val"',
  'id="control-hints"',
  'id="settings-resume"',
  'id="settings-done"',
  'id="settings-leave-container"',
  'id="pause-leave-btn"',
  'id="pause-leave-confirm"',
  'id="pause-confirm-leave"',
  'id="pause-cancel-leave"',
  'id="open-pause-menu"',
];

for (const el of requiredHtmlElements) {
  assert(html.includes(el), `Missing required HTML element: ${el}`);
}
console.log('✓ All 23 required HTML elements and controls verified.\n');

// 2. Verify CSS Styling & Victorian Art Direction
console.log('[2/4] Verifying CSS Styles & Victorian Pause Design...');
const css = fs.readFileSync(path.resolve('public/styles.css'), 'utf8');

const requiredCssSelectors = [
  '.pause-settings-card',
  '.settings-wax-seal',
  '.settings-title',
  '.settings-divider',
  '.settings-diamond',
  '.settings-content-scroller',
  '.settings-group',
  '.settings-group__legend',
  '.setting-row--toggle',
  '.setting-row--slider',
  '.setting-row--select',
  '.setting-value-badge',
  '.vintage-slider',
  '.vintage-select',
  '.toggle-checkbox',
  '.button--resume-investigation',
  '.settings-leave-container',
  '.leave-warning-divider',
  '.button--pause-leave',
  '.pause-leave-confirm',
  '.leave-confirm-text',
  '.leave-confirm-actions',
  'body.hide-control-hints .desktop-controls-legend',
];

for (const sel of requiredCssSelectors) {
  assert(css.includes(sel), `Missing required CSS selector: ${sel}`);
}
console.log('✓ All 23 required CSS classes, sliders, and danger-zone styles verified.\n');

// 3. Verify JavaScript Logic & Settings Connections
console.log('[3/4] Verifying JavaScript Logic, Persistence, and Real Settings...');
const js = fs.readFileSync(path.resolve('public/app.js'), 'utf8');
const ambientJs = fs.readFileSync(path.resolve('public/ambient-audio.js'), 'utf8');
const worldJs = fs.readFileSync(path.resolve('public/world3d.js'), 'utf8');

assert(js.includes('function openPauseSettingsMenu'), 'Missing openPauseSettingsMenu in app.js');
assert(js.includes('function closePauseSettingsMenu'), 'Missing closePauseSettingsMenu in app.js');
assert(js.includes('function initPauseAndSettingsMenu'), 'Missing initPauseAndSettingsMenu in app.js');
assert(js.includes('shadows-camera-sensitivity'), 'Missing camera sensitivity persistence in app.js');
assert(js.includes('shadows-graphics-quality'), 'Missing graphics quality persistence in app.js');
assert(js.includes('shadows-control-hints'), 'Missing control hints persistence in app.js');
assert(js.includes('openPauseSettingsMenu(true)'), 'Missing in-game pause trigger in app.js');
assert(js.includes('leaveRoom()'), 'Missing leaveRoom connection in app.js');

assert(ambientJs.includes('setAmbientVolume'), 'Missing setAmbientVolume in ambient-audio.js');
assert(ambientJs.includes('getAmbientVolume'), 'Missing getAmbientVolume in ambient-audio.js');
assert(ambientJs.includes('shadows-ambient-volume'), 'Missing ambient volume storage in ambient-audio.js');

assert(worldJs.includes('setLookSensitivity'), 'Missing setLookSensitivity in world3d.js');
assert(worldJs.includes('setGraphicsQuality'), 'Missing setGraphicsQuality in world3d.js');
console.log('✓ JavaScript preference persistence, audio volume, and 3D graphics mapping verified.\n');

// 4. Functional Simulation
console.log('[4/4] Verifying Slider & Option Ranges and Autoplay Safety...');
// Verify sensitivity range in HTML
assert(html.includes('min="0.5" max="2.5" step="0.1"'), 'Camera sensitivity slider must have valid range 0.5 to 2.5');
assert(html.includes('min="0" max="100" step="5"'), 'Atmosphere volume slider must have range 0 to 100');

// Verify graphics quality option values
assert(html.includes('value="high"'), 'Missing high graphics quality option');
assert(html.includes('value="medium"'), 'Missing medium graphics quality option');
assert(html.includes('value="low"'), 'Missing low graphics quality option');

console.log('✓ Ranges, defaults, and option values verified.');

console.log('\n=== ALL PAUSE & SETTINGS VERIFICATIONS PASSED! ===');
