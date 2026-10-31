import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

// 1. Verify HTML elements for the redesigned HUD exist
const html = fs.readFileSync(path.resolve('public/index.html'), 'utf8');

const requiredElements = [
  'id="world-3d"',
  'id="map"',
  'id="hud-location-badge"',
  'id="hud-location-name"',
  'id="hud-objectives"',
  'id="hud-objectives-list"',
  'id="connection-state"',
  'id="player-count"',
  'id="open-casebook"',
  'id="close-casebook"',
  'id="hud-interaction-card"',
  'id="interaction-keycap"',
  'id="interaction-hint"',
  'id="virtual-joystick"',
  'id="joystick-thumb"',
  'id="interact"',
  'id="role-action"',
  'id="side-panel"',
  'id="vote-card"',
  'id="result-card"',
];

for (const el of requiredElements) {
  assert(html.includes(el), `Missing required DOM element in index.html: ${el}`);
}
console.log('PASS: All HUD and game elements are present in public/index.html');

// 2. Verify styles for HUD and Casebook Drawer exist in styles.css
const css = fs.readFileSync(path.resolve('public/styles.css'), 'utf8');
const requiredClasses = [
  '.hud-upper-left',
  '.hud-location-badge',
  '.hud-objectives',
  '.hud-upper-right',
  '.hud-status-chip',
  '.button--hud-action',
  '.hud-interaction-card',
  '.hud-lower-left',
  '.desktop-controls-legend',
  '.hud-lower-right',
  '.button--hud-interact',
  '.side-panel',
  '.side-panel.is-open',
  '.casebook-drawer-close',
];

for (const cls of requiredClasses) {
  assert(css.includes(cls), `Missing required CSS class in styles.css: ${cls}`);
}
console.log('PASS: All HUD classes and drawer styles are present in public/styles.css');

// 3. Verify JavaScript logic in app.js
const appJs = fs.readFileSync(path.resolve('public/app.js'), 'utf8');
assert(appJs.includes('getLocationName'), 'getLocationName missing in app.js');
assert(appJs.includes('setCasebookOpen'), 'setCasebookOpen missing in app.js');
assert(appJs.includes('drawCompass'), 'drawCompass missing in app.js');
assert(appJs.includes("key === 'tab' || key === 'j'"), 'Tab / J keyboard navigation missing in app.js');
assert(appJs.includes("key === 'escape'"), 'Escape key handler missing in app.js');
assert(appJs.includes("key === 'e'"), 'E key interact handler missing in app.js');
assert(appJs.includes('virtual-joystick'), 'virtual-joystick touch handler missing in app.js');
console.log('PASS: app.js contains all required HUD and input handler logic');

console.log('ALL HUD & INPUT CHECKS PASSED SUCCESSFULLY!');
