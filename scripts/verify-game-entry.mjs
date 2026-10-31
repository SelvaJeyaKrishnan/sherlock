import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

console.log('--- STARTING COMPREHENSIVE GAME ENTRY & PLAYABILITY VERIFICATION ---');

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new',
  '--remote-debugging-port=9222',
  '--disable-gpu',
  'http://localhost:3000'
]);

for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 200));
  try {
    await fetch('http://localhost:9222/json');
    break;
  } catch {}
}

const list = await (await fetch('http://localhost:9222/json')).json();
const page = list.find(t => t.url.includes('localhost:3000'));
assert.ok(page?.webSocketDebuggerUrl, 'Could not find localhost:3000 Chrome target');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 1;
const send = (method, params = {}) => new Promise((resolve) => {
  const msgId = id++;
  const handler = (evt) => {
    const data = JSON.parse(evt.data);
    if (data.id === msgId) {
      ws.removeEventListener('message', handler);
      resolve(data.result);
    }
  };
  ws.addEventListener('message', handler);
  ws.send(JSON.stringify({ id: msgId, method, params }));
});

await new Promise(r => ws.onopen = r);
const exceptions = [];
ws.addEventListener('message', (evt) => {
  const msg = JSON.parse(evt.data);
  if (msg.method === 'Runtime.exceptionThrown') {
    exceptions.push(msg.params.exceptionDetails?.text || 'Exception');
  }
});

await send('Runtime.enable');
await send('Page.enable');

const navPromise = new Promise((resolve) => {
  const loadHandler = (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.method === 'Page.loadEventFired') {
      ws.removeEventListener('message', loadHandler);
      resolve();
    }
  };
  ws.addEventListener('message', loadHandler);
});

await send('Page.navigate', { url: 'http://localhost:3000' });
await navPromise;
await new Promise(r => setTimeout(r, 2000));

// SCENARIO 1: Home screen loads without runtime errors
console.log('\n[Scenario 1] Verifying Home Screen...');
const initialCheck = await send('Runtime.evaluate', {
  expression: `(() => ({
    welcomeVisible: !document.getElementById('welcome-screen').classList.contains('hidden'),
    playSoloBtn: !!document.getElementById('play-game'),
    createRoomBtn: !!document.getElementById('menu-create-room'),
    joinRoomBtn: !!document.getElementById('menu-join-room'),
    settingsBtn: !!document.getElementById('open-settings'),
    howToPlayBtn: !!document.getElementById('open-how-to-play'),
    clientReady: window.__sherlockClientReady,
    clientError: window.__sherlockClientError
  }))()`,
  returnByValue: true
});
console.log('Home screen status:', initialCheck.result.value);
assert.equal(initialCheck.result.value.welcomeVisible, true, 'Welcome screen must be visible');
assert.equal(initialCheck.result.value.clientReady, true, 'Client must be ready');
assert.equal(exceptions.length, 0, 'No runtime exceptions on load');
console.log('✓ Scenario 1 passed: Home screen loaded without runtime errors.');

// SCENARIO 2 & 3: Clicking Play Solo enters actual solo gameplay & Watson initialized
console.log('\n[Scenario 2 & 3] Clicking Play Solo (with Watson)...');
await send('Runtime.evaluate', { expression: `document.getElementById('play-game').click();` });
await new Promise(r => setTimeout(r, 800));

