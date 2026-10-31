import { spawn } from 'node:child_process';
import path from 'node:path';

const PORT = 3003;
const env = { ...process.env, PORT: String(PORT), GAME_TEST_URL: `http://localhost:${PORT}/api/game` };

console.log(`Starting test server on port ${PORT}...`);
const serverProc = spawn('node', ['server.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] });

let serverReady = false;

serverProc.stdout.on('data', (d) => {
  const msg = d.toString();
  if (msg.includes('Sherlock: Shadows of London running')) {
    serverReady = true;
  }
});

serverProc.stderr.on('data', (d) => {
  console.error(`[Server stderr]`, d.toString());
});

// Wait up to 5s for server to start
for (let i = 0; i < 50; i++) {
  if (serverReady) break;
  try {
    const res = await fetch(`http://localhost:${PORT}/health`);
    if (res.ok) {
      serverReady = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}

if (!serverReady) {
  serverProc.kill();
  console.error('Failed to start test server.');
  process.exit(1);
}

console.log('Server is running and healthy. Running verification tests...\n');

function runTest(testFile) {
  return new Promise((resolve, reject) => {
    console.log(`--- Running ${testFile} ---`);
    const proc = spawn('node', [testFile], { env, stdio: 'inherit' });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${testFile} exited with code ${code}`));
    });
  });
}

try {
  await runTest(path.join('scripts', 'test-lobby-verification.mjs'));
  console.log('✓ Lobby verification passed!\n');

  await runTest(path.join('scripts', 'test-upgraded-lobby.mjs'));
  console.log('✓ Upgraded 14-point Victorian lobby verification passed!\n');

  await runTest(path.join('scripts', 'test-lobby-v2-refinement.mjs'));
  console.log('✓ Lobby V2 refinement verification passed!\n');

  await runTest(path.join('scripts', 'test-evidence-discovery.mjs'));
  console.log('✓ Evidence discovery verification passed!\n');

  await runTest(path.join('scripts', 'test-clue-discovery-system.mjs'));
  console.log('✓ Clue discovery system verification passed!\n');

  await runTest(path.join('scripts', 'test-casebook-desk.mjs'));
  console.log('✓ Casebook investigation desk verification passed!\n');

  await runTest(path.join('scripts', 'test-3d-district.mjs'));
  console.log('✓ 3D Victorian district verification passed!\n');

  await runTest(path.join('scripts', 'test-coop-portrait-gameplay.mjs'));
  console.log('✓ Cooperative multiplayer portrait gameplay verification passed!\n');

  await runTest(path.join('scripts', 'test-pause-settings.mjs'));
  console.log('✓ Victorian pause and settings verification passed!\n');

  await runTest(path.join('scripts', 'test-ending-screens.mjs'));
  console.log('✓ Victorian ending screens verification passed!\n');

  await runTest(path.join('scripts', 'test-responsive-audit.mjs'));
  console.log('✓ Responsive audit & multi-device polish verification passed!\n');

  await runTest(path.join('scripts', 'test-cinematic-menu-audit.mjs'));
  console.log('✓ Cinematic main menu audit passed!\n');

  await runTest(path.join('scripts', 'test-room-cap.mjs'));
  console.log('✓ Room cap verification passed!\n');

  await runTest(path.join('scripts', 'test-minigames.mjs'));
  console.log('✓ Forensic mini-games verification passed!\n');

  await runTest(path.join('scripts', 'test-evidence-identification.mjs'));
  console.log('✓ Shared evidence & thief identification verification passed!\n');


  await runTest(path.join('scripts', 'test-mobile-touch-controls.mjs'));
  console.log('✓ Mobile touch controls & responsive layout verification passed!\n');

  await runTest(path.join('scripts', 'test-character-upgrade.mjs'));
  console.log('✓ Professional 3D character upgrade audit passed!\n');

  await runTest(path.join('scripts', 'test-complete-polish-audit.mjs'));
  console.log('✓ Full polish, 4P/8P/co-op, mini-games & reunion audit passed!\n');

  await runTest(path.join('scripts', 'test-contest-cross-device.mjs'));
  console.log('✓ Handshake AI contest & cross-device multiplayer audit passed!\n');

  console.log('==========================================');
  console.log('ALL SERVER & MULTIPLAYER VERIFICATION TESTS PASSED!');
  console.log('==========================================');
} catch (err) {
  console.error('Test execution failed:', err);
  process.exitCode = 1;
} finally {
  serverProc.kill();
}
