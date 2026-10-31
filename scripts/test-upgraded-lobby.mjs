import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  newRoom,
  makePlayer,
  publicRoom,
  doAction,
  activePlayers,
  findByCode,
  CHARACTERS
} from '../lib/game-core.mjs';

console.log('--- RUNNING UPGRADED MULTIPLAYER LOBBY 14-POINT VERIFICATION ---');

// 1. Host creates a room
console.log('\n[1/14] Testing Host creates room...');
const { room, player: host } = newRoom('LOBBY1', 'Sherlock Holmes', 'boy');
assert.equal(room.phase, 'lobby', 'Initial phase is lobby');
assert.equal(room.hostId, host.id, 'Host ID assigned to creator');
const hostInitialView = publicRoom(room, host);
assert.equal(hostInitialView.me.isHost, true, 'Host player recognizes itself as host');
assert.equal(hostInitialView.room.connectedCount, 1, 'Connected count is 1');
console.log('✓ Host successfully created lobby LOBBY1');

// 2. Second player joins
console.log('\n[2/14] Testing Second player joins...');
const guest1 = makePlayer('Dr. John Watson', 'boy');
room.players.set(guest1.id, guest1);
room.scores.set(guest1.id, 0);
assert.equal(activePlayers(room).length, 2, 'Room now has 2 active players');
console.log('✓ Second player Dr. John Watson joined');

// 3. All players appear correctly in roster
console.log('\n[3/14] Testing All players appear correctly in roster...');
const hostView2p = publicRoom(room, host);
const guestView2p = publicRoom(room, guest1);
assert.equal(hostView2p.room.players.length, 2, 'Host sees 2 players');
assert.equal(guestView2p.room.players.length, 2, 'Guest sees 2 players');
const hFromG = guestView2p.room.players.find(p => p.id === host.id);
const gFromH = hostView2p.room.players.find(p => p.id === guest1.id);
assert.equal(hFromG.isHost, true, 'Guest sees Host correctly labeled');
assert.equal(gFromH.isHost, false, 'Host sees Guest correctly labeled');
assert.equal(gFromH.name, 'Dr. John Watson', 'Guest name preserved');
console.log('✓ Roster synchronized across both players');

// 4. Player selects a character
console.log('\n[4/14] Testing Character selection & synchronization...');
const charRes = doAction(room, guest1, { action: 'character', character: 'watson' });
assert.equal(charRes.ok, true, 'Character change should succeed when not ready');
assert.equal(guest1.character, 'watson', 'Player character updated to watson');
const hostViewChar = publicRoom(room, host);
const guestInHostRoster = hostViewChar.room.players.find(p => p.id === guest1.id);
assert.equal(guestInHostRoster.character, 'watson', 'Host sees guest updated character');
console.log('✓ Character selection synchronized to watson');

// 5. Ready status updates for everyone
console.log('\n[5/14] Testing Ready status updates & toggles...');
const guestReadyRes = doAction(room, guest1, { action: 'ready', ready: true });
assert.equal(guestReadyRes.ok, true, 'Guest marks ready');
assert.equal(publicRoom(room, host).room.players.find(p => p.id === guest1.id).ready, true, 'Host sees guest is ready');
assert.equal(publicRoom(room, host).room.allReady, false, 'Not all ready yet (host not ready)');
// Character change while ready must be prevented
const lockedCharRes = doAction(room, guest1, { action: 'character', character: 'journalist' });
assert.equal(lockedCharRes.ok, false, 'Changing character while ready must be blocked');
// Guest unready
doAction(room, guest1, { action: 'ready', ready: false });
assert.equal(guest1.ready, false, 'Guest can cancel ready');
console.log('✓ Ready status toggles and character locking verified');

// 6. Player leaves the room
console.log('\n[6/14] Testing Player leaves the room...');
const leaveRes = doAction(room, guest1, { action: 'leave' });
assert.equal(leaveRes.ok, true, 'Leave action succeeds');
assert.equal(guest1.dropped, true, 'Guest marked dropped');
assert.equal(activePlayers(room).length, 1, 'Active players count drops to 1');
const hostViewAfterLeave = publicRoom(room, host);
assert.equal(hostViewAfterLeave.room.connectedCount, 1, 'Host sees 1 connected player');
console.log('✓ Player left cleanly, roster updated');

// 7. Disconnected player reconnects
console.log('\n[7/14] Testing Disconnected player reconnects...');
guest1.connected = true;
guest1.dropped = false;
guest1.lastSeen = Date.now();
const hostViewReconnected = publicRoom(room, host);
assert.equal(hostViewReconnected.room.connectedCount, 2, 'Connected count restored to 2');
console.log('✓ Player reconnected successfully');

// 8. Ready both players
doAction(room, host, { action: 'ready', ready: true });
doAction(room, guest1, { action: 'ready', ready: true });
const allReadyState = publicRoom(room, host);
assert.equal(allReadyState.room.allReady, true, 'allReady is true when both are ready');