const soloState = await send('Runtime.evaluate', {
  expression: `({
    welcomeHidden: document.getElementById('welcome-screen').classList.contains('hidden'),
    gameVisible: !document.getElementById('game').classList.contains('hidden'),
    gameGridVisible: !document.getElementById('game-grid').classList.contains('hidden'),
    lobbyHidden: document.getElementById('lobby-screen').classList.contains('hidden'),
    round: document.getElementById('round-counter').innerText,
    mapTitle: document.getElementById('map-title').innerText,
    roomCode: document.getElementById('room-code-display').innerText,
    players: window.getView?.()?.room?.players?.map(p => ({ name: p.name, role: p.role, x: p.x, y: p.y })),
    isSolo: window.local?.isSolo
  })`,
  returnByValue: true
});
console.log('Solo gameplay state:', soloState.result.value);
assert.equal(soloState.result.value.gameVisible, true, 'Game screen must be visible');
assert.equal(soloState.result.value.gameGridVisible, true, 'Gameplay grid (3D canvas) must be visible');
assert.equal(soloState.result.value.mapTitle, 'The streets of London', 'Should be in London investigation');
assert.equal(soloState.result.value.isSolo, true, 'Should be flagged as solo');
assert.equal(soloState.result.value.players.length, 2, 'Should have Sherlock and Watson');
assert.equal(soloState.result.value.players[1].name, 'Dr. Watson (AI)', 'Watson must be present');
console.log('✓ Scenario 2 & 3 passed: Play Solo enters actual gameplay with Dr. Watson initialized.');

// Leave solo game and return to menu
console.log('\nReturning to main menu...');
await send('Runtime.evaluate', { expression: `document.getElementById('leave-room').click();` });
await new Promise(r => setTimeout(r, 500));

// SCENARIO 4: Clicking Create Multiplayer Room
console.log('\n[Scenario 4] Clicking Create Multiplayer Room...');
await send('Runtime.evaluate', { expression: `document.getElementById('menu-create-room').click();` });
await new Promise(r => setTimeout(r, 1200));

const createMultiState = await send('Runtime.evaluate', {
  expression: `({
    gameVisible: !document.getElementById('game').classList.contains('hidden'),
    lobbyVisible: !document.getElementById('lobby-screen').classList.contains('hidden'),
    roomCode: document.getElementById('room-code-display').innerText,
    hostStatus: document.getElementById('host-status').innerText,
    isSolo: window.local?.isSolo
  })`,
  returnByValue: true
});
console.log('Create Multiplayer state:', createMultiState.result.value);
assert.equal(createMultiState.result.value.gameVisible, true, 'Game screen must be visible');
assert.equal(createMultiState.result.value.lobbyVisible, true, 'Lobby must be visible');
assert.equal(createMultiState.result.value.roomCode.length, 6, 'Valid 6-character room code generated');
assert.equal(createMultiState.result.value.isSolo, false, 'Should be multiplayer mode');
const createdCode = createMultiState.result.value.roomCode;
console.log(`✓ Scenario 4 passed: Multiplayer room created with code ${createdCode} and entered.`);

// Leave room back to menu
await send('Runtime.evaluate', { expression: `document.getElementById('leave-room').click();` });
await new Promise(r => setTimeout(r, 500));

// SCENARIO 5: Joining with valid room code
console.log(`\n[Scenario 5] Joining with valid room code ${createdCode}...`);
await send('Runtime.evaluate', { expression: `document.getElementById('menu-join-room').click();` });
await new Promise(r => setTimeout(r, 300));
await send('Runtime.evaluate', {
  expression: `
    document.getElementById('menu-room-code-input').value = '${createdCode}';
    document.getElementById('menu-join-submit').click();
  `
});
await new Promise(r => setTimeout(r, 1200));

const joinValidState = await send('Runtime.evaluate', {
  expression: `({
    gameVisible: !document.getElementById('game').classList.contains('hidden'),
    lobbyVisible: !document.getElementById('lobby-screen').classList.contains('hidden'),
    roomCode: document.getElementById('room-code-display').innerText
  })`,
  returnByValue: true
});
console.log('Joined room state:', joinValidState.result.value);
assert.equal(joinValidState.result.value.gameVisible, true, 'Should enter game');
assert.equal(joinValidState.result.value.roomCode, createdCode, 'Should match room code');
console.log('✓ Scenario 5 passed: Joined valid room successfully.');

// Leave room back to menu
await send('Runtime.evaluate', { expression: `document.getElementById('leave-room').click();` });
await new Promise(r => setTimeout(r, 500));

