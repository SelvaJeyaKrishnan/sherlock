import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function runTests() {
  console.log('--- RUNNING VICTORIAN INVESTIGATION DESK (CASEBOOK) VERIFICATION ---');

  const html = await readFile(resolve('public/index.html'), 'utf8');
  const css = await readFile(resolve('public/styles.css'), 'utf8');
  const js = await readFile(resolve('public/app.js'), 'utf8');

  // Test 1: HTML Structure
  console.log('\n[1/5] Verifying HTML Structure...');
  const htmlRequirements = [
    'id="casebook-desk"',
    'class="casebook-desk-frame"',
    'class="card-corner-ornament card-corner-ornament--tl"',
    'class="desk-seal"',
    'id="casebook-desk-title"',
    'id="desk-tab-evidence"',
    'id="desk-tab-clues"',
    'id="desk-tab-suspects"',
    'id="desk-tab-map"',
    'id="desk-tab-notes"',
    'id="casebook-desk-close"',
    'id="desk-thread-svg"',
    'id="desk-view-evidence"',
    'id="desk-evidence-grid"',
    'id="desk-view-clues"',
    'id="desk-clues-list"',
    'id="desk-view-suspects"',
    'id="desk-suspects-grid"',
    'id="desk-view-map"',
    'id="desk-map-canvas-wrap"',
    'id="desk-view-notes"',
    'id="desk-notes-container"',
    'id="desk-close-action"',
  ];

  for (const req of htmlRequirements) {
    if (!html.includes(req)) {
      throw new Error(`HTML requirement missing: ${req}`);
    }
  }
  console.log('✓ All 23 required HTML elements and IDs verified.');

  // Test 2: CSS Styles
  console.log('\n[2/5] Verifying CSS Styles & Art Direction...');
  const cssRules = [
    '.casebook-desk-backdrop',
    '.casebook-desk-frame',
    '.desk-header',
    '.desk-seal',
    '.desk-title',
    '.desk-tabs',
    '.desk-tab',
    '.desk-surface',
    '.desk-thread-svg',
    '.desk-evidence-grid',
    '.desk-evidence-card',
    '.brass-push-pin',
    '.desk-card-annotation',
    '.desk-card-status--recovered',
    '.desk-thread-tag',
    '.desk-clue-item',
    '.desk-suspect-card',
    '.desk-map-sector-card',
    '.desk-mission-checklist',
    '.desk-telegram-log',
    '.desk-footer',
  ];

  for (const rule of cssRules) {
    if (!css.includes(rule)) {
      throw new Error(`CSS rule missing: ${rule}`);
    }
  }
  console.log('✓ All 21 required CSS classes and component styles verified.');

  // Test 3: Responsive Media Queries
  console.log('\n[3/5] Verifying Mobile Responsiveness...');
  const mobileRules = [
    '.casebook-desk-frame { width: 98vw',
    '.desk-tabs { order: 3',
    '.desk-evidence-grid { grid-template-columns: 1fr',
  ];
  for (const rule of mobileRules) {
    if (!css.includes(rule)) {
      throw new Error(`Mobile CSS rule missing: ${rule}`);
    }
  }
  console.log('✓ Mobile responsive media queries verified.');

  // Test 4: JavaScript Logic & Data Integrity
  console.log('\n[4/5] Verifying JavaScript Logic...');
  const jsRequirements = [
    'let currentDeskTab = \'evidence\';',
    'function setCasebookOpen(open)',
    'function setDeskTab(tabName)',
    'const DESK_EVIDENCE_ITEMS =',
    'function renderInvestigationDesk()',
    'function renderDeskEvidence(missions)',
    'function drawRedThreadSvg()',
    'function renderDeskClues(clues',
    'function renderDeskSuspects(room, me)',
    'function renderDeskMap(room, me)',
    'function renderDeskNotes(room)',
    'initializeCasebookDesk()',
    'desk-tab-evidence',
    'desk-tab-clues',
    'desk-tab-suspects',
    'desk-tab-map',
    'desk-tab-notes',
    'casebook-desk-close',
    'desk-close-action',
  ];

  for (const req of jsRequirements) {
    if (!js.includes(req)) {
      throw new Error(`JavaScript requirement missing: ${req}`);
    }
  }
  console.log('✓ All 19 required JavaScript functions and tab bindings verified.');

  // Test 5: Keyboard Navigation & Shortcuts
  console.log('\n[5/5] Verifying Keyboard Shortcuts...');
  const keyShortcuts = [
    'key === \'escape\'',
    '!$(\'casebook-desk\').classList.contains(\'hidden\')',
    'key === \'1\'',
    'key === \'2\'',
    'key === \'3\'',
    'key === \'4\'',
    'key === \'5\'',
    'key === \'tab\'',
    'key === \'j\'',
  ];

  for (const sc of keyShortcuts) {
    if (!js.includes(sc)) {
      throw new Error(`Keyboard shortcut check missing: ${sc}`);
    }
  }
  console.log('✓ Keyboard shortcuts (1-5, Esc, Tab, J) verified.');

  console.log('\n=== ALL CASEBOOK INVESTIGATION DESK TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
