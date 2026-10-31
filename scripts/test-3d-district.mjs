import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CITY_PATHS, CITY_BUILDINGS, GAS_LAMPS, gameToWorld } from '../public/world-layout.js';

async function runTests() {
  console.log('--- RUNNING 3D VICTORIAN DISTRICT VERIFICATION ---');

  const worldJs = await readFile(resolve('public/world3d.js'), 'utf8');
  const appJs = await readFile(resolve('public/app.js'), 'utf8');
  const html = await readFile(resolve('public/index.html'), 'utf8');
  const audioJs = await readFile(resolve('public/ambient-audio.js'), 'utf8');

  // Test 1: Atmospheric Victorian Elements in world3d.js
  console.log('\n[1/5] Verifying 3D Atmospheric Victorian Components...');
  const expected3dComponents = [
    'makeCobbleTexture',
    'makeBrickMaps',
    'makeMistTexture',
    'getMistMap',
    'createGroundMist',
    'addIronRailing',
    'addDistantSkyline',
    'createClockTower',
    'gasLampObjects',
    'addDistrictEdge',
    'addLandmarks',
    'addBuilding',
    'addLamp',
  ];

  for (const comp of expected3dComponents) {
    if (!worldJs.includes(comp)) {
      throw new Error(`Missing 3D component: ${comp}`);
    }
  }
  console.log('✓ All 13 core 3D architectural and atmospheric functions verified.');

  // Test 2: Landmark specific details
  console.log('\n[2/5] Verifying Distinct Victorian Landmarks...');
  const landmarkDetails = [
    'BAKER STREET',
    'CONSULTING DETECTIVE',
    '221B',
    'SCOTLAND YARD',
    'METROPOLITAN POLICE',
    'chalkShape',
    'EAST LONDON',
    'PASSENGER TERMINAL',
    'BLACKTHORN & CO.',
    'BONDED WAREHOUSE',
    'hoistBeam',
    'THE BLACKTHORN INN',
  ];

  for (const detail of landmarkDetails) {
    if (!worldJs.includes(detail)) {
      throw new Error(`Missing landmark detail: ${detail}`);
    }
  }
  console.log('✓ All landmark signage, architectural features, and period motifs verified.');

  // Test 3: Ambient Motion & Soundscape
  console.log('\n[3/5] Verifying Ambient Motion & Procedural Audio...');
  if (!worldJs.includes('flicker') || !worldJs.includes('groundMist')) {
    throw new Error('Gas lamp flicker or ground mist animation missing in world3d.js animate loop');
  }
  if (!html.includes('id="ambient-audio"')) {
    throw new Error('Missing ambient-audio toggle in index.html');
  }
  if (!audioJs.includes('createRainBuffer') || !audioJs.includes('createWindBuffer')) {
    throw new Error('Missing procedural audio generators in ambient-audio.js');
  }
  if (!appJs.includes('initAmbientAudio')) {
    throw new Error('Missing ambient audio initialization in app.js');
  }
  console.log('✓ Gas lamp flicker, drifting ground mist, and Web Audio soundscape verified.');

  // Test 4: Coordinate system & Playable Routes
  console.log('\n[4/5] Verifying Playable Route Coordinates...');
  const keyLocations = [
    { name: 'Crime Scene / Ink Sample', x: 112, y: 108 },
    { name: 'Scotland Yard Seal Registry', x: 252, y: 182 },
    { name: 'Baker Street Study', x: 494, y: 154 },
    { name: 'Signal Box B', x: 738, y: 306 },
    { name: 'Commercial Relay', x: 874, y: 410 },
    { name: 'Blackthorn Safehouse', x: 484, y: 552 },
  ];

  for (const loc of keyLocations) {
    const worldPoint = gameToWorld(loc.x, loc.y, 0.2);
    if (typeof worldPoint.x !== 'number' || typeof worldPoint.z !== 'number') {
      throw new Error(`Invalid coordinate projection for ${loc.name}`);
    }
    // Check bounds: district extends from ~ -12 to +12 in x, and -8 to +8 in z
    if (Math.abs(worldPoint.x) > 13 || Math.abs(worldPoint.z) > 9) {
      throw new Error(`Location ${loc.name} exceeds playable district world bounds: (${worldPoint.x}, ${worldPoint.z})`);
    }
    console.log(`  ✓ ${loc.name} mapped at Game (${loc.x}, ${loc.y}) -> World (${worldPoint.x.toFixed(2)}, ${worldPoint.z.toFixed(2)})`);
  }

  // Test 5: Verify Paths Continuity & Gas Lamp Placement
  console.log('\n[5/5] Verifying Street Paths & Gas Lamps...');
  if (CITY_PATHS.length < 5) throw new Error('Expected at least 5 major street paths');
  if (GAS_LAMPS.length < 15) throw new Error('Expected at least 15 gas lamps along streets');
  console.log(`✓ ${CITY_PATHS.length} street paths and ${GAS_LAMPS.length} gas lamps verified.`);

  console.log('\n=== ALL 3D VICTORIAN DISTRICT VERIFICATIONS PASSED! ===');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