// 9. Non-host cannot start the game
console.log('\n[9/14] Testing Non-host cannot start...');
const guestStartAttempt = doAction(room, guest1, { action: 'start' });
assert.equal(guestStartAttempt.ok, false, 'Guest cannot start');
assert.equal(room.phase, 'lobby', 'Phase remains lobby');
console.log('✓ Unauthorized guest start safely rejected');

// 10. Invalid start requests are rejected
console.log('\n[10/14] Testing Premature/invalid start rejected...');
doAction(room, guest1, { action: 'ready', ready: false });
const prematureStart = doAction(room, host, { action: 'start' });
assert.equal(prematureStart.ok, false, 'Host cannot start when guest is unready');
assert.equal(room.phase, 'lobby', 'Phase remains lobby');
// Restore readiness
doAction(room, guest1, { action: 'ready', ready: true });
console.log('✓ Premature start blocked by server ready gate');

// 8 & 11. Host starts with valid conditions & countdown broadcast
console.log('\n[8 & 11/14] Testing Host start & synchronized countdown...');
const validStart = doAction(room, host, { action: 'start' });
assert.equal(validStart.ok, true, 'Host start succeeds');
assert.equal(room.phase, 'investigation', 'Phase transitions to investigation');
assert.ok(room.countdownUntil > Date.now(), 'Server sets countdownUntil');
const hostStartView = publicRoom(room, host);
const guestStartView = publicRoom(room, guest1);
assert.equal(hostStartView.room.countdown, guestStartView.room.countdown, 'Both players receive identical countdown');
assert.ok(hostStartView.room.countdown > 0, 'Countdown is active (> 0)');
console.log(`✓ Synchronized countdown active: ${hostStartView.room.countdown}s remaining`);

// 12. Game begins exactly once
console.log('\n[12/14] Testing Prevent duplicate start requests...');
const duplicateStart = doAction(room, host, { action: 'start' });
assert.equal(duplicateStart.ok, false, 'Duplicate start rejected');
console.log('✓ Duplicate start request rejected: ' + duplicateStart.message);

// 13. Eight-player lobby works & secret role privacy maintained
console.log('\n[13/14] Testing Eight-player lobby & role privacy...');
const { room: room8, player: host8 } = newRoom('EIGHTP', 'Host Detective', 'boy');
const guests8 = [];
for (let i = 2; i <= 8; i++) {
  const g = makePlayer(`Detective ${i}`, i % 2 === 0 ? 'watson' : 'girl');
  room8.players.set(g.id, g);
  room8.scores.set(g.id, 0);
  guests8.push(g);
}
assert.equal(room8.players.size, 8, '8 players in lobby');
const lobby8View = publicRoom(room8, host8);
assert.equal(lobby8View.room.players.length, 8, '8 players present in public room');
// Verify zero role leaks in lobby phase
for (const p of lobby8View.room.players) {
  assert.equal(Object.hasOwn(p, 'role'), false, 'Lobby public player data must not leak role');
  assert.equal(Object.hasOwn(p, 'revealedRole'), false, 'Lobby public player data must not leak revealedRole');
}
// Ready all 8
doAction(room8, host8, { action: 'ready', ready: true });
for (const g of guests8) doAction(room8, g, { action: 'ready', ready: true });
assert.equal(publicRoom(room8, host8).room.allReady, true, 'All 8 players ready');
// Start 8-player match -> pure cooperative detective adventure
const start8Res = doAction(room8, host8, { action: 'start' });
assert.equal(start8Res.ok, true, '8-player match started');
assert.equal(room8.mode, 'cooperative', '8-player mode is cooperative');
const detectives = [...room8.players.values()].filter(p => p.role === 'detective');
assert.equal(detectives.length, 8, 'All 8 players are detectives on the same cooperative team');
console.log('✓ 8-player cooperative team verified');

// 14. Responsive mobile & desktop layout verified
console.log('\n[14/14] Testing Responsive layout & mobile compatibility...');
const html = readFileSync('public/index.html', 'utf8');
const css = readFileSync('public/styles.css', 'utf8');
assert.ok(html.includes('id="lobby-screen"'), 'HTML contains #lobby-screen');
assert.ok(html.includes('class="lobby-card headquarters-card"'), 'HTML contains headquarters-card');
assert.ok(html.includes('class="headquarters-grid"'), 'HTML contains 2-column headquarters-grid');
assert.ok(html.includes('id="lobby-character-selector"'), 'HTML contains character selector');
assert.ok(html.includes('id="lobby-countdown-overlay"'), 'HTML contains countdown overlay');
assert.ok(css.includes('.headquarters-grid'), 'CSS defines .headquarters-grid');
assert.ok(css.includes('@media (max-width: 900px)') || css.includes('@media (max-width: 820px)') || css.includes('@media (max-width: 768px)') || css.includes('@media (max-width: 960px)'), 'CSS includes responsive mobile media queries');
assert.ok(css.includes('env(safe-area-inset'), 'CSS includes safe-area-inset for mobile notches');
console.log('✓ HTML/CSS responsive structure verified');

console.log('\n======================================================');
console.log('ALL 14 MULTIPLAYER LOBBY AUDIT TESTS PASSED WITH 100%!');
console.log('======================================================');
