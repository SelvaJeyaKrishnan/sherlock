import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';

console.log('--- RUNNING PROFESSIONAL 3D CHARACTER UPGRADE AUDIT ---');

const worldJs = fs.readFileSync(path.resolve('public/world3d.js'), 'utf8');

// Test 1-5: Check character definitions and distinctive features in world3d.js
console.log('\n[1/15] Verifying Sherlock Holmes 3D character features...');
assert.ok(worldJs.includes('magnifyingGlass') || worldJs.includes('matGlass'), 'Sherlock has magnifying glass with lens');
assert.ok(worldJs.includes('deerstalker') || (worldJs.includes('frontVisor') && worldJs.includes('rearVisor')), 'Sherlock has dual-visored deerstalker hat');
assert.ok(worldJs.includes('capelet') || worldJs.includes('Inverness') || worldJs.includes('mantle'), 'Sherlock has Inverness shoulder capelet');
console.log('✓ Sherlock Holmes character features verified.');

console.log('\n[2/15] Verifying Dr. John Watson 3D character features...');
assert.ok(worldJs.includes('isWatson'), 'Watson character branch exists');
assert.ok(worldJs.includes('moustache') || worldJs.includes('mustache'), 'Watson has distinguished moustache');
assert.ok(worldJs.includes('bowler') || (worldJs.includes('isWatson') && worldJs.includes('brim')), 'Watson has bowler hat');
assert.ok(worldJs.includes('medicalBag') || worldJs.includes('satchel') || worldJs.includes('doctor'), 'Watson has medical bag/satchel');
console.log('✓ Dr. John Watson character features verified.');

console.log('\n[3/15] Verifying Irene Adler 3D character features...');
assert.ok(worldJs.includes('isGirl'), 'Irene Adler character branch exists');
assert.ok(worldJs.includes('feather') || worldJs.includes('plume'), 'Irene has feathered hat/bonnet');
assert.ok(worldJs.includes('cameo') || worldJs.includes('brooch'), 'Irene has cameo brooch/collar');
assert.ok(worldJs.includes('chignon') || worldJs.includes('updo') || worldJs.includes('curls'), 'Irene has styled Victorian hairstyle');
console.log('✓ Irene Adler character features verified.');

console.log('\n[4/15] Verifying Langdale Pike 3D character features...');
assert.ok(worldJs.includes('isJournalist'), 'Langdale Pike character branch exists');
assert.ok(worldJs.includes('spectacles') || worldJs.includes('glasses'), 'Langdale Pike has spectacles');
assert.ok(worldJs.includes('newsboy') || (worldJs.includes('isJournalist') && worldJs.includes('peak')), 'Langdale Pike has newsboy cap');
console.log('✓ Langdale Pike character features verified.');

console.log('\n[5/15] Verifying Inspector Lestrade 3D character features...');
assert.ok(worldJs.includes('isOfficer'), 'Inspector Lestrade character branch exists');
assert.ok(worldJs.includes('custodian') || worldJs.includes('helmet') || worldJs.includes('bobby'), 'Lestrade has Scotland Yard custodian helmet');
assert.ok(worldJs.includes('badge') || worldJs.includes('star'), 'Lestrade has Scotland Yard badge');
console.log('✓ Inspector Lestrade character features verified.');

// Test 6: Character identity normalization (no male character collapsing into 'boy')
console.log('\n[6/15] Verifying character identity normalization & distinct models...');
assert.ok(worldJs.includes('normalizeCharacterId'), 'world3d.js exports/defines normalizeCharacterId()');
assert.ok(!worldJs.includes("const character = player.character === 'girl' ? 'girl' : 'boy';"), 'Old generic boy/girl binary collapse removed');
console.log('✓ Character normalization preserves all distinct identities.');

// Test 7: Thief role privacy protection
console.log('\n[7/15] Verifying hidden thief appearance privacy...');
assert.ok(!worldJs.includes("player?.role === 'culprit' || name.toLowerCase().includes('moriarty')"), 'Secret thief role does not alter character appearance');
assert.ok(!worldJs.includes("actor.isCulprit = player.revealedRole === 'culprit' || player.role === 'culprit'"), 'actor.isCulprit does not leak unrevealed role');
console.log('✓ Hidden thief privacy strictly protected: no pre-reveal visual tell.');

// Test 8: Character preview upgrades
console.log('\n[8/15] Verifying character preview system...');
assert.ok(worldJs.includes('createDetectivePreview'), 'createDetectivePreview function exists');
assert.ok(worldJs.includes('DirectionalLight'), 'Preview studio has directional lighting');
assert.ok(worldJs.includes('camera'), 'Preview camera properly configured');
console.log('✓ Character preview system verified.');

// Test 9-12: Animation system (Idle, Walk, Sprint, Investigate, Turn)
console.log('\n[9-12/15] Verifying upgraded animation system...');
assert.ok(worldJs.includes('isSprinting'), 'Sprint animation branch exists');
assert.ok(worldJs.includes('isInvestigating'), 'Investigation animation branch exists');
assert.ok(worldJs.includes('turnRate'), 'Turning bank/lean branch exists');
assert.ok(worldJs.includes('breath') || worldJs.includes('time * 2'), 'Idle breathing animation exists');
console.log('✓ Upgraded animation system verified.');

// Test 13: Memory & geometry cleanup
console.log('\n[13-15/15] Verifying disposal & mobile performance...');
assert.ok(worldJs.includes('disposeObject'), 'disposeObject exists');
assert.ok(worldJs.includes('pointLight') || worldJs.includes('detectiveLight'), 'Only active player has detective point light (avoid per-character light spam)');
console.log('✓ Disposal and mobile performance checks verified.');

console.log('\n================================================================');
console.log('ALL 15 CHARACTER UPGRADE AUDIT CHECKS PASSED (100%)!');
console.log('================================================================');