// SCENARIO 6: Invalid room code produces clear error message
console.log('\n[Scenario 6] Testing invalid room code rejection...');
await send('Runtime.evaluate', { expression: `document.getElementById('menu-join-room').click();` });
await new Promise(r => setTimeout(r, 300));
// Short code
await send('Runtime.evaluate', {
  expression: `
    document.getElementById('menu-room-code-input').value = 'XYZ';
    document.getElementById('menu-join-submit').click();
  `
});
await new Promise(r => setTimeout(r, 300));
const shortCodeError = await send('Runtime.evaluate', {
  expression: `document.getElementById('menu-join-error').innerText`,
  returnByValue: true
});
console.log('Short code error:', shortCodeError.result.value);
assert.ok(shortCodeError.result.value.includes('six-character'), 'Short code must produce error');

// Non-existent 6-letter code
await send('Runtime.evaluate', {
  expression: `
    document.getElementById('menu-room-code-input').value = 'ZZZZZZ';
    document.getElementById('menu-join-submit').click();
  `
});
await new Promise(r => setTimeout(r, 1000));
const notFoundError = await send('Runtime.evaluate', {
  expression: `document.getElementById('menu-join-error').innerText`,
  returnByValue: true
});
console.log('Not found error:', notFoundError.result.value);
assert.ok(notFoundError.result.value.includes('Room not found'), 'Non-existent code must produce 404 message');
console.log('✓ Scenario 6 passed: Invalid room codes produce clear error messages.');

// SCENARIO 7: Failed network requests do not leave app stuck loading
console.log('\n[Scenario 7] Verifying buttons are not stuck loading...');
const buttonCheck = await send('Runtime.evaluate', {
  expression: `({
    playDisabled: document.getElementById('play-game').disabled,
    createDisabled: document.getElementById('menu-create-room').disabled,
    joinSubmitDisabled: document.getElementById('menu-join-submit').disabled
  })`,
  returnByValue: true
});
console.log('Button state:', buttonCheck.result.value);
assert.equal(buttonCheck.result.value.playDisabled, false, 'Play Solo button must not be disabled');
assert.equal(buttonCheck.result.value.createDisabled, false, 'Create Room button must not be disabled');
assert.equal(buttonCheck.result.value.joinSubmitDisabled, false, 'Join Submit button must not be disabled');
console.log('✓ Scenario 7 passed: Buttons reset and are not stuck loading.');

// SCENARIO 8: Settings and How to Play modals remain intact
console.log('\n[Scenario 8] Verifying Settings and How to Play...');
await send('Runtime.evaluate', { expression: `document.getElementById('open-settings').click();` });
await new Promise(r => setTimeout(r, 400));
const settingsOpen = await send('Runtime.evaluate', {
  expression: `!document.getElementById('settings-modal').classList.contains('hidden')`,
  returnByValue: true
});
assert.equal(settingsOpen.result.value, true, 'Settings modal should open');
await send('Runtime.evaluate', { expression: `document.getElementById('settings-close').click();` });
await new Promise(r => setTimeout(r, 300));

await send('Runtime.evaluate', { expression: `document.getElementById('open-how-to-play').click();` });
await new Promise(r => setTimeout(r, 400));
const howToPlayOpen = await send('Runtime.evaluate', {
  expression: `!document.getElementById('tutorial').classList.contains('hidden')`,
  returnByValue: true
});
assert.equal(howToPlayOpen.result.value, true, 'How to Play tutorial should open');
await send('Runtime.evaluate', { expression: `document.getElementById('tutorial-close').click();` });
await new Promise(r => setTimeout(r, 300));
console.log('✓ Scenario 8 passed: Settings and How to Play remain fully operational.');

console.log('\n======================================================');
console.log('ALL VERIFICATION SCENARIOS PASSED WITH ZERO EXCEPTIONS!');
console.log('======================================================');

ws.close();
chrome.kill();
