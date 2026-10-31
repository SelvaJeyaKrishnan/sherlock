import assert from 'node:assert/strict';
import http from 'node:http';

const endpoint = process.env.GAME_TEST_URL || 'http://localhost:3000/api/game';

async function post(body) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, ok: res.ok, data };
}

console.log('Testing Victorian Lobby with two independent sessions...');

// Session 1: Host creates room
const s1Create = await post({ op: 'create', name: 'Sherlock Holmes', character: 'boy' });
assert.equal(s1Create.ok, true, 'Session 1 must create room');
const code = s1Create.data.code;
const s1Token = s1Create.data.token;
console.log(`✓ Session 1 created room ${code}`);

// Session 1 checks initial state
const s1StateInitial = await post({ op: 'state', code, token: s1Token });
assert.equal(s1StateInitial.data.room.phase, 'lobby', 'Initial phase must be lobby');
assert.equal(s1StateInitial.data.room.connectedCount, 1, 'Only host connected initially');
assert.equal(s1StateInitial.data.me.isHost, true, 'Session 1 is host');
assert.equal(s1StateInitial.data.me.ready, false, 'Session 1 starts not ready');
console.log('✓ Session 1 verified waiting state with 1 player');

// Session 2: Guest joins with room code
const s2Join = await post({ op: 'join', code, name: 'Dr. John Watson', character: 'boy' });
assert.equal(s2Join.ok, true, 'Session 2 must join with valid room code');
const s2Token = s2Join.data.token;
console.log(`✓ Session 2 joined room ${code}`);

// Session 1 polls state and verifies 2 players
const s1State2p = await post({ op: 'state', code, token: s1Token });
assert.equal(s1State2p.data.room.connectedCount, 2, 'Host sees 2 connected players');
assert.equal(s1State2p.data.room.players.length, 2, '2 players in roster');
const s1PlayerList = s1State2p.data.room.players;
const hostPlayer = s1PlayerList.find(p => p.name === 'Sherlock Holmes');
const guestPlayer = s1PlayerList.find(p => p.name === 'Dr. John Watson');
assert.ok(hostPlayer, 'Host present in roster');
assert.ok(guestPlayer, 'Guest present in roster');
assert.equal(hostPlayer.connected, true, 'Host is connected');
assert.equal(guestPlayer.connected, true, 'Guest is connected');
assert.equal(hostPlayer.ready, false, 'Host not ready');
assert.equal(guestPlayer.ready, false, 'Guest not ready');
console.log('✓ Session 1 sees Session 2 connected in roster');

// Session 2 polls state and verifies same data
const s2State2p = await post({ op: 'state', code, token: s2Token });
assert.equal(s2State2p.data.room.connectedCount, 2, 'Guest sees 2 connected players');
assert.equal(s2State2p.data.me.isHost, false, 'Guest is not host');
assert.equal(s2State2p.data.me.name, 'Dr. John Watson');
console.log('✓ Session 2 sees itself and Host with correct roles');

// Session 1 toggles ready
const s1Ready = await post({ op: 'action', action: 'ready', ready: true, code, token: s1Token });
assert.equal(s1Ready.ok, true, 'Host marks ready');

// Session 2 polls state: verifies Host is ready, Guest is not ready
const s2StateAfterHostReady = await post({ op: 'state', code, token: s2Token });
const s2HostView = s2StateAfterHostReady.data.room.players.find(p => p.name === 'Sherlock Holmes');
const s2GuestView = s2StateAfterHostReady.data.room.players.find(p => p.name === 'Dr. John Watson');
assert.equal(s2HostView.ready, true, 'Session 2 sees Host is ready');
assert.equal(s2GuestView.ready, false, 'Session 2 sees Guest is not ready');
assert.equal(s2StateAfterHostReady.data.room.allReady, false, 'Not all ready yet');
console.log('✓ Session 2 sees Session 1 ready state update in real-time');

// Session 2 (Guest) attempts unauthorized start
const unauthorizedStart = await post({ op: 'action', action: 'start', code, token: s2Token });
assert.equal(unauthorizedStart.ok, false, 'Guest cannot start game');
assert.equal(unauthorizedStart.status, 400, 'Rejection status is 400');
console.log('✓ Session 2 start attempt correctly rejected (host permission respected)');

// Session 1 attempts premature start (guest not ready)
const prematureStart = await post({ op: 'action', action: 'start', code, token: s1Token });
assert.equal(prematureStart.ok, false, 'Host cannot start before all are ready');
console.log('✓ Premature start correctly rejected (ready gate respected)');

// Session 2 toggles ready
const s2Ready = await post({ op: 'action', action: 'ready', ready: true, code, token: s2Token });
assert.equal(s2Ready.ok, true, 'Guest marks ready');

// Both poll state: allReady is true
const s1StateAllReady = await post({ op: 'state', code, token: s1Token });
assert.equal(s1StateAllReady.data.room.allReady, true, 'allReady is now true');
console.log('✓ Both sessions ready: allReady is true');

// Session 1 (Authorized Host) starts investigation
const hostStart = await post({ op: 'action', action: 'start', code, token: s1Token });
assert.equal(hostStart.ok, true, 'Host starts the case');

// Verify both sessions transition to investigation
const s1Final = await post({ op: 'state', code, token: s1Token });
const s2Final = await post({ op: 'state', code, token: s2Token });
assert.equal(s1Final.data.room.phase, 'investigation', 'Session 1 in investigation');
assert.equal(s2Final.data.room.phase, 'investigation', 'Session 2 in investigation');
console.log('✓ Both sessions transitioned to investigation');

// Session 2 leaves the case
const s2Leave = await post({ op: 'action', action: 'leave', code, token: s2Token });
assert.equal(s2Leave.ok, true, 'Session 2 successfully leaves');
const s1AfterLeave = await post({ op: 'state', code, token: s1Token });
assert.equal(s1AfterLeave.data.room.connectedCount, 1, 'Connected count reflects left player');
console.log('✓ Session 2 left cleanly, Session 1 updated');

console.log('PASS: Two independent browser sessions verified Victorian Lobby multiplayer state, permissions, readiness, joining, start, and leaving.');
